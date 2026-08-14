# SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
# SPDX-License-Identifier: Apache-2.0

from __future__ import annotations

import asyncio
import logging
import signal
import uuid
from collections.abc import Awaitable, Callable, Sequence
from datetime import timedelta
from typing import Any

import httpx
from temporalio.worker import Worker

from app.agentic.activities.store_health_activities import StoreHealthActivities
from app.agentic.infrastructure.agentic_control_client import AgenticControlClient
from app.agentic.infrastructure.keycloak import KeycloakClientCredentialsProvider
from app.agentic.infrastructure.temporal_client import connect_temporal
from app.agentic.observability import BoundedMetrics, StructuredEventLogger
from app.agentic.workflows.store_health_review_v1 import StoreHealthReviewWorkflowV1
from app.shared.config import RuntimeSettings


async def run_supervised_worker(
    *,
    temporal_client: object,
    activities: StoreHealthActivities,
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
    await run_supervised_worker(
        temporal_client=temporal.raw_client,
        activities=StoreHealthActivities(
            control,
            metrics,
            logger,
            fake_activity_delay_ms=settings.activity.fake_delay_ms,
        ),
        task_queue=settings.temporal.task_queue,
        shutdown_grace_seconds=settings.worker_shutdown_grace_seconds,
        stop=stop,
        resources=(http, temporal),
        metrics=metrics,
        logger=logger,
        polling_probe=lambda: temporal.wait_until_polling(
            settings.worker_shutdown_grace_seconds
        ),
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
