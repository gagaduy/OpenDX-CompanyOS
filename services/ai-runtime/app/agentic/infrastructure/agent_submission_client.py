# SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
# SPDX-License-Identifier: Apache-2.0

from __future__ import annotations

from typing import Mapping

import httpx

from app.agentic.application.ports import AccessTokenProvider
from app.agentic.infrastructure.safe_json_transport import (
    SafeJsonTransport,
    SafeJsonTransportError,
)


class AgentSubmissionError(RuntimeError):
    def __init__(self, code: str, *, retryable: bool) -> None:
        super().__init__(code)
        self.code = code
        self.retryable = retryable


class AgentSubmissionClient:
    def __init__(self, *, base_url: str, tokens: AccessTokenProvider,
                 client: httpx.AsyncClient, timeout_seconds: float,
                 maximum_response_bytes: int) -> None:
        self._tokens = tokens
        self._transport = SafeJsonTransport(
            base_url=base_url, client=client, timeout_seconds=timeout_seconds,
            maximum_response_bytes=maximum_response_bytes,
        )

    async def accept_plan(self, plan: Mapping[str, object]) -> None:
        try:
            data = await self._transport.request(
                "POST", "/orchestration/plans", tokens=self._tokens, body=plan
            )
            if data != {"accepted": True}:
                raise AgentSubmissionError("AGENT_SUBMISSION_RESPONSE_INVALID", retryable=False)
        except SafeJsonTransportError as error:
            raise AgentSubmissionError(
                f"AGENT_SUBMISSION_{error.code}", retryable=error.retryable
            ) from error
