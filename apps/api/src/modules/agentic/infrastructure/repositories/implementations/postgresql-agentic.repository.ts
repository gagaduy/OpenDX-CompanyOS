// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { DatabaseSession } from "../../../../../shared/database/transaction";
import type {
  AgenticRepository,
  AgentSubtaskDependencyRecord,
  AgentSubtaskRecord,
  ApprovalListFilter,
  AuditFilter,
  AuditEventRecord,
  BudgetLimitRecord,
  BudgetReservationInput,
  BudgetSettlementInput,
  ActivityReservationResult,
  ModelConfigurationRecord,
  PolicyRecord,
  ProvenanceRecord,
  RevisionChildren,
  RevocationRecord,
  ToolGrantRecord,
  ToolInvocationCompletionInput,
  ToolInvocationFailureInput,
  ToolInvocationRecord,
  ToolInvocationReservationInput,
  ToolInvocationReservationResult,
  ToolRecord,
  WorkflowRunCreateResult,
  WorkflowSignalReceiptCreateResult,
} from "../../../application/repositories/interfaces/agentic.repository";
import { AgenticApplicationError } from "../../../application/services/agentic-application.error";
import type { AgentKind, AgentProfile } from "../../../domain/entities/agent-profile";
import type { AgentTask } from "../../../domain/entities/agent-task";
import type { ApprovalRequest, ApprovalState } from "../../../domain/entities/approval-request";
import type { ConfigurationRevision } from "../../../domain/entities/configuration-revision";
import type {
  ActivityInvocation,
  WorkflowRun,
  WorkflowSignalReceipt,
} from "../../../domain/entities/workflow-run";

type Row = Record<string, unknown>;

export class PostgresqlAgenticRepository implements AgenticRepository {
  async findAgentByClientId(
    session: DatabaseSession,
    clientId: string,
  ): Promise<AgentProfile | undefined> {
    const result = await session.query<Row>(
      "SELECT * FROM agentic_agents WHERE keycloak_client_id=$1",
      [clientId],
    );
    return result.rows[0] === undefined ? undefined : mapAgent(result.rows[0]);
  }

  async findAgentByKind(
    session: DatabaseSession,
    agentKind: AgentKind,
  ): Promise<AgentProfile | undefined> {
    const result = await session.query<Row>("SELECT * FROM agentic_agents WHERE kind=$1", [agentKind]);
    return result.rows[0] === undefined ? undefined : mapAgent(result.rows[0]);
  }

  async listAgents(session: DatabaseSession): Promise<readonly AgentProfile[]> {
    const result = await session.query<Row>("SELECT * FROM agentic_agents ORDER BY kind");
    return result.rows.map(mapAgent);
  }

  async createTask(session: DatabaseSession, task: AgentTask): Promise<void> {
    await session.query(
      `INSERT INTO agentic_tasks
       (id,state,created_by,goal,instructions,deadline,configuration_revision_id,version,created_at,updated_at)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [task.id, task.state, task.createdBy, task.goal, task.instructions,
        task.deadline ?? null, task.configurationRevisionId ?? null, task.version,
        task.createdAt, task.updatedAt],
    );
  }

  async findTask(
    session: DatabaseSession,
    taskId: string,
    ownerId: string,
  ): Promise<AgentTask | undefined> {
    const result = await session.query<Row>(
      "SELECT * FROM agentic_tasks WHERE id=$1 AND created_by=$2",
      [taskId, ownerId],
    );
    return result.rows[0] === undefined ? undefined : mapTask(result.rows[0]);
  }

  async findTaskById(session: DatabaseSession, taskId: string): Promise<AgentTask | undefined> {
    const result = await session.query<Row>("SELECT * FROM agentic_tasks WHERE id=$1", [taskId]);
    return result.rows[0] === undefined ? undefined : mapTask(result.rows[0]);
  }

  async findTaskForApproval(session: DatabaseSession, taskId: string): Promise<AgentTask | undefined> {
    const result = await session.query<Row>(
      `SELECT t.* FROM agentic_tasks t WHERE t.id=$1 AND EXISTS (
        SELECT 1 FROM agentic_approval_requests a WHERE a.task_id=t.id AND a.state='pending'
      )`,
      [taskId],
    );
    return result.rows[0] === undefined ? undefined : mapTask(result.rows[0]);
  }

  async findTaskForAgent(
    session: DatabaseSession,
    taskId: string,
    agentKind: AgentKind,
  ): Promise<AgentTask | undefined> {
    const result = await session.query<Row>(
      `SELECT t.* FROM agentic_tasks t
       WHERE t.id=$1 AND t.state='ready' AND EXISTS (
         SELECT 1 FROM agentic_subtasks s WHERE s.task_id=t.id AND s.agent_kind=$2
       )`,
      [taskId, agentKind],
    );
    return result.rows[0] === undefined ? undefined : mapTask(result.rows[0]);
  }

  async listTasks(
    session: DatabaseSession,
    ownerId: string,
    page: number,
    pageSize: number,
  ): Promise<{ readonly items: readonly AgentTask[]; readonly totalItems: number }> {
    const count = await session.query<{ total: string }>(
      "SELECT count(*)::text total FROM agentic_tasks WHERE created_by=$1",
      [ownerId],
    );
    const result = await session.query<Row>(
      `SELECT * FROM agentic_tasks WHERE created_by=$1
       ORDER BY created_at DESC,id LIMIT $2 OFFSET $3`,
      [ownerId, pageSize, (page - 1) * pageSize],
    );
    return { items: result.rows.map(mapTask), totalItems: Number(count.rows[0]?.total ?? 0) };
  }

  async listAllTasks(
    session: DatabaseSession,
    page: number,
    pageSize: number,
  ): Promise<{ readonly items: readonly AgentTask[]; readonly totalItems: number }> {
    const count = await session.query<{ total: string }>("SELECT count(*)::text total FROM agentic_tasks");
    const result = await session.query<Row>(
      "SELECT * FROM agentic_tasks ORDER BY created_at DESC,id LIMIT $1 OFFSET $2",
      [pageSize, (page - 1) * pageSize],
    );
    return { items: result.rows.map(mapTask), totalItems: Number(count.rows[0]?.total ?? 0) };
  }

  async updateTask(
    session: DatabaseSession,
    task: AgentTask,
    expectedVersion: number,
  ): Promise<boolean> {
    const result = await session.query(
      `UPDATE agentic_tasks
       SET state=$2,goal=$3,instructions=$4,deadline=$5,
           configuration_revision_id=$6,version=$7,updated_at=$8
       WHERE id=$1 AND created_by=$9 AND version=$10`,
      [task.id, task.state, task.goal, task.instructions, task.deadline ?? null,
        task.configurationRevisionId ?? null, task.version, task.updatedAt,
        task.createdBy, expectedVersion],
    );
    return result.rowCount === 1;
  }

  async replaceTaskGraph(
    session: DatabaseSession,
    taskId: string,
    ownerId: string,
    subtasks: readonly AgentSubtaskRecord[],
    dependencies: readonly AgentSubtaskDependencyRecord[],
  ): Promise<boolean> {
    const task = await session.query(
      "SELECT id FROM agentic_tasks WHERE id=$1 AND created_by=$2 AND state='draft' FOR UPDATE",
      [taskId, ownerId],
    );
    if (task.rowCount !== 1) return false;
    await session.query("DELETE FROM agentic_subtasks WHERE task_id=$1", [taskId]);
    for (const subtask of subtasks) {
      await session.query(
        `INSERT INTO agentic_subtasks(id,task_id,agent_kind,title,version,created_at)
         VALUES($1,$2,$3,$4,$5,$6)`,
        [subtask.id, taskId, subtask.agentKind, subtask.title, subtask.version, subtask.createdAt],
      );
    }
    for (const dependency of dependencies) {
      await session.query(
        `INSERT INTO agentic_subtask_dependencies(task_id,from_subtask_id,to_subtask_id)
         VALUES($1,$2,$3)`,
        [taskId, dependency.from, dependency.to],
      );
    }
    return true;
  }

  async listTaskGraph(
    session: DatabaseSession,
    taskId: string,
  ): Promise<{ readonly subtasks: readonly AgentSubtaskRecord[]; readonly dependencies: readonly AgentSubtaskDependencyRecord[] }> {
    const subtasks = await session.query<Row>(
      "SELECT * FROM agentic_subtasks WHERE task_id=$1 ORDER BY created_at,id", [taskId],
    );
    const dependencies = await session.query<Row>(
      `SELECT task_id,from_subtask_id,to_subtask_id FROM agentic_subtask_dependencies
       WHERE task_id=$1 ORDER BY from_subtask_id,to_subtask_id`, [taskId],
    );
    return {
      subtasks: subtasks.rows.map((row) => ({
        id: String(row.id), taskId: String(row.task_id), agentKind: row.agent_kind as AgentKind,
        title: String(row.title), version: Number(row.version), createdAt: toIso(row.created_at),
      })),
      dependencies: dependencies.rows.map((row) => ({
        taskId: String(row.task_id), from: String(row.from_subtask_id), to: String(row.to_subtask_id),
      })),
    };
  }

  async createRevision(
    session: DatabaseSession,
    revision: ConfigurationRevision,
  ): Promise<void> {
    await session.query(
      `INSERT INTO agentic_configuration_revisions
       (id,state,created_by,payload_digest,decided_by,decision_reason,version,created_at,updated_at)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [revision.id, revision.state, revision.createdBy, revision.payloadDigest,
        revision.decidedBy ?? null, revision.decisionReason ?? null, revision.version,
        revision.createdAt, revision.updatedAt],
    );
  }

