// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { AgenticDomainError } from "../exceptions/agentic-domain.error";
import { validateOrchestrationPlan, type OrchestrationPlan } from "./ai-ceo-orchestration-rules";

const plan = (overrides: Partial<OrchestrationPlan> = {}): OrchestrationPlan => ({
  taskId: "task-1", version: 1, digest: "a".repeat(64),
  subtasks: [{ id: "catalog", owner: "catalog", dependencies: [], budgetMicros: 100, timeoutSeconds: 30 }],
  ...overrides,
});

describe("AI CEO orchestration rules", () => {
  it("rejects cycles before dispatch", () => {
    expectCode(() => validateOrchestrationPlan(plan({ subtasks: [
      { id: "catalog", owner: "catalog", dependencies: ["inventory"], budgetMicros: 100, timeoutSeconds: 30 },
      { id: "inventory", owner: "inventory", dependencies: ["catalog"], budgetMicros: 100, timeoutSeconds: 30 },
    ] }), new Set(["catalog", "inventory"])), "INVALID_PLAN");
  });
  it("rejects an owner outside the policy-eligible assignments", () => {
    expectCode(() => validateOrchestrationPlan(plan(), new Set(["inventory"])), "POLICY_DENIED");
  });
});
function expectCode(operation: () => unknown, code: string): void { try { operation(); throw new Error("Expected AgenticDomainError"); } catch (error) { expect(error).toBeInstanceOf(AgenticDomainError); expect((error as AgenticDomainError).code).toBe(code); } }
