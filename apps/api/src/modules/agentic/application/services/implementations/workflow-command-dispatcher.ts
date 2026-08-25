// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { TransactionRunner } from "../../../../../shared/database/transaction";
import type { AgenticRepository } from "../../repositories/interfaces/agentic.repository";
import type { WorkflowGateway } from "../../workflows/interfaces/workflow-gateway";
import type { WorkflowRun, WorkflowSignalReceipt } from "../../../domain/entities/workflow-run";

type DispatcherRepository = Pick<AgenticRepository,
  | "listPendingWorkflowStarts" | "listPendingWorkflowSignals"
  | "findWorkflowRun" | "attachTemporalRunId" | "updateWorkflowSignalReceipt">;

export class WorkflowCommandDispatcher {
  private timer: ReturnType<typeof setInterval> | undefined;
  private activeCycle: Promise<void> | undefined;

  constructor(
    private readonly repository: DispatcherRepository,
    private readonly transactions: TransactionRunner,
    private readonly gateway: WorkflowGateway,
    private readonly now: () => string,
    private readonly intervalMs: number,
    private readonly batchSize: number,
    private readonly onError: (error: unknown) => void,
  ) {
    if (!Number.isSafeInteger(intervalMs) || intervalMs < 1) {
      throw new RangeError("Workflow dispatcher interval must be positive");
    }
    if (!Number.isSafeInteger(batchSize) || batchSize < 1 || batchSize > 1_000) {
      throw new RangeError("Workflow dispatcher batch size must be between 1 and 1000");
    }
  }

  start(): void {
    if (this.timer !== undefined) return;
    this.timer = setInterval(() => this.runCycle(), this.intervalMs);
    this.timer.unref();
    this.runCycle();
  }

  async stop(): Promise<void> {
    if (this.timer !== undefined) clearInterval(this.timer);
    this.timer = undefined;
    await this.activeCycle;
  }

  async dispatchOnce(): Promise<void> {
    const pending = await this.transactions.runReadOnly(async (session) => ({
      starts: await this.repository.listPendingWorkflowStarts(session, this.batchSize),
      signals: await this.repository.listPendingWorkflowSignals(session, this.batchSize),
    }));
    for (const run of pending.starts) {
      await this.dispatchStart(run).catch(this.onError);
    }
    for (const receipt of pending.signals) {
      await this.dispatchSignal(receipt).catch(this.onError);
    }
  }

  private runCycle(): void {
    if (this.activeCycle !== undefined) return;
    this.activeCycle = this.dispatchOnce()
      .catch(this.onError)
      .finally(() => { this.activeCycle = undefined; });
  }

  private async dispatchStart(run: WorkflowRun): Promise<void> {
    const result = await this.gateway.start({
      workflowRunId: run.id,
      temporalWorkflowId: run.temporalWorkflowId,
      taskId: run.taskId,
      workflowVersion: 1,
      planRevision: run.planRevision,
    });
    await this.transactions.run(async (session) => {
      const current = await this.repository.findWorkflowRun(session, run.id);
      if (current === undefined || current.temporalRunId !== undefined) return;
      await this.repository.attachTemporalRunId(
        session,
        current.id,
        result.temporalRunId,
        current.version,
        this.now(),
      );
    });
  }

  private async dispatchSignal(receipt: WorkflowSignalReceipt): Promise<void> {
    const run = await this.transactions.runReadOnly((session) =>
      this.repository.findWorkflowRun(session, receipt.workflowRunId));
    if (run === undefined) throw new Error("Pending workflow signal has no workflow run");
    if (receipt.signalKind === "approval") {
      await this.gateway.signalApproval({
        temporalWorkflowId: run.temporalWorkflowId,
        idempotencyKey: receipt.idempotencyKey,
        approvalId: receipt.approvalId!,
        payloadDigest: receipt.payloadDigest,
        decision: receipt.decision!,
        applicationDecisionVersion: receipt.applicationDecisionVersion!,
      });
    } else {
      await this.gateway.signalCancellation({
        temporalWorkflowId: run.temporalWorkflowId,
        idempotencyKey: receipt.idempotencyKey,
        payloadDigest: receipt.payloadDigest,
        reasonCode: receipt.reasonCode!,
      });
    }
    await this.transactions.run((session) => this.repository.updateWorkflowSignalReceipt(
      session,
      {
        ...receipt,
        deliveryState: "delivered",
        accepted: true,
        deliveredAt: this.now(),
      },
    ));
  }
}