  async findRevision(
    session: DatabaseSession,
    revisionId: string,
  ): Promise<ConfigurationRevision | undefined> {
    const result = await session.query<Row>(
      "SELECT * FROM agentic_configuration_revisions WHERE id=$1",
      [revisionId],
    );
    return result.rows[0] === undefined ? undefined : mapRevision(result.rows[0]);
  }

  async findActiveRevision(session: DatabaseSession): Promise<ConfigurationRevision | undefined> {
    const result = await session.query<Row>(
      "SELECT * FROM agentic_configuration_revisions WHERE state='active' LIMIT 1",
    );
    return result.rows[0] === undefined ? undefined : mapRevision(result.rows[0]);
  }

  async updateRevision(
    session: DatabaseSession,
    revision: ConfigurationRevision,
    expectedVersion: number,
  ): Promise<boolean> {
    const result = await session.query(
      `UPDATE agentic_configuration_revisions
       SET state=$2,payload_digest=$3,version=$4,updated_at=$5
       WHERE id=$1 AND state='draft' AND created_by=$6 AND version=$7`,
      [revision.id, revision.state, revision.payloadDigest, revision.version, revision.updatedAt,
        revision.createdBy, expectedVersion],
    );
    return result.rowCount === 1;
  }

  async replaceRevisionChildren(
    session: DatabaseSession,
    revisionId: string,
    children: RevisionChildren,
  ): Promise<boolean> {
    const draft = await session.query(
      "SELECT id FROM agentic_configuration_revisions WHERE id=$1 AND state='draft' FOR UPDATE",
      [revisionId],
    );
    if (draft.rowCount !== 1) return false;
    await session.query("DELETE FROM agentic_policies WHERE revision_id=$1", [revisionId]);
    await session.query("DELETE FROM agentic_tool_grants WHERE revision_id=$1", [revisionId]);
    await session.query("DELETE FROM agentic_model_configs WHERE revision_id=$1", [revisionId]);
    await session.query("DELETE FROM agentic_budget_limits WHERE revision_id=$1", [revisionId]);
    for (const policy of children.policies) await insertPolicy(session, revisionId, policy);
    for (const grant of children.toolGrants) await insertToolGrant(session, revisionId, grant);
    for (const model of children.modelConfigurations) await insertModelConfiguration(session, revisionId, model);
    for (const budget of children.budgetLimits) await insertBudgetLimit(session, revisionId, budget);
    return true;
  }

  async getRevisionChildren(
    session: DatabaseSession,
    revisionId: string,
  ): Promise<RevisionChildren> {
    const policies = await session.query<Row>(
      "SELECT * FROM agentic_policies WHERE revision_id=$1 ORDER BY rule_order,id", [revisionId],
    );
    const grants = await session.query<Row>(
      "SELECT * FROM agentic_tool_grants WHERE revision_id=$1 ORDER BY agent_kind,tool_name,tool_version,purpose,data_scope,id", [revisionId],
    );
    const models = await session.query<Row>(`SELECT c.*,COALESCE(array_agg(f.model ORDER BY f.position)
        FILTER (WHERE f.model IS NOT NULL),'{}') fallback_models
        FROM agentic_model_configs c LEFT JOIN agentic_model_fallbacks f
          ON f.revision_id=c.revision_id AND f.agent_kind=c.agent_kind
        WHERE c.revision_id=$1 GROUP BY c.revision_id,c.agent_kind ORDER BY c.agent_kind`, [revisionId]);
    const budgets = await session.query<Row>(
      "SELECT * FROM agentic_budget_limits WHERE revision_id=$1 ORDER BY agent_kind", [revisionId],
    );
    return {
      policies: policies.rows.map(mapPolicy),
      toolGrants: grants.rows.map(mapToolGrant),
      modelConfigurations: models.rows.map(mapModelConfiguration),
      budgetLimits: budgets.rows.map(mapBudgetLimit),
    };
  }

  async activateRevision(
    session: DatabaseSession,
    revisionId: string,
    expectedVersion: number,
    decidedBy: string,
    decidedAt: string,
  ): Promise<boolean> {
    await session.query("SELECT pg_advisory_xact_lock(hashtext('agentic.configuration.activation'))");
    const candidate = await session.query<{ created_by: string }>(
      `SELECT created_by FROM agentic_configuration_revisions
       WHERE id=$1 AND state='pending_approval' AND version=$2 FOR UPDATE`,
      [revisionId, expectedVersion],
    );
    if (candidate.rows[0] === undefined || candidate.rows[0].created_by === decidedBy) return false;

    await session.query(
      `UPDATE agentic_configuration_revisions
       SET state='superseded',version=version+1,updated_at=$1
       WHERE state='active' AND id<>$2`,
      [decidedAt, revisionId],
    );
    const result = await session.query(
      `UPDATE agentic_configuration_revisions
       SET state='active',decided_by=$3,decided_at=$4,version=version+1,updated_at=$4
       WHERE id=$1 AND state='pending_approval' AND version=$2`,
      [revisionId, expectedVersion, decidedBy, decidedAt],
    );
    return result.rowCount === 1;
  }

  async listPolicies(
    session: DatabaseSession,
    revisionId: string,
  ): Promise<readonly PolicyRecord[]> {
    const result = await session.query<Row>(
      "SELECT * FROM agentic_policies WHERE revision_id=$1 ORDER BY rule_order,id",
      [revisionId],
    );
    return result.rows.map(mapPolicy);
  }

