// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { beforeAll, beforeEach, afterAll, describe, expect, it } from "vitest";
import { PostgresTransactionRunner } from "../../../../../shared/database/transaction";
import { assertIntegrationEnvironment } from "../../../../../shared/testing/assert-integration-environment";
import type { ActivityInvocation, WorkflowRun, WorkflowSignalReceipt } from "../../../domain/entities/workflow-run";
import { transitionWorkflowRun } from "../../../domain/services/workflow-run-rules";
import { runAgenticMigrations } from "../../database/run-agentic-migrations";
import { PostgresqlAgenticRepository } from "./postgresql-agentic.repository";

const databaseUrl = process.env.TEST_DATABASE_URL;
const suite = databaseUrl === undefined ? describe.skip : describe;

suite("PostgresqlAgenticRepository", () => {
  assertIntegrationEnvironment({ TEST_DATABASE_URL: databaseUrl });
  const pool = new Pool({ connectionString: databaseUrl });
  const transactions = new PostgresTransactionRunner(pool);
  const repository = new PostgresqlAgenticRepository();

  beforeAll(async () => runAgenticMigrations(databaseUrl!, "up"));
  beforeEach(async () => {
    await pool.query(`TRUNCATE agentic_workflow_signal_receipts,
      agentic_activity_invocations, agentic_workflow_runs,
      agentic_provenance_records, agentic_audit_events,
      agentic_revocations, agentic_approval_requests, agentic_budget_entries,
      agentic_budget_limits, agentic_model_fallbacks, agentic_model_configs,
      agentic_tool_grants, agentic_tools, agentic_policies,
      agentic_subtask_dependencies, agentic_subtasks, agentic_tasks,
      agentic_configuration_revisions, agentic_agents CASCADE`);
    await pool.query(`INSERT INTO agentic_agents(kind,keycloak_client_id) VALUES
      ('ai_ceo','agent-ai-ceo'),('catalog','agent-catalog'),('inventory','agent-inventory'),
      ('order','agent-order'),('finance','agent-finance'),('crm','agent-crm'),('support','agent-support')`);
  });
  afterAll(async () => pool.end());

  it("enforces owner-scoped reads and one-winner optimistic task updates", async () => {
    const taskId = randomUUID();
    await transactions.run((session) => repository.createTask(session, {
      id: taskId, state: "draft", createdBy: "operator-a", goal: "Review store",
      instructions: "Use evidence", version: 1, createdAt: "2026-08-14T00:00:00.000Z",
      updatedAt: "2026-08-14T00:00:00.000Z",
    }));

    await expect(transactions.runReadOnly((session) => repository.findTask(session, taskId, "operator-b")))
      .resolves.toBeUndefined();
    const next = {
      ...(await transactions.runReadOnly((session) => repository.findTask(session, taskId, "operator-a")))!,
      goal: "Updated review", version: 2, updatedAt: "2026-08-14T01:00:00.000Z",
    };
    const results = await Promise.all([
      transactions.run((session) => repository.updateTask(session, next, 1)),
      transactions.run((session) => repository.updateTask(session, { ...next, goal: "Competing update" }, 1)),
    ]);
    expect(results.sort()).toEqual([false, true]);
  });

  it("resolves fixed agent identities and keeps task lists owner-scoped", async () => {
    const ownedId = randomUUID();
    const foreignId = randomUUID();
    for (const [id, createdBy] of [[ownedId, "operator-a"], [foreignId, "operator-b"]]) {
      await transactions.run((session) => repository.createTask(session, {
        id, state: "draft", createdBy, goal: "Review store", instructions: "Use evidence",
        version: 1, createdAt: "2026-08-14T00:00:00.000Z",
        updatedAt: "2026-08-14T00:00:00.000Z",
      }));
    }
    const agent = await transactions.runReadOnly((session) =>
      repository.findAgentByClientId(session, "agent-inventory"));
    expect(agent).toMatchObject({ kind: "inventory", active: true });
    const page = await transactions.runReadOnly((session) =>
      repository.listTasks(session, "operator-a", 1, 20));
    expect(page.totalItems).toBe(1);
    expect(page.items.map(({ id }) => id)).toEqual([ownedId]);
  });

  it("replaces draft task graphs only for the owner and resolves assigned ready tasks", async () => {
    const taskId = randomUUID();
    const first = randomUUID();
    const second = randomUUID();
    const at = "2026-08-14T00:00:00.000Z";
    const task = { id: taskId, state: "draft" as const, createdBy: "operator-a", goal: "Review", instructions: "Evidence", version: 1, createdAt: at, updatedAt: at };
    await transactions.run((session) => repository.createTask(session, task));
    const subtasks = [
      { id: first, taskId, agentKind: "catalog" as const, title: "Catalog", version: 1, createdAt: at },
      { id: second, taskId, agentKind: "inventory" as const, title: "Inventory", version: 1, createdAt: at },
    ];
    await expect(transactions.run((session) => repository.replaceTaskGraph(session, taskId, "operator-b", subtasks, [])))
      .resolves.toBe(false);
    await expect(transactions.run((session) => repository.replaceTaskGraph(session, taskId, "operator-a", subtasks, [{ taskId, from: first, to: second }])))
      .resolves.toBe(true);
    const graph = await transactions.runReadOnly((session) => repository.listTaskGraph(session, taskId));
    expect(graph.subtasks.map(({ id }) => id).sort()).toEqual([first, second].sort());
    expect(graph.dependencies).toMatchObject([{ from: first, to: second }]);

    const revisionId = randomUUID();
    await pool.query("INSERT INTO agentic_configuration_revisions(id,state,created_by,payload_digest,decided_by,decided_at) VALUES($1,'active','admin-a',$2,'admin-b',now())", [revisionId, "c".repeat(64)]);
    await transactions.run((session) => repository.updateTask(session, {
      ...task, state: "ready", configurationRevisionId: revisionId, version: 2, updatedAt: "2026-08-14T01:00:00.000Z",
    }, 1));
    await expect(transactions.runReadOnly((session) => repository.findTaskForAgent(session, taskId, "catalog")))
      .resolves.toMatchObject({ id: taskId, state: "ready" });
    await expect(transactions.runReadOnly((session) => repository.findTaskForAgent(session, taskId, "support")))
      .resolves.toBeUndefined();
  });

  it("activates one configuration revision and supersedes the previous active revision atomically", async () => {
    const activeId = randomUUID();
    const candidateA = randomUUID();
    const candidateB = randomUUID();
    await pool.query(`INSERT INTO agentic_configuration_revisions
      (id,state,created_by,payload_digest,decided_by,decided_at) VALUES
      ($1,'active','admin-a',$4,'admin-z',now()),
      ($2,'pending_approval','admin-b',$5,NULL,NULL),
      ($3,'pending_approval','admin-c',$6,NULL,NULL)`,
      [activeId, candidateA, candidateB, "a".repeat(64), "b".repeat(64), "c".repeat(64)]);

    const results = await Promise.all([
      transactions.run((session) => repository.activateRevision(session, candidateA, 1, "admin-x", "2026-08-14T01:00:00.000Z")),
      transactions.run((session) => repository.activateRevision(session, candidateB, 1, "admin-y", "2026-08-14T01:00:00.000Z")),
    ]);
    expect(results.some(Boolean)).toBe(true);
    expect((await pool.query("SELECT id FROM agentic_configuration_revisions WHERE state='active'")).rowCount).toBe(1);
    expect((await pool.query("SELECT state FROM agentic_configuration_revisions WHERE id=$1", [activeId])).rows[0]?.state).toBe("superseded");
  });

  it("submits owned drafts and allows one concurrent rejection", async () => {
    const revisionId = randomUUID();
    const draft = {
      id: revisionId, state: "draft" as const, createdBy: "admin-a",
      payloadDigest: "a".repeat(64), version: 1,
      createdAt: "2026-08-14T00:00:00.000Z", updatedAt: "2026-08-14T00:00:00.000Z",
    };
    await transactions.run((session) => repository.createRevision(session, draft));
    const policyId = randomUUID();
    await expect(transactions.run((session) => repository.replaceRevisionChildren(session, revisionId, {
      policies: [{ id: policyId, revisionId, ruleOrder: 1, effect: "DENY", actorType: "agent", resource: "catalog", action: "write", purpose: "analysis", dataClassification: "internal", reasonCode: "read-only" }],
      toolGrants: [], modelConfigurations: [], budgetLimits: [],
    }))).resolves.toBe(true);
    await expect(transactions.runReadOnly((session) => repository.getRevisionChildren(session, revisionId)))
      .resolves.toMatchObject({ policies: [{ id: policyId, reasonCode: "read-only" }] });
    await expect(transactions.run((session) => repository.updateRevision(session, {
      ...draft, state: "pending_approval", version: 2,
      updatedAt: "2026-08-14T01:00:00.000Z",
    }, 1))).resolves.toBe(true);
    const results = await Promise.all([
      transactions.run((session) => repository.rejectRevision(session, revisionId, 2, "admin-b", "Not safe", "2026-08-14T02:00:00.000Z")),
      transactions.run((session) => repository.rejectRevision(session, revisionId, 2, "admin-c", "Incomplete", "2026-08-14T02:00:00.000Z")),
    ]);
    expect(results.sort()).toEqual([false, true]);
    await expect(transactions.runReadOnly((session) => repository.findRevision(session, revisionId)))
      .resolves.toMatchObject({ state: "rejected", version: 3 });
  });

  it("allows exactly one concurrent approval decision", async () => {
    const revisionId = randomUUID();
    const approvalId = randomUUID();
    await pool.query("INSERT INTO agentic_configuration_revisions(id,state,created_by,payload_digest) VALUES($1,'draft','admin-a',$2)", [revisionId, "d".repeat(64)]);
    await pool.query(`INSERT INTO agentic_approval_requests
      (id,state,requester_id,approver_scope,action,resource_type,resource_id,parameters_digest,policy_version,configuration_revision_id,expires_at)
      VALUES($1,'pending','requester-a','tool_invocation','tool.invoke','tool','catalog.health',$2,1,$3,'2026-08-15T00:00:00.000Z')`,
      [approvalId, "e".repeat(64), revisionId]);

    const results = await Promise.all([
      transactions.run((session) => repository.decideApproval(session, approvalId, 1, "approved", "approver-b", "Approved", "2026-08-14T01:00:00.000Z")),
      transactions.run((session) => repository.decideApproval(session, approvalId, 1, "rejected", "approver-c", "Rejected", "2026-08-14T01:00:00.000Z")),
    ]);
    expect(results.sort()).toEqual([false, true]);
  });

  it("prevents concurrent budget reservations from exceeding the task limit and converges duplicate keys", async () => {
    const revisionId = randomUUID();
    const taskId = randomUUID();
    await pool.query("INSERT INTO agentic_configuration_revisions(id,state,created_by,payload_digest) VALUES($1,'draft','admin-a',$2)", [revisionId, "f".repeat(64)]);
    await pool.query("INSERT INTO agentic_budget_limits(revision_id,agent_kind,task_cost_micros,daily_cost_micros,monthly_cost_micros) VALUES($1,'catalog',100,100,100)", [revisionId]);
    await pool.query("UPDATE agentic_configuration_revisions SET state='active',decided_by='admin-b',decided_at=now() WHERE id=$1", [revisionId]);
    await pool.query("INSERT INTO agentic_tasks(id,state,created_by,goal,instructions,configuration_revision_id) VALUES($1,'ready','operator-a','Review','Evidence',$2)", [taskId, revisionId]);

    const reserve = (idempotencyKey: string) => transactions.run((session) => repository.reserveBudget(session, {
      id: randomUUID(), revisionId, agentKind: "catalog", taskId, idempotencyKey,
      costMicros: 60, occurredAt: "2026-08-14T01:00:00.000Z",
    }));
    const keys = ["reserve-a", "reserve-b"] as const;
    const results = await Promise.all(keys.map(reserve));
    expect([...results].sort()).toEqual(["exceeded", "reserved"]);
    const reservedKey = keys[results.indexOf("reserved")];
    await expect(reserve(reservedKey!)).resolves.toBe("duplicate");
  });

  it("settles reservations once and persists append-only audit, provenance, and revocation evidence", async () => {
    const revisionId = randomUUID();
    const taskId = randomUUID();
    const reservationId = randomUUID();
    await pool.query("INSERT INTO agentic_configuration_revisions(id,state,created_by,payload_digest) VALUES($1,'draft','admin-a',$2)", [revisionId, "a".repeat(64)]);
    await pool.query("INSERT INTO agentic_budget_limits(revision_id,agent_kind,task_cost_micros,daily_cost_micros,monthly_cost_micros) VALUES($1,'catalog',100,100,100)", [revisionId]);
    await pool.query("UPDATE agentic_configuration_revisions SET state='active',decided_by='admin-b',decided_at=now() WHERE id=$1", [revisionId]);
    await pool.query("INSERT INTO agentic_tasks(id,state,created_by,goal,instructions,configuration_revision_id) VALUES($1,'ready','operator-a','Review','Evidence',$2)", [taskId, revisionId]);
    await expect(transactions.run((session) => repository.reserveBudget(session, {
      id: reservationId, revisionId, agentKind: "catalog", taskId,
      idempotencyKey: "reservation", costMicros: 80,
      occurredAt: "2026-08-14T01:00:00.000Z",
    }))).resolves.toBe("reserved");
    const settle = (key: string) => transactions.run((session) => repository.settleBudget(session, {
      id: randomUUID(), reservationId, idempotencyKey: key, actualCostMicros: 70,
      occurredAt: "2026-08-14T01:01:00.000Z",
    }));
    const settlementResults = await Promise.all([settle("settlement-a"), settle("settlement-b")]);
    expect([...settlementResults].sort()).toEqual(["settled", "stale"]);

    const auditId = randomUUID();
    const provenanceId = randomUUID();
    await transactions.run(async (session) => {
      await repository.appendAudit(session, {
        id: auditId, actorId: "agent-catalog", actorType: "agent", taskId,
        action: "catalog.read", resourceType: "tool", resourceId: "catalog.health",
        outcome: "allowed", correlationId: "corr-1", occurredAt: "2026-08-14T01:02:00.000Z",
      });
      await repository.appendProvenance(session, {
        id: provenanceId, taskId, sourceType: "database", sourceId: "catalog.products",
        sourceDigest: "b".repeat(64), classification: "internal",
        recordedBy: "agent-catalog", recordedAt: "2026-08-14T01:02:00.000Z",
      });
      await repository.createRevocation(session, {
        id: randomUUID(), targetType: "agent", targetId: "catalog", reason: "Emergency stop",
        activatedBy: "admin-a", activatedAt: "2026-08-14T01:03:00.000Z",
        idempotencyKey: "revoke-catalog",
      });
    });
    expect(await transactions.runReadOnly((session) => repository.listAudit(session, { limit: 10 })))
      .toHaveLength(1);
    expect(await transactions.runReadOnly((session) => repository.listAudit(session, { limit: 10, actorId: "someone-else" })))
      .toHaveLength(0);
    expect(await transactions.runReadOnly((session) => repository.listProvenance(session, taskId)))
      .toHaveLength(1);
    expect(await transactions.runReadOnly((session) => repository.findActiveRevocation(session, "agent", "catalog")))
      .toMatchObject({ reason: "Emergency stop" });
  });

  it("converges workflow starts and rejects stale projections", async () => {
    const { taskId } = await createReadyTask(pool);
    const first = workflowRun(taskId);
    const competing = workflowRun(taskId, { id: randomUUID(), temporalWorkflowId: `store-health-v1:${randomUUID()}` });

    const starts = await Promise.all([
      transactions.run((session) => repository.createWorkflowRun(session, first)),
      transactions.run((session) => repository.createWorkflowRun(session, competing)),
    ]);
    expect(starts.map(({ status }) => status).sort()).toEqual(["created", "duplicate"]);
    const accepted = starts.find(({ status }) => status === "created")!.run;
    expect(starts.find(({ status }) => status === "duplicate")!.run).toEqual(accepted);

    const planning = transitionWorkflowRun(accepted, { state: "planning" }, "2026-08-14T01:00:00.000Z");
    await expect(transactions.run((session) => repository.projectWorkflowRun(
      session, planning, 1, 0,
    ))).resolves.toBe("updated");
    await expect(transactions.run((session) => repository.projectWorkflowRun(
      session, planning, 1, 0,
    ))).resolves.toBe("duplicate");
    await expect(transactions.run((session) => repository.projectWorkflowRun(
      session, { ...planning, state: "failed", outcomeCode: "INVALID_FROZEN_PLAN", completedAt: "2026-08-14T01:01:00.000Z" }, 1, 0,
    ))).resolves.toBe("conflict");
    await expect(transactions.run((session) => repository.projectWorkflowRun(
      session, accepted, 1, 0,
    ))).resolves.toBe("stale");
    await expect(transactions.runReadOnly((session) => repository.findWorkflowRun(session, accepted.id)))
      .resolves.toEqual(planning);

    await expect(transactions.run((session) => repository.attachTemporalRunId(
      session, accepted.id, "temporal-run-1", 2, "2026-08-14T01:02:00.000Z",
    ))).resolves.toBe(true);
    await expect(transactions.run((session) => repository.attachTemporalRunId(
      session, accepted.id, "temporal-run-2", 2, "2026-08-14T01:03:00.000Z",
    ))).resolves.toBe(false);
    await expect(transactions.runReadOnly((session) => repository.listPendingWorkflowStarts(session, 10)))
      .resolves.toEqual([]);
  });

  it("returns stored activity outcomes and rejects a conflicting invocation digest", async () => {
    const { taskId, subtaskId } = await createReadyTask(pool);
    const run = workflowRun(taskId);
    await transactions.run((session) => repository.createWorkflowRun(session, run));
    const invocation = activityInvocation(run.id, subtaskId);

    const reservations = await Promise.all([
      transactions.run((session) => repository.reserveActivityInvocation(session, invocation)),
      transactions.run((session) => repository.reserveActivityInvocation(
        session, { ...invocation, createdAt: "2026-08-14T01:01:00.000Z" },
      )),
    ]);
    expect(reservations.map(({ status }) => status).sort()).toEqual(["duplicate", "reserved"]);
    expect(reservations.every(({ invocation: stored }) => stored.invocationKey === invocation.invocationKey))
      .toBe(true);
    await expect(transactions.run((session) => repository.reserveActivityInvocation(
      session, { ...invocation, inputDigest: "f".repeat(64) },
    ))).resolves.toEqual({ status: "conflict", invocation });

    const completed: ActivityInvocation = {
      ...invocation,
      state: "completed",
      outcomeCode: "FAKE_ANALYSIS_COMPLETED",
      safeResult: { status: "usable" },
      version: 2,
      updatedAt: "2026-08-14T01:02:00.000Z",
      completedAt: "2026-08-14T01:02:00.000Z",
    };
    await expect(transactions.run((session) => repository.finishActivityInvocation(
      session, completed, 1,
    ))).resolves.toBe(true);
    await expect(transactions.run((session) => repository.finishActivityInvocation(
      session, completed, 1,
    ))).resolves.toBe(false);
    await expect(transactions.runReadOnly((session) => repository.findActivityInvocation(
      session, invocation.invocationKey,
    ))).resolves.toEqual(completed);
  });

  it("deduplicates signal receipts and lists only pending delivery", async () => {
    const { taskId, revisionId } = await createReadyTask(pool);
    const run = workflowRun(taskId);
    const approvalId = randomUUID();
    await transactions.run((session) => repository.createWorkflowRun(session, run));
    await pool.query(`INSERT INTO agentic_approval_requests
      (id,state,requester_id,approver_scope,action,resource_type,resource_id,
       parameters_digest,task_id,policy_version,workflow_version,
       configuration_revision_id,expires_at,decided_by,decision_reason,
       decided_at,version)
      VALUES($1,'approved','system:workflow','workflow_execution',
       'agentic.workflow.complete','workflow_run',$2,$3,$4,1,1,$5,
       '2026-08-15T00:00:00.000Z','approver-a','Approved for completion',
       '2026-08-14T01:00:00.000Z',2)`,
    [approvalId, run.id, "a".repeat(64), taskId, revisionId]);
    await expect(transactions.runReadOnly((session) => repository.findWorkflowApproval(
      session, run.id,
    ))).resolves.toMatchObject({
      id: approvalId,
      approverScope: "workflow_execution",
      resourceId: run.id,
    });
    const receipt = signalReceipt(run.id, approvalId);

    await expect(transactions.run((session) => repository.createWorkflowSignalReceipt(session, receipt)))
      .resolves.toEqual({ status: "created", receipt });
    await expect(transactions.run((session) => repository.createWorkflowSignalReceipt(
      session, { ...receipt, id: randomUUID() },
    ))).resolves.toEqual({ status: "duplicate", receipt });
    await expect(transactions.run((session) => repository.createWorkflowSignalReceipt(
      session, { ...receipt, id: randomUUID(), payloadDigest: "b".repeat(64) },
    ))).resolves.toEqual({ status: "conflict", receipt });
    await expect(transactions.runReadOnly((session) => repository.listPendingWorkflowSignals(session, 10)))
      .resolves.toEqual([receipt]);

    const delivered: WorkflowSignalReceipt = {
      ...receipt,
      deliveryState: "delivered",
      accepted: true,
      deliveredAt: "2026-08-14T01:02:00.000Z",
    };
    await expect(transactions.run((session) => repository.updateWorkflowSignalReceipt(
      session, delivered,
    ))).resolves.toBe(true);
    await expect(transactions.runReadOnly((session) => repository.listPendingWorkflowSignals(session, 10)))
      .resolves.toEqual([]);
  });

  it("rolls back workflow mutation and its audit event together", async () => {
    const { taskId } = await createReadyTask(pool);
    const run = workflowRun(taskId);

    await expect(transactions.run(async (session) => {
      await repository.createWorkflowRun(session, run);
      await repository.appendAudit(session, {
        id: randomUUID(), actorId: "operator-a", actorType: "staff", taskId,
        action: "agentic.workflow.start.accepted", resourceType: "workflow_run",
        resourceId: run.id, outcome: "allowed", correlationId: "corr-rollback",
        occurredAt: "2026-08-14T01:00:00.000Z",
      });
      throw new Error("rollback requested");
    })).rejects.toThrow("rollback requested");

    await expect(transactions.runReadOnly((session) => repository.findWorkflowRun(session, run.id)))
      .resolves.toBeUndefined();
    await expect(transactions.runReadOnly((session) => repository.listAudit(
      session, { limit: 10, action: "agentic.workflow.start.accepted" },
    ))).resolves.toEqual([]);
  });
});

