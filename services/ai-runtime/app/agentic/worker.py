# SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
# SPDX-License-Identifier: Apache-2.0

from __future__ import annotations

import asyncio
import logging
import os
import signal
import uuid
from collections.abc import Awaitable, Callable, Sequence
from datetime import timedelta
from pathlib import Path
from typing import Any

import httpx
from temporalio.worker import Worker

from app.agentic.activities.orchestration_activities import OrchestrationActivities
from app.agentic.activities.store_health_activities import StoreHealthActivities
from app.agentic.activities.model_execution_activities import ModelExecutionActivities
from app.agentic.application.department_execution import (
    AiCeoPlanningService,
    AiCeoSynthesisService,
    DepartmentExecutionService,
)
from app.agentic.application.context_boundary import enforce_context_boundary
from app.agentic.application.model_executor import ModelExecutor
from app.agentic.application.phase_f_context import (
    PhaseFContext,
    build_phase_f_prompt,
)
from app.agentic.application.prompt_builder import build_model_prompt
from app.agentic.application.quality_gate import OrchestrationQualityGate, QualityGate
from app.agentic.domain.store_health_result_schemas import STORE_HEALTH_RESULT_SCHEMAS
from app.agentic.domain.model_runtime import AgentKind
from app.agentic.infrastructure.agent_submission_client import AgentSubmissionClient
from app.agentic.infrastructure.agentic_control_client import AgenticControlClient
from app.agentic.infrastructure.department_tools import DepartmentToolClient
from app.agentic.infrastructure.keycloak import (
    AgentTokenProviders,
    KeycloakClientCredentialsProvider,
    build_agent_token_providers,
)
from app.agentic.infrastructure.openrouter import OpenRouterModelGateway
from app.agentic.infrastructure.temporal_client import connect_temporal
from app.agentic.observability import BoundedMetrics, StructuredEventLogger
from app.agentic.worker_healthcheck import WorkerReadiness
from app.agentic.workflows.store_health_review_v1 import StoreHealthReviewWorkflowV1
from app.shared.config import RuntimeSettings


class WorkerActivities:
    def __init__(self, store_health: StoreHealthActivities,
                 model_execution: ModelExecutionActivities | None = None,
                 orchestration: Any | None = None) -> None:
        self._store_health = store_health
        self._model_execution = model_execution
        self._orchestration = orchestration

    @property
    def registered(self) -> list[object]:
        registered = list(self._store_health.registered)
        if self._model_execution is not None:
            registered.extend(self._model_execution.registered)
        if self._orchestration is not None:
            registered.extend(self._orchestration.registered)
        return registered


def build_model_executor(settings: RuntimeSettings, control: object, client: httpx.AsyncClient) -> ModelExecutor | None:
    if not settings.openrouter.execution_enabled:
        return None
    gateway = OpenRouterModelGateway(settings=settings.openrouter, client=client)
    return ModelExecutor(
        controls=control, gateway=gateway, quality_gate=QualityGate(),
        context_filter=lambda agent_kind, value: enforce_context_boundary(agent_kind, value),
        prompt_builder=build_model_prompt,
    )


def build_orchestration_activities(
    settings: RuntimeSettings, control: object, client: httpx.AsyncClient,
    *, executor: ModelExecutor | None = None,
    agent_tokens: AgentTokenProviders | None = None,
) -> OrchestrationActivities | None:
    if not settings.orchestration_descriptor_execution_enabled:
        return None
    phase_f_executor = executor or _build_orchestration_executor(settings, control, client)
    if phase_f_executor is None:
        raise ValueError("OpenRouter execution is required for descriptor execution")
    tokens = agent_tokens or build_agent_token_providers(settings.keycloak, client=client)
    tools = DepartmentToolClient(
        base_url=settings.agentic_api_base_url, tokens=tokens.departments,
        client=client, timeout_seconds=10, maximum_response_bytes=16_384,
    )
    submissions = AgentSubmissionClient(
        base_url=settings.agentic_api_base_url, tokens=tokens.ai_ceo,
        client=client, timeout_seconds=10, maximum_response_bytes=16_384,
    )
    department = DepartmentExecutionService(
        controls=control, tools=tools, models=phase_f_executor,
        result_schemas=STORE_HEALTH_RESULT_SCHEMAS,
    )
    planning = AiCeoPlanningService(
        controls=control, models=phase_f_executor, submissions=submissions,
        ai_ceo_client_id=settings.keycloak.ai_ceo_identity.client_id,
    )
    synthesis = AiCeoSynthesisService(controls=control, models=phase_f_executor)
    return OrchestrationActivities(
        department, planning=planning, synthesis=synthesis, controls=control,
    )


def _build_orchestration_executor(
    settings: RuntimeSettings, control: object, client: httpx.AsyncClient,
) -> ModelExecutor | None:
    if not settings.openrouter.execution_enabled:
        return None
    gateway = OpenRouterModelGateway(settings=settings.openrouter, client=client)

    def filter_context(agent_kind: AgentKind, context: object) -> object:
        if isinstance(context, PhaseFContext):
            return context
        return enforce_context_boundary(agent_kind, context)

    def prompt(agent_kind: AgentKind, context: object) -> object:
        if isinstance(context, PhaseFContext):
            return build_phase_f_prompt(context)
        return build_model_prompt(agent_kind, context)

    return ModelExecutor(
        controls=control, gateway=gateway, quality_gate=OrchestrationQualityGate(),
        context_filter=filter_context, prompt_builder=prompt,
    )