  async rejectRevision(
    session: DatabaseSession,
    revisionId: string,
    expectedVersion: number,
    decidedBy: string,
    reason: string,
    decidedAt: string,
  ): Promise<boolean> {
    const result = await session.query(
      `UPDATE agentic_configuration_revisions
       SET state='rejected',decided_by=$3,decision_reason=$4,decided_at=$5,
           version=version+1,updated_at=$5
       WHERE id=$1 AND state='pending_approval' AND version=$2 AND created_by<>$3`,
      [revisionId, expectedVersion, decidedBy, reason, decidedAt],
    );
    return result.rowCount === 1;
  }

  async findTool(
    session: DatabaseSession,
    name: string,
    version: number,
  ): Promise<ToolRecord | undefined> {
    const result = await session.query<Row>(
      "SELECT * FROM agentic_tools WHERE name=$1 AND version=$2",
      [name, version],
    );
    return result.rows[0] === undefined ? undefined : mapTool(result.rows[0]);
  }

  async registerTool(
    session: DatabaseSession,
    tool: ToolRecord,
  ): Promise<"created" | "duplicate"> {
    const result = await session.query(
      `INSERT INTO agentic_tools
       (name,version,input_schema_digest,output_schema_digest,active,
        execution_cost_micros,maximum_attempts)
       VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(name,version) DO NOTHING`,
      [tool.name, tool.version, tool.inputSchemaDigest, tool.outputSchemaDigest,
        tool.active, tool.executionCostMicros, tool.maximumAttempts],
    );
    return result.rowCount === 1 ? "created" : "duplicate";
  }

  async findToolGrant(
    session: DatabaseSession,
    revisionId: string,
    agentKind: AgentKind,
    name: string,
    version: number,
  ): Promise<ToolGrantRecord | undefined> {
    const result = await session.query<Row>(
      `SELECT * FROM agentic_tool_grants
       WHERE revision_id=$1 AND agent_kind=$2 AND tool_name=$3 AND tool_version=$4`,
      [revisionId, agentKind, name, version],
    );
    return result.rows[0] === undefined ? undefined : mapToolGrant(result.rows[0]);
  }

  async findModelConfiguration(
    session: DatabaseSession,
    revisionId: string,
    agentKind: AgentKind,
  ): Promise<ModelConfigurationRecord | undefined> {
    const result = await session.query<Row>(
      `SELECT c.*,COALESCE(array_agg(f.model ORDER BY f.position)
         FILTER (WHERE f.model IS NOT NULL),'{}') fallback_models
       FROM agentic_model_configs c LEFT JOIN agentic_model_fallbacks f
         ON f.revision_id=c.revision_id AND f.agent_kind=c.agent_kind
       WHERE c.revision_id=$1 AND c.agent_kind=$2 GROUP BY c.revision_id,c.agent_kind`,
      [revisionId, agentKind],
    );
    return result.rows[0] === undefined ? undefined : mapModelConfiguration(result.rows[0]);
  }

  async findBudgetLimit(
    session: DatabaseSession,
    revisionId: string,
    agentKind: AgentKind,
  ): Promise<BudgetLimitRecord | undefined> {
    const result = await session.query<Row>(
      "SELECT * FROM agentic_budget_limits WHERE revision_id=$1 AND agent_kind=$2",
      [revisionId, agentKind],
    );
    return result.rows[0] === undefined ? undefined : mapBudgetLimit(result.rows[0]);
  }

  async createApproval(
    session: DatabaseSession,
    approval: ApprovalRequest,
  ): Promise<void> {
    await session.query(
      `INSERT INTO agentic_approval_requests
       (id,state,requester_id,approver_scope,action,resource_type,resource_id,parameters_digest,
        task_id,policy_version,workflow_version,configuration_revision_id,expires_at,
        decided_by,decision_reason,decided_at,version,created_at)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)`,
      [approval.id, approval.state, approval.requesterId, approval.approverScope, approval.action,
        approval.resourceType, approval.resourceId, approval.parametersDigest,
        approval.taskId ?? null, approval.policyVersion, approval.workflowVersion ?? null,
        approval.configurationRevisionId, approval.expiresAt, approval.decidedBy ?? null,
        approval.decisionReason ?? null, approval.decidedAt ?? null, approval.version,
        approval.createdAt],
    );
  }

  async findApproval(
    session: DatabaseSession,
    approvalId: string,
  ): Promise<ApprovalRequest | undefined> {
    const result = await session.query<Row>(
      "SELECT * FROM agentic_approval_requests WHERE id=$1",
      [approvalId],
    );
    return result.rows[0] === undefined ? undefined : mapApproval(result.rows[0]);
  }