async function createReadyTask(pool: Pool): Promise<{
  readonly taskId: string;
  readonly revisionId: string;
  readonly subtaskId: string;
}> {
  const revisionId = randomUUID();
  const taskId = randomUUID();
  const subtaskId = randomUUID();
  await pool.query(
    "INSERT INTO agentic_configuration_revisions(id,state,created_by,payload_digest) VALUES($1,'draft','admin-a',$2)",
    [revisionId, "c".repeat(64)],
  );
  await pool.query(
    "INSERT INTO agentic_tasks(id,state,created_by,goal,instructions,configuration_revision_id,version) VALUES($1,'ready','operator-a','Review','Evidence',$2,2)",
    [taskId, revisionId],
  );
  await pool.query(
    "INSERT INTO agentic_subtasks(id,task_id,agent_kind,title) VALUES($1,$2,'catalog','Catalog health')",
    [subtaskId, taskId],
  );
  return { taskId, revisionId, subtaskId };
}

function workflowRun(taskId: string, overrides: Partial<WorkflowRun> = {}): WorkflowRun {
  const id = randomUUID();
  return {
    id,
    taskId,
    workflowName: "StoreHealthReviewWorkflowV1",
    workflowVersion: 1,
    planRevision: 2,
    temporalWorkflowId: `store-health-v1:${id}`,
    state: "received",
    projectionSequence: 0,
    version: 1,
    createdAt: "2026-08-14T01:00:00.000Z",
    updatedAt: "2026-08-14T01:00:00.000Z",
    ...overrides,
  };
}

function activityInvocation(workflowRunId: string, branchId: string): ActivityInvocation {
  const digest = "d".repeat(64);
  return {
    invocationKey: `${workflowRunId}:1:execute_fake_analysis:${branchId}:${digest}`,
    workflowRunId,
    activityKind: "execute_fake_analysis",
    branchId,
    inputDigest: digest,
    state: "reserved",
    version: 1,
    createdAt: "2026-08-14T01:00:00.000Z",
    updatedAt: "2026-08-14T01:00:00.000Z",
  };
}

function signalReceipt(workflowRunId: string, approvalId: string): WorkflowSignalReceipt {
  return {
    id: randomUUID(),
    workflowRunId,
    signalKind: "approval",
    idempotencyKey: `approval:${approvalId}:2`,
    approvalId,
    payloadDigest: "a".repeat(64),
    decision: "approved",
    applicationDecisionVersion: 2,
    deliveryState: "pending",
    createdAt: "2026-08-14T01:01:00.000Z",
  };
}
