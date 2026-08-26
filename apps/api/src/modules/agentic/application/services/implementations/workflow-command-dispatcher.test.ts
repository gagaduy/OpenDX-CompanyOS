// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it, vi } from "vitest";
import type { DatabaseSession, TransactionRunner } from "../../../../../shared/database/transaction";
import type { AgenticRepository } from "../../repositories/interfaces/agentic.repository";
import type { WorkflowGateway } from "../../workflows/interfaces/workflow-gateway";
import type { WorkflowRun, WorkflowSignalReceipt } from "../../../domain/entities/workflow-run";
import { WorkflowCommandDispatcher } from "./workflow-command-dispatcher";

const session = {} as DatabaseSession;
const transactions: TransactionRunner = {
  run: (work) => work(session),
  runReadOnly: (work) => work(session),
};

describe("WorkflowCommandDispatcher", () => {
  it("attaches a Temporal run only after start acknowledgement", async () => {
    const run = workflowRun();
    const { dispatcher, repository, gateway } = harness({ starts: [run] });

    await dispatcher.dispatchOnce();

    expect(gateway.start).toHaveBeenCalledWith(expect.objectContaining({
      workflowRunId: run.id,
      temporalWorkflowId: run.temporalWorkflowId,
      executionProfile: "advanced_live",
    }));
    expect(repository.attachTemporalRunId).toHaveBeenCalledWith(
      session, run.id, "temporal-run-1", 1, "2026-08-14T12:00:00.000Z",
    );
  });

  it("delivers approval and cancellation receipts with their stable idempotency keys", async () => {
    const run = workflowRun({ temporalRunId: "temporal-run-1" });
    const approval = approvalReceipt(run.id);
    const cancellation = cancellationReceipt(run.id);
    const { dispatcher, repository, gateway } = harness({
      run,
      signals: [approval, cancellation],
    });

    await dispatcher.dispatchOnce();

    expect(gateway.signalApproval).toHaveBeenCalledWith(expect.objectContaining({
      idempotencyKey: approval.idempotencyKey,
      approvalId: approval.approvalId,
    }));
    expect(gateway.signalCancellation).toHaveBeenCalledWith(expect.objectContaining({
      idempotencyKey: cancellation.idempotencyKey,
      reasonCode: "CANCELED_BY_OPERATOR",
    }));
    expect(repository.updateWorkflowSignalReceipt).toHaveBeenCalledTimes(2);
    const delivered = repository.updateWorkflowSignalReceipt.mock.calls;
    expect(delivered.map(([, receipt]) => receipt))
      .toEqual(expect.arrayContaining([
        expect.objectContaining({ id: approval.id, deliveryState: "delivered", accepted: true }),
        expect.objectContaining({ id: cancellation.id, deliveryState: "delivered", accepted: true }),
      ]));
  });

  it("keeps failed commands pending and continues the batch", async () => {
    const first = workflowRun({ id: "run-1", temporalWorkflowId: "store-health-v1:run-1" });
    const second = workflowRun({ id: "run-2", taskId: "task-2", temporalWorkflowId: "store-health-v1:run-2" });
    const onError = vi.fn();
    const { dispatcher, repository, gateway } = harness({ starts: [first, second], onError });
    vi.mocked(gateway.start)
      .mockRejectedValueOnce(new Error("Temporal unavailable"))
      .mockResolvedValueOnce({ temporalRunId: "temporal-run-2", duplicate: false });

    await dispatcher.dispatchOnce();

    expect(onError).toHaveBeenCalledOnce();
    expect(repository.attachTemporalRunId).toHaveBeenCalledOnce();
    expect(repository.attachTemporalRunId).toHaveBeenCalledWith(
      session, second.id, "temporal-run-2", 1, "2026-08-14T12:00:00.000Z",
    );
  });
});

interface HarnessOptions {
  readonly starts?: readonly WorkflowRun[];
  readonly signals?: readonly WorkflowSignalReceipt[];
  readonly run?: WorkflowRun;
  readonly onError?: (error: unknown) => void;
}

function harness(options: HarnessOptions = {}) {
  const runs = new Map(
    [...(options.starts ?? []), ...(options.run === undefined ? [] : [options.run])]
      .map((run) => [run.id, run] as const),
  );
  const repository = {
    listPendingWorkflowStarts: vi.fn(async () => options.starts ?? []),
    listPendingWorkflowSignals: vi.fn(async () => options.signals ?? []),
    findWorkflowRun: vi.fn(async (_session: DatabaseSession, id: string) => runs.get(id)),
    findTaskById: vi.fn(async () => ({ executionProfile: "advanced_live" as const })),
    attachTemporalRunId: vi.fn(async () => true),
    updateWorkflowSignalReceipt: vi.fn(async (
      _session: DatabaseSession,
      _receipt: WorkflowSignalReceipt,
    ) => true),
  };
  const gateway: WorkflowGateway = {
    probe: vi.fn(async () => undefined),
    start: vi.fn(async () => ({ temporalRunId: "temporal-run-1", duplicate: false })),
    signalApproval: vi.fn(async () => undefined),
    signalCancellation: vi.fn(async () => undefined),
    describe: vi.fn(async () => ({ status: "running" as const })),
  };
  const dispatcher = new WorkflowCommandDispatcher(
    repository as unknown as AgenticRepository,
    transactions,
    gateway,
    () => "2026-08-14T12:00:00.000Z",
    5_000,
    20,
    options.onError ?? (() => undefined),
  );
  return { dispatcher, repository, gateway };
}

function workflowRun(overrides: Partial<WorkflowRun> = {}): WorkflowRun {
  return {
    id: "run-1", taskId: "task-1", workflowName: "StoreHealthReviewWorkflowV1",
    workflowVersion: 1, planRevision: 2,
    temporalWorkflowId: "store-health-v1:run-1", state: "received",
    projectionSequence: 0, version: 1,
    createdAt: "2026-08-14T12:00:00.000Z", updatedAt: "2026-08-14T12:00:00.000Z",
    ...overrides,
  };
}

function approvalReceipt(workflowRunId: string): WorkflowSignalReceipt {
  return {
    id: "receipt-approval", workflowRunId, signalKind: "approval",
    idempotencyKey: "approval:approval-1:2", approvalId: "approval-1",
    payloadDigest: "a".repeat(64), decision: "approved",
    applicationDecisionVersion: 2, deliveryState: "pending",
    createdAt: "2026-08-14T12:00:00.000Z",
  };
}

function cancellationReceipt(workflowRunId: string): WorkflowSignalReceipt {
  return {
    id: "receipt-cancel", workflowRunId, signalKind: "cancellation",
    idempotencyKey: `cancellation:${workflowRunId}:3`,
    payloadDigest: "b".repeat(64), reasonCode: "CANCELED_BY_OPERATOR",
    deliveryState: "pending", createdAt: "2026-08-14T12:00:00.000Z",
  };
}