  async listApprovals(
    session: DatabaseSession,
    page: number,
    pageSize: number,
    filter?: ApprovalListFilter,
  ): Promise<{ readonly items: readonly ApprovalRequest[]; readonly totalItems: number }> {
    const conditions: string[] = [];
    const values: unknown[] = [];
    if (filter?.requesterId !== undefined) {
      values.push(filter.requesterId);
      conditions.push(`requester_id=$${values.length}`);
    }
    if (filter?.approverScopes !== undefined) {
      values.push(filter.approverScopes);
      conditions.push(`approver_scope=ANY($${values.length}::text[])`);
    }
    const where = conditions.length === 0 ? "TRUE" : conditions.join(" AND ");
    const count = await session.query<{ total: string }>(
      `SELECT count(*)::text total FROM agentic_approval_requests WHERE ${where}`,
      values,
    );
    const result = await session.query<Row>(
      `SELECT * FROM agentic_approval_requests WHERE ${where}
       ORDER BY created_at DESC,id LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
      [...values, pageSize, (page - 1) * pageSize],
    );
    return { items: result.rows.map(mapApproval), totalItems: Number(count.rows[0]?.total ?? 0) };
  }

  async decideApproval(
    session: DatabaseSession,
    approvalId: string,
    expectedVersion: number,
    state: Exclude<ApprovalState, "pending">,
    decidedBy: string,
    reason: string,
    decidedAt: string,
  ): Promise<boolean> {
    const result = await session.query(
      `UPDATE agentic_approval_requests
       SET state=$3,decided_by=$4,decision_reason=$5,decided_at=$6,version=version+1
       WHERE id=$1 AND version=$2 AND state='pending' AND requester_id<>$4 AND expires_at>$6`,
      [approvalId, expectedVersion, state, decidedBy, reason, decidedAt],
    );
    return result.rowCount === 1;
  }

  async createRevocation(
    session: DatabaseSession,
    revocation: RevocationRecord,
  ): Promise<"created" | "duplicate"> {
    const result = await session.query(
      `INSERT INTO agentic_revocations
       (id,target_type,target_id,reason,activated_by,activated_at,approval_id,idempotency_key)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(idempotency_key) DO NOTHING`,
      [revocation.id, revocation.targetType, revocation.targetId, revocation.reason,
        revocation.activatedBy, revocation.activatedAt, revocation.approvalId ?? null,
        revocation.idempotencyKey],
    );
    return result.rowCount === 1 ? "created" : "duplicate";
  }

  async findActiveRevocation(
    session: DatabaseSession,
    targetType: RevocationRecord["targetType"],
    targetId: string,
  ): Promise<RevocationRecord | undefined> {
    const result = await session.query<Row>(
      `SELECT * FROM agentic_revocations WHERE target_type=$1 AND target_id=$2
       ORDER BY activated_at DESC,id DESC LIMIT 1`,
      [targetType, targetId],
    );
    return result.rows[0] === undefined ? undefined : mapRevocation(result.rows[0]);
  }

  async reserveBudget(
    session: DatabaseSession,
    input: BudgetReservationInput,
  ): Promise<"reserved" | "duplicate" | "exceeded"> {
    if (!Number.isSafeInteger(input.costMicros) || input.costMicros < 0) return "exceeded";
    await session.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
      `agentic.budget:${input.revisionId}:${input.agentKind}:${input.taskId}`,
    ]);
    const duplicate = await session.query(
      "SELECT id FROM agentic_budget_entries WHERE idempotency_key=$1",
      [input.idempotencyKey],
    );
    if (duplicate.rowCount > 0) return "duplicate";

    const limits = await session.query<Row>(
      `SELECT task_cost_micros::text,daily_cost_micros::text,monthly_cost_micros::text
       FROM agentic_budget_limits WHERE revision_id=$1 AND agent_kind=$2`,
      [input.revisionId, input.agentKind],
    );
    const limit = limits.rows[0];
    if (limit === undefined) return "exceeded";
    const usage = await session.query<Row>(
      `SELECT
         COALESCE(sum(cost_micros) FILTER (WHERE task_id=$2),0)::text task_used,
         COALESCE(sum(cost_micros) FILTER (WHERE occurred_at >= date_trunc('day',$4::timestamptz)
           AND occurred_at < date_trunc('day',$4::timestamptz)+interval '1 day'),0)::text daily_used,
         COALESCE(sum(cost_micros) FILTER (WHERE occurred_at >= date_trunc('month',$4::timestamptz)
           AND occurred_at < date_trunc('month',$4::timestamptz)+interval '1 month'),0)::text monthly_used
       FROM agentic_budget_entries
       WHERE entry_type='reservation' AND agent_kind=$1
         AND task_id IN (SELECT id FROM agentic_tasks WHERE configuration_revision_id=$3)`,
      [input.agentKind, input.taskId, input.revisionId, input.occurredAt],
    );
    const consumed = usage.rows[0]!;
    const cost = BigInt(input.costMicros);
    if (
      BigInt(String(consumed.task_used)) + cost > BigInt(String(limit.task_cost_micros)) ||
      BigInt(String(consumed.daily_used)) + cost > BigInt(String(limit.daily_cost_micros)) ||
      BigInt(String(consumed.monthly_used)) + cost > BigInt(String(limit.monthly_cost_micros))
    ) return "exceeded";

    await session.query(
      `INSERT INTO agentic_budget_entries
       (id,agent_kind,task_id,entry_type,idempotency_key,cost_micros,occurred_at)
       VALUES($1,$2,$3,'reservation',$4,$5,$6)`,
      [input.id, input.agentKind, input.taskId, input.idempotencyKey,
        input.costMicros, input.occurredAt],
    );
    return "reserved";
  }

  async settleBudget(
    session: DatabaseSession,
    input: BudgetSettlementInput,
  ): Promise<"settled" | "duplicate" | "stale"> {
    if (!Number.isSafeInteger(input.actualCostMicros) || input.actualCostMicros < 0) return "stale";
    const reservation = await session.query<Row>(
      `SELECT id,agent_kind,task_id,cost_micros::text FROM agentic_budget_entries
       WHERE id=$1 AND entry_type='reservation' FOR UPDATE`,
      [input.reservationId],
    );
    const existing = await session.query(
      "SELECT id FROM agentic_budget_entries WHERE idempotency_key=$1",
      [input.idempotencyKey],
    );
    if (existing.rowCount > 0) return "duplicate";
    const reserved = reservation.rows[0];
    if (reserved === undefined || BigInt(input.actualCostMicros) > BigInt(String(reserved.cost_micros))) {
      return "stale";
    }
    const alreadySettled = await session.query(
      "SELECT id FROM agentic_budget_entries WHERE reservation_id=$1",
      [input.reservationId],
    );
    if (alreadySettled.rowCount > 0) return "stale";
    await session.query(
      `INSERT INTO agentic_budget_entries
       (id,agent_kind,task_id,entry_type,idempotency_key,reservation_id,cost_micros,occurred_at)
       VALUES($1,$2,$3,'settlement',$4,$5,$6,$7)`,
      [input.id, reserved.agent_kind, reserved.task_id, input.idempotencyKey,
        input.reservationId, input.actualCostMicros, input.occurredAt],
    );
    return "settled";
  }

  async appendAudit(session: DatabaseSession, event: AuditEventRecord): Promise<void> {
    await session.query(
      `INSERT INTO agentic_audit_events
       (id,actor_id,actor_type,task_id,action,resource_type,resource_id,outcome,
        policy_version,model_version,tool_version,correlation_id,causation_id,occurred_at)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
      [event.id, event.actorId, event.actorType, event.taskId ?? null, event.action,
        event.resourceType, event.resourceId, event.outcome, event.policyVersion ?? null,
        event.modelVersion ?? null, event.toolVersion ?? null, event.correlationId,
        event.causationId ?? null, event.occurredAt],
    );
  }

  async listAudit(
    session: DatabaseSession,
    filter: AuditFilter,
  ): Promise<readonly AuditEventRecord[]> {
    const conditions: string[] = [];
    const values: unknown[] = [];
    const add = (condition: string, value: unknown): void => {
      values.push(value);
      conditions.push(condition.replace("?", `$${values.length}`));
    };
    if (filter.actorId !== undefined) add("actor_id=?", filter.actorId);
    if (filter.action !== undefined) add("action=?", filter.action);
    if (filter.outcome !== undefined) add("outcome=?", filter.outcome);
    if (filter.resourceTypes !== undefined) add("resource_type=ANY(?::text[])", filter.resourceTypes);
    values.push(filter.limit);
    const result = await session.query<Row>(
      `SELECT * FROM agentic_audit_events${conditions.length === 0 ? "" : ` WHERE ${conditions.join(" AND ")}`}
       ORDER BY occurred_at DESC,id LIMIT $${values.length}`,
      values,
    );
    return result.rows.map(mapAudit);
  }

  async countToolInvocations(
    session: DatabaseSession,
    taskId: string,
    actorId: string,
    resourceId: string,
  ): Promise<number> {
    const result = await session.query<{ total: string }>(
      `SELECT count(*)::text total FROM agentic_audit_events
       WHERE task_id=$1 AND actor_id=$2 AND action='tool.invoke'
         AND resource_id=$3 AND outcome='allowed'`,
      [taskId, actorId, resourceId],
    );
    return Number(result.rows[0]?.total ?? 0);
  }

