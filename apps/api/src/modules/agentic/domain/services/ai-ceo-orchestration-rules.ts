// SPDX-License-Identifier: Apache-2.0
import { AgenticDomainError } from "../exceptions/agentic-domain.error";

export interface PlannedSubtask { readonly id: string; readonly owner: string; readonly dependencies: readonly string[]; readonly budgetMicros: number; readonly timeoutSeconds: number; }
export interface OrchestrationPlan { readonly taskId: string; readonly version: number; readonly digest: string; readonly subtasks: readonly PlannedSubtask[]; }

export function validateOrchestrationPlan(plan: OrchestrationPlan, eligibleOwners: ReadonlySet<string>): void {
  const nodes = new Map(plan.subtasks.map((subtask) => [subtask.id, subtask]));
  for (const subtask of plan.subtasks) {
    if (!eligibleOwners.has(subtask.owner)) fail("POLICY_DENIED", "Subtask owner is not policy eligible");
    if (!Number.isInteger(subtask.budgetMicros) || subtask.budgetMicros < 1 || !Number.isInteger(subtask.timeoutSeconds) || subtask.timeoutSeconds < 1) fail("INVALID_PLAN", "Subtask budget and timeout must be positive integers");
    if (subtask.dependencies.some((dependency) => !nodes.has(dependency))) fail("INVALID_PLAN", "Subtask dependency is unknown");
  }
  const visiting = new Set<string>(), visited = new Set<string>();
  const visit = (id: string): void => { if (visiting.has(id)) fail("INVALID_PLAN", "Plan dependencies must be acyclic"); if (visited.has(id)) return; visiting.add(id); for (const dependency of nodes.get(id)!.dependencies) visit(dependency); visiting.delete(id); visited.add(id); };
  for (const id of nodes.keys()) visit(id);
}
function fail(code: string, message: string): never { throw new AgenticDomainError(code, message); }
