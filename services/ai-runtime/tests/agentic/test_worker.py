# SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
# SPDX-License-Identifier: Apache-2.0

from __future__ import annotations

import asyncio
import logging
from typing import Any

from app.agentic.activities.store_health_activities import StoreHealthActivities
from app.agentic.worker import (
    WorkerActivities,
    build_model_executor,
    configure_logging,
    run_supervised_worker,
    worker_identity,
)
from app.agentic.workflows.store_health_review_v1 import StoreHealthReviewWorkflowV1


class WorkerFake:
    def __init__(self, _client: object, **options: Any) -> None:
        self.options = options
        self.running = asyncio.Event()
        self.finished = asyncio.Event()
        self.shutdown_calls = 0

    async def run(self) -> None:
        self.running.set()
        await self.finished.wait()

    async def shutdown(self) -> None:
        self.shutdown_calls += 1
        self.finished.set()


class ResourceFake:
    def __init__(self) -> None:
        self.closed = False

    async def aclose(self) -> None:
        self.closed = True


def test_standalone_worker_enables_structured_info_logs(
    monkeypatch: Any,
) -> None:
    captured: dict[str, object] = {}
    monkeypatch.setattr(logging, "basicConfig", lambda **options: captured.update(options))

    configure_logging()

    assert captured == {"level": logging.INFO, "format": "%(message)s"}


def test_worker_identity_is_unique_to_the_current_process_instance() -> None:
    assert worker_identity("a" * 32) == f"opendx-ai-worker:{'a' * 32}"


def test_model_executor_factory_returns_none_when_execution_is_disabled() -> None:
    class Settings:
        class OpenRouter:
            execution_enabled = False
        openrouter = OpenRouter()

    assert build_model_executor(Settings(), object(), object()) is None  # type: ignore[arg-type]


def test_registers_exact_v1_workflow_and_activity_names_then_drains() -> None:
    async def scenario() -> tuple[WorkerFake, ResourceFake]:
        created: list[WorkerFake] = []

        def factory(client: object, **options: Any) -> WorkerFake:
            worker = WorkerFake(client, **options)
            created.append(worker)
            return worker

        stop = asyncio.Event()
        resource = ResourceFake()
        running = asyncio.create_task(run_supervised_worker(
            temporal_client=object(),
            activities=StoreHealthActivities(None),  # type: ignore[arg-type]
            task_queue="store-health-v1",
            shutdown_grace_seconds=2,
            stop=stop,
            resources=(resource,),
            worker_factory=factory,
        ))
        while not created:
            await asyncio.sleep(0)
        await created[0].running.wait()
        stop.set()
        await running
        return created[0], resource

    worker, resource = asyncio.run(scenario())
    assert worker.options["workflows"] == [StoreHealthReviewWorkflowV1]
    names = {
        item.__temporal_activity_definition.name
        for item in worker.options["activities"]
    }
    assert names == {
        "load_frozen_plan",
        "project_state",
        "execute_fake_analysis",
        "execute_fake_quality_review",
        "execute_fake_collaboration",
        "execute_fake_synthesis",
    }
    assert worker.options["graceful_shutdown_timeout"].total_seconds() == 2
    assert worker.shutdown_calls == 1
    assert resource.closed is True


def test_worker_activity_registry_adds_model_execution_without_changing_workflow() -> None:
    class ModelActivities:
        registered = [object()]

    activities = WorkerActivities(StoreHealthActivities(None), ModelActivities())  # type: ignore[arg-type]

    assert len(activities.registered) == 7
    assert activities.registered[-1] is ModelActivities.registered[0]
    assert StoreHealthReviewWorkflowV1.__name__ == "StoreHealthReviewWorkflowV1"


def test_shutdown_timeout_still_closes_resources() -> None:
    class StuckWorker(WorkerFake):
        async def shutdown(self) -> None:
            self.shutdown_calls += 1
            await asyncio.Future()

    async def scenario() -> ResourceFake:
        resource = ResourceFake()
        stop = asyncio.Event()
        stop.set()
        await asyncio.wait_for(
            run_supervised_worker(
                temporal_client=object(),
                activities=StoreHealthActivities(None),  # type: ignore[arg-type]
                task_queue="store-health-v1",
                shutdown_grace_seconds=1,
                stop=stop,
                resources=(resource,),
                worker_factory=StuckWorker,
            ),
            timeout=2,
        )
        return resource

    assert asyncio.run(scenario()).closed is True


def test_worker_fatal_error_propagates_and_closes_resources_without_a_signal() -> None:
    class FailedWorker(WorkerFake):
        async def run(self) -> None:
            raise RuntimeError("poller failed")

    async def scenario() -> ResourceFake:
        resource = ResourceFake()
        try:
            await run_supervised_worker(
                temporal_client=object(),
                activities=StoreHealthActivities(None),  # type: ignore[arg-type]
                task_queue="store-health-v1",
                shutdown_grace_seconds=1,
                stop=asyncio.Event(),
                resources=(resource,),
                worker_factory=FailedWorker,
            )
        except RuntimeError as error:
            assert str(error) == "poller failed"
            return resource
        raise AssertionError("Worker failure was swallowed")

    assert asyncio.run(scenario()).closed is True


def test_worker_construction_failure_still_closes_resources() -> None:
    async def scenario() -> ResourceFake:
        resource = ResourceFake()

        def factory(_client: object, **_options: object) -> object:
            raise RuntimeError("worker construction failed")

        try:
            await run_supervised_worker(
                temporal_client=object(),
                activities=StoreHealthActivities(None),  # type: ignore[arg-type]
                task_queue="store-health-v1",
                shutdown_grace_seconds=1,
                stop=asyncio.Event(),
                resources=(resource,),
                worker_factory=factory,
            )
        except RuntimeError as error:
            assert str(error) == "worker construction failed"
            return resource
        raise AssertionError("Construction failure was swallowed")

    assert asyncio.run(scenario()).closed is True


def test_worker_reports_healthy_only_after_the_expected_poller_is_visible() -> None:
    async def scenario() -> tuple[bool, list[tuple[str, dict[str, str]]]]:
        created: list[WorkerFake] = []
        observations: list[tuple[str, dict[str, str]]] = []

        def factory(client: object, **options: Any) -> WorkerFake:
            worker = WorkerFake(client, **options)
            created.append(worker)
            return worker

        class Metrics:
            def increment(self, name: str, labels: dict[str, str]) -> None:
                observations.append((name, labels))

        async def polling_probe() -> None:
            while not created:
                await asyncio.sleep(0)
            assert created[0].running.is_set()

        stop = asyncio.Event()
        running = asyncio.create_task(run_supervised_worker(
            temporal_client=object(),
            activities=StoreHealthActivities(None),  # type: ignore[arg-type]
            task_queue="store-health-v1",
            shutdown_grace_seconds=1,
            stop=stop,
            worker_factory=factory,
            polling_probe=polling_probe,
            metrics=Metrics(),
        ))
        while not observations:
            await asyncio.sleep(0)
        stop.set()
        await running
        return created[0].running.is_set(), observations

    started, observations = asyncio.run(scenario())
    assert started is True
    assert observations[0] == ("worker_polling", {"outcome": "healthy"})