  async appendProvenance(
    session: DatabaseSession,
    record: ProvenanceRecord,
  ): Promise<void> {
    await session.query(
      `INSERT INTO agentic_provenance_records
       (id,task_id,source_type,source_id,source_digest,classification,recorded_by,recorded_at)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,
      [record.id, record.taskId ?? null, record.sourceType, record.sourceId,
        record.sourceDigest, record.classification, record.recordedBy, record.recordedAt],
    );
  }

  async listProvenance(
    session: DatabaseSession,
    taskId: string,
  ): Promise<readonly ProvenanceRecord[]> {
    const result = await session.query<Row>(
      "SELECT * FROM agentic_provenance_records WHERE task_id=$1 ORDER BY recorded_at,id",
      [taskId],
    );
    return result.rows.map(mapProvenance);
  }

  async createWorkflowRun(
    session: DatabaseSession,
    run: WorkflowRun,
  ): Promise<WorkflowRunCreateResult> {
    await session.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
      `agentic.workflow.start:${run.taskId}`,
    ]);
    const existing = await session.query<Row>(
      `SELECT * FROM agentic_workflow_runs
       WHERE task_id=$1 AND workflow_name=$2 AND workflow_version=$3 AND plan_revision=$4`,
      [run.taskId, run.workflowName, run.workflowVersion, run.planRevision],
    );
    if (existing.rows[0] !== undefined) {
      return { status: "duplicate", run: mapWorkflowRun(existing.rows[0]) };
    }
    await session.query(
      `INSERT INTO agentic_workflow_runs
       (id,task_id,workflow_name,workflow_version,plan_revision,
        temporal_workflow_id,temporal_run_id,state,projection_sequence,
        resume_state,outcome_code,version,created_at,updated_at,completed_at)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
      [run.id, run.taskId, run.workflowName, run.workflowVersion, run.planRevision,
        run.temporalWorkflowId, run.temporalRunId ?? null, run.state,
        run.projectionSequence, run.resumeState ?? null, run.outcomeCode ?? null,
        run.version, run.createdAt, run.updatedAt, run.completedAt ?? null],
    );
    return { status: "created", run };
  }

  async findWorkflowRun(
    session: DatabaseSession,
    runId: string,
  ): Promise<WorkflowRun | undefined> {
    const result = await session.query<Row>(
      "SELECT * FROM agentic_workflow_runs WHERE id=$1",
      [runId],
    );
    return result.rows[0] === undefined ? undefined : mapWorkflowRun(result.rows[0]);
  }

  async findActiveWorkflowRunForTask(
    session: DatabaseSession,
    taskId: string,
  ): Promise<WorkflowRun | undefined> {
    const result = await session.query<Row>(
      `SELECT * FROM agentic_workflow_runs WHERE task_id=$1
       AND state NOT IN ('completed','partially_completed','failed','canceled')
       ORDER BY created_at DESC,id LIMIT 1`,
      [taskId],
    );
    return result.rows[0] === undefined ? undefined : mapWorkflowRun(result.rows[0]);
  }

  async listWorkflowRunsForTask(
    session: DatabaseSession,
    taskId: string,
  ): Promise<readonly WorkflowRun[]> {
    const result = await session.query<Row>(
      `SELECT * FROM agentic_workflow_runs WHERE task_id=$1
       ORDER BY created_at DESC,id`,
      [taskId],
    );
    return result.rows.map(mapWorkflowRun);
  }

  async projectWorkflowRun(
    session: DatabaseSession,
    run: WorkflowRun,
    expectedVersion: number,
    expectedProjectionSequence: number,
  ): Promise<"updated" | "duplicate" | "stale" | "conflict"> {
    const result = await session.query(
      `UPDATE agentic_workflow_runs SET
        state=$2,projection_sequence=$3,resume_state=$4,outcome_code=$5,
        version=$6,updated_at=$7,completed_at=$8
       WHERE id=$1 AND version=$9 AND projection_sequence=$10
         AND state NOT IN ('completed','partially_completed','failed','canceled')`,
      [run.id, run.state, run.projectionSequence, run.resumeState ?? null,
        run.outcomeCode ?? null, run.version, run.updatedAt, run.completedAt ?? null,
        expectedVersion, expectedProjectionSequence],
    );
    if (result.rowCount === 1) return "updated";
    const current = await this.findWorkflowRun(session, run.id);
    if (current === undefined || current.projectionSequence !== run.projectionSequence) {
      return "stale";
    }
    return sameWorkflowProjection(current, run) ? "duplicate" : "conflict";
  }

  async attachTemporalRunId(
    session: DatabaseSession,
    runId: string,
    temporalRunId: string,
    expectedVersion: number,
    updatedAt: string,
  ): Promise<boolean> {
    const result = await session.query(
      `UPDATE agentic_workflow_runs
       SET temporal_run_id=$2,version=version+1,updated_at=$4
       WHERE id=$1 AND version=$3 AND temporal_run_id IS NULL
         AND state NOT IN ('completed','partially_completed','failed','canceled')`,
      [runId, temporalRunId, expectedVersion, updatedAt],
    );
    return result.rowCount === 1;
  }

  async listPendingWorkflowStarts(
    session: DatabaseSession,
    limit: number,
  ): Promise<readonly WorkflowRun[]> {
    const result = await session.query<Row>(
      `SELECT * FROM agentic_workflow_runs
       WHERE temporal_run_id IS NULL
         AND state NOT IN ('completed','partially_completed','failed','canceled')
       ORDER BY created_at,id LIMIT $1`,
      [limit],
    );
    return result.rows.map(mapWorkflowRun);
  }

