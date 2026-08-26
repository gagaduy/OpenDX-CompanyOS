# SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
# SPDX-License-Identifier: Apache-2.0

from __future__ import annotations

from typing import Annotated, Any, Literal

from fastapi import APIRouter, Depends, Header, HTTPException, Response
from pydantic import BaseModel, ConfigDict, Field

from app.agentic.application.workflow_control import (
    ApprovalCommand,
    CancellationCommand,
    StartWorkflowCommand,
    WorkflowControlError,
)
from app.agentic.domain.contracts import ApprovalDecision
from app.agentic.presentation.workload_auth import WorkloadAuthenticator


BoundedId = Annotated[str, Field(min_length=1, max_length=255, pattern=r"^\S+$")]
Digest = Annotated[str, Field(pattern=r"^[a-f0-9]{64}$")]
ReasonCode = Annotated[str, Field(pattern=r"^[A-Z][A-Z0-9_]{0,99}$")]
PositiveVersion = Annotated[int, Field(ge=1, le=2_147_483_647)]
CorrelationId = Annotated[
    str,
    Header(
        alias="x-correlation-id",
        min_length=1,
        max_length=255,
        pattern=r"^\S+$",
    ),
]


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True, populate_by_name=True)


class StartRequest(StrictModel):
    workflow_run_id: BoundedId = Field(alias="workflowRunId")
    temporal_workflow_id: BoundedId = Field(alias="temporalWorkflowId")
    task_id: BoundedId = Field(alias="taskId")
    workflow_version: Literal[1] = Field(alias="workflowVersion")
    plan_revision: PositiveVersion = Field(alias="planRevision")
    execution_profile: Literal["store_health_review", "advanced_live"] = Field(
        alias="executionProfile"
    )


class StartResponse(StrictModel):
    temporal_run_id: BoundedId = Field(alias="temporalRunId")
    duplicate: bool


class DescriptionResponse(StrictModel):
    status: Literal["running", "completed", "failed", "canceled"]
    temporal_run_id: BoundedId | None = Field(default=None, alias="temporalRunId")


class ApprovalRequest(StrictModel):
    idempotency_key: BoundedId = Field(alias="idempotencyKey")
    approval_id: BoundedId = Field(alias="approvalId")
    payload_digest: Digest = Field(alias="payloadDigest")
    decision: Literal["approved", "rejected"]
    application_decision_version: PositiveVersion = Field(
        alias="applicationDecisionVersion"
    )


class CancellationRequest(StrictModel):
    idempotency_key: BoundedId = Field(alias="idempotencyKey")
    payload_digest: Digest = Field(alias="payloadDigest")
    reason_code: ReasonCode = Field(alias="reasonCode")


def create_agentic_router(
    control: Any, authenticator: WorkloadAuthenticator
) -> APIRouter:
    router = APIRouter(prefix="/internal/agentic/workflow-runs")

    def authenticate(authorization: str | None = Header(default=None)) -> None:
        try:
            authenticator.authenticate(authorization)
        except Exception as error:
            raise HTTPException(
                status_code=401, detail="WORKLOAD_AUTHENTICATION_REQUIRED"
            ) from error

    @router.post("/start", response_model=StartResponse)
    async def start(
        value: StartRequest,
        correlation_id: CorrelationId,
        _: None = Depends(authenticate),
    ) -> StartResponse:
        try:
            result = await control.start(StartWorkflowCommand(
                workflow_run_id=value.workflow_run_id,
                temporal_workflow_id=value.temporal_workflow_id,
                task_id=value.task_id,
                workflow_version=value.workflow_version,
                plan_revision=value.plan_revision,
                execution_profile=value.execution_profile,
                correlation_id=correlation_id,
            ))
            return StartResponse(
                temporal_run_id=result.temporal_run_id, duplicate=result.duplicate
            )
        except WorkflowControlError as error:
            raise _http_error(error) from error

    @router.get("/{workflow_id}", response_model=DescriptionResponse)
    async def describe(
        workflow_id: BoundedId,
        correlation_id: CorrelationId,
        _: None = Depends(authenticate),
    ) -> DescriptionResponse:
        try:
            result = await control.describe(workflow_id, correlation_id)
            return DescriptionResponse(
                status=result.status, temporal_run_id=result.temporal_run_id
            )
        except WorkflowControlError as error:
            raise _http_error(error) from error

    @router.post("/{workflow_id}/signals/approval", status_code=204)
    async def signal_approval(
        workflow_id: BoundedId,
        value: ApprovalRequest,
        correlation_id: CorrelationId,
        idempotency_key: str | None = Header(default=None, alias="idempotency-key"),
        _: None = Depends(authenticate),
    ) -> Response:
        _match_receipt(idempotency_key, value.idempotency_key)
        try:
            await control.signal_approval(ApprovalCommand(
                temporal_workflow_id=workflow_id,
                idempotency_key=value.idempotency_key,
                approval_id=value.approval_id,
                payload_digest=value.payload_digest,
                decision=ApprovalDecision(value.decision),
                application_decision_version=value.application_decision_version,
                correlation_id=correlation_id,
            ))
            return Response(status_code=204)
        except WorkflowControlError as error:
            raise _http_error(error) from error

    @router.post("/{workflow_id}/signals/cancellation", status_code=204)
    async def signal_cancellation(
        workflow_id: BoundedId,
        value: CancellationRequest,
        correlation_id: CorrelationId,
        idempotency_key: str | None = Header(default=None, alias="idempotency-key"),
        _: None = Depends(authenticate),
    ) -> Response:
        _match_receipt(idempotency_key, value.idempotency_key)
        try:
            await control.signal_cancellation(CancellationCommand(
                temporal_workflow_id=workflow_id,
                idempotency_key=value.idempotency_key,
                payload_digest=value.payload_digest,
                reason_code=value.reason_code,
                correlation_id=correlation_id,
            ))
            return Response(status_code=204)
        except WorkflowControlError as error:
            raise _http_error(error) from error

    return router


def _match_receipt(header: str | None, body: str) -> None:
    if header != body:
        raise HTTPException(status_code=409, detail="WORKFLOW_SIGNAL_CONFLICT")


def _http_error(error: WorkflowControlError) -> HTTPException:
    if error.code == "TEMPORAL_WORKFLOW_NOT_FOUND":
        status = 404
    elif error.retryable:
        status = 503
    elif error.code.endswith("INVALID"):
        status = 422
    else:
        status = 409
    return HTTPException(status_code=status, detail=error.code)
