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
  DecideConfigurationInput, SubmitConfigurationInput, UpdateConfigurationDraftInput,
} from "../interfaces/configuration.service";

type ConfigurationRepository = Pick<AgenticRepository,
  | "createRevision" | "findRevision" | "findActiveRevision" | "updateRevision"
  | "replaceRevisionChildren" | "activateRevision" | "rejectRevision" | "appendAudit">;

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
    return this.transactions.run(async (session) => {
      const current = await this.requireRevision(session, input.revisionId);
      if (current.createdBy !== principal.subject) fail("FORBIDDEN", "Only the draft owner can submit a revision");
      if (current.version !== input.expectedVersion) fail("STALE_VERSION", "Configuration version is stale");
      const at = this.now();
      const next = transitionRevision(current, { type: "submit" }, at);
      if (!await this.repository.updateRevision(session, next, input.expectedVersion)) fail("STALE_VERSION", "Configuration version is stale");
      await this.audit(session, principal, current.id, "configuration.submit", at);
      return next;
    });
  }

  async decide(input: DecideConfigurationInput, principal: StaffPrincipal): Promise<ConfigurationRevision> {
    requireRole(principal, "agentic_approver", "administrator");
    return this.transactions.run(async (session) => {
      const current = await this.requireRevision(session, input.revisionId);
      if (current.version !== input.expectedVersion) fail("STALE_VERSION", "Configuration version is stale");
      const at = this.now();
      const next = transitionRevision(current, input.decision === "activate"
        ? { type: "activate", decidedBy: principal.subject }
        : { type: "reject", decidedBy: principal.subject, reason: input.reason ?? "" }, at);
      const changed = input.decision === "activate"
        ? await this.repository.activateRevision(session, current.id, input.expectedVersion, principal.subject, at)
        : await this.repository.rejectRevision(session, current.id, input.expectedVersion, principal.subject, input.reason ?? "", at);
      if (!changed) fail("STALE_VERSION", "Configuration decision is stale");
      await this.audit(session, principal, current.id, `configuration.${input.decision}`, at);
      return next;
    });
  }

  async getDiff(revisionId: string, principal: StaffPrincipal): Promise<ConfigurationDiff> {
    requireRole(principal, "agentic_governance_admin", "agentic_approver", "administrator");
    return this.transactions.runReadOnly(async (session) => {
      const revision = await this.requireRevision(session, revisionId);
      const active = await this.repository.findActiveRevision(session);
      return {
        revisionId,
        ...(active === undefined ? {} : { activeRevisionId: active.id }),
        changed: active?.payloadDigest !== revision.payloadDigest,
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