  async reserveToolInvocation(
    session: DatabaseSession,
    input: ToolInvocationReservationInput,
  ): Promise<ToolInvocationReservationResult> {
    await session.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
      `agentic.tool:${input.taskId}:${input.agentKind}:${input.idempotencyKey}`,
    ]);
    const existingResult = await session.query<Row>(
      `SELECT invocation.*,tool.maximum_attempts
       FROM agentic_tool_invocations invocation
       JOIN agentic_tools tool
         ON tool.name=invocation.tool_name AND tool.version=invocation.tool_version
       WHERE invocation.task_id=$1 AND invocation.agent_kind=$2
         AND invocation.idempotency_key=$3`,
      [input.taskId, input.agentKind, input.idempotencyKey],
    );
    const existingRow = existingResult.rows[0];
    if (existingRow !== undefined) {
      const existing = mapToolInvocation(existingRow);
      if (
        existing.toolName !== input.toolName
        || existing.toolVersion !== input.toolVersion
        || existing.parametersDigest !== input.parametersDigest
      ) {
        return { kind: "conflict", invocationId: existing.id, attempt: existing.attempt };
      }
      if (existing.status === "completed") {
        return {
          kind: "completed",
          invocationId: existing.id,
          attempt: existing.attempt,
          result: existing.safeResult,
        };
      }
      if (existing.status === "failed") {
        return failedReservation(existing);
      }
      if (existing.status === "reserved") {
        return { kind: "in_progress", invocationId: existing.id, attempt: existing.attempt };
      }
      if (existing.attempt >= Number(existingRow.maximum_attempts)) {
        return failedReservation(existing);
      }
      const claimed = await session.query(
        `UPDATE agentic_tool_invocations
         SET status='reserved',attempt=attempt+1,error_code=NULL,completed_at=NULL,
             version=version+1,updated_at=$2
         WHERE id=$1 AND status='retryable_failed' AND version=$3`,
        [existing.id, input.occurredAt, existing.version],
      );
      return claimed.rowCount === 1
        ? { kind: "reserved", invocationId: existing.id, attempt: existing.attempt + 1 }
        : { kind: "in_progress", invocationId: existing.id, attempt: existing.attempt + 1 };
    }

    const descriptor = await session.query<{ maximum_attempts: number }>(
      `SELECT maximum_attempts FROM agentic_tools
       WHERE name=$1 AND version=$2 AND active=true`,
      [input.toolName, input.toolVersion],
    );
    if (descriptor.rows[0] === undefined) {
      throw new AgenticApplicationError("TOOL_NOT_FOUND", "Tool version is unavailable");
    }
    await session.query(
      `INSERT INTO agentic_tool_invocations
       (id,task_id,agent_kind,tool_name,tool_version,idempotency_key,
        parameters_digest,status,attempt,correlation_id,causation_id,
        version,created_at,updated_at)
       VALUES($1,$2,$3,$4,$5,$6,$7,'reserved',1,$8,$9,1,$10,$10)`,
      [input.id, input.taskId, input.agentKind, input.toolName, input.toolVersion,
        input.idempotencyKey, input.parametersDigest, input.correlationId,
        input.causationId, input.occurredAt],
    );
    return { kind: "reserved", invocationId: input.id, attempt: 1 };
  }

  async completeToolInvocation(
    session: DatabaseSession,
    input: ToolInvocationCompletionInput,
  ): Promise<boolean> {
    assertSafeResultSize(input.safeResult);
    await session.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
      `agentic.tool.invocation:${input.invocationId}`,
    ]);
    const result = await session.query(
      `UPDATE agentic_tool_invocations
       SET status='completed',safe_result=$3,result_digest=$4,
           version=version+1,updated_at=$5,completed_at=$5
       WHERE id=$1 AND attempt=$2 AND status='reserved'`,
      [input.invocationId, input.attempt, input.safeResult,
        input.resultDigest, input.occurredAt],
    );
    return result.rowCount === 1;
  }

  async failToolInvocation(
    session: DatabaseSession,
    input: ToolInvocationFailureInput,
  ): Promise<boolean> {
    await session.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
      `agentic.tool.invocation:${input.invocationId}`,
    ]);
    const result = await session.query(
      `UPDATE agentic_tool_invocations invocation
       SET status=CASE
         WHEN $3::boolean AND invocation.attempt<tool.maximum_attempts
           THEN 'retryable_failed'
         ELSE 'failed'
       END,
       error_code=$4,version=invocation.version+1,updated_at=$5,completed_at=$5
       FROM agentic_tools tool
       WHERE invocation.id=$1 AND invocation.attempt=$2
         AND invocation.status='reserved'
         AND tool.name=invocation.tool_name AND tool.version=invocation.tool_version`,
      [input.invocationId, input.attempt, input.retryable,
        input.errorCode, input.occurredAt],
    );
    return result.rowCount === 1;
  }

  async findToolInvocation(
    session: DatabaseSession,
    invocationId: string,
  ): Promise<ToolInvocationRecord | undefined> {
    const result = await session.query<Row>(
      "SELECT * FROM agentic_tool_invocations WHERE id=$1",
      [invocationId],
    );
    return result.rows[0] === undefined ? undefined : mapToolInvocation(result.rows[0]);
  }

  async reserveActivityInvocation(
    session: DatabaseSession,
    invocation: ActivityInvocation,
  ): Promise<ActivityReservationResult> {
    await session.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
      `agentic.activity:${invocation.invocationKey}`,
    ]);
    const existing = await this.findActivityInvocation(session, invocation.invocationKey);
    if (existing !== undefined) {
      const duplicate = existing.workflowRunId === invocation.workflowRunId
        && existing.activityKind === invocation.activityKind
        && existing.branchId === invocation.branchId
        && existing.inputDigest === invocation.inputDigest;
      return { status: duplicate ? "duplicate" : "conflict", invocation: existing };
    }
    await session.query(
      `INSERT INTO agentic_activity_invocations
       (invocation_key,workflow_run_id,activity_kind,branch_id,input_digest,
        state,outcome_code,safe_result,version,created_at,updated_at,completed_at)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [invocation.invocationKey, invocation.workflowRunId, invocation.activityKind,
        invocation.branchId ?? null, invocation.inputDigest, invocation.state,
        invocation.outcomeCode ?? null, invocation.safeResult ?? null,
        invocation.version, invocation.createdAt, invocation.updatedAt,
        invocation.completedAt ?? null],
    );
    return { status: "reserved", invocation };
  }

  async findActivityInvocation(
    session: DatabaseSession,
    invocationKey: string,
  ): Promise<ActivityInvocation | undefined> {
    const result = await session.query<Row>(
      "SELECT * FROM agentic_activity_invocations WHERE invocation_key=$1",
      [invocationKey],
    );
    return result.rows[0] === undefined
      ? undefined
      : mapActivityInvocation(result.rows[0]);
  }

  async finishActivityInvocation(
    session: DatabaseSession,
    invocation: ActivityInvocation,
    expectedVersion: number,
  ): Promise<boolean> {
    const result = await session.query(
      `UPDATE agentic_activity_invocations SET
        state=$2,outcome_code=$3,safe_result=$4,version=$5,
        updated_at=$6,completed_at=$7
       WHERE invocation_key=$1 AND version=$8 AND state='reserved'
         AND workflow_run_id=$9 AND activity_kind=$10 AND input_digest=$11
         AND branch_id IS NOT DISTINCT FROM $12`,
      [invocation.invocationKey, invocation.state, invocation.outcomeCode ?? null,
        invocation.safeResult ?? null, invocation.version, invocation.updatedAt,
        invocation.completedAt ?? null, expectedVersion, invocation.workflowRunId,
        invocation.activityKind, invocation.inputDigest, invocation.branchId ?? null],
    );
    return result.rowCount === 1;
  }

  async createWorkflowSignalReceipt(
    session: DatabaseSession,
    receipt: WorkflowSignalReceipt,
  ): Promise<WorkflowSignalReceiptCreateResult> {
    await session.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
      `agentic.workflow.signal:${receipt.idempotencyKey}`,
    ]);
    const existing = await this.findWorkflowSignalReceipt(session, receipt.idempotencyKey);
    if (existing !== undefined) {
      const duplicate = existing.workflowRunId === receipt.workflowRunId
        && existing.signalKind === receipt.signalKind
        && existing.approvalId === receipt.approvalId
        && existing.payloadDigest === receipt.payloadDigest
        && existing.decision === receipt.decision
        && existing.applicationDecisionVersion === receipt.applicationDecisionVersion;
      return { status: duplicate ? "duplicate" : "conflict", receipt: existing };
    }
    await session.query(
      `INSERT INTO agentic_workflow_signal_receipts
       (id,workflow_run_id,signal_kind,idempotency_key,approval_id,payload_digest,
        decision,application_decision_version,delivery_state,accepted,
        reason_code,created_at,delivered_at)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
      [receipt.id, receipt.workflowRunId, receipt.signalKind, receipt.idempotencyKey,
        receipt.approvalId ?? null, receipt.payloadDigest, receipt.decision ?? null,
        receipt.applicationDecisionVersion ?? null, receipt.deliveryState,
        receipt.accepted ?? null, receipt.reasonCode ?? null, receipt.createdAt,
        receipt.deliveredAt ?? null],
    );
    return { status: "created", receipt };
  }

  async findWorkflowSignalReceipt(
    session: DatabaseSession,
    idempotencyKey: string,
  ): Promise<WorkflowSignalReceipt | undefined> {
    const result = await session.query<Row>(
      "SELECT * FROM agentic_workflow_signal_receipts WHERE idempotency_key=$1",
      [idempotencyKey],
    );
    return result.rows[0] === undefined
      ? undefined
      : mapWorkflowSignalReceipt(result.rows[0]);
  }

  async findWorkflowApproval(
    session: DatabaseSession,
    runId: string,
  ): Promise<ApprovalRequest | undefined> {
    const result = await session.query<Row>(
      `SELECT * FROM agentic_approval_requests
       WHERE resource_type='workflow_run' AND resource_id=$1
         AND action='agentic.workflow.complete'
       ORDER BY created_at DESC,id LIMIT 1`,
      [runId],
    );
    return result.rows[0] === undefined ? undefined : mapApproval(result.rows[0]);
  }

  async updateWorkflowSignalReceipt(
    session: DatabaseSession,
    receipt: WorkflowSignalReceipt,
  ): Promise<boolean> {
    const result = await session.query(
      `UPDATE agentic_workflow_signal_receipts
       SET delivery_state=$2,accepted=$3,reason_code=$4,delivered_at=$5
       WHERE id=$1 AND delivery_state='pending' AND workflow_run_id=$6
         AND idempotency_key=$7 AND payload_digest=$8`,
      [receipt.id, receipt.deliveryState, receipt.accepted ?? null,
        receipt.reasonCode ?? null, receipt.deliveredAt ?? null,
        receipt.workflowRunId, receipt.idempotencyKey, receipt.payloadDigest],
    );
    return result.rowCount === 1;
  }

  async listPendingWorkflowSignals(
    session: DatabaseSession,
    limit: number,
  ): Promise<readonly WorkflowSignalReceipt[]> {
    const result = await session.query<Row>(
      `SELECT * FROM agentic_workflow_signal_receipts
       WHERE delivery_state='pending' ORDER BY created_at,id LIMIT $1`,
      [limit],
    );
    return result.rows.map(mapWorkflowSignalReceipt);
  }
}

