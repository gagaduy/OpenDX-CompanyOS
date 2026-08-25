// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it, vi } from "vitest";
import type { DatabaseSession, TransactionRunner } from "../../../../../shared/database/transaction";
import type { AgenticRepository } from "../../repositories/interfaces/agentic.repository";
import type { OrchestrationPlanSubmission } from "../interfaces/orchestration.service";
import type { PolicyEvaluator } from "../interfaces/policy-evaluator";
import { STORE_HEALTH_EXECUTION_CATALOG } from "../../orchestration/store-health-execution-catalog";
import { canonicalDigest, createExecutionDescriptor } from "../../../domain/entities/orchestration-execution-descriptor";
import { createAiCeoExecutionAuthority } from "../../../domain/entities/ai-ceo-execution-authority";
import { AI_CEO_EXECUTION_CATALOG } from "../../orchestration/ai-ceo-execution-catalog";
import { OrchestrationServiceImpl } from "./orchestration.service";

const session = {} as DatabaseSession;
const transactions: TransactionRunner = { run: (work) => work(session), runReadOnly: (work) => work(session) };
const principal = { subject: "service-account-agent-ai-ceo", clientId: "agent-ai-ceo", agentKind: "ai_ceo" } as const;
const worker = { subject: "service-account-opendx-agentic-worker", clientId: "opendx-agentic-worker", workload: "agentic_worker" } as const;
const plan: OrchestrationPlanSubmission = {
  id: "plan-1", taskId: "task-1", version: 1, digest: "a".repeat(64), taskBriefDigest: "b".repeat(64),
  planningAuthorityId: "00000000-0000-4000-8000-000000000090",
  planningAuthorityDigest: "9".repeat(64),
  policyVersion: 4, configurationRevisionId: "revision-1", createdBy: principal.clientId,
  createdAt: "2026-08-22T00:00:00.000Z", subtasks: [{ id: "catalog-1", owner: "catalog",
    expectedResultSchemaDigest: "c".repeat(64), allowedToolsDigest: "d".repeat(64),
    dataScope: "catalog.aggregate", freshnessSeconds: 300, timeoutSeconds: 30,
    budgetMicros: 100, sourceProvenanceDigest: "e".repeat(64), dependencies: [] }],
};

