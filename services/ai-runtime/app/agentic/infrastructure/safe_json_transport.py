# SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
# SPDX-License-Identifier: Apache-2.0

from __future__ import annotations

import json
from typing import Any, Mapping

import httpx

from app.agentic.application.ports import AccessTokenProvider


class SafeJsonTransportError(RuntimeError):
    def __init__(self, code: str, *, retryable: bool) -> None:
        super().__init__(code)
        self.code = code
        self.retryable = retryable


class SafeJsonTransport:
    def __init__(self, *, base_url: str, client: httpx.AsyncClient,
                 timeout_seconds: float, maximum_response_bytes: int) -> None:
        if maximum_response_bytes < 1:
            raise ValueError("maximum_response_bytes")
        self._base_url = base_url.rstrip("/")
        self._client = client
        self._timeout = timeout_seconds
        self._maximum = maximum_response_bytes

    async def request(self, method: str, path: str, *, tokens: AccessTokenProvider,
                      body: Mapping[str, object] | None = None) -> dict[str, Any]:
        token = await tokens.get_token()
        try:
            async with self._client.stream(
                method, self._base_url + path,
                json=None if body is None else dict(body),
                headers={"authorization": f"Bearer {token}"}, timeout=self._timeout,
            ) as response:
                status = response.status_code
                chunks: list[bytes] = []
                size = 0
                async for chunk in response.aiter_bytes():
                    size += len(chunk)
                    if size > self._maximum:
                        raise SafeJsonTransportError("RESPONSE_TOO_LARGE", retryable=False)
                    chunks.append(chunk)
        except SafeJsonTransportError:
            raise
        except httpx.HTTPError as error:
            raise SafeJsonTransportError("TRANSPORT_FAILED", retryable=True) from error
        if status < 200 or status >= 300:
            raise SafeJsonTransportError(
                "REQUEST_REJECTED", retryable=status in {408, 429} or status >= 500
            )
        try:
            envelope = json.loads(b"".join(chunks))
            data = envelope["data"]
            if envelope.get("success") is not True or not isinstance(data, dict):
                raise ValueError
            return data
        except (AttributeError, KeyError, TypeError, ValueError) as error:
            raise SafeJsonTransportError("RESPONSE_INVALID", retryable=False) from error
