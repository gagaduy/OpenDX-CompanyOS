# SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
# SPDX-License-Identifier: Apache-2.0

from __future__ import annotations

from typing import Protocol

from app.agentic.domain.contracts import (
    ActivityOutcome,
    ActivityReservationRequest,
    FrozenWorkflowPlan,
    StateProjection,
    WorkloadPrincipal,
)


class WorkloadVerifier(Protocol):
    def verify(self, token: str) -> WorkloadPrincipal: ...


class AccessTokenProvider(Protocol):
    async def get_token(self) -> str: ...


class AgenticControlPort(Protocol):
    async def load_plan(self, run_id: str) -> FrozenWorkflowPlan: ...
    async def project_state(self, run_id: str, projection: StateProjection) -> object: ...
    async def reserve_activity(self, reservation: ActivityReservationRequest) -> object: ...
    async def complete_activity(self, invocation_key: str, outcome: ActivityOutcome) -> object: ...
    async def fail_activity(self, invocation_key: str, outcome: ActivityOutcome) -> object: ...