describe("OrchestrationServiceImpl", () => {
  it("builds a bounded Task Brief with only policy-eligible server-owned choices", async () => {
    let latestAuthority: unknown;
    const repository = {
      findTaskById: vi.fn().mockResolvedValue({
        id: "00000000-0000-4000-8000-000000000001", state: "ready", createdBy: "operator-a",
        goal: "Review Store Health", instructions: "Use aggregate evidence", deadline: "2026-08-23T00:00:00.000Z",
        configurationRevisionId: "00000000-0000-4000-8000-000000000002", version: 2,
        createdAt: "2026-08-22T00:00:00.000Z", updatedAt: "2026-08-22T00:01:00.000Z",
      }),
      findRevision: vi.fn().mockResolvedValue({ id: "00000000-0000-4000-8000-000000000002", state: "active", version: 4 }),
      listProvenance: vi.fn().mockResolvedValue([{ id: "00000000-0000-4000-8000-000000000003",
        taskId: "00000000-0000-4000-8000-000000000001", sourceType: "agentic_task",
        sourceId: "00000000-0000-4000-8000-000000000001", sourceDigest: "f".repeat(64),
        classification: "internal", recordedBy: "operator-a", recordedAt: "2026-08-22T00:00:00.000Z" }]),
      findModelConfiguration: vi.fn().mockResolvedValue({
        primaryModel: "provider/ai-ceo", fallbackModels: ["provider/ai-ceo-fallback"], timeoutMs: 30_000,
      }),
      findBudgetLimit: vi.fn().mockResolvedValue({ taskCostMicros: 20_000 }),
      findAgentByKind: vi.fn().mockResolvedValue({ kind: "ai_ceo", active: true }),
      findActiveRevocation: vi.fn().mockResolvedValue(undefined),
      lockAndFindLatestAiCeoExecutionAuthority: vi.fn().mockImplementation(async () => latestAuthority),
      appendAiCeoExecutionAuthority: vi.fn().mockImplementation(async (_session, authority, payload) => {
        latestAuthority = { authority, payload };
        return "created";
      }),
    } as unknown as AgenticRepository;
    const policy = { evaluateInSession: vi.fn().mockImplementation(async (_session, input) => ({
      effect: input.department === "support" ? "DENY" : "ALLOW",
      policyVersion: 4, reasonCode: "ASSIGNMENT_CHECKED", matchedRuleIds: [],
      evaluatedAt: "2026-08-22T00:02:00.000Z",
    })) } as unknown as PolicyEvaluator;
    let generated = 8;
    let clock = "2026-08-25T02:00:00.000Z";
    const service = new OrchestrationServiceImpl(repository, transactions, policy,
      () => `00000000-0000-4000-8000-${(++generated).toString().padStart(12, "0")}`,
      () => clock);

    const brief = await service.loadTaskBrief("00000000-0000-4000-8000-000000000001", worker);

    expect(brief).toMatchObject({
      taskId: "00000000-0000-4000-8000-000000000001",
      goal: "Review Store Health",
      configurationRevisionId: "00000000-0000-4000-8000-000000000002",
      policyVersion: 4,
    });
    expect(brief.eligibleAssignments.map(({ agentKind }) => agentKind)).toEqual([
      "catalog", "inventory", "order", "finance", "crm",
    ]);
    expect(brief.eligibleAssignments[0]).toEqual(expect.objectContaining({
      resultSchemaDigest: STORE_HEALTH_EXECUTION_CATALOG[0]!.resultSchemaDigest,
      allowedToolsDigest: STORE_HEALTH_EXECUTION_CATALOG[0]!.allowedToolsDigest,
    }));
    expect(brief.provenance).toEqual([{ id: "00000000-0000-4000-8000-000000000003",
      sourceType: "agentic_task", sourceDigest: "f".repeat(64), classification: "internal" }]);
    expect(brief.digest).toMatch(/^[a-f0-9]{64}$/);
    expect(brief.planningAuthority).toEqual({
      authorityId: expect.any(String), authorityDigest: expect.stringMatching(/^[a-f0-9]{64}$/),
    });
    expect(repository.appendAiCeoExecutionAuthority).toHaveBeenCalledOnce();
    await expect(service.loadTaskBrief("00000000-0000-4000-8000-000000000001", worker))
      .resolves.toEqual(brief);
    expect(repository.appendAiCeoExecutionAuthority).toHaveBeenCalledOnce();
    clock = "2026-08-25T02:10:01.000Z";
    const refreshed = await service.loadTaskBrief("00000000-0000-4000-8000-000000000001", worker);
    expect(refreshed.planningAuthority).not.toEqual(brief.planningAuthority);
    expect(repository.appendAiCeoExecutionAuthority).toHaveBeenCalledTimes(2);
  });

  it("re-evaluates policy before plan persistence", async () => {
    const repository = {
      findAgentByClientId: vi.fn().mockResolvedValue({ kind: "ai_ceo", active: true }),
      appendOrchestrationPlan: vi.fn(), appendAudit: vi.fn(), appendProvenance: vi.fn(),
    } as unknown as AgenticRepository;
    const policy = { evaluateInSession: vi.fn().mockResolvedValue({ effect: "DENY", policyVersion: 4, reasonCode: "DENIED", matchedRuleIds: [], evaluatedAt: plan.createdAt }) } as unknown as PolicyEvaluator;
    const service = new OrchestrationServiceImpl(repository, transactions, policy, () => "event-1");

    await expect(service.acceptPlan(plan, principal)).rejects.toMatchObject({ code: "POLICY_DENIED" });
    expect(policy.evaluateInSession).toHaveBeenCalledOnce();
    expect(repository.appendOrchestrationPlan).not.toHaveBeenCalled();
  });

  it("derives and persists one descriptor from API-owned authority", async () => {
    const taskId = "00000000-0000-4000-8000-000000000011";
    const revisionId = "00000000-0000-4000-8000-000000000012";
    const subtaskId = "00000000-0000-4000-8000-000000000013";
    const catalog = STORE_HEALTH_EXECUTION_CATALOG[0]!;
    const provenance = [{ id: "00000000-0000-4000-8000-000000000014", taskId,
      sourceType: "agentic_task", sourceId: taskId, sourceDigest: "f".repeat(64),
      classification: "internal", recordedBy: "operator-a", recordedAt: "2026-08-22T00:00:00.000Z" }];
    const authorizedContext = provenance.map(({ id, sourceType, sourceDigest, classification }) =>
      ({ id, sourceType, sourceDigest, classification }));
    const eligibleAssignments = STORE_HEALTH_EXECUTION_CATALOG.map((entry) => ({
      agentKind: entry.agentKind, resultSchemaName: entry.resultSchemaName,
      resultSchemaDigest: entry.resultSchemaDigest, allowedToolsDigest: entry.allowedToolsDigest,
    }));
    const taskBrief = { taskId, goal: "Review Store Health", instructions: "Use aggregate evidence",
      configurationRevisionId: revisionId, policyVersion: 4,
      provenance: authorizedContext, eligibleAssignments };
    const planningPayload = { resultSchema: AI_CEO_EXECUTION_CATALOG.planning.resultSchema,
      authorizedContext: { taskBrief: { ...taskBrief, digest: canonicalDigest(taskBrief) } } };
    const planningAuthority = createAiCeoExecutionAuthority({
      id: "00000000-0000-4000-8000-000000000016", version: 1,
      purpose: "orchestration_planning", taskId, configurationRevisionId: revisionId,
      policyVersion: 4, primaryModel: "provider/primary", fallbackModel: "provider/fallback",
      resultSchemaName: AI_CEO_EXECUTION_CATALOG.planning.resultSchemaName,
      resultSchemaDigest: AI_CEO_EXECUTION_CATALOG.planning.resultSchemaDigest,
      authorizedContextDigest: canonicalDigest(planningPayload.authorizedContext),
      budgetAuthorizationMicros: 10_000, timeoutSeconds: 30,
      createdAt: "2026-08-22T00:00:00.000Z", expiresAt: "2026-08-22T00:10:00.000Z",
    }, planningPayload);
    const acceptedPlan: OrchestrationPlanSubmission = {
      id: "00000000-0000-4000-8000-000000000015", taskId, version: 1,
      planningAuthorityId: planningAuthority.id,
      planningAuthorityDigest: planningAuthority.authorityDigest,
      digest: "a".repeat(64), taskBriefDigest: canonicalDigest(taskBrief), policyVersion: 4,
      configurationRevisionId: revisionId, createdBy: principal.clientId,
      createdAt: "2026-08-22T00:02:00.000Z", subtasks: [{ id: subtaskId, owner: "catalog",
        expectedResultSchemaDigest: catalog.resultSchemaDigest,
        allowedToolsDigest: catalog.allowedToolsDigest, dataScope: "catalog:health:read",
        freshnessSeconds: 300, timeoutSeconds: 30, budgetMicros: 10_000,
        sourceProvenanceDigest: canonicalDigest(authorizedContext), dependencies: [] }],
    };
    const repository = {
      findAgentByClientId: vi.fn().mockResolvedValue({ kind: "ai_ceo", active: true }),
      findAiCeoExecutionAuthority: vi.fn().mockResolvedValue({ authority: planningAuthority, payload: planningPayload }),
      findTaskById: vi.fn().mockResolvedValue({ id: taskId, state: "ready", createdBy: "operator-a",
        goal: taskBrief.goal, instructions: taskBrief.instructions, configurationRevisionId: revisionId,
        version: 2, createdAt: "2026-08-22T00:00:00.000Z", updatedAt: "2026-08-22T00:01:00.000Z" }),
      findRevision: vi.fn().mockResolvedValue({ id: revisionId, state: "active", version: 4 }),
      listProvenance: vi.fn().mockResolvedValue(provenance),
      findModelConfiguration: vi.fn().mockResolvedValue({ revisionId, agentKind: "catalog",
        primaryModel: "provider/primary", fallbackModels: ["provider/fallback"], maxInputTokens: 1_000,
        maxOutputTokens: 500, timeoutMs: 30_000, maxRetries: 1,
        inputCostMicrosPerMillion: 1, outputCostMicrosPerMillion: 1 }),
      findBudgetLimit: vi.fn().mockResolvedValue({ revisionId, agentKind: "catalog",
        taskCostMicros: 10_000, dailyCostMicros: 100_000, monthlyCostMicros: 1_000_000 }),
      findActiveRevocation: vi.fn().mockResolvedValue(undefined),
      findAgentByKind: vi.fn().mockResolvedValue({ kind: "ai_ceo", active: true }),
      findTool: vi.fn().mockResolvedValue({ active: true }),
      findToolGrant: vi.fn().mockImplementation(async (_session, _revision, _agent, name) => {
        const grant = catalog.toolGrants.find((item) => item.name === name)!;
        return { revisionId, agentKind: "catalog", toolName: grant.name, toolVersion: 1,
          purpose: grant.purpose, dataScope: grant.dataScope, maxInvocations: grant.maximumInvocations };
      }),
      appendOrchestrationPlan: vi.fn().mockResolvedValue("created"), appendExecutionDescriptor: vi.fn().mockResolvedValue("created"),
      lockAndFindLatestAiCeoExecutionAuthority: vi.fn().mockResolvedValue(undefined),
      appendAiCeoExecutionAuthority: vi.fn().mockResolvedValue("created"),
      appendAudit: vi.fn(), appendProvenance: vi.fn(),
    } as unknown as AgenticRepository;
    const policy = { evaluateInSession: vi.fn().mockResolvedValue({ effect: "ALLOW", policyVersion: 4,
      reasonCode: "ALLOWED", matchedRuleIds: [], evaluatedAt: acceptedPlan.createdAt }) } as unknown as PolicyEvaluator;
    let id = 100;
    const service = new OrchestrationServiceImpl(repository, transactions, policy,
      () => `00000000-0000-4000-8000-${(++id).toString().padStart(12, "0")}`,
      () => "2026-08-22T00:02:00.000Z");

    await service.acceptPlan(acceptedPlan, principal);

    expect(repository.appendExecutionDescriptor).toHaveBeenCalledOnce();
    expect(repository.appendExecutionDescriptor).toHaveBeenCalledWith(session,
      expect.objectContaining({ taskId, subtaskId, agentKind: "catalog",
        primaryModel: "provider/primary", fallbackModel: "provider/fallback",
        resultSchemaDigest: catalog.resultSchemaDigest,
        allowedToolsDigest: catalog.allowedToolsDigest, budgetAuthorizationMicros: 10_000 }),
      expect.objectContaining({ resultSchema: catalog.resultSchema, toolGrants: catalog.toolGrants,
        authorizedContext }));

    vi.mocked(repository.appendOrchestrationPlan).mockResolvedValue("duplicate");
    vi.mocked(repository.appendExecutionDescriptor).mockClear();
    vi.mocked(repository.appendAudit).mockClear();
    vi.mocked(repository.appendProvenance).mockClear();
    await service.acceptPlan(acceptedPlan, principal);
    expect(repository.appendExecutionDescriptor).not.toHaveBeenCalled();
    expect(repository.appendAudit).not.toHaveBeenCalled();
    expect(repository.appendProvenance).not.toHaveBeenCalled();
  });

  it("rejects expired descriptors before returning their private payload", async () => {
    const repository = {
      findExecutionDescriptor: vi.fn().mockResolvedValue({ descriptor: {
        id: "00000000-0000-4000-8000-000000000021", descriptorDigest: "a".repeat(64),
        expiresAt: "2026-08-22T00:05:00.000Z",
      }, payload: { taskBrief: {}, resultSchema: {}, authorizedContext: [], toolGrants: [] } }),
    } as unknown as AgenticRepository;
    const service = new OrchestrationServiceImpl(repository, transactions, {} as PolicyEvaluator,
      () => "event-1", () => "2026-08-22T00:05:00.000Z");

    await expect(service.loadExecutionDescriptor(
      "00000000-0000-4000-8000-000000000021", "a".repeat(64), worker,
    )).rejects.toMatchObject({ code: "DESCRIPTOR_EXPIRED" });
  });

  it("requires an exact worker-only binding and current AI CEO authority", async () => {
    const payload = { resultSchema: AI_CEO_EXECUTION_CATALOG.planning.resultSchema,
      authorizedContext: { taskBrief: { taskId: "00000000-0000-4000-8000-000000000061" } } };
    const authority = createAiCeoExecutionAuthority({
      id: "00000000-0000-4000-8000-000000000062", version: 1,
      purpose: "orchestration_planning", taskId: "00000000-0000-4000-8000-000000000061",
      configurationRevisionId: "00000000-0000-4000-8000-000000000063", policyVersion: 4,
      primaryModel: "provider/ai-ceo", fallbackModel: "provider/ai-ceo-fallback",
      resultSchemaName: AI_CEO_EXECUTION_CATALOG.planning.resultSchemaName,
      resultSchemaDigest: AI_CEO_EXECUTION_CATALOG.planning.resultSchemaDigest,
      authorizedContextDigest: canonicalDigest(payload.authorizedContext),
      budgetAuthorizationMicros: 20_000, timeoutSeconds: 30,
      createdAt: "2026-08-25T02:00:00.000Z", expiresAt: "2026-08-25T02:10:00.000Z",
    }, payload);
    const repository = { findAiCeoExecutionAuthority: vi.fn().mockResolvedValue({ authority, payload }),
      findRevision: vi.fn().mockResolvedValue({ state: "active", version: 4 }),
      findAgentByKind: vi.fn().mockResolvedValue({ active: true }),
      findModelConfiguration: vi.fn().mockResolvedValue({ primaryModel: authority.primaryModel,
        fallbackModels: [authority.fallbackModel], timeoutMs: 30_000 }),
      findBudgetLimit: vi.fn().mockResolvedValue({ taskCostMicros: 20_000 }),
      findActiveRevocation: vi.fn().mockResolvedValue(undefined),
    } as unknown as AgenticRepository;
    const service = new OrchestrationServiceImpl(repository, transactions, {} as PolicyEvaluator,
      () => "event-1", () => "2026-08-25T02:05:00.000Z");

    await expect(service.loadAiCeoExecutionAuthority(authority.id, authority.authorityDigest, worker))
      .resolves.toEqual({ authority, payload });
    await expect(service.loadAiCeoExecutionAuthority(authority.id, "0".repeat(64), worker))
      .rejects.toMatchObject({ code: "AI_CEO_AUTHORITY_BINDING_INVALID" });
    await expect(service.loadAiCeoExecutionAuthority(authority.id, authority.authorityDigest, {
      subject: "agent", clientId: "agent-ai-ceo", workload: "agentic_worker",
    })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("rejects an otherwise valid descriptor after its Department is revoked", async () => {
    const catalog = STORE_HEALTH_EXECUTION_CATALOG[0]!;
    const payload = { taskBrief: { taskId: "00000000-0000-4000-8000-000000000021" },
      resultSchema: catalog.resultSchema, authorizedContext: [], toolGrants: catalog.toolGrants };
    const descriptor = createExecutionDescriptor({ id: "00000000-0000-4000-8000-000000000022",
      version: 1, taskId: "00000000-0000-4000-8000-000000000021", planVersion: 1,
      subtaskId: "00000000-0000-4000-8000-000000000023", agentKind: "catalog",
      configurationRevisionId: "00000000-0000-4000-8000-000000000024", policyVersion: 4,
      primaryModel: "provider/primary", fallbackModel: "provider/fallback",
      resultSchemaName: catalog.resultSchemaName, resultSchemaDigest: catalog.resultSchemaDigest,
      authorizedContextDigest: canonicalDigest([]), allowedToolsDigest: catalog.allowedToolsDigest,
      budgetAuthorizationMicros: 100, timeoutSeconds: 30, freshnessSeconds: 300,
      createdAt: "2026-08-22T00:00:00.000Z", expiresAt: "2026-08-22T00:05:00.000Z" }, payload);
    const repository = { findExecutionDescriptor: vi.fn().mockResolvedValue({ descriptor, payload }),
      findRevision: vi.fn().mockResolvedValue({ state: "active", version: 4 }),
      findAgentByKind: vi.fn().mockResolvedValue({ active: true }),
      findModelConfiguration: vi.fn().mockResolvedValue({ primaryModel: descriptor.primaryModel,
        fallbackModels: [descriptor.fallbackModel] }),
      findBudgetLimit: vi.fn().mockResolvedValue({ taskCostMicros: 100 }),
      findActiveRevocation: vi.fn().mockImplementation(async (_session, type, id) =>
        type === "agent" && id === "catalog" ? { id: "revoked" } : undefined),
    } as unknown as AgenticRepository;
    const service = new OrchestrationServiceImpl(repository, transactions, {} as PolicyEvaluator,
      () => "event-1", () => "2026-08-22T00:04:00.000Z");

    await expect(service.loadExecutionDescriptor(descriptor.id, descriptor.descriptorDigest, worker))
      .rejects.toMatchObject({ code: "DESCRIPTOR_REVOKED" });
  });

  it("returns a digest-bound dispatch graph in stable repository order", async () => {
    const dispatch = { taskId: "00000000-0000-4000-8000-000000000031", planVersion: 1,
      planDigest: "a".repeat(64), nodes: [{ subtaskId: "00000000-0000-4000-8000-000000000032",
        agentKind: "catalog" as const, dependencies: [],
        descriptorId: "00000000-0000-4000-8000-000000000033", descriptorDigest: "b".repeat(64) }] };
    const authorityPayload = { resultSchema: AI_CEO_EXECUTION_CATALOG.synthesis.resultSchema,
      authorizedContext: { taskId: dispatch.taskId, planVersion: 1 } };
    const authority = createAiCeoExecutionAuthority({
      id: "00000000-0000-4000-8000-000000000035", version: 1,
      purpose: "executive_synthesis", taskId: dispatch.taskId, planVersion: 1,
      configurationRevisionId: "00000000-0000-4000-8000-000000000036", policyVersion: 4,
      primaryModel: "provider/ai-ceo", fallbackModel: "provider/ai-ceo-fallback",
      resultSchemaName: AI_CEO_EXECUTION_CATALOG.synthesis.resultSchemaName,
      resultSchemaDigest: AI_CEO_EXECUTION_CATALOG.synthesis.resultSchemaDigest,
      authorizedContextDigest: canonicalDigest(authorityPayload.authorizedContext),
      budgetAuthorizationMicros: 20_000, timeoutSeconds: 30,
      createdAt: "2026-08-22T00:00:00.000Z", expiresAt: "2026-08-22T00:10:00.000Z",
    }, authorityPayload);
    const repository = { findOrchestrationDispatchPlan: vi.fn().mockResolvedValue(dispatch),
      lockAndFindLatestAiCeoExecutionAuthority: vi.fn().mockResolvedValue({ authority, payload: authorityPayload }),
      findRevision: vi.fn().mockResolvedValue({ state: "active", version: 4 }),
      findAgentByKind: vi.fn().mockResolvedValue({ active: true }),
      findActiveRevocation: vi.fn().mockResolvedValue(undefined),
      findModelConfiguration: vi.fn().mockResolvedValue({ primaryModel: authority.primaryModel,
        fallbackModels: [authority.fallbackModel], timeoutMs: 30_000 }),
      findBudgetLimit: vi.fn().mockResolvedValue({ taskCostMicros: 20_000 }),
    } as unknown as AgenticRepository;
    const service = new OrchestrationServiceImpl(repository, transactions, {} as PolicyEvaluator,
      () => "00000000-0000-4000-8000-000000000037", () => "2026-08-22T00:05:00.000Z");

    await expect(service.loadDispatchPlan("00000000-0000-4000-8000-000000000034", worker))
      .resolves.toEqual({ ...dispatch, synthesisAuthority: {
        authorityId: authority.id, authorityDigest: authority.authorityDigest,
      } });
  });

  it("accepts an exact result replay but rejects a conflicting settlement", async () => {
    const taskId = "00000000-0000-4000-8000-000000000042";
    const subtaskId = "00000000-0000-4000-8000-000000000043";
    const provenanceId = "00000000-0000-4000-8000-000000000046";
    const catalog = STORE_HEALTH_EXECUTION_CATALOG[0]!;
    const toolSummary = { totalProducts: 2 };
    const result = { schemaVersion: 1, agentKind: "catalog", status: "complete",
      summary: "Catalog reviewed", conclusions: [], risks: [], recommendedActions: [],
      payload: { toolSummaries: [{ toolName: "catalog.product_completeness", provenanceId,
        summaryDigest: canonicalDigest(toolSummary) }] } } as const;
    const descriptorPayload = { taskBrief: { taskId }, resultSchema: catalog.resultSchema,
      authorizedContext: [], toolGrants: catalog.toolGrants };
    const descriptor = createExecutionDescriptor({
      id: "00000000-0000-4000-8000-000000000044", version: 1, taskId, planVersion: 1,
      subtaskId, agentKind: "catalog", configurationRevisionId: "00000000-0000-4000-8000-000000000047",
      policyVersion: 4, primaryModel: "provider/primary", fallbackModel: "provider/fallback",
      resultSchemaName: catalog.resultSchemaName, resultSchemaDigest: catalog.resultSchemaDigest,
      authorizedContextDigest: canonicalDigest([]), allowedToolsDigest: catalog.allowedToolsDigest,
      budgetAuthorizationMicros: 100, timeoutSeconds: 30, freshnessSeconds: 300,
      createdAt: "2026-08-22T00:00:00.000Z", expiresAt: "2026-08-22T00:05:00.000Z",
    }, descriptorPayload);
    const input = { id: "00000000-0000-4000-8000-000000000041", taskId, planVersion: 1,
      subtaskId, descriptorId: descriptor.id, descriptorDigest: descriptor.descriptorDigest,
      resultDigest: canonicalDigest(result), qualityEvidenceDigest: "b".repeat(64),
      provenanceDigest: canonicalDigest([provenanceId]), acceptedAt: "2026-08-22T00:04:00.000Z", result };
    const repository = { findExecutionDescriptorForSubtask: vi.fn().mockResolvedValue(descriptor),
      findExecutionDescriptor: vi.fn().mockResolvedValue({ descriptor, payload: descriptorPayload }),
      listCompletedToolInvocationsForSubtask: vi.fn().mockResolvedValue([{
        toolName: "catalog.product_completeness", safeResult: { provenanceId, summary: toolSummary },
      }]),
      findModelQualityEvidenceForResult: vi.fn().mockResolvedValue({
        outcome: "accepted", provenanceIds: [provenanceId],
      }),
      findRevision: vi.fn().mockResolvedValue({ state: "active", version: 4 }),
      findAgentByKind: vi.fn().mockResolvedValue({ active: true }),
      findActiveRevocation: vi.fn().mockResolvedValue(undefined),
      findModelConfiguration: vi.fn().mockResolvedValue({ primaryModel: descriptor.primaryModel,
        fallbackModels: [descriptor.fallbackModel] }),
      findBudgetLimit: vi.fn().mockResolvedValue({ taskCostMicros: 100 }),
      findTool: vi.fn().mockResolvedValue({ active: true }),
      findToolGrant: vi.fn().mockImplementation(async (_session, _revision, _agent, name) => {
        const grant = catalog.toolGrants.find((item) => item.name === name)!;
        return { id: name, purpose: grant.purpose, dataScope: grant.dataScope,
          maxInvocations: grant.maximumInvocations };
      }),
      appendAcceptedOrchestrationResult: vi.fn().mockResolvedValueOnce("duplicate").mockResolvedValueOnce("conflict"),
      findAcceptedOrchestrationResultId: vi.fn().mockResolvedValue(input.id),
      appendAcceptedOrchestrationResultPayload: vi.fn().mockResolvedValue("duplicate"),
      appendAudit: vi.fn() } as unknown as AgenticRepository;
    const policy = { evaluateInSession: vi.fn().mockResolvedValue({ effect: "ALLOW", policyVersion: 4 }) } as unknown as PolicyEvaluator;
    const service = new OrchestrationServiceImpl(repository, transactions, policy,
      () => "00000000-0000-4000-8000-000000000045", () => "2026-08-22T00:04:30.000Z");

    await expect(service.acceptResult(input, worker)).resolves.toEqual({ digest: input.resultDigest });
    await expect(service.acceptResult(input, worker)).rejects.toMatchObject({ code: "SETTLEMENT_CONFLICT" });
    vi.mocked(repository.findModelQualityEvidenceForResult).mockResolvedValue(undefined);
    await expect(service.acceptResult(input, worker))
      .rejects.toMatchObject({ code: "RESULT_QUALITY_EVIDENCE_INVALID" });
  });

  it("rejects a shareable result whose body does not match its digest", async () => {
    const input = {
      id: "00000000-0000-4000-8000-000000000051",
      taskId: "00000000-0000-4000-8000-000000000052", planVersion: 1,
      subtaskId: "00000000-0000-4000-8000-000000000053",
      descriptorId: "00000000-0000-4000-8000-000000000054",
      descriptorDigest: "d".repeat(64), resultDigest: "0".repeat(64),
      qualityEvidenceDigest: "b".repeat(64), provenanceDigest: "c".repeat(64),
      acceptedAt: "2026-08-22T00:04:00.000Z",
      result: { schemaVersion: 1, agentKind: "catalog", status: "complete" },
    } as const;
    const repository = {
      findExecutionDescriptorForSubtask: vi.fn().mockResolvedValue({
        id: input.descriptorId, descriptorDigest: input.descriptorDigest,
        taskId: input.taskId, planVersion: 1, subtaskId: input.subtaskId,
        expiresAt: "2026-08-22T00:05:00.000Z",
      }),
      appendAcceptedOrchestrationResult: vi.fn(),
      appendAcceptedOrchestrationResultPayload: vi.fn(),
    } as unknown as AgenticRepository;
    const service = new OrchestrationServiceImpl(repository, transactions, {} as PolicyEvaluator,
      () => "event-1", () => "2026-08-22T00:04:30.000Z");

    await expect(service.acceptResult(input, worker))
      .rejects.toMatchObject({ code: "RESULT_DIGEST_INVALID" });
    expect(repository.appendAcceptedOrchestrationResultPayload).not.toHaveBeenCalled();
  });
});
