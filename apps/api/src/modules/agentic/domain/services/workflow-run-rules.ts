// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import {
  isTerminalWorkflowState,
  type WorkflowOutcomeCode,
  type WorkflowRun,
  type WorkflowRunState,
} from "../entities/workflow-run";
import { AgenticDomainError } from "../exceptions/agentic-domain.error";

export interface WorkflowRunTransition {
  readonly state: WorkflowRunState;
  readonly outcomeCode?: WorkflowOutcomeCode;
}

const transitions: Readonly<Record<Exclude<WorkflowRunState, "retrying" | "partially_completed" | "failed" | "canceled" | "completed">, readonly WorkflowRunState[]>> = {
  received: ["planning", "failed", "canceled"],
  planning: ["awaiting_plan_approval", "dispatching", "failed", "canceled"],
  awaiting_plan_approval: ["dispatching", "failed", "canceled"],
  dispatching: ["department_analysis", "failed", "canceled"],
  department_analysis: ["retrying", "quality_review", "partially_completed", "failed", "canceled"],
  quality_review: ["retrying", "collaboration", "executive_synthesis", "partially_completed", "failed", "canceled"],
  collaboration: ["retrying", "executive_synthesis", "partially_completed", "failed", "canceled"],
  executive_synthesis: ["retrying", "awaiting_human_approval", "completed", "partially_completed", "failed", "canceled"],
  awaiting_human_approval: ["completed", "failed", "canceled"],
};

const failedOutcomes = new Set<WorkflowOutcomeCode>([
  "APPROVAL_REJECTED",
  "APPROVAL_EXPIRED",
  "RETRY_EXHAUSTED",
  "ACTIVITY_REJECTED",
  "INVALID_FROZEN_PLAN",
]);

export function transitionWorkflowRun(
  run: WorkflowRun,
  transition: WorkflowRunTransition,
  at: string,
): WorkflowRun {
  if (isTerminalWorkflowState(run.state)) {
    fail("WORKFLOW_TERMINAL_IMMUTABLE", "Terminal workflow runs are immutable");
  }

  if (run.state === "retrying") {
    if (transition.state !== run.resumeState) invalidState(run.state, transition.state);
  } else if (!transitions[run.state].includes(transition.state)) {
    invalidState(run.state, transition.state);
  }

  validateOutcome(transition.state, transition.outcomeCode);
  const terminal = isTerminalWorkflowState(transition.state);
  const resumeState = transition.state === "retrying"
    ? run.state as Exclude<WorkflowRunState, "retrying">
    : undefined;

  return {
    ...run,
    state: transition.state,
    projectionSequence: run.projectionSequence + 1,
    version: run.version + 1,
    updatedAt: at,
    ...(resumeState === undefined ? {} : { resumeState }),
    ...(transition.outcomeCode === undefined ? {} : { outcomeCode: transition.outcomeCode }),
    ...(terminal ? { completedAt: at } : {}),
    ...(run.state === "retrying" && transition.state !== "retrying"
      ? { resumeState: undefined }
      : {}),
  };
}

function validateOutcome(
  state: WorkflowRunState,
  outcomeCode: WorkflowOutcomeCode | undefined,
): void {
  const valid = state === "completed"
    ? outcomeCode === "COMPLETED"
    : state === "partially_completed"
      ? outcomeCode === "PARTIAL_ACTIVITY_FAILURE"
      : state === "canceled"
        ? outcomeCode === "CANCELED_BY_STAFF"
        : state === "failed"
          ? outcomeCode !== undefined && failedOutcomes.has(outcomeCode)
          : outcomeCode === undefined;
  if (!valid) {
    fail("WORKFLOW_OUTCOME_INVALID", "Workflow outcome does not match its state");
  }
}

function invalidState(from: WorkflowRunState, to: WorkflowRunState): never {
  return fail(
    "WORKFLOW_STATE_INVALID",
    `Workflow cannot transition from ${from} to ${to}`,
  );
}

function fail(code: string, message: string): never {
  throw new AgenticDomainError(code, message);
}
