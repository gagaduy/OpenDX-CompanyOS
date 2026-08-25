// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { createHash } from "node:crypto";
import type { StaffPrincipal, StaffRole } from "../../../../../shared/auth/staff-principal";
import type { TransactionRunner } from "../../../../../shared/database/transaction";
import type { AgenticRepository, RevisionChildren } from "../../repositories/interfaces/agentic.repository";
import type { ConfigurationRevision } from "../../../domain/entities/configuration-revision";
import { transitionRevision, validateBudgetLimits, validateModelConfiguration } from "../../../domain/services/agent-governance-rules";
import { AgenticApplicationError } from "../agentic-application.error";
import type {
  ConfigurationDiff, ConfigurationService, CreateConfigurationDraftInput,
  ActivateConfigurationInput, DecideConfigurationInput, SubmitConfigurationInput, UpdateConfigurationDraftInput,
} from "../interfaces/configuration.service";

type ConfigurationRepository = Pick<AgenticRepository,
  | "createRevision" | "findRevision" | "findActiveRevision" | "updateRevision"
  | "replaceRevisionChildren" | "getRevisionChildren" | "activateRevision" | "rejectRevision"
  | "appendAudit" | "appendProvenance" | "findTool" | "findActiveRevocation">;

export class ConfigurationServiceImpl implements ConfigurationService {
  constructor(
    private readonly repository: ConfigurationRepository,
    private readonly transactions: TransactionRunner,
    private readonly generateId: () => string,
    private readonly now: () => string,
  ) {}

  async createDraft(input: CreateConfigurationDraftInput, principal: StaffPrincipal): Promise<ConfigurationRevision> {
    requireRole(principal, "agentic_governance_admin", "administrator");
    validateChildren(input.children);
    return this.transactions.run(async (session) => {
      const at = this.now();
      const revision: ConfigurationRevision = {
        id: this.generateId(), state: "draft", createdBy: principal.subject,
        payloadDigest: digest(input.children), version: 1, createdAt: at, updatedAt: at,
      };
      await this.repository.createRevision(session, revision);
      if (!await this.repository.replaceRevisionChildren(session, revision.id, input.children)) {
        fail("CONFIGURATION_INVALID", "Configuration children could not be stored");
      }
      await this.audit(session, principal, revision.id, "configuration.create", at);
      return revision;
    });
  }

  async updateDraft(input: UpdateConfigurationDraftInput, principal: StaffPrincipal): Promise<ConfigurationRevision> {
    requireRole(principal, "agentic_governance_admin", "administrator");
    validateChildren(input.children);
    return this.transactions.run(async (session) => {
      const current = await this.requireRevision(session, input.revisionId);
      if (current.state !== "draft" || current.createdBy !== principal.subject) {
        fail("FORBIDDEN", "Only the draft owner can update a revision");
      }
      if (current.version !== input.expectedVersion) fail("STALE_VERSION", "Configuration version is stale");
      const at = this.now();
      const next = { ...current, payloadDigest: digest(input.children), version: current.version + 1, updatedAt: at };
      if (!await this.repository.updateRevision(session, next, input.expectedVersion)) fail("STALE_VERSION", "Configuration version is stale");
      if (!await this.repository.replaceRevisionChildren(session, current.id, input.children)) fail("CONFIGURATION_INVALID", "Configuration children could not be stored");
      await this.audit(session, principal, current.id, "configuration.update", at);
      return next;
    });
  }

  async submit(input: SubmitConfigurationInput, principal: StaffPrincipal): Promise<ConfigurationRevision> {
    requireRole(principal, "agentic_governance_admin", "administrator");
    void input;
    fail("CONFIGURATION_LIFECYCLE_RETIRED", "Configuration submission is retired; activate an owned draft directly");
  }

  async decide(input: DecideConfigurationInput, principal: StaffPrincipal): Promise<ConfigurationRevision> {
    requireRole(principal, "agentic_governance_admin", "administrator");
    void input;
    fail("CONFIGURATION_LIFECYCLE_RETIRED", "Configuration decisions are retired; activate an owned draft directly");
  }

