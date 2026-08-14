# SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
# SPDX-License-Identifier: Apache-2.0

from __future__ import annotations

from typing import Any
from urllib.parse import quote

import httpx

from app.agentic.application.ports import AccessTokenProvider
from app.agentic.domain.contracts import (
    ActivityOutcome,
    ActivityReservationRequest,
    FrozenWorkflowPlan,
    PlanDependency,
    PlanNode,
    StateProjection,
)


class AgenticControlError(RuntimeError):
    def __init__(self, code: str, *, retryable: bool, status_code: int | None = None) -> None:
        super().__init__(code)
        self.retryable = retryable
        self.status_code = status_code


class AgenticControlClient:
    def __init__(self, *, base_url: str, tokens: AccessTokenProvider,
                 client: httpx.AsyncClient, timeout_seconds: float,
                 maximum_response_bytes: int) -> None:
        self._base_url = base_url.rstrip("/")
        self._tokens = tokens
        self._client = client
        self._timeout = timeout_seconds
        self._maximum = maximum_response_bytes

    async def load_plan(self, run_id: str) -> FrozenWorkflowPlan:
        data = await self._request("GET", f"/workflow-runs/{quote(run_id, safe='')}/plan")
        try:
            return FrozenWorkflowPlan(
                task_id=data["taskId"], workflow_run_id=data["workflowRunId"],
                workflow_version=data["workflowVersion"], plan_revision=data["planRevision"],
                configuration_revision_id=data["configurationRevisionId"],
                subtasks=tuple(PlanNode(
                    id=node["id"], agent_kind=node["agentKind"], version=node["version"]
                ) for node in data["subtasks"]),
                dependencies=tuple(PlanDependency(
                    source=edge["from"], target=edge["to"]
                ) for edge in data["dependencies"]),
            )
        except (KeyError, TypeError, ValueError) as error:
            raise AgenticControlError("AGENTIC_RESPONSE_INVALID", retryable=False) from error

    async def project_state(self, run_id: str, projection: StateProjection) -> dict[str, Any]:
        body: dict[str, Any] = {
            "projectionSequence": projection.projection_sequence,
            "state": projection.state.value,
        }
        if projection.outcome_code is not None:
            body["outcomeCode"] = projection.outcome_code
        return await self._request(
            "POST", f"/workflow-runs/{quote(run_id, safe='')}/state", json=body
        )

    async def reserve_activity(self, reservation: ActivityReservationRequest) -> dict[str, Any]:
        body = {
            "invocationKey": reservation.invocation_key, "runId": reservation.run_id,
            "activityKind": reservation.activity_kind.value,
            "inputDigest": reservation.input_digest,
        }
        if reservation.branch_id is not None:
            body["branchId"] = reservation.branch_id
        return await self._request(
            "POST", "/activity-invocations/reserve", json=body,
            idempotency_key=reservation.invocation_key,
        )

    async def complete_activity(self, invocation_key: str,
                                outcome: ActivityOutcome) -> dict[str, Any]:
        return await self._activity_outcome(invocation_key, "complete", outcome)

    async def fail_activity(self, invocation_key: str,
                            outcome: ActivityOutcome) -> dict[str, Any]:
        return await self._activity_outcome(invocation_key, "fail", outcome)

    async def _activity_outcome(self, invocation_key: str, action: str,
                                outcome: ActivityOutcome) -> dict[str, Any]:
        body: dict[str, Any] = {
            "expectedVersion": outcome.expected_version,
            "outcomeCode": outcome.outcome_code,
        }
        if outcome.safe_result is not None:
            body["safeResult"] = outcome.safe_result
        return await self._request(
            "POST", f"/activity-invocations/{quote(invocation_key, safe='')}/{action}",
            json=body, idempotency_key=invocation_key,
        )

    async def _request(self, method: str, path: str, *, json: object | None = None,
                       idempotency_key: str | None = None) -> dict[str, Any]:
        token = await self._tokens.get_token()
        headers = {"authorization": f"Bearer {token}"}
        if idempotency_key is not None:
            headers["idempotency-key"] = idempotency_key
        try:
            async with self._client.stream(
                method, self._base_url + path, json=json, headers=headers,
                timeout=self._timeout,
            ) as response:
                if not response.is_success:
                    retryable = response.status_code in {408, 429} or response.status_code >= 500
                    raise AgenticControlError(
                        "AGENTIC_CONTROL_REJECTED", retryable=retryable,
                        status_code=response.status_code,
                    )
                chunks: list[bytes] = []
                length = 0
                async for chunk in response.aiter_bytes():
                    length += len(chunk)
                    if length > self._maximum:
                        raise AgenticControlError("AGENTIC_RESPONSE_TOO_LARGE", retryable=False)
                    chunks.append(chunk)
        except AgenticControlError:
            raise
        except httpx.HTTPError as error:
            raise AgenticControlError("AGENTIC_CONTROL_TRANSPORT_FAILED", retryable=True) from error
        try:
            envelope = httpx.Response(200, content=b"".join(chunks)).json()
            data = envelope["data"]
            if envelope.get("success") is not True or not isinstance(data, dict):
                raise ValueError
            return data
        except (ValueError, KeyError, TypeError) as error:
            raise AgenticControlError("AGENTIC_RESPONSE_INVALID", retryable=False) from error
