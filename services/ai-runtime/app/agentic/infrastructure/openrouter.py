# SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
# SPDX-License-Identifier: Apache-2.0

from __future__ import annotations

import json
import math
import re
import time
from collections.abc import Callable, Mapping
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from types import MappingProxyType

import httpx

from app.agentic.domain.model_result_schemas import parse_model_result
from app.agentic.domain.model_runtime import (
    AgentKind,
    ModelGatewayFailure,
    ModelRequest,
    ModelResult,
)
from app.shared.config import OpenRouterSettings


PRIMARY_MODELS: Mapping[AgentKind, str] = MappingProxyType(
    {
        "ai_ceo": "z-ai/glm-5.2:free",
        "catalog": "google/gemma-4-26b-a4b-it:free",
        "inventory": "google/gemma-4-31b-it:free",
        "order": "nvidia/nemotron-3-super-120b-a12b:free",
        "finance": "openai/gpt-oss-20b:free",
        "crm": "dots-studio/dots-3-note-preview:free",
        "support": "nvidia/nemotron-nano-9b-v2:free",
    }
)
EMERGENCY_FALLBACK = "liquid/lfm-2.5-2.6b:free"

_APPROVED_MODELS = frozenset((*PRIMARY_MODELS.values(), EMERGENCY_FALLBACK))
_MAX_SAFE_INTEGER = 9_007_199_254_740_991
_MAX_OUTPUT_TOKENS = 32_768
_MAX_PROVIDER_ID_LENGTH = 255
_PROVIDER_ID = re.compile(r"[A-Za-z0-9][A-Za-z0-9._:/-]{0,254}")