  async activate(input: ActivateConfigurationInput, principal: StaffPrincipal): Promise<ConfigurationRevision> {
    requireRole(principal, "agentic_governance_admin", "administrator");
    return this.transactions.run(async (session) => {
      const current = await this.requireRevision(session, input.revisionId);
      if (current.state !== "draft" || current.createdBy !== principal.subject) {
        fail("FORBIDDEN", "Only the draft owner can activate a revision");
      }
      if (current.version !== input.expectedVersion) fail("STALE_VERSION", "Configuration version is stale");
      const at = this.now();
      const children = await this.repository.getRevisionChildren(session, current.id);
      await validateActivationDependencies(this.repository, session, children);
      const previous = await this.repository.findActiveRevision(session);
      const next = transitionRevision(current, { type: "activate", activatedBy: principal.subject }, at);
      const changed = await this.repository.activateRevision(session, current.id, input.expectedVersion, principal.subject, at);
      if (!changed) fail("STALE_VERSION", "Configuration decision is stale");
      const auditId = this.generateId();
      const summary = childSummary(children);
      await this.repository.appendAudit(session, {
        id: auditId, actorId: principal.subject, actorType: "staff", action: "configuration.activate",
        resourceType: "configuration_revision", resourceId: current.id, outcome: "allowed",
        correlationId: current.id, causationId: previous?.id, parametersDigest: current.payloadDigest,
        policyVersion: previous?.version, modelVersion: next.version, resultDigest: digest(summary), occurredAt: at,
      });
      await this.repository.appendProvenance(session, {
        id: this.generateId(), sourceType: "configuration_activation", sourceId: auditId,
        sourceDigest: current.payloadDigest, sourceVersion: next.version,
        normalizedWindow: { previousRevisionId: previous?.id, previousVersion: previous?.version,
          newRevisionId: current.id, newVersion: next.version, ...summary },
        classification: "internal", recordedBy: principal.subject, recordedAt: at,
      });
      return { ...next, activationAuditId: auditId };
    });
  }

  async getDiff(revisionId: string, principal: StaffPrincipal): Promise<ConfigurationDiff> {
    requireRole(principal, "agentic_governance_admin", "administrator");
    return this.transactions.runReadOnly(async (session) => {
      const revision = await this.requireRevision(session, revisionId);
      const active = await this.repository.findActiveRevision(session);
      const candidate = await this.repository.getRevisionChildren(session, revision.id);
      const activeChildren = active === undefined
        ? undefined
        : await this.repository.getRevisionChildren(session, active.id);
      return {
        revisionId,
        ...(active === undefined ? {} : { activeRevisionId: active.id }),
        changed: active?.payloadDigest !== revision.payloadDigest,
        ...(activeChildren === undefined ? {} : { active: activeChildren }),
        candidate,
      };
    });
  }

  private async requireRevision(session: Parameters<ConfigurationRepository["findRevision"]>[0], id: string): Promise<ConfigurationRevision> {
    const revision = await this.repository.findRevision(session, id);
    if (revision === undefined) fail("CONFIGURATION_NOT_FOUND", "Configuration revision was not found");
    return revision;
  }

  private async audit(session: Parameters<ConfigurationRepository["appendAudit"]>[0], principal: StaffPrincipal, id: string, action: string, occurredAt: string): Promise<void> {
    await this.repository.appendAudit(session, {
      id: this.generateId(), actorId: principal.subject, actorType: "staff", action,
      resourceType: "configuration_revision", resourceId: id, outcome: "allowed",
      correlationId: id, occurredAt,
    });
  }
}

function validateChildren(children: RevisionChildren): void {
  for (const model of children.modelConfigurations) validateModelConfiguration(model);
  for (const budget of children.budgetLimits) validateBudgetLimits(budget);
}

async function validateActivationDependencies(
  repository: ConfigurationRepository,
  session: Parameters<ConfigurationRepository["findRevision"]>[0],
  children: RevisionChildren,
): Promise<void> {
  validateChildren(children);
  for (const grant of children.toolGrants) {
    if (await repository.findTool(session, grant.toolName, grant.toolVersion) === undefined) {
      fail("CONFIGURATION_INVALID", "A configured tool no longer exists");
    }
    if (await repository.findActiveRevocation(session, "tool_grant", grant.id) !== undefined) {
      fail("CONFIGURATION_REVOKED", "A configured tool grant is revoked");
    }
  }
  for (const model of children.modelConfigurations) {
    if (await repository.findActiveRevocation(session, "agent", model.agentKind) !== undefined) {
      fail("CONFIGURATION_REVOKED", "A configured Agent is revoked");
    }
    for (const modelId of [model.primaryModel, ...model.fallbackModels]) {
      if (await repository.findActiveRevocation(session, "model", modelId) !== undefined) {
        fail("CONFIGURATION_REVOKED", "A configured model is revoked");
      }
    }
  }
}

function childSummary(children: RevisionChildren): Record<string, number> {
  return { policies: children.policies.length, toolGrants: children.toolGrants.length,
    modelConfigurations: children.modelConfigurations.length, budgetLimits: children.budgetLimits.length };
}

function digest(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex");
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b))
      .map(([key, child]) => [key, canonical(child)]));
  }
  return value;
}

function requireRole(principal: StaffPrincipal, ...roles: readonly StaffRole[]): void {
  if (!principal.roles.some((role) => roles.includes(role))) fail("FORBIDDEN", "Insufficient permission");
}

function fail(code: string, message: string): never { throw new AgenticApplicationError(code, message); }
