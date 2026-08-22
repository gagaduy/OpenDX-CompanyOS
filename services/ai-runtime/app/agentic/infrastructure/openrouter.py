# SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
# SPDX-License-Identifier: Apache-2.0

from __future__ import annotations

import asyncio
import json
import math
import re
import time
from collections.abc import Callable, Mapping
from decimal import Decimal, DecimalException, InvalidOperation, ROUND_HALF_UP

import httpx

from app.agentic.domain.model_result_schemas import parse_model_result
from app.agentic.domain.model_runtime import (
    ModelGatewayFailure,
    ModelRequest,
    ModelResult,
)
from app.shared.config import OpenRouterSettings


_MAX_SAFE_INTEGER = 9_007_199_254_740_991
_MAX_OUTPUT_TOKENS = 32_768
_MAX_PROVIDER_ID_LENGTH = 255
_MAX_SCHEMA_DEPTH = 64
_MAX_SCHEMA_NODES = 10_000
_PROVIDER_ID = re.compile(r"[A-Za-z0-9][A-Za-z0-9._:/-]{0,254}")
_NONNEGATIVE_DECIMAL = re.compile(
    r"(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?"
)


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
        self._catalog: object | None = None
        self._catalog_refresh: asyncio.Task[None] | None = None

    async def generate(self, request: ModelRequest) -> ModelResult:
        await self.preflight(request)
        body = self._request_body(request)
        document = await self._request_json(
            "POST", "/chat/completions", json_body=body
        )
        return self._parse_result(document, request)

    async def preflight(self, request: ModelRequest) -> None:
        self._validate_request(request)
        self._request_body(request)
        await self._ensure_catalog(
            request.model,
            request.input_cost_micros_per_million,
            request.output_cost_micros_per_million,
        )

    def _validate_request(self, request: ModelRequest) -> None:
        if not self._settings.execution_enabled:
            _fail("OPENROUTER_EXECUTION_DISABLED", retryable=False)
        if self._settings.api_key is None:
            _fail("OPENROUTER_AUTH_FAILED", retryable=False)
        if (
            type(request.model) is not str
            or _PROVIDER_ID.fullmatch(request.model) is None
            or type(request.fallback_position) is not int
            or request.fallback_position not in {0, 1}
        ):
            _fail("OPENROUTER_REQUEST_INVALID", retryable=False)
        if not all(
            _nonnegative_safe_integer(price)
            for price in (
                request.input_cost_micros_per_million,
                request.output_cost_micros_per_million,
            )
        ):
            _fail("OPENROUTER_REQUEST_INVALID", retryable=False)
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

    async def _ensure_catalog(
        self,
        configured_model: str,
        approved_input_price: int,
        approved_output_price: int,
    ) -> None:
        while True:
            if (
                self._catalog_valid_until is not None
                and self._now() < self._catalog_valid_until
            ):
                if not _configured_model_available(
                    self._catalog,
                    configured_model,
                    approved_input_price,
                    approved_output_price,
                ):
                    _fail("OPENROUTER_CATALOG_INVALID", retryable=False)
                return
            refresh = self._catalog_refresh
            if refresh is None:
                refresh = asyncio.create_task(self._refresh_catalog())
                self._catalog_refresh = refresh
                refresh.add_done_callback(self._catalog_refresh_done)
            await asyncio.wait((refresh,))
            await refresh
            if not _configured_model_available(
                self._catalog,
                configured_model,
                approved_input_price,
                approved_output_price,
            ):
                _fail("OPENROUTER_CATALOG_INVALID", retryable=False)
            return

    def _catalog_refresh_done(self, refresh: asyncio.Task[None]) -> None:
        if self._catalog_refresh is refresh:
            self._catalog_refresh = None
        if not refresh.cancelled():
            refresh.exception()

    async def _refresh_catalog(self) -> None:
        document = await self._request_json("GET", "/models")
        if not _valid_catalog_document(document):
            _fail("OPENROUTER_CATALOG_INVALID", retryable=False)
        self._catalog = document
        self._catalog_valid_until = (
            self._now() + self._settings.catalog_cache_ttl_seconds
        )

    def _request_body(self, request: ModelRequest) -> dict[str, object]:
        invalid = False
        schema: object = None
        context = ""
        messages: list[dict[str, str]] = []
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
        except (TypeError, ValueError, OverflowError, RecursionError):
            invalid = True
        if invalid:
            _fail("OPENROUTER_REQUEST_INVALID", retryable=False)
        messages.append(
            {
                "role": "user",
                "content": f"UNTRUSTED_CONTEXT_JSON\n{context}",
            }
        )
        body = {
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
        serialization_failed = False
        try:
            json.dumps(body, ensure_ascii=False, allow_nan=False)
        except (TypeError, ValueError, OverflowError, RecursionError):
            serialization_failed = True
        if serialization_failed:
            _fail("OPENROUTER_REQUEST_INVALID", retryable=False)
        return body

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
        request: httpx.Request | None = None
        build_failed = False
        try:
            request = self._client.build_request(
                method,
                f"{self._settings.base_url}{path}",
                headers=headers,
                json=json_body,
            )
        except (httpx.HTTPError, TypeError, ValueError, OverflowError, UnicodeError):
            build_failed = True
        if build_failed or request is None:
            _fail("OPENROUTER_REQUEST_INVALID", retryable=False)
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

        decoded, document = _decode_json(payload)
        if not decoded:
            _fail("OPENROUTER_RESPONSE_INVALID", retryable=False)
        return document

    def _parse_result(self, value: object, request: ModelRequest) -> ModelResult:
        invalid = False
        provider_request_id: object = None
        returned_model: object = None
        result_content: dict[str, object] = {}
        usage: dict[str, object] = {}
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
                decoded, content = _decode_json(content)
                if not decoded:
                    raise ValueError
            result_content = _object(content)
            usage = _object(document["usage"])
        except ModelGatewayFailure:
            raise
        except (KeyError, TypeError, ValueError, json.JSONDecodeError, UnicodeError):
            invalid = True
        if invalid:
            _fail("OPENROUTER_RESPONSE_INVALID", retryable=False)

        result_invalid = False
        try:
            parsed = parse_model_result(result_content)
        except (TypeError, ValueError):
            result_invalid = True
            parsed = None
        if result_invalid or parsed is None:
            _fail("OPENROUTER_RESULT_INVALID", retryable=False)
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
    transport_failed = False
    try:
        async for chunk in response.aiter_bytes():
            size += len(chunk)
            if size > maximum:
                _fail("OPENROUTER_RESPONSE_OVERSIZED", retryable=False)
            chunks.append(chunk)
    except ModelGatewayFailure:
        raise
    except (httpx.TimeoutException, httpx.TransportError):
        transport_failed = True
    if transport_failed:
        _fail("OPENROUTER_TRANSPORT_FAILED", retryable=True)
    return b"".join(chunks)


def _status_failure(status: int) -> ModelGatewayFailure | None:
    if 200 <= status < 300:
        return None
    if status in {401, 403}:
        return ModelGatewayFailure("OPENROUTER_AUTH_FAILED", retryable=False)
    if status in {408, 429} or 500 <= status <= 599:
        return ModelGatewayFailure("OPENROUTER_PROVIDER_RETRYABLE", retryable=True)
    return ModelGatewayFailure("OPENROUTER_PROVIDER_REJECTED", retryable=False)


def _valid_catalog_document(value: object) -> bool:
    try:
        document = _object(value)
        return type(document["data"]) is list
    except (KeyError, TypeError, ValueError):
        return False


def _configured_model_available(
    value: object,
    configured_model: str,
    approved_input_price: int,
    approved_output_price: int,
) -> bool:
    try:
        document = _object(value)
        models = document["data"]
        if type(models) is not list:
            return False
        matches = [
            _object(item)
            for item in models
            if type(item) is dict and item.get("id") == configured_model
        ]
        if len(matches) != 1:
            return False
        model = matches[0]
        pricing = _object(model["pricing"])
        parameters = model["supported_parameters"]
        return (
            _catalog_price_within_approved(
                pricing.get("prompt"), approved_input_price
            )
            and _catalog_price_within_approved(
                pricing.get("completion"), approved_output_price
            )
            and type(parameters) is list
            and "response_format" in parameters
        )
    except (KeyError, TypeError, ValueError):
        return False


def _nonnegative_decimal_string(value: object) -> bool:
    return _nonnegative_decimal(value) is not None


def _nonnegative_decimal(value: object) -> Decimal | None:
    if type(value) is not str or _NONNEGATIVE_DECIMAL.fullmatch(value) is None:
        return None
    try:
        price = Decimal(value)
        return price if price.is_finite() and price >= 0 else None
    except DecimalException:
        return None


def _catalog_price_within_approved(value: object, approved_price: int) -> bool:
    price = _nonnegative_decimal(value)
    if price is None:
        return False
    try:
        approved_usd_per_token = Decimal(approved_price).scaleb(-12)
        return price <= approved_usd_per_token
    except DecimalException:
        return False


def _strict_object_schemas(value: object) -> bool:
    pending = [(value, 0)]
    seen: set[int] = set()
    visited = 0
    while pending:
        current, depth = pending.pop()
        visited += 1
        if visited > _MAX_SCHEMA_NODES or depth > _MAX_SCHEMA_DEPTH:
            return False
        if isinstance(current, Mapping):
            identity = id(current)
            if identity in seen or len(current) > _MAX_SCHEMA_NODES:
                return False
            seen.add(identity)
            if any(type(key) is not str for key in current):
                return False
            schema_type = current.get("type")
            explicit_object = schema_type == "object" or (
                type(schema_type) in (list, tuple) and "object" in schema_type
            )
            implicit_object = any(
                key in current
                for key in (
                    "properties",
                    "patternProperties",
                    "required",
                    "dependentRequired",
                    "dependentSchemas",
                    "propertyNames",
                    "unevaluatedProperties",
                    "minProperties",
                    "maxProperties",
                    "dependencies",
                )
            )
            if (
                "additionalProperties" in current
                and current["additionalProperties"] is not False
            ):
                return False
            if (explicit_object or implicit_object) and current.get(
                "additionalProperties"
            ) is not False:
                return False
            pending.extend((item, depth + 1) for item in current.values())
        elif type(current) in (list, tuple):
            identity = id(current)
            if len(current) > _MAX_SCHEMA_NODES:
                return False
            if current:
                if identity in seen:
                    return False
                seen.add(identity)
            pending.extend((item, depth + 1) for item in current)
        elif type(current) is float:
            if not math.isfinite(current):
                return False
        elif current is None or type(current) in (str, int, bool):
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
    invalid = False
    micros = 0
    try:
        cost = value if type(value) is Decimal else Decimal(str(value))
        if not cost.is_finite() or cost < 0:
            raise InvalidOperation
        micros = int((cost * 1_000_000).quantize(Decimal(1), rounding=ROUND_HALF_UP))
    except (InvalidOperation, ValueError, OverflowError):
        invalid = True
    if invalid:
        _fail("OPENROUTER_COST_INVALID", retryable=False)
    if micros > _MAX_SAFE_INTEGER:
        _fail("OPENROUTER_COST_INVALID", retryable=False)
    return micros


def _fail(code: str, *, retryable: bool) -> None:
    raise ModelGatewayFailure(code, retryable=retryable) from None


def _raise_json_value_error() -> None:
    raise ValueError


def _decode_json(value: bytes | str) -> tuple[bool, object]:
    try:
        return (
            True,
            json.loads(
                value,
                parse_float=Decimal,
                parse_constant=lambda _value: (_raise_json_value_error()),
            ),
        )
    except (json.JSONDecodeError, UnicodeDecodeError, ValueError, RecursionError):
        return False, None