class OpenRouterModelGateway:
    def __init__(
        self,
        *,
        settings: OpenRouterSettings,
        client: httpx.AsyncClient,
        now: Callable[[], float] = time.monotonic,
    ) -> None:
        self._settings = settings
        self._client = client
        self._now = now
        self._catalog_valid_until: float | None = None

    async def generate(self, request: ModelRequest) -> ModelResult:
        self._validate_request(request)
        await self._ensure_catalog()
        body = self._request_body(request)
        document = await self._request_json(
            "POST", "/chat/completions", json_body=body
        )
        return self._parse_result(document, request)

    def _validate_request(self, request: ModelRequest) -> None:
        if not self._settings.execution_enabled:
            _fail("OPENROUTER_EXECUTION_DISABLED", retryable=False)
        if self._settings.api_key is None:
            _fail("OPENROUTER_AUTH_FAILED", retryable=False)
        primary = PRIMARY_MODELS.get(request.agent_kind)
        valid_position = type(request.fallback_position) is int
        valid_primary = (
            valid_position
            and request.model == primary
            and request.fallback_position == 0
        )
        valid_fallback = (
            valid_position
            and request.model == EMERGENCY_FALLBACK
            and request.fallback_position == 1
        )
        if request.model not in _APPROVED_MODELS or not (
            valid_primary or valid_fallback
        ):
            _fail("OPENROUTER_MODEL_UNAUTHORIZED", retryable=False)
        if (
            type(request.max_output_tokens) is not int
            or request.max_output_tokens < 1
            or request.max_output_tokens > _MAX_OUTPUT_TOKENS
        ):
            _fail("OPENROUTER_REQUEST_INVALID", retryable=False)
        if (
            not request.result_schema_name
            or len(request.result_schema_name) > 128
            or not re.fullmatch(r"[A-Za-z][A-Za-z0-9_-]*", request.result_schema_name)
        ):
            _fail("OPENROUTER_SCHEMA_INVALID", retryable=False)
        if not _strict_object_schemas(request.result_schema):
            _fail("OPENROUTER_SCHEMA_INVALID", retryable=False)

    async def _ensure_catalog(self) -> None:
        if (
            self._catalog_valid_until is not None
            and self._now() < self._catalog_valid_until
        ):
            return
        document = await self._request_json("GET", "/models")
        if not _valid_catalog(document):
            _fail("OPENROUTER_CATALOG_INVALID", retryable=False)
        self._catalog_valid_until = (
            self._now() + self._settings.catalog_cache_ttl_seconds
        )

    def _request_body(self, request: ModelRequest) -> dict[str, object]:
        try:
            schema = _plain_json(request.result_schema)
            context = json.dumps(
                _plain_json(request.untrusted_context),
                ensure_ascii=False,
                allow_nan=False,
                separators=(",", ":"),
                sort_keys=True,
            )
            messages = [
                {"role": "system", "content": instruction}
                for instruction in request.trusted_instructions
            ]
        except (TypeError, ValueError, OverflowError):
            _fail("OPENROUTER_REQUEST_INVALID", retryable=False)
        messages.append(
            {
                "role": "user",
                "content": f"UNTRUSTED_CONTEXT_JSON\n{context}",
            }
        )
        return {
            "model": request.model,
            "messages": messages,
            "response_format": {
                "type": "json_schema",
                "json_schema": {
                    "name": request.result_schema_name,
                    "schema": schema,
                    "strict": True,
                },
            },
            "provider": {"require_parameters": True},
            "max_tokens": request.max_output_tokens,
            "stream": False,
        }

    async def _request_json(
        self,
        method: str,
        path: str,
        *,
        json_body: Mapping[str, object] | None = None,
    ) -> object:
        headers = {
            "Authorization": f"Bearer {self._settings.api_key}",
            "Accept": "application/json",
        }
        if self._settings.public_attribution_url is not None:
            headers["HTTP-Referer"] = self._settings.public_attribution_url
        if self._settings.public_attribution_name is not None:
            headers["X-Title"] = self._settings.public_attribution_name
        request = self._client.build_request(
            method,
            f"{self._settings.base_url}{path}",
            headers=headers,
            json=json_body,
        )
        transport_failure: ModelGatewayFailure | None = None
        try:
            response = await self._client.send(request, stream=True)
        except (httpx.TimeoutException, httpx.TransportError):
            transport_failure = ModelGatewayFailure(
                "OPENROUTER_TRANSPORT_FAILED", retryable=True
            )
        if transport_failure is not None:
            raise transport_failure from None

        try:
            payload = await _read_bounded(
                response, self._settings.maximum_response_bytes
            )
            status_failure = _status_failure(response.status_code)
            if status_failure is not None:
                raise status_failure from None
        finally:
            await response.aclose()

        try:
            return json.loads(
                payload,
                parse_float=Decimal,
                parse_constant=lambda _value: (_raise_json_value_error()),
            )
        except (json.JSONDecodeError, UnicodeDecodeError, ValueError):
            raise ModelGatewayFailure(
                "OPENROUTER_RESPONSE_INVALID", retryable=False
            ) from None

    def _parse_result(self, value: object, request: ModelRequest) -> ModelResult:
        try:
            document = _object(value)
            provider_request_id = document["id"]
            returned_model = document["model"]
            if (
                type(provider_request_id) is not str
                or len(provider_request_id) > _MAX_PROVIDER_ID_LENGTH
                or _PROVIDER_ID.fullmatch(provider_request_id) is None
            ):
                raise ValueError
            if type(returned_model) is not str:
                raise ValueError
            if returned_model != request.model:
                _fail("OPENROUTER_MODEL_MISMATCH", retryable=False)
            choices = document["choices"]
            if type(choices) is not list or not choices:
                raise ValueError
            first = _object(choices[0])
            message = _object(first["message"])
            content = message["content"]
            if type(content) is str:
                if len(content.encode("utf-8")) > self._settings.maximum_response_bytes:
                    raise ValueError
                content = json.loads(
                    content,
                    parse_float=Decimal,
                    parse_constant=lambda _value: (_raise_json_value_error()),
                )
            result_content = _object(content)
            usage = _object(document["usage"])
        except ModelGatewayFailure:
            raise
        except (KeyError, TypeError, ValueError, json.JSONDecodeError, UnicodeError):
            raise ModelGatewayFailure(
                "OPENROUTER_RESPONSE_INVALID", retryable=False
            ) from None

        try:
            parsed = parse_model_result(result_content)
        except (TypeError, ValueError):
            raise ModelGatewayFailure(
                "OPENROUTER_RESULT_INVALID", retryable=False
            ) from None
        if parsed.agent_kind != request.agent_kind:
            _fail("OPENROUTER_RESULT_INVALID", retryable=False)

        input_tokens = usage.get("prompt_tokens")
        output_tokens = usage.get("completion_tokens")
        total_tokens = usage.get("total_tokens")
        if not all(
            _nonnegative_safe_integer(token)
            for token in (input_tokens, output_tokens, total_tokens)
        ) or total_tokens != input_tokens + output_tokens:
            _fail("OPENROUTER_USAGE_INVALID", retryable=False)

        cost = usage.get("cost")
        provider_cost_micros = None if cost is None else _cost_micros(cost)
        return ModelResult(
            provider_request_id=provider_request_id,
            model=returned_model,
            content=result_content,
            input_tokens=input_tokens,
            output_tokens=output_tokens,
            total_tokens=total_tokens,
            provider_cost_micros=provider_cost_micros,
        )