async function insertPolicy(session: DatabaseSession, revisionId: string, value: PolicyRecord): Promise<void> {
  await session.query(
    `INSERT INTO agentic_policies
     (id,revision_id,rule_order,effect,actor_type,agent_kind,department,resource,action,purpose,data_classification,reason_code)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
    [value.id, revisionId, value.ruleOrder, value.effect, value.actorType,
      value.agentKind ?? null, value.department ?? null, value.resource, value.action,
      value.purpose, value.dataClassification, value.reasonCode],
  );
}

async function insertToolGrant(session: DatabaseSession, revisionId: string, value: ToolGrantRecord): Promise<void> {
  await session.query(
    `INSERT INTO agentic_tool_grants
     (id,revision_id,agent_kind,tool_name,tool_version,purpose,data_scope,max_invocations)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,
    [value.id, revisionId, value.agentKind, value.toolName, value.toolVersion,
      value.purpose, value.dataScope, value.maxInvocations],
  );
}

async function insertModelConfiguration(session: DatabaseSession, revisionId: string, value: ModelConfigurationRecord): Promise<void> {
  await session.query(
    `INSERT INTO agentic_model_configs
     (revision_id,agent_kind,primary_model,max_input_tokens,max_output_tokens,timeout_ms,max_retries)
     VALUES($1,$2,$3,$4,$5,$6,$7)`,
    [revisionId, value.agentKind, value.primaryModel, value.maxInputTokens,
      value.maxOutputTokens, value.timeoutMs, value.maxRetries],
  );
  for (const [index, model] of value.fallbackModels.entries()) {
    await session.query(
      `INSERT INTO agentic_model_fallbacks(revision_id,agent_kind,position,model)
       VALUES($1,$2,$3,$4)`,
      [revisionId, value.agentKind, index + 1, model],
    );
  }
}

async function insertBudgetLimit(session: DatabaseSession, revisionId: string, value: BudgetLimitRecord): Promise<void> {
  for (const cost of [value.taskCostMicros, value.dailyCostMicros, value.monthlyCostMicros]) {
    if (!Number.isSafeInteger(cost)) throw new RangeError("Budget cost exceeds the safe integer range");
  }
  await session.query(
    `INSERT INTO agentic_budget_limits
     (revision_id,agent_kind,task_cost_micros,daily_cost_micros,monthly_cost_micros)
     VALUES($1,$2,$3,$4,$5)`,
    [revisionId, value.agentKind, value.taskCostMicros,
      value.dailyCostMicros, value.monthlyCostMicros],
  );
}

function mapTask(row: Row): AgentTask {
  const task: AgentTask = {
    id: String(row.id),
    state: row.state as AgentTask["state"],
    createdBy: String(row.created_by),
    goal: String(row.goal),
    instructions: String(row.instructions),
    version: Number(row.version),
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
    ...(row.deadline === null ? {} : { deadline: toIso(row.deadline) }),
    ...(row.configuration_revision_id === null
      ? {}
      : { configurationRevisionId: String(row.configuration_revision_id) }),
  };
  return task;
}

