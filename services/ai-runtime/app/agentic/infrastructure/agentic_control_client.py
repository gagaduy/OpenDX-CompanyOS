# SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
# SPDX-License-Identifier: Apache-2.0

from __future__ import annotations

import json as json_module
from typing import Any
from urllib.parse import quote

import httpx

from app.agentic.application.ports import AgenticControlFailure, AccessTokenProvider
from app.agentic.domain.contracts import (
    ActivityOutcome,
    ActivityReservationRequest,
    ApprovalRequirement,
    FrozenWorkflowPlan,
    PlanDependency,
    PlanNode,
    StateProjection,
)

AUTHORITATIVE_CONTROL_ERROR_CODES = frozenset({"INVALID_FROZEN_PLAN"})


class AgenticControlError(AgenticControlFailure):
    def __init__(self, code: str, *, retryable: bool, status_code: int | None = None) -> None:
        super().__init__(code, retryable=retryable)
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
            approval = data.get("approval")
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
                approval=None if approval is None else ApprovalRequirement(
                    id=approval["id"], payload_digest=approval["payloadDigest"],
                    expires_at=approval["expiresAt"], policy_version=approval["policyVersion"],
                    application_decision_version=approval["applicationDecisionVersion"],
                ),
                partial_completion_allowed=data["partialCompletionAllowed"],
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
                status_code = response.status_code
                is_success = response.is_success
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
        if not is_success:
            error_code = "AGENTIC_CONTROL_REJECTED"
            try:
                envelope = json_module.loads(b"".join(chunks))
                candidate = envelope.get("errorCode")
                if (
                    envelope.get("success") is False
                    and candidate in AUTHORITATIVE_CONTROL_ERROR_CODES
                ):
                    error_code = candidate
            except (AttributeError, TypeError, ValueError):
                pass
            retryable = status_code in {408, 429} or status_code >= 500
            raise AgenticControlError(
                error_code, retryable=retryable, status_code=status_code
            )
        try:
            envelope = httpx.Response(200, content=b"".join(chunks)).json()
            data = envelope["data"]
            if envelope.get("success") is not True or not isinstance(data, dict):
                raise ValueError
            return data
        except (ValueError, KeyError, TypeError) as error:
            raise AgenticControlError("AGENTIC_RESPONSE_INVALID", retryable=False) from error
