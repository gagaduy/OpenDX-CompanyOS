# SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
# SPDX-License-Identifier: Apache-2.0

from __future__ import annotations

import asyncio
from collections.abc import Callable
from datetime import timedelta
from typing import Any, Awaitable

from temporalio.api.enums.v1 import TaskQueueType, WorkflowExecutionStatus
from temporalio.api.taskqueue.v1 import TaskQueue
from temporalio.api.workflowservice.v1 import (
    DescribeNamespaceRequest,
    DescribeTaskQueueRequest,
)
from temporalio.client import Client
from temporalio.common import WorkflowIDConflictPolicy, WorkflowIDReusePolicy
from temporalio.exceptions import WorkflowAlreadyStartedError
from temporalio.service import RPCError, RPCStatusCode, TLSConfig

from app.agentic.application.workflow_control import (
    TemporalAlreadyStarted,
    TemporalControlFailure,
    TemporalDescription,
)
from app.agentic.domain.contracts import StoreHealthReviewInput
from app.agentic.workflows.store_health_review_v1 import StoreHealthReviewWorkflowV1
from app.shared.config import TemporalSettings


class TemporalClientAdapter:
    def __init__(
        self,
        client: Client,
        task_queue: str,
        identity: str = "opendx-ai-runtime",
    ) -> None:
        self._client = client
        self._task_queue = task_queue
        self._identity = identity

    @property
    def raw_client(self) -> Client:
        if self._client is None:
            raise TemporalControlFailure("TEMPORAL_CLIENT_CLOSED", retryable=False)
        return self._client

    async def start(self, workflow_id: str, value: StoreHealthReviewInput) -> str:
        try:
            handle = await self.raw_client.start_workflow(
                StoreHealthReviewWorkflowV1.run,
                value,
                id=workflow_id,
                task_queue=self._task_queue,
                id_reuse_policy=WorkflowIDReusePolicy.REJECT_DUPLICATE,
                id_conflict_policy=WorkflowIDConflictPolicy.FAIL,
            )
            run_id = handle.result_run_id or handle.run_id
            if not run_id:
                raise TemporalControlFailure(
                    "TEMPORAL_RESPONSE_INVALID", retryable=False
                )
            return run_id
        except WorkflowAlreadyStartedError as error:
            raise TemporalAlreadyStarted(error.run_id) from error
        except TemporalControlFailure:
            raise
        except RPCError as error:
            raise _safe_rpc_error(error) from error
        except Exception as error:
            raise TemporalControlFailure(
                "TEMPORAL_UNAVAILABLE", retryable=True
            ) from error

    async def describe(self, workflow_id: str) -> TemporalDescription:
        try:
            description = await self.raw_client.get_workflow_handle(workflow_id).describe()
            info = description.raw_description.workflow_execution_info
            status = _status(info.status)
            run_id = info.execution.run_id or None
            return TemporalDescription(status, run_id)
        except RPCError as error:
            raise _safe_rpc_error(error) from error
        except TemporalControlFailure:
            raise
        except Exception as error:
            raise TemporalControlFailure(
                "TEMPORAL_RESPONSE_INVALID", retryable=False
            ) from error

    async def signal(self, workflow_id: str, name: str, value: object) -> None:
        if name not in {"approve", "cancel"}:
            raise TemporalControlFailure("TEMPORAL_SIGNAL_INVALID", retryable=False)
        try:
            await self.raw_client.get_workflow_handle(workflow_id).signal(name, value)
        except RPCError as error:
            raise _safe_rpc_error(error) from error
        except Exception as error:
            raise TemporalControlFailure(
                "TEMPORAL_UNAVAILABLE", retryable=True
            ) from error

    async def probe(self) -> None:
        try:
            client = self.raw_client
            await client.service_client.check_health(timeout=timedelta(seconds=5))
            await client.workflow_service.describe_namespace(
                DescribeNamespaceRequest(namespace=client.namespace),
                timeout=timedelta(seconds=5),
            )
            await client.workflow_service.describe_task_queue(
                DescribeTaskQueueRequest(
                    namespace=client.namespace,
                    task_queue=TaskQueue(name=self._task_queue),
                    task_queue_type=TaskQueueType.TASK_QUEUE_TYPE_WORKFLOW,
                ),
                timeout=timedelta(seconds=5),
            )
        except RPCError as error:
            raise _safe_rpc_error(error) from error
        except Exception as error:
            raise TemporalControlFailure(
                "TEMPORAL_UNAVAILABLE", retryable=True
            ) from error

    async def wait_until_polling(self, timeout_seconds: int) -> None:
        try:
            async with asyncio.timeout(timeout_seconds):
                while True:
                    client = self.raw_client
                    response = await client.workflow_service.describe_task_queue(
                        DescribeTaskQueueRequest(
                            namespace=client.namespace,
                            task_queue=TaskQueue(name=self._task_queue),
                            task_queue_type=TaskQueueType.TASK_QUEUE_TYPE_WORKFLOW,
                            report_pollers=True,
                        ),
                        timeout=timedelta(seconds=min(timeout_seconds, 5)),
                    )
                    if any(
                        poller.identity == self._identity
                        for poller in response.pollers
                    ):
                        return
                    await asyncio.sleep(0.1)
        except (TimeoutError, RPCError) as error:
            raise TemporalControlFailure(
                "TEMPORAL_WORKER_NOT_POLLING", retryable=True
            ) from error

    async def aclose(self) -> None:
        # temporalio 1.30 owns channels through its Runtime and exposes no close API.
        # Releasing the adapter reference after worker drain gives that Runtime
        # deterministic ownership of the remaining channel lifetime.
        self._client = None


