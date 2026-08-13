// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { DatabaseSession } from "../../../../../shared/database/transaction";
import type {
  AgenticRepository,
  AuditEventRecord,
  BudgetLimitRecord,
  BudgetReservationInput,
  BudgetSettlementInput,
  ModelConfigurationRecord,
  PolicyRecord,
  ProvenanceRecord,
  RevisionChildren,
  RevocationRecord,
  ToolGrantRecord,
  ToolRecord,
} from "../../../application/repositories/interfaces/agentic.repository";
import type { AgentKind, AgentProfile } from "../../../domain/entities/agent-profile";
import type { AgentTask } from "../../../domain/entities/agent-task";
import type { ApprovalRequest, ApprovalState } from "../../../domain/entities/approval-request";
import type { ConfigurationRevision } from "../../../domain/entities/configuration-revision";

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

  async updateRevision(
    session: DatabaseSession,
    revision: ConfigurationRevision,
    expectedVersion: number,
  ): Promise<boolean> {
    const result = await session.query(
      `UPDATE agentic_configuration_revisions
       SET payload_digest=$2,version=$3,updated_at=$4
       WHERE id=$1 AND state='draft' AND created_by=$5 AND version=$6`,
      [revision.id, revision.payloadDigest, revision.version, revision.updatedAt,
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
       (name,version,input_schema_digest,output_schema_digest,active)
       VALUES($1,$2,$3,$4,$5) ON CONFLICT(name,version) DO NOTHING`,
      [tool.name, tool.version, tool.inputSchemaDigest, tool.outputSchemaDigest, tool.active],
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
       (id,state,requester_id,action,resource_type,resource_id,parameters_digest,
        task_id,policy_version,workflow_version,configuration_revision_id,expires_at,
        decided_by,decision_reason,decided_at,version,created_at)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`,
      [approval.id, approval.state, approval.requesterId, approval.action,
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
    limit: number,
  ): Promise<readonly AuditEventRecord[]> {
    const result = await session.query<Row>(
      "SELECT * FROM agentic_audit_events ORDER BY occurred_at DESC,id LIMIT $1",
      [limit],
    );
    return result.rows.map(mapAudit);
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
  };
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
    requesterId: String(row.requester_id), action: String(row.action),
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

function safeInteger(value: unknown): number {
  const parsed = Number(String(value));
  if (!Number.isSafeInteger(parsed)) throw new RangeError("Database integer exceeds safe range");
  return parsed;
}

function toIso(value: unknown): string {
  return value instanceof Date ? value.toISOString() : String(value);
}
