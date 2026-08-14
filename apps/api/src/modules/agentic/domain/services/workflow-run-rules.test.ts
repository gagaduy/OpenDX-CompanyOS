// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import type { WorkflowRun, WorkflowRunState } from "../entities/workflow-run";
import { AgenticDomainError } from "../exceptions/agentic-domain.error";
import { transitionWorkflowRun } from "./workflow-run-rules";

const at = "2026-08-14T09:00:00.000Z";

describe("Workflow run rules", () => {
  it("advances through the complete deterministic path", () => {
    const states: readonly WorkflowRunState[] = [
      "planning",
      "dispatching",
      "department_analysis",
      "quality_review",
      "collaboration",
      "executive_synthesis",
      "completed",
    ];

    const result = states.reduce(
      (run, state) => transitionWorkflowRun(
        run,
        state === "completed" ? { state, outcomeCode: "COMPLETED" } : { state },
        at,
      ),
      workflowRun(),
    );

    expect(result).toMatchObject({
      state: "completed",
      outcomeCode: "COMPLETED",
      version: 8,
      projectionSequence: 7,
      completedAt: at,
    });
  });

  it("supports both governed approval wait points", () => {
    const planApproval = transitionWorkflowRun(
      workflowRun({ state: "planning" }),
      { state: "awaiting_plan_approval" },
      at,
    );
    const humanApproval = transitionWorkflowRun(
      workflowRun({ state: "executive_synthesis" }),
      { state: "awaiting_human_approval" },
      at,
    );

    expect(transitionWorkflowRun(planApproval, { state: "dispatching" }, at).state)
      .toBe("dispatching");
    expect(transitionWorkflowRun(
      humanApproval,
      { state: "completed", outcomeCode: "COMPLETED" },
      at,
    ).state).toBe("completed");
  });

  it.each([
    "department_analysis",
    "quality_review",
    "collaboration",
    "executive_synthesis",
  ] as const)("returns retrying work only to %s", (state) => {
    const retrying = transitionWorkflowRun(workflowRun({ state }), { state: "retrying" }, at);

    expect(retrying.resumeState).toBe(state);
    expect(transitionWorkflowRun(retrying, { state }, at)).toMatchObject({
      state,
      resumeState: undefined,
    });
    expectDomainError(
      () => transitionWorkflowRun(retrying, { state: "planning" }, at),
      "WORKFLOW_STATE_INVALID",
    );
  });

  it.each([
    ["completed", "COMPLETED"],
    ["partially_completed", "PARTIAL_ACTIVITY_FAILURE"],
    ["canceled", "CANCELED_BY_STAFF"],
    ["failed", "RETRY_EXHAUSTED"],
    ["failed", "ACTIVITY_REJECTED"],
  ] as const)("records terminal state %s with outcome %s", (state, outcomeCode) => {
    const source = state === "completed" ? "executive_synthesis" : "department_analysis";

    const result = transitionWorkflowRun(
      workflowRun({ state: source }),
      { state, outcomeCode },
      at,
    );

    expect(result).toMatchObject({ state, outcomeCode, completedAt: at, version: 2 });
  });

  it("rejects a terminal state without its matching outcome", () => {
    expectDomainError(
      () => transitionWorkflowRun(
        workflowRun({ state: "executive_synthesis" }),
        { state: "completed", outcomeCode: "RETRY_EXHAUSTED" },
        at,
      ),
      "WORKFLOW_OUTCOME_INVALID",
    );
  });

  it.each([
    ["received", "quality_review"],
    ["planning", "completed"],
    ["dispatching", "retrying"],
    ["awaiting_human_approval", "department_analysis"],
  ] as const)("rejects transition from %s to %s", (from, state) => {
    expectDomainError(
      () => transitionWorkflowRun(workflowRun({ state: from }), { state }, at),
      "WORKFLOW_STATE_INVALID",
    );
  });

  it.each([
    ["completed", "COMPLETED"],
    ["partially_completed", "PARTIAL_ACTIVITY_FAILURE"],
    ["failed", "RETRY_EXHAUSTED"],
    ["canceled", "CANCELED_BY_STAFF"],
  ] as const)("keeps terminal state %s immutable", (state, outcomeCode) => {
    expectDomainError(
      () => transitionWorkflowRun(
        workflowRun({ state, outcomeCode, completedAt: at }),
        { state: "planning" },
        at,
      ),
      "WORKFLOW_TERMINAL_IMMUTABLE",
    );
  });
});

function workflowRun(overrides: Partial<WorkflowRun> = {}): WorkflowRun {
  return {
    id: "a1700000-0000-4000-8000-000000000001",
    taskId: "a1700000-0000-4000-8000-000000000002",
    workflowName: "StoreHealthReviewWorkflowV1",
    workflowVersion: 1,
    planRevision: 2,
    temporalWorkflowId: "store-health-v1:a1700000-0000-4000-8000-000000000001",
    state: "received",
    projectionSequence: 0,
    version: 1,
    createdAt: "2026-08-14T08:00:00.000Z",
    updatedAt: "2026-08-14T08:00:00.000Z",
    ...overrides,
  };
}

function expectDomainError(operation: () => unknown, code: string): void {
  try {
    operation();
    throw new Error("Expected AgenticDomainError");
  } catch (error) {
    expect(error).toBeInstanceOf(AgenticDomainError);
    expect((error as AgenticDomainError).code).toBe(code);
  }
}