function mapAgent(row: Row): AgentProfile {
  return {
    kind: row.kind as AgentKind,
    keycloakClientId: String(row.keycloak_client_id),
    active: Boolean(row.active),
    version: Number(row.version),
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}

function mapRevision(row: Row): ConfigurationRevision {
  return {
    id: String(row.id),
    state: row.state as ConfigurationRevision["state"],
    createdBy: String(row.created_by),
    payloadDigest: String(row.payload_digest),
    version: Number(row.version),
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
    ...(row.decided_by === null ? {} : { decidedBy: String(row.decided_by) }),
    ...(row.decision_reason === null ? {} : { decisionReason: String(row.decision_reason) }),
  };
}

function mapPolicy(row: Row): PolicyRecord {
  return {
    id: String(row.id), revisionId: String(row.revision_id), ruleOrder: Number(row.rule_order),
    effect: row.effect as PolicyRecord["effect"], actorType: String(row.actor_type),
    resource: String(row.resource), action: String(row.action), purpose: String(row.purpose),
    dataClassification: String(row.data_classification), reasonCode: String(row.reason_code),
    ...(row.agent_kind === null ? {} : { agentKind: row.agent_kind as AgentKind }),
    ...(row.department === null ? {} : { department: String(row.department) }),
  };
}

function mapTool(row: Row): ToolRecord {
  return {
    name: String(row.name), version: Number(row.version),
    inputSchemaDigest: String(row.input_schema_digest),
    outputSchemaDigest: String(row.output_schema_digest), active: Boolean(row.active),
    executionCostMicros: safeInteger(row.execution_cost_micros),
    maximumAttempts: Number(row.maximum_attempts),
  };
}

function mapToolInvocation(row: Row): ToolInvocationRecord {
  return {
    id: String(row.id),
    taskId: String(row.task_id),
    agentKind: row.agent_kind as ToolInvocationRecord["agentKind"],
    toolName: row.tool_name as ToolInvocationRecord["toolName"],
    toolVersion: Number(row.tool_version) as 1,
    idempotencyKey: String(row.idempotency_key),
    parametersDigest: String(row.parameters_digest),
    status: row.status as ToolInvocationRecord["status"],
    attempt: Number(row.attempt),
    correlationId: String(row.correlation_id),
    causationId: String(row.causation_id),
    version: Number(row.version),
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
    ...(row.safe_result === null ? {} : { safeResult: row.safe_result }),
    ...(row.result_digest === null ? {} : { resultDigest: String(row.result_digest) }),
    ...(row.error_code === null ? {} : { errorCode: String(row.error_code) }),
    ...(row.completed_at === null ? {} : { completedAt: toIso(row.completed_at) }),
  };
}

function failedReservation(existing: ToolInvocationRecord): ToolInvocationReservationResult {
  return {
    kind: "failed",
    invocationId: existing.id,
    attempt: existing.attempt,
    errorCode: existing.errorCode ?? "TOOL_EXECUTION_FAILED",
  };
}

function assertSafeResultSize(value: unknown): void {
  const serialized = JSON.stringify(value);
  if (serialized === undefined || Buffer.byteLength(serialized, "utf8") > 262_144) {
    throw new AgenticApplicationError(
      "TOOL_RESULT_TOO_LARGE",
      "Tool result exceeds the safe receipt limit",
    );
  }
}

function mapToolGrant(row: Row): ToolGrantRecord {
  return {
    id: String(row.id), revisionId: String(row.revision_id),
    agentKind: row.agent_kind as AgentKind, toolName: String(row.tool_name),
    toolVersion: Number(row.tool_version), purpose: String(row.purpose),
    dataScope: String(row.data_scope), maxInvocations: Number(row.max_invocations),
  };
}

function mapModelConfiguration(row: Row): ModelConfigurationRecord {
  return {
    revisionId: String(row.revision_id), agentKind: row.agent_kind as AgentKind,
    primaryModel: String(row.primary_model),
    fallbackModels: Array.isArray(row.fallback_models)
      ? row.fallback_models.map(String) : [],
    maxInputTokens: Number(row.max_input_tokens), maxOutputTokens: Number(row.max_output_tokens),
    timeoutMs: Number(row.timeout_ms), maxRetries: Number(row.max_retries),
  };
}

function mapBudgetLimit(row: Row): BudgetLimitRecord {
  return {
    revisionId: String(row.revision_id), agentKind: row.agent_kind as AgentKind,
    taskCostMicros: safeInteger(row.task_cost_micros),
    dailyCostMicros: safeInteger(row.daily_cost_micros),
    monthlyCostMicros: safeInteger(row.monthly_cost_micros),
  };
}

function mapApproval(row: Row): ApprovalRequest {
  return {
    id: String(row.id), state: row.state as ApprovalState,
    requesterId: String(row.requester_id), approverScope: row.approver_scope as ApprovalRequest["approverScope"], action: String(row.action),
    resourceType: String(row.resource_type), resourceId: String(row.resource_id),
    parametersDigest: String(row.parameters_digest), policyVersion: Number(row.policy_version),
    configurationRevisionId: String(row.configuration_revision_id),
    expiresAt: toIso(row.expires_at), version: Number(row.version), createdAt: toIso(row.created_at),
    ...(row.task_id === null ? {} : { taskId: String(row.task_id) }),
    ...(row.workflow_version === null ? {} : { workflowVersion: Number(row.workflow_version) }),
    ...(row.decided_by === null ? {} : { decidedBy: String(row.decided_by) }),
    ...(row.decision_reason === null ? {} : { decisionReason: String(row.decision_reason) }),
    ...(row.decided_at === null ? {} : { decidedAt: toIso(row.decided_at) }),
  };
}

function mapRevocation(row: Row): RevocationRecord {
  return {
    id: String(row.id), targetType: row.target_type as RevocationRecord["targetType"],
    targetId: String(row.target_id), reason: String(row.reason),
    activatedBy: String(row.activated_by), activatedAt: toIso(row.activated_at),
    idempotencyKey: String(row.idempotency_key),
    ...(row.approval_id === null ? {} : { approvalId: String(row.approval_id) }),
  };
}

function mapAudit(row: Row): AuditEventRecord {
  return {
    id: String(row.id), actorId: String(row.actor_id),
    actorType: row.actor_type as AuditEventRecord["actorType"], action: String(row.action),
    resourceType: String(row.resource_type), resourceId: String(row.resource_id),
    outcome: row.outcome as AuditEventRecord["outcome"], correlationId: String(row.correlation_id),
    occurredAt: toIso(row.occurred_at),
    ...(row.task_id === null ? {} : { taskId: String(row.task_id) }),
    ...(row.policy_version === null ? {} : { policyVersion: Number(row.policy_version) }),
    ...(row.model_version === null ? {} : { modelVersion: Number(row.model_version) }),
    ...(row.tool_version === null ? {} : { toolVersion: Number(row.tool_version) }),
    ...(row.causation_id === null ? {} : { causationId: String(row.causation_id) }),
  };
}

function mapProvenance(row: Row): ProvenanceRecord {
  return {
    id: String(row.id), sourceType: String(row.source_type), sourceId: String(row.source_id),
    sourceDigest: String(row.source_digest), classification: String(row.classification),
    recordedBy: String(row.recorded_by), recordedAt: toIso(row.recorded_at),
    ...(row.task_id === null ? {} : { taskId: String(row.task_id) }),
  };
}

function mapWorkflowRun(row: Row): WorkflowRun {
  return {
    id: String(row.id),
    taskId: String(row.task_id),
    workflowName: "StoreHealthReviewWorkflowV1",
    workflowVersion: 1,
    planRevision: Number(row.plan_revision),
    temporalWorkflowId: String(row.temporal_workflow_id),
    state: row.state as WorkflowRun["state"],
    projectionSequence: Number(row.projection_sequence),
    version: Number(row.version),
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
    ...(row.temporal_run_id === null ? {} : { temporalRunId: String(row.temporal_run_id) }),
    ...(row.resume_state === null ? {} : { resumeState: row.resume_state as NonNullable<WorkflowRun["resumeState"]> }),
    ...(row.outcome_code === null ? {} : { outcomeCode: row.outcome_code as NonNullable<WorkflowRun["outcomeCode"]> }),
    ...(row.completed_at === null ? {} : { completedAt: toIso(row.completed_at) }),
  };
}

function mapActivityInvocation(row: Row): ActivityInvocation {
  return {
    invocationKey: String(row.invocation_key),
    workflowRunId: String(row.workflow_run_id),
    activityKind: String(row.activity_kind),
    inputDigest: String(row.input_digest),
    state: row.state as ActivityInvocation["state"],
    version: Number(row.version),
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
    ...(row.branch_id === null ? {} : { branchId: String(row.branch_id) }),
    ...(row.outcome_code === null ? {} : { outcomeCode: String(row.outcome_code) }),
    ...(row.safe_result === null
      ? {}
      : { safeResult: row.safe_result as Readonly<Record<string, unknown>> }),
    ...(row.completed_at === null ? {} : { completedAt: toIso(row.completed_at) }),
  };
}

function mapWorkflowSignalReceipt(row: Row): WorkflowSignalReceipt {
  return {
    id: String(row.id),
    workflowRunId: String(row.workflow_run_id),
    signalKind: row.signal_kind as WorkflowSignalReceipt["signalKind"],
    idempotencyKey: String(row.idempotency_key),
    payloadDigest: String(row.payload_digest),
    deliveryState: row.delivery_state as WorkflowSignalReceipt["deliveryState"],
    createdAt: toIso(row.created_at),
    ...(row.approval_id === null ? {} : { approvalId: String(row.approval_id) }),
    ...(row.decision === null
      ? {}
      : { decision: row.decision as NonNullable<WorkflowSignalReceipt["decision"]> }),
    ...(row.application_decision_version === null
      ? {}
      : { applicationDecisionVersion: Number(row.application_decision_version) }),
    ...(row.accepted === null ? {} : { accepted: Boolean(row.accepted) }),
    ...(row.reason_code === null ? {} : { reasonCode: String(row.reason_code) }),
    ...(row.delivered_at === null ? {} : { deliveredAt: toIso(row.delivered_at) }),
  };
}

function sameWorkflowProjection(left: WorkflowRun, right: WorkflowRun): boolean {
  return left.state === right.state
    && left.resumeState === right.resumeState
    && left.outcomeCode === right.outcomeCode
    && left.completedAt === right.completedAt;
}

function safeInteger(value: unknown): number {
  const parsed = Number(String(value));
  if (!Number.isSafeInteger(parsed)) throw new RangeError("Database integer exceeds safe range");
  return parsed;
}

function toIso(value: unknown): string {
  return value instanceof Date ? value.toISOString() : String(value);
}