async def connect_temporal(
    settings: TemporalSettings,
    connect: Callable[..., Awaitable[Client]] = Client.connect,
    identity: str = "opendx-ai-runtime",
) -> TemporalClientAdapter:
    tls: TLSConfig | None = None
    if settings.tls is not None:
        try:
            tls = TLSConfig(
                server_root_ca_cert=_read(settings.tls.ca_path),
                client_cert=_read(settings.tls.certificate_path),
                client_private_key=_read(settings.tls.key_path),
                domain=settings.tls.server_name,
            )
        except OSError as error:
            raise TemporalControlFailure(
                "TEMPORAL_TLS_MATERIAL_UNAVAILABLE", retryable=False
            ) from error
    try:
        client = await connect(
            settings.address,
            namespace=settings.namespace,
            tls=tls,
            identity=identity,
        )
    except Exception as error:
        raise TemporalControlFailure("TEMPORAL_UNAVAILABLE", retryable=True) from error
    return TemporalClientAdapter(client, settings.task_queue, identity)


def _read(path: str) -> bytes:
    with open(path, "rb") as source:
        return source.read()


def _safe_rpc_error(error: RPCError) -> TemporalControlFailure:
    if error.status is RPCStatusCode.NOT_FOUND:
        return TemporalControlFailure("TEMPORAL_WORKFLOW_NOT_FOUND", retryable=False)
    retryable = error.status in {
        RPCStatusCode.CANCELLED,
        RPCStatusCode.DEADLINE_EXCEEDED,
        RPCStatusCode.RESOURCE_EXHAUSTED,
        RPCStatusCode.ABORTED,
        RPCStatusCode.INTERNAL,
        RPCStatusCode.UNAVAILABLE,
    }
    code = "TEMPORAL_UNAVAILABLE" if retryable else "TEMPORAL_REJECTED"
    return TemporalControlFailure(code, retryable=retryable)


def _status(value: WorkflowExecutionStatus.ValueType) -> str:
    statuses = {
        WorkflowExecutionStatus.WORKFLOW_EXECUTION_STATUS_RUNNING: "running",
        WorkflowExecutionStatus.WORKFLOW_EXECUTION_STATUS_COMPLETED: "completed",
        WorkflowExecutionStatus.WORKFLOW_EXECUTION_STATUS_FAILED: "failed",
        WorkflowExecutionStatus.WORKFLOW_EXECUTION_STATUS_CANCELED: "canceled",
        WorkflowExecutionStatus.WORKFLOW_EXECUTION_STATUS_TERMINATED: "canceled",
        WorkflowExecutionStatus.WORKFLOW_EXECUTION_STATUS_TIMED_OUT: "failed",
        WorkflowExecutionStatus.WORKFLOW_EXECUTION_STATUS_CONTINUED_AS_NEW: "running",
    }
    status = statuses.get(value)
    if status is None:
        raise TemporalControlFailure("TEMPORAL_RESPONSE_INVALID", retryable=False)
    return status


class DeferredTemporalClient:
    def __init__(
        self,
        settings: TemporalSettings,
        connect: Callable[[TemporalSettings], Awaitable[TemporalClientAdapter]]
        = connect_temporal,
    ) -> None:
        self._settings = settings
        self._connect = connect
        self._adapter: TemporalClientAdapter | None = None
        self._connecting = asyncio.Lock()

    async def start(self, workflow_id: str, value: StoreHealthReviewInput) -> str:
        return await (await self._required()).start(workflow_id, value)

    async def describe(self, workflow_id: str) -> TemporalDescription:
        return await (await self._required()).describe(workflow_id)

    async def signal(self, workflow_id: str, name: str, value: object) -> None:
        await (await self._required()).signal(workflow_id, name, value)

    async def probe(self) -> None:
        await (await self._required()).probe()

    async def aclose(self) -> None:
        async with self._connecting:
            adapter, self._adapter = self._adapter, None
            if adapter is not None:
                await adapter.aclose()

    async def _required(self) -> TemporalClientAdapter:
        if self._adapter is not None:
            return self._adapter
        async with self._connecting:
            if self._adapter is None:
                self._adapter = await self._connect(self._settings)
        return self._adapter
