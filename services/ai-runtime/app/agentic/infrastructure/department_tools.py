# SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
# SPDX-License-Identifier: Apache-2.0

from __future__ import annotations

from typing import Mapping

import httpx

from app.agentic.application.ports import AccessTokenProvider
from app.agentic.domain.orchestration_schemas import DepartmentAgentKind
from app.agentic.infrastructure.safe_json_transport import (
    SafeJsonTransport,
    SafeJsonTransportError,
)


class DepartmentToolError(RuntimeError):
    def __init__(self, code: str, *, retryable: bool) -> None:
        super().__init__(code)
        self.code = code
        self.retryable = retryable


class DepartmentToolClient:
    def __init__(self, *, base_url: str,
                 tokens: Mapping[DepartmentAgentKind, AccessTokenProvider],
                 client: httpx.AsyncClient, timeout_seconds: float,
                 maximum_response_bytes: int) -> None:
        self._tokens = dict(tokens)
        self._transport = SafeJsonTransport(
            base_url=base_url, client=client, timeout_seconds=timeout_seconds,
            maximum_response_bytes=maximum_response_bytes,
        )

    async def invoke(self, agent_kind: DepartmentAgentKind,
                     request: Mapping[str, object]) -> dict[str, object]:
        tokens = self._tokens.get(agent_kind)
        if tokens is None:
            raise DepartmentToolError("DEPARTMENT_IDENTITY_UNAVAILABLE", retryable=False)
        try:
            return await self._transport.request(
                "POST", "/tools/invoke", tokens=tokens, body=request
            )
        except SafeJsonTransportError as error:
            raise DepartmentToolError(
                f"DEPARTMENT_TOOL_{error.code}", retryable=error.retryable
            ) from error