async def run_supervised_worker(
    *,
    temporal_client: object,
    activities: Any,
    task_queue: str,
    shutdown_grace_seconds: int,
    stop: asyncio.Event,
    resources: Sequence[Any] = (),
    worker_factory: Callable[..., Any] = Worker,
    metrics: Any | None = None,
    logger: Any | None = None,
    polling_probe: Callable[[], Awaitable[None]] | None = None,
) -> None:
    run_task: asyncio.Task[None] | None = None
    stop_task: asyncio.Task[bool] | None = None
    probe_task: asyncio.Task[None] | None = None
    try:
        worker = worker_factory(
            temporal_client,
            task_queue=task_queue,
            workflows=[StoreHealthReviewWorkflowV1],
            activities=activities.registered,
            graceful_shutdown_timeout=timedelta(seconds=shutdown_grace_seconds),
        )
        run_task = asyncio.create_task(worker.run())
        stop_task = asyncio.create_task(stop.wait())
        if polling_probe is not None:
            probe_task = asyncio.create_task(polling_probe())
            ready, _ = await asyncio.wait(
                (run_task, stop_task, probe_task),
                return_when=asyncio.FIRST_COMPLETED,
            )
            if probe_task in ready:
                await probe_task
            elif run_task in ready:
                await run_task
            else:
                await _shutdown_worker(
                    worker, run_task, shutdown_grace_seconds
                )
                return
        _observe_worker(metrics, logger, "healthy")
        done, _ = await asyncio.wait(
            (run_task, stop_task), return_when=asyncio.FIRST_COMPLETED
        )
        if run_task in done:
            try:
                await run_task
            except BaseException:
                _observe_worker(metrics, logger, "unavailable")
                raise
        else:
            await _shutdown_worker(worker, run_task, shutdown_grace_seconds)
    finally:
        if probe_task is not None:
            probe_task.cancel()
        if stop_task is not None:
            stop_task.cancel()
        if run_task is not None and not run_task.done():
            run_task.cancel()
        for resource in resources:
            await resource.aclose()


async def _shutdown_worker(
    worker: Any,
    run_task: asyncio.Task[None],
    shutdown_grace_seconds: int,
) -> None:
    try:
        async with asyncio.timeout(shutdown_grace_seconds):
            await worker.shutdown()
            await run_task
    except TimeoutError:
        run_task.cancel()
        try:
            await run_task
        except BaseException:
            pass


def _observe_worker(metrics: Any | None, logger: Any | None, outcome: str) -> None:
    try:
        if metrics is not None:
            metrics.increment("worker_polling", {"outcome": outcome})
        if logger is not None:
            logger.emit("worker_polling", outcome=outcome)
    except Exception:
        pass


async def run_from_settings(settings: RuntimeSettings) -> None:
    identity = worker_identity()
    readiness = WorkerReadiness(
        Path(os.environ.get("WORKER_READINESS_PATH", "/tmp/opendx-worker-ready")),
        identity,
    )
    temporal = await connect_temporal(
        settings.temporal, identity=identity
    )
    http = httpx.AsyncClient(timeout=10)
    tokens = KeycloakClientCredentialsProvider(
        token_url=settings.keycloak.token_url,
        client_id=settings.keycloak.worker_client_id,
        client_secret=settings.keycloak.worker_client_secret,
        audience=settings.keycloak.worker_audience,
        client=http,
    )
    control = AgenticControlClient(
        base_url=settings.agentic_api_base_url,
        tokens=tokens,
        client=http,
        timeout_seconds=10,
        maximum_response_bytes=16_384,
    )
    worker_log = logging.getLogger("opendx.agentic.worker")
    metrics = BoundedMetrics(logging.getLogger("opendx.agentic.metrics").info)
    logger = StructuredEventLogger(worker_log.info)
    stop = asyncio.Event()
    loop = asyncio.get_running_loop()
    for received in (signal.SIGTERM, signal.SIGINT):
        loop.add_signal_handler(received, stop.set)

    async def confirm_polling() -> None:
        await temporal.wait_until_polling(settings.worker_shutdown_grace_seconds)
        readiness.publish()

    store_health = StoreHealthActivities(
        control, metrics, logger, fake_activity_delay_ms=settings.activity.fake_delay_ms,
    )
    executor = build_model_executor(settings, control, http)
    model_execution = None if executor is None else ModelExecutionActivities(executor, metrics, logger)
    orchestration = build_orchestration_activities(settings, control, http)
    await run_supervised_worker(
        temporal_client=temporal.raw_client,
        activities=WorkerActivities(store_health, model_execution, orchestration),
        task_queue=settings.temporal.task_queue,
        shutdown_grace_seconds=settings.worker_shutdown_grace_seconds,
        stop=stop,
        resources=(readiness, http, temporal),
        metrics=metrics,
        logger=logger,
        polling_probe=confirm_polling,
    )


def main() -> None:
    configure_logging()
    asyncio.run(run_from_settings(RuntimeSettings.from_environment()))


def configure_logging() -> None:
    logging.basicConfig(level=logging.INFO, format="%(message)s")


def worker_identity(instance_id: str | None = None) -> str:
    value = instance_id or uuid.uuid4().hex
    if len(value) != 32 or any(character not in "0123456789abcdef" for character in value):
        raise ValueError("Worker instance identity is invalid")
    return f"opendx-ai-worker:{value}"


if __name__ == "__main__":
    main()