async def _read_bounded(response: httpx.Response, maximum: int) -> bytes:
    chunks: list[bytes] = []
    size = 0
    try:
        async for chunk in response.aiter_bytes():
            size += len(chunk)
            if size > maximum:
                _fail("OPENROUTER_RESPONSE_OVERSIZED", retryable=False)
            chunks.append(chunk)
    except ModelGatewayFailure:
        raise
    except (httpx.TimeoutException, httpx.TransportError):
        raise ModelGatewayFailure(
            "OPENROUTER_TRANSPORT_FAILED", retryable=True
        ) from None
    return b"".join(chunks)


def _status_failure(status: int) -> ModelGatewayFailure | None:
    if 200 <= status < 300:
        return None
    if status in {401, 403}:
        return ModelGatewayFailure("OPENROUTER_AUTH_FAILED", retryable=False)
    if status in {408, 429} or 500 <= status <= 599:
        return ModelGatewayFailure("OPENROUTER_PROVIDER_RETRYABLE", retryable=True)
    return ModelGatewayFailure("OPENROUTER_PROVIDER_REJECTED", retryable=False)


def _valid_catalog(value: object) -> bool:
    try:
        document = _object(value)
        models = document["data"]
        if type(models) is not list:
            return False
        seen: set[str] = set()
        for value in models:
            model = _object(value)
            identifier = model["id"]
            if type(identifier) is not str:
                return False
            if identifier not in _APPROVED_MODELS:
                continue
            if identifier in seen:
                return False
            seen.add(identifier)
            pricing = _object(model["pricing"])
            if not _exact_zero(pricing.get("prompt")) or not _exact_zero(
                pricing.get("completion")
            ):
                return False
            parameters = model["supported_parameters"]
            if type(parameters) is not list or "response_format" not in parameters:
                return False
        return seen == _APPROVED_MODELS
    except (KeyError, TypeError, ValueError):
        return False


def _exact_zero(value: object) -> bool:
    return type(value) is str and value == "0"


def _strict_object_schemas(value: object) -> bool:
    pending = [value]
    while pending:
        current = pending.pop()
        if isinstance(current, Mapping):
            if current.get("type") == "object" and current.get(
                "additionalProperties"
            ) is not False:
                return False
            pending.extend(current.values())
        elif type(current) in (list, tuple):
            pending.extend(current)
        elif current is None or type(current) in (str, int, float, bool):
            continue
        else:
            return False
    return True


def _plain_json(value: object) -> object:
    if isinstance(value, Mapping):
        return {key: _plain_json(item) for key, item in value.items()}
    if type(value) in (list, tuple):
        return [_plain_json(item) for item in value]
    if value is None or type(value) in (str, int, float, bool):
        return value
    raise TypeError


def _object(value: object) -> dict[str, object]:
    if type(value) is not dict:
        raise ValueError
    return value  # type: ignore[return-value]


def _nonnegative_safe_integer(value: object) -> bool:
    return type(value) is int and 0 <= value <= _MAX_SAFE_INTEGER


def _cost_micros(value: object) -> int:
    if type(value) not in (str, int, float, Decimal):
        _fail("OPENROUTER_COST_INVALID", retryable=False)
    if type(value) is float and not math.isfinite(value):
        _fail("OPENROUTER_COST_INVALID", retryable=False)
    try:
        cost = value if type(value) is Decimal else Decimal(str(value))
        if not cost.is_finite() or cost < 0:
            raise InvalidOperation
        micros = int((cost * 1_000_000).quantize(Decimal(1), rounding=ROUND_HALF_UP))
    except (InvalidOperation, ValueError, OverflowError):
        _fail("OPENROUTER_COST_INVALID", retryable=False)
    if micros > _MAX_SAFE_INTEGER:
        _fail("OPENROUTER_COST_INVALID", retryable=False)
    return micros


def _fail(code: str, *, retryable: bool) -> None:
    raise ModelGatewayFailure(code, retryable=retryable) from None


def _raise_json_value_error() -> None:
    raise ValueError
