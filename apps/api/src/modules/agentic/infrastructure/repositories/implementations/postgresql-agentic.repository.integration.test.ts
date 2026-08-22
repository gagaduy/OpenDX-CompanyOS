// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { beforeAll, beforeEach, afterAll, describe, expect, it } from "vitest";
import { PostgresTransactionRunner } from "../../../../../shared/database/transaction";
import { assertIntegrationEnvironment } from "../../../../../shared/testing/assert-integration-environment";
import type { ModelQualityEvidence, ModelRun } from "../../../domain/entities/model-run";
import type { AgenticIntakeFile, AgenticFilePreview } from "../../../domain/entities/agentic-file";
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
    await pool.query(`TRUNCATE agentic_model_quality_evidence, agentic_model_runs,
      agentic_file_approvals, agentic_file_previews, agentic_intake_files,
      agentic_workflow_signal_receipts,
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
    await pool.query(`INSERT INTO agentic_tools
      (name,version,input_schema_digest,output_schema_digest,execution_cost_micros,maximum_attempts)
      VALUES('catalog.product_completeness',1,$1,$2,1,2)`, ["a".repeat(64), "b".repeat(64)]);
  });

  it("persists bounded previews and atomically creates one draft task per approved file", async () => {
    const at = "2026-08-22T00:00:00.000Z";
    const file: AgenticIntakeFile = {
      id: randomUUID(), objectKey: `agentic-intake/${randomUUID()}`, originalFilename: "catalog.csv",
      format: "csv", mediaType: "text/csv", byteSize: 42, payloadDigest: "a".repeat(64),
      status: "uploaded", createdBy: "governance-admin", version: 1, createdAt: at, updatedAt: at,
    };
    const preview: AgenticFilePreview = {
      id: randomUUID(), fileId: file.id, previewVersion: 1, parserVersion: "csv-rfc4180-v1",
      payloadDigest: file.payloadDigest, previewDigest: "b".repeat(64), summary: { rowCount: 1 }, createdAt: at,
    };
    await transactions.run(async (session) => {
      await repository.createIntakeFile(session, file);
      expect(await repository.transitionIntakeFile(session, { ...file, status: "scanning", version: 2, updatedAt: at }, 1)).toBe(true);
      expect(await repository.transitionIntakeFile(session, { ...file, status: "clean", version: 3, updatedAt: at, scannedAt: at }, 2)).toBe(true);
      await repository.appendFilePreview(session, preview);
      expect(await repository.transitionIntakeFile(session, { ...file, status: "previewed", version: 4, updatedAt: at, scannedAt: at }, 3)).toBe(true);
    });
    const task = { id: randomUUID(), state: "draft" as const, createdBy: "governance-admin", goal: "Review catalog", instructions: "Use bounded preview", version: 1, createdAt: at, updatedAt: at };
    const first = await transactions.run((session) => repository.approveFilePreview(session, { id: randomUUID(), fileId: file.id, previewVersion: 1, previewDigest: preview.previewDigest, expectedFileVersion: 4, previewPayloadDigest: preview.payloadDigest, task, idempotencyKey: `file-approval:${file.id}`, approvedBy: "governance-admin", approvedAt: at }));
    const replay = await transactions.run((session) => repository.approveFilePreview(session, { id: randomUUID(), fileId: file.id, previewVersion: 1, previewDigest: preview.previewDigest, expectedFileVersion: 4, previewPayloadDigest: preview.payloadDigest, task: { ...task, id: randomUUID() }, idempotencyKey: `file-approval:${file.id}`, approvedBy: "governance-admin", approvedAt: at }));
    expect(first).toEqual({ status: "created", taskId: task.id });
    expect(replay).toEqual({ status: "duplicate", taskId: task.id });
    expect(await transactions.runReadOnly((session) => repository.findIntakeFile(session, file.id))).toMatchObject({ status: "approved", version: 5 });
  });

  it("serializes concurrent file approvals into one task, approval, audit, and provenance set", async () => {
    const at = "2026-08-22T00:00:00.000Z"; const fileId = randomUUID(); const previewId = randomUUID();
    await pool.query(`INSERT INTO agentic_intake_files(id,object_key,original_filename,format,media_type,byte_size,payload_digest,status,created_by,version,created_at,updated_at,scanned_at)
      VALUES($1,$2,'catalog.csv','csv','text/csv',42,$3,'previewed','governance-admin',4,$4,$4,$4)`, [fileId, `agentic-intake/${randomUUID()}`, "a".repeat(64), at]);
    await pool.query(`INSERT INTO agentic_file_previews(id,file_id,preview_version,parser_version,payload_digest,preview_digest,summary,created_at)
      VALUES($1,$2,1,'csv-rfc4180-v1',$3,$4,'{}',$5)`, [previewId, fileId, "a".repeat(64), "b".repeat(64), at]);
    let entered!: () => void; const firstEntered = new Promise<void>((resolve) => { entered = resolve; }); let release!: () => void; const releaseFirst = new Promise<void>((resolve) => { release = resolve; }); let secondStarted!: () => void; const secondReady = new Promise<void>((resolve) => { secondStarted = resolve; }); const key = `file-approval:${fileId}`;
    const approval = (taskId: string) => ({ id: randomUUID(), fileId, previewVersion: 1, previewDigest: "b".repeat(64), expectedFileVersion: 4, previewPayloadDigest: "a".repeat(64), task: { id: taskId, state: "draft" as const, createdBy: "governance-admin", goal: "Review catalog", instructions: "Use bounded preview", version: 1, createdAt: at, updatedAt: at }, idempotencyKey: key, approvedBy: "governance-admin", approvedAt: at });
    const first = transactions.run(async (session) => { const input = approval(randomUUID()); const result = await repository.approveFilePreview(session, input); entered(); await releaseFirst; if (result.status === "created") { await repository.appendAudit(session, { id: randomUUID(), actorId: "governance-admin", actorType: "staff", taskId: input.task.id, action: "agentic_file.approve", resourceType: "agentic_intake_file", resourceId: fileId, outcome: "allowed", correlationId: fileId, occurredAt: at }); await repository.appendProvenance(session, { id: randomUUID(), taskId: input.task.id, sourceType: "agentic_intake_file", sourceId: fileId, sourceDigest: "a".repeat(64), sourceVersion: 4, classification: "internal", recordedBy: "governance-admin", recordedAt: at }); await repository.appendProvenance(session, { id: randomUUID(), taskId: input.task.id, sourceType: "agentic_file_preview", sourceId: previewId, sourceDigest: "b".repeat(64), sourceVersion: 1, classification: "internal", recordedBy: "governance-admin", recordedAt: at }); } return result; });
    await firstEntered;
    const second = transactions.run(async (session) => { secondStarted(); return repository.approveFilePreview(session, approval(randomUUID())); });
    await secondReady; release(); const [created, replay] = await Promise.all([first, second]);
    expect(created.status).toBe("created"); expect(replay).toEqual({ status: "duplicate", taskId: created.taskId });
    await expect(pool.query("SELECT count(*)::int AS count FROM agentic_tasks")).resolves.toMatchObject({ rows: [{ count: 1 }] });
    await expect(pool.query("SELECT count(*)::int AS count FROM agentic_file_approvals")).resolves.toMatchObject({ rows: [{ count: 1 }] });
    await expect(pool.query("SELECT count(*)::int AS count FROM agentic_audit_events WHERE action='agentic_file.approve'")).resolves.toMatchObject({ rows: [{ count: 1 }] });
    await expect(pool.query("SELECT count(*)::int AS count FROM agentic_provenance_records")).resolves.toMatchObject({ rows: [{ count: 2 }] });
  });

  it("stores exact model pricing and maps it without precision loss", async () => {
    const revisionId = randomUUID();
    await transactions.run(async (session) => {
      await repository.createRevision(session, {
        id: revisionId, state: "draft", createdBy: "admin-a", payloadDigest: "a".repeat(64),
        version: 1, createdAt: "2026-08-19T00:00:00.000Z", updatedAt: "2026-08-19T00:00:00.000Z",
      });
      await repository.replaceRevisionChildren(session, revisionId, {
        policies: [], toolGrants: [], budgetLimits: [],
        modelConfigurations: [{
          revisionId, agentKind: "catalog", primaryModel: "google/gemma-4-26b-a4b-it:free",
          fallbackModels: ["liquid/lfm-2.5-2.6b:free"], maxInputTokens: 8_000,
          maxOutputTokens: 2_000, timeoutMs: 30_000, maxRetries: 1,
          inputCostMicrosPerMillion: 0, outputCostMicrosPerMillion: Number.MAX_SAFE_INTEGER,
        }],
      });
    });

    await expect(transactions.runReadOnly((session) =>
      repository.findModelConfiguration(session, revisionId, "catalog")))
      .resolves.toMatchObject({
        inputCostMicrosPerMillion: 0,
        outputCostMicrosPerMillion: Number.MAX_SAFE_INTEGER,
      });
  });

  it.each([
    ["quality reasons", { qualityReasonCodes: ["MODEL_RESULT_ACCEPTED"] }],
    ["provenance", { provenanceIds: ["evidence-1"] }],
  ])("rejects reserved model runs carrying %s", async (_case, evidence) => {
    const { taskId, revisionId } = await createReadyTask(pool);
    await expect(transactions.run((session) => repository.reserveModelRun(session, {
      ...modelRun(taskId, revisionId),
      ...evidence,
    }))).rejects.toMatchObject({ code: "MODEL_RUN_INVALID" });
  });

  it.each([
    ["task", { taskId: randomUUID() }],
    ["configuration", { configurationRevisionId: randomUUID() }],
    ["requested model", { requestedModel: "different/model:free" }],
  ] satisfies ReadonlyArray<readonly [string, Partial<ModelRun>]>)(
    "rejects a running transition with forged %s identity",
    async (_case, identity) => {
      const { taskId, revisionId } = await createReadyTask(pool);
      const reserved = (await transactions.run((session) =>
        repository.reserveModelRun(session, modelRun(taskId, revisionId)))).run;
      await expect(transactions.run((session) => repository.markModelRunRunning(
        session, { ...runningModelRun(reserved), ...identity }, 1,
      ))).resolves.toBe(false);
      await expect(transactions.runReadOnly((session) => repository.findModelRun(session, reserved.id)))
        .resolves.toEqual(reserved);
    },
  );

  it.each([
    ["task", { taskId: randomUUID() }],
    ["configuration", { configurationRevisionId: randomUUID() }],
    ["requested model", { requestedModel: "different/model:free" }],
  ] satisfies ReadonlyArray<readonly [string, Partial<ModelRun>]>)(
    "rejects terminal settlement with forged %s identity",
    async (_case, identity) => {
      const { taskId, revisionId } = await createReadyTask(pool);
      const reserved = (await transactions.run((session) =>
        repository.reserveModelRun(session, modelRun(taskId, revisionId)))).run;
      const running = runningModelRun(reserved);
      await transactions.run((session) => repository.markModelRunRunning(session, running, 1));
      await expect(transactions.run((session) => repository.settleModelRunTerminal(
        session, { ...completedModelRun(running), ...identity }, 2,
      ))).resolves.toBe("conflict");
      await expect(transactions.runReadOnly((session) => repository.findModelRun(session, reserved.id)))
        .resolves.toEqual(running);
    },
  );

  it.each([
    ["task", { taskId: randomUUID() }],
    ["configuration", { configurationRevisionId: randomUUID() }],
    ["returned model", { returnedModel: "different/model:free" }],
    ["fallback position", { fallbackPosition: 1 }],
    ["started timestamp", { startedAt: "2026-08-19T01:01:01.000Z" }],
  ] satisfies ReadonlyArray<readonly [string, Partial<ModelRun>]>)(
    "conflicts terminal replay with forged %s identity",
    async (_case, identity) => {
      const { taskId, revisionId } = await createReadyTask(pool);
      const reserved = (await transactions.run((session) =>
        repository.reserveModelRun(session, modelRun(taskId, revisionId)))).run;
      const running = runningModelRun(reserved);
      const completed = completedModelRun(running);
      await transactions.run((session) => repository.markModelRunRunning(session, running, 1));
      await transactions.run((session) => repository.settleModelRunTerminal(session, completed, 2));
      await expect(transactions.run((session) => repository.settleModelRunTerminal(
        session, { ...completed, ...identity }, 2,
      ))).resolves.toBe("conflict");
    },
  );

  it.each([
    ["older", 1],
    ["terminal", 3],
    ["future", 4],
  ] as const)("conflicts %s terminal replay version %i", async (_case, expectedVersion) => {
    const { taskId, revisionId } = await createReadyTask(pool);
    const reserved = (await transactions.run((session) =>
      repository.reserveModelRun(session, modelRun(taskId, revisionId)))).run;
    const running = runningModelRun(reserved);
    const completed = completedModelRun(running);
    await transactions.run((session) => repository.markModelRunRunning(session, running, 1));
    await transactions.run((session) => repository.settleModelRunTerminal(session, completed, 2));
    await expect(transactions.run((session) => repository.settleModelRunTerminal(
      session, completed, expectedVersion,
    ))).resolves.toBe("conflict");
  });

  it("converges model run reservation, optimistic lifecycle, and append evidence", async () => {
    const { taskId, revisionId } = await createReadyTask(pool);
    const run = modelRun(taskId, revisionId);
    const reservations = await Promise.all([
      transactions.run((session) => repository.reserveModelRun(session, run)),
      transactions.run((session) => repository.reserveModelRun(session, { ...run, id: randomUUID() })),
    ]);
    expect(reservations.map(({ status }) => status).sort()).toEqual(["duplicate", "reserved"]);
    expect(reservations.every(({ run: stored }) => stored.id === reservations[0]?.run.id)).toBe(true);
    await expect(transactions.run((session) => repository.reserveModelRun(session, {
      ...run, id: randomUUID(), inputDigest: "f".repeat(64),
    }))).resolves.toMatchObject({ status: "conflict" });

    const accepted = reservations[0]!.run;
    const running = {
      ...accepted, status: "running" as const, returnedModel: accepted.requestedModel,
      fallbackPosition: 0 as const, version: 2, startedAt: "2026-08-19T01:01:00.000Z",
      updatedAt: "2026-08-19T01:01:00.000Z",
    };
    const starts = await Promise.all([
      transactions.run((session) => repository.markModelRunRunning(session, running, 1)),
      transactions.run((session) => repository.markModelRunRunning(session, running, 1)),
    ]);
    expect(starts.sort()).toEqual([false, true]);

    const completed = {
      ...running, status: "completed" as const, outputDigest: "b".repeat(64),
      inputTokens: 10, outputTokens: 5, settledCostMicros: 0,
      providerRequestIdDigest: "c".repeat(64), latencyMs: 20,
      statusCode: "MODEL_RESULT_ACCEPTED", qualityReasonCodes: [], provenanceIds: ["evidence-1"],
      version: 3, completedAt: "2026-08-19T01:02:00.000Z", updatedAt: "2026-08-19T01:02:00.000Z",
    };
    await expect(transactions.run((session) =>
      repository.settleModelRunTerminal(session, completed, 2))).resolves.toBe("updated");
    await expect(transactions.run((session) =>
      repository.settleModelRunTerminal(session, completed, 2))).resolves.toBe("duplicate");
    await expect(transactions.run((session) => repository.settleModelRunTerminal(session, {
      ...completed,
      startedAt: "2026-08-19T08:01:00.000+07:00",
      completedAt: "2026-08-19T08:02:00.000+07:00",
      updatedAt: "2026-08-19T08:02:00.000+07:00",
    }, 2))).resolves.toBe("duplicate");
    await expect(transactions.run((session) => repository.settleModelRunTerminal(session, {
      ...completed,
      completedAt: "2026-08-19T08:02:01.000+07:00",
      updatedAt: "2026-08-19T08:02:01.000+07:00",
    }, 2))).resolves.toBe("conflict");
    await expect(transactions.run((session) => repository.settleModelRunTerminal(
      session, { ...completed, outputDigest: "d".repeat(64) }, 2,
    ))).resolves.toBe("conflict");
    await expect(transactions.runReadOnly((session) => repository.findModelRun(session, accepted.id)))
      .resolves.toEqual(completed);

    const evidence = {
      id: randomUUID(), modelRunId: accepted.id, generationRound: 0 as const,
      idempotencyKey: "quality:catalog:0", outcome: "accepted" as const,
      reasonCodes: [], provenanceIds: ["evidence-1"], evidenceDigest: "e".repeat(64),
      recordedAt: "2026-08-19T01:02:00.000Z",
    };
    await expect(transactions.run((session) => repository.appendModelQualityEvidence(session, evidence)))
      .resolves.toBe("created");
    await expect(transactions.run((session) => repository.appendModelQualityEvidence(
      session, { ...evidence, id: randomUUID() },
    ))).resolves.toBe("duplicate");
    await expect(transactions.run((session) => repository.appendModelQualityEvidence(
      session, { ...evidence, id: randomUUID(), recordedAt: "2026-08-19T08:02:00.000+07:00" },
    ))).resolves.toBe("duplicate");
    await expect(transactions.run((session) => repository.appendModelQualityEvidence(
      session, { ...evidence, id: randomUUID(), recordedAt: "2026-08-19T08:02:01.000+07:00" },
    ))).resolves.toBe("conflict");
    await expect(transactions.run((session) => repository.appendModelQualityEvidence(
      session, { ...evidence, id: randomUUID(), evidenceDigest: "f".repeat(64) },
    ))).resolves.toBe("conflict");
    await expect(transactions.run((session) => repository.appendModelQualityEvidence(
      session, { ...evidence, id: randomUUID(), idempotencyKey: "quality:catalog:alternate" },
    ))).resolves.toBe("duplicate");
  });

  it("replays delayed and concurrent semantic model run reservations despite new timestamps", async () => {
    const { taskId, revisionId } = await createReadyTask(pool);
    const first = modelRun(taskId, revisionId);
    const delayed = {
      ...first,
      id: randomUUID(),
      createdAt: "2026-08-19T01:00:01.000Z",
      updatedAt: "2026-08-19T01:00:01.000Z",
    };
    const reserved = await transactions.run((session) => repository.reserveModelRun(session, first));

    await expect(transactions.run((session) => repository.reserveModelRun(session, delayed)))
      .resolves.toEqual({ status: "duplicate", run: reserved.run });
    await expect(transactions.run((session) => repository.reserveModelRun(session, {
      ...delayed,
      inputDigest: "f".repeat(64),
    }))).resolves.toMatchObject({ status: "conflict" });

    const concurrentKey = "model:catalog:concurrent";
    const concurrent = await Promise.all([
      transactions.run((session) => repository.reserveModelRun(session, {
        ...first, id: randomUUID(), idempotencyKey: concurrentKey,
      })),
      transactions.run((session) => repository.reserveModelRun(session, {
        ...delayed, id: randomUUID(), idempotencyKey: concurrentKey,
      })),
    ]);
    expect(concurrent.map(({ status }) => status).sort()).toEqual(["duplicate", "reserved"]);
    expect(concurrent[0]!.run).toEqual(concurrent[1]!.run);
  });

  it("rejects quality evidence before its model run is terminal", async () => {
    const { taskId, revisionId } = await createReadyTask(pool);
    const reserved = (await transactions.run((session) =>
      repository.reserveModelRun(session, modelRun(taskId, revisionId)))).run;
    const evidence = modelQualityEvidence(reserved.id);
    await expect(transactions.run((session) =>
      repository.appendModelQualityEvidence(session, evidence)))
      .rejects.toMatchObject({ code: "23514" });

    const running = runningModelRun(reserved);
    await expect(transactions.run((session) =>
      repository.markModelRunRunning(session, running, 1))).resolves.toBe(true);
    await expect(transactions.run((session) =>
      repository.appendModelQualityEvidence(session, evidence)))
      .rejects.toMatchObject({ code: "23514" });
  });

  it("validates model run and evidence mutations before executing SQL", async () => {
    const { taskId, revisionId } = await createReadyTask(pool);
    const reserved = (await transactions.run((session) =>
      repository.reserveModelRun(session, modelRun(taskId, revisionId)))).run;
    const running = runningModelRun(reserved);
    await expect(transactions.run((session) => repository.markModelRunRunning(session, {
      ...running, startedAt: "infinity", updatedAt: "infinity",
    }, 1))).rejects.toMatchObject({ code: "MODEL_RUN_INVALID" });
    await expect(transactions.run((session) =>
      repository.markModelRunRunning(session, running, 1))).resolves.toBe(true);

    const completed = completedModelRun(running);
    await expect(transactions.run((session) => repository.settleModelRunTerminal(session, {
      ...completed, completedAt: "infinity", updatedAt: "infinity",
    }, 2))).rejects.toMatchObject({ code: "MODEL_RUN_INVALID" });
    await expect(transactions.run((session) => repository.settleModelRunTerminal(session, {
      ...completed, status: "running",
    } as unknown as ModelRun, 2))).rejects.toMatchObject({ code: "MODEL_RUN_INVALID" });
    await expect(transactions.run((session) =>
      repository.settleModelRunTerminal(session, completed, 2))).resolves.toBe("updated");

    await expect(transactions.run((session) => repository.appendModelQualityEvidence(session, {
      ...modelQualityEvidence(reserved.id), recordedAt: "infinity",
    }))).rejects.toMatchObject({ code: "MODEL_QUALITY_EVIDENCE_INVALID" });
    await expect(transactions.run((session) => repository.appendModelQualityEvidence(session, {
      ...modelQualityEvidence(reserved.id), outcome: "retry",
    } as unknown as ModelQualityEvidence))).rejects.toMatchObject({
      code: "MODEL_QUALITY_EVIDENCE_INVALID",
    });
  });
  afterAll(async () => {
    await runAgenticMigrations(databaseUrl!, "down", 999_999);
    await pool.end();
  });

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
      ($2,'draft','admin-b',$5,NULL,NULL),
      ($3,'draft','admin-c',$6,NULL,NULL)`,
      [activeId, candidateA, candidateB, "a".repeat(64), "b".repeat(64), "c".repeat(64)]);

    const results = await Promise.all([
      transactions.run((session) => repository.activateRevision(session, candidateA, 1, "admin-b", "2026-08-14T01:00:00.000Z")),
      transactions.run((session) => repository.activateRevision(session, candidateB, 1, "admin-c", "2026-08-14T01:00:00.000Z")),
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
    await expect(transactions.run((session) => repository.reserveBudget(session, {
      id: randomUUID(), revisionId, agentKind: "catalog", taskId,
      idempotencyKey: reservedKey!, costMicros: 61,
      occurredAt: "2026-08-14T01:00:01.000Z",
    }))).resolves.toBe("conflict");
    await expect(transactions.run((session) => repository.reserveBudget(session, {
      id: randomUUID(), revisionId, agentKind: "catalog", taskId,
      idempotencyKey: reservedKey!, costMicros: 60, modelRunId: randomUUID(),
      occurredAt: "2026-08-14T01:00:01.000Z",
    }))).resolves.toBe("conflict");
    for (const identity of [
      { revisionId: randomUUID() },
      { taskId: randomUUID() },
      { agentKind: "finance" as const },
    ]) {
      await expect(transactions.run((session) => repository.reserveBudget(session, {
        id: randomUUID(), revisionId, agentKind: "catalog", taskId,
        idempotencyKey: reservedKey!, costMicros: 60,
        occurredAt: "2026-08-14T01:00:01.000Z", ...identity,
      }))).resolves.toBe("conflict");
    }
  });

  it("serializes aggregate quota across tasks while independent agent scopes proceed", async () => {
    const revisionId = randomUUID();
    const catalogTasks = [randomUUID(), randomUUID()];
    const inventoryTask = randomUUID();
    await pool.query(`INSERT INTO agentic_configuration_revisions
      (id,state,created_by,payload_digest) VALUES($1,'draft','admin-a',$2)`,
    [revisionId, "f".repeat(64)]);
    await pool.query(`INSERT INTO agentic_budget_limits
      (revision_id,agent_kind,task_cost_micros,daily_cost_micros,monthly_cost_micros)
      VALUES($1,'catalog',100,100,100),($1,'inventory',100,100,100)`, [revisionId]);
    await pool.query(`UPDATE agentic_configuration_revisions
      SET state='active',decided_by='admin-b',decided_at='2026-08-14T00:00:00.000Z'
      WHERE id=$1`, [revisionId]);
    for (const taskId of [...catalogTasks, inventoryTask]) {
      await pool.query("INSERT INTO agentic_tasks(id,state,created_by,goal,instructions,configuration_revision_id) VALUES($1,'ready','operator-a','Review','Evidence',$2)", [taskId, revisionId]);
    }
    const reserve = (agentKind: "catalog" | "inventory", taskId: string, key: string) =>
      transactions.run((session) => repository.reserveBudget(session, {
        id: randomUUID(), revisionId, agentKind, taskId, idempotencyKey: key,
        costMicros: 60, occurredAt: "2026-08-14T01:00:00.000Z",
      }));

    const [catalogA, catalogB, inventory] = await Promise.all([
      reserve("catalog", catalogTasks[0]!, "catalog-task-a"),
      reserve("catalog", catalogTasks[1]!, "catalog-task-b"),
      reserve("inventory", inventoryTask, "inventory-task-a"),
    ]);
    expect([catalogA, catalogB].sort()).toEqual(["exceeded", "reserved"]);
    expect(inventory).toBe("reserved");
    await expect(pool.query<{ total: string }>(`SELECT COALESCE(sum(cost_micros),0)::text AS total
      FROM agentic_budget_entries WHERE entry_type='reservation' AND agent_kind='catalog'`))
      .resolves.toMatchObject({ rows: [{ total: "60" }] });
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
    const settledKey = ["settlement-a", "settlement-b"][settlementResults.indexOf("settled")]!;
    await expect(settle(settledKey)).resolves.toBe("duplicate");
    await expect(transactions.run((session) => repository.settleBudget(session, {
      id: randomUUID(), reservationId, idempotencyKey: settledKey, actualCostMicros: 69,
      occurredAt: "2026-08-14T01:01:01.000Z",
    }))).resolves.toBe("conflict");
    await expect(transactions.run((session) => repository.settleBudget(session, {
      id: randomUUID(), reservationId: randomUUID(), idempotencyKey: settledKey,
      actualCostMicros: 70, occurredAt: "2026-08-14T01:01:01.000Z",
    }))).resolves.toBe("conflict");
    await expect(transactions.run((session) => repository.settleBudget(session, {
      id: randomUUID(), reservationId, idempotencyKey: settledKey,
      actualCostMicros: 70, modelRunId: randomUUID(),
      occurredAt: "2026-08-14T01:01:01.000Z",
    }))).resolves.toBe("conflict");

    const auditId = randomUUID();
    const provenanceId = randomUUID();
    await transactions.run(async (session) => {
      await repository.appendAudit(session, {
        id: auditId, actorId: "agent-catalog", clientId: "agent-catalog-client",
        actorType: "agent", taskId,
        action: "catalog.read", resourceType: "tool", resourceId: "catalog.health",
        outcome: "allowed", correlationId: "corr-1", causationId: "cause-1",
        parametersDigest: "c".repeat(64), attempt: 1, durationMs: 25,
        resultDigest: "d".repeat(64), errorCode: "NONE",
        occurredAt: "2026-08-14T01:02:00.000Z",
      });
      await repository.appendProvenance(session, {
        id: provenanceId, taskId, sourceType: "database", sourceId: "catalog.products",
        sourceDigest: "b".repeat(64), classification: "internal",
        sourceVersion: 1,
        normalizedWindow: { start: "2026-08-13T00:00:00.000Z", end: "2026-08-14T00:00:00.000Z" },
        sourceSnapshotAt: "2026-08-14T01:01:59.000Z",
        recordedBy: "agent-catalog", recordedAt: "2026-08-14T01:02:00.000Z",
      });
      await repository.createRevocation(session, {
        id: randomUUID(), targetType: "agent", targetId: "catalog", reason: "Emergency stop",
        activatedBy: "admin-a", activatedAt: "2026-08-14T01:03:00.000Z",
        idempotencyKey: "revoke-catalog",
      });
    });
    expect(await transactions.runReadOnly((session) => repository.listAudit(session, { limit: 10 })))
      .toEqual([expect.objectContaining({
        clientId: "agent-catalog-client", parametersDigest: "c".repeat(64),
        causationId: "cause-1", attempt: 1, durationMs: 25,
        resultDigest: "d".repeat(64), errorCode: "NONE",
      })]);
    expect(await transactions.runReadOnly((session) => repository.listAudit(session, { limit: 10, actorId: "someone-else" })))
      .toHaveLength(0);
    expect(await transactions.runReadOnly((session) => repository.listProvenance(session, taskId)))
      .toEqual([expect.objectContaining({
        sourceVersion: 1,
        normalizedWindow: { start: "2026-08-13T00:00:00.000Z", end: "2026-08-14T00:00:00.000Z" },
        sourceSnapshotAt: "2026-08-14T01:01:59.000Z",
      })]);
    expect(await transactions.runReadOnly((session) => repository.findActiveRevocation(session, "agent", "catalog")))
      .toMatchObject({ reason: "Emergency stop" });
  });

  it("records a denied attempt and preserves its unbound attempted task", async () => {
    const missingTaskId = randomUUID();
    await transactions.run((session) => repository.appendAudit(session, {
      id: randomUUID(), actorId: "agent-catalog", clientId: "agent-catalog-client",
      actorType: "agent", taskId: missingTaskId, action: "tool.invoke",
      resourceType: "tool", resourceId: "catalog.product_completeness@1",
      outcome: "denied", correlationId: "corr-missing-task",
      parametersDigest: "a".repeat(64), attempt: 0, durationMs: 1,
      errorCode: "TASK_AGENT_MISMATCH", occurredAt: "2026-08-14T01:02:00.000Z",
    }));
    await expect(pool.query<{ attempted_task_id: string }>(
      "SELECT attempted_task_id FROM agentic_audit_events WHERE correlation_id=$1",
      ["corr-missing-task"],
    )).resolves.toMatchObject({ rows: [{ attempted_task_id: missingTaskId }] });

    const auditEvents = await transactions.runReadOnly((session) => repository.listAudit(
      session, { limit: 10, action: "tool.invoke" },
    ));
    expect(auditEvents).toEqual([expect.objectContaining({
      outcome: "denied", errorCode: "TASK_AGENT_MISMATCH",
    })]);
    expect(auditEvents[0]).toMatchObject({ taskId: missingTaskId });
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

  it("reserves and replays one completed department tool invocation", async () => {
    const { taskId } = await createReadyTask(pool);
    const request = toolInvocationReservation(taskId);

    await expect(transactions.run((session) => repository.reserveToolInvocation(session, request)))
      .resolves.toEqual({ kind: "reserved", invocationId: request.id, attempt: 1 });
    await expect(transactions.run((session) => repository.reserveToolInvocation(session, request)))
      .resolves.toEqual({ kind: "in_progress", invocationId: request.id, attempt: 1 });

    const safeResult = { summary: { totalProducts: 12 } };
    await expect(transactions.run((session) => repository.completeToolInvocation(session, {
      invocationId: request.id,
      attempt: 1,
      safeResult,
      resultDigest: "c".repeat(64),
      occurredAt: "2026-08-16T01:01:00.000Z",
    }))).resolves.toBe(true);
    await expect(transactions.run((session) => repository.reserveToolInvocation(session, request)))
      .resolves.toEqual({ kind: "completed", invocationId: request.id, attempt: 1, result: safeResult });
    await expect(transactions.runReadOnly((session) => repository.countToolInvocations(
      session,
      taskId,
      "catalog",
      "catalog.product_completeness",
      1,
      request.idempotencyKey,
    ))).resolves.toBe(0);
    await expect(transactions.runReadOnly((session) => repository.countToolInvocations(
      session,
      taskId,
      "catalog",
      "catalog.product_completeness",
      1,
      "another-key",
    ))).resolves.toBe(1);
  });

  it("reclaims a stale department tool reservation with a bounded retry", async () => {
    const { taskId } = await createReadyTask(pool);
    const request = toolInvocationReservation(taskId);
    await transactions.run((session) => repository.reserveToolInvocation(session, request));
    await pool.query(
      "UPDATE agentic_tool_invocations SET updated_at=$2 WHERE id=$1",
      [request.id, "2026-08-16T00:58:00.000Z"],
    );

    const retry = { ...request, occurredAt: "2026-08-16T01:00:00.000Z" };
    await expect(transactions.run((session) => repository.reserveToolInvocation(session, retry)))
      .resolves.toEqual({ kind: "reserved", invocationId: request.id, attempt: 2 });
    await expect(transactions.run((session) => repository.reserveToolInvocation(session, retry)))
      .resolves.toEqual({ kind: "in_progress", invocationId: request.id, attempt: 2 });
  });

  it("claims one retryable attempt and replays a terminal error", async () => {
    const { taskId } = await createReadyTask(pool);
    const request = toolInvocationReservation(taskId);
    await transactions.run((session) => repository.reserveToolInvocation(session, request));
    await expect(transactions.run((session) => repository.failToolInvocation(session, {
      invocationId: request.id,
      attempt: 1,
      errorCode: "TOOL_SOURCE_UNAVAILABLE",
      retryable: true,
      occurredAt: "2026-08-16T01:01:00.000Z",
    }))).resolves.toBe(true);

    const claims = await Promise.all([
      transactions.run((session) => repository.reserveToolInvocation(session, request)),
      transactions.run((session) => repository.reserveToolInvocation(session, request)),
    ]);
    expect(claims.map(({ kind }) => kind).sort()).toEqual(["in_progress", "reserved"]);
    expect(claims.every(({ attempt }) => attempt === 2)).toBe(true);

    await expect(transactions.run((session) => repository.failToolInvocation(session, {
      invocationId: request.id,
      attempt: 2,
      errorCode: "TOOL_OUTPUT_INVALID",
      retryable: false,
      occurredAt: "2026-08-16T01:02:00.000Z",
    }))).resolves.toBe(true);
    await expect(transactions.run((session) => repository.reserveToolInvocation(session, request)))
      .resolves.toEqual({
        kind: "failed",
        invocationId: request.id,
        attempt: 2,
        errorCode: "TOOL_OUTPUT_INVALID",
      });
  });

  it("rejects oversized safe results before storage", async () => {
    const { taskId } = await createReadyTask(pool);
    const request = toolInvocationReservation(taskId);
    await transactions.run((session) => repository.reserveToolInvocation(session, request));

    await expect(transactions.run((session) => repository.completeToolInvocation(session, {
      invocationId: request.id,
      attempt: 1,
      safeResult: { value: "x".repeat(262_145) },
      resultDigest: "d".repeat(64),
      occurredAt: "2026-08-16T01:01:00.000Z",
    }))).rejects.toMatchObject({ code: "TOOL_RESULT_TOO_LARGE" });
    await expect(transactions.runReadOnly((session) => repository.findToolInvocation(
      session,
      request.id,
    ))).resolves.toMatchObject({ status: "reserved", attempt: 1 });
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
    `INSERT INTO agentic_model_configs
     (revision_id,agent_kind,primary_model,max_input_tokens,max_output_tokens,timeout_ms,
      max_retries,input_cost_micros_per_million,output_cost_micros_per_million)
     VALUES($1,'catalog','google/gemma-4-26b-a4b-it:free',8000,2000,30000,1,0,0)`,
    [revisionId],
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

function toolInvocationReservation(taskId: string) {
  return {
    id: randomUUID(),
    taskId,
    agentKind: "catalog" as const,
    toolName: "catalog.product_completeness" as const,
    toolVersion: 1 as const,
    idempotencyKey: randomUUID(),
    parametersDigest: "a".repeat(64),
    correlationId: "corr-tool",
    causationId: "cause-tool",
    occurredAt: "2026-08-16T01:00:00.000Z",
  };
}

function modelRun(taskId: string, configurationRevisionId: string) {
  return {
    id: randomUUID(), taskId, agentKind: "catalog" as const, configurationRevisionId,
    schemaVersion: 1, generationRound: 0 as const, idempotencyKey: "model:catalog:0",
    requestedModel: "google/gemma-4-26b-a4b-it:free", policyVersion: 1,
    configurationVersion: 1, resultSchemaVersion: 1, inputDigest: "a".repeat(64),
    inputCostMicrosPerMillion: 0, outputCostMicrosPerMillion: 0,
    maxReservedCostMicros: 0, status: "reserved" as const,
    qualityReasonCodes: [], provenanceIds: [], version: 1,
    createdAt: "2026-08-19T01:00:00.000Z", updatedAt: "2026-08-19T01:00:00.000Z",
  };
}

function runningModelRun(run: ReturnType<typeof modelRun> | ModelRun): ModelRun {
  return {
    ...run, status: "running", returnedModel: run.requestedModel, fallbackPosition: 0,
    version: 2, startedAt: "2026-08-19T01:01:00.000Z",
    updatedAt: "2026-08-19T01:01:00.000Z",
  };
}

function completedModelRun(run: ModelRun): ModelRun {
  return {
    ...run, status: "completed", outputDigest: "b".repeat(64), inputTokens: 10,
    outputTokens: 5, settledCostMicros: 0, providerRequestIdDigest: "c".repeat(64),
    latencyMs: 20, statusCode: "MODEL_RESULT_ACCEPTED", qualityReasonCodes: [],
    provenanceIds: ["evidence-1"], version: 3,
    completedAt: "2026-08-19T01:02:00.000Z", updatedAt: "2026-08-19T01:02:00.000Z",
  };
}

function modelQualityEvidence(modelRunId: string): ModelQualityEvidence {
  return {
    id: randomUUID(), modelRunId, generationRound: 0,
    idempotencyKey: `quality:${modelRunId}`, outcome: "accepted",
    reasonCodes: [], provenanceIds: ["evidence-1"], evidenceDigest: "e".repeat(64),
    recordedAt: "2026-08-19T01:02:00.000Z",
  };
}
