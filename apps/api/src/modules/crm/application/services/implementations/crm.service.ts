// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { TransactionRunner } from "../../../../../shared/database/transaction";
import type { CustomerOperationsReader } from "../../../../customer";
import type { CustomerOrderOperationsReader, PaidCustomerSegmentId } from "../../../../order";
import type { Followup } from "../../../domain/entities/followup";
import type { CustomerSegment } from "../../../domain/services/crm-rules";
import {
  calculateSegments,
  claimFollowup,
  completeFollowup,
  createCorrection,
  createFollowup,
  createNote,
} from "../../../domain/services/crm-rules";
import type { CrmContext, CrmPage, CustomerSegmentDefinitionDto, SegmentCustomerDto } from "../../dtos/crm.dto";
import { mapCrmNote, mapCustomerDetail, mapCustomerSummary, mapFollowup } from "../../mappers/crm.mapper";
import type { CrmRepository } from "../../repositories/interfaces/crm.repository";
import { CrmApplicationError } from "../crm-application.error";
import type { CrmOperationsSummaryReader, CrmServiceContract } from "../interfaces/crm.service";

const segmentDefinitions: readonly Omit<CustomerSegmentDefinitionDto, "customerCount">[] = [
  { id: "new_customer", name: "New customers", description: "No paid orders" },
  { id: "first_time_buyer", name: "First-time buyers", description: "Exactly one paid order" },
  { id: "repeat_customer", name: "Repeat customers", description: "At least two paid orders" },
  { id: "high_value", name: "High-value customers", description: "Lifetime paid total of at least 50,000,000 VND" },
  { id: "inactive_90d", name: "Inactive 90 days", description: "Previously paid, with no payment in the last 90 days" },
] as const;
const segmentIds = new Set<CustomerSegment>(segmentDefinitions.map((definition) => definition.id));

export class CrmService implements CrmServiceContract, CrmOperationsSummaryReader {
  constructor(
    private readonly repository: CrmRepository,
    private readonly customers: CustomerOperationsReader,
    private readonly orders: CustomerOrderOperationsReader,
    private readonly transactions: TransactionRunner,
    private readonly generateId: () => string,
    private readonly now: () => string,
  ) {}

  async searchCustomers(
    query: { readonly search?: string; readonly page: number; readonly pageSize: number },
    context: CrmContext,
  ) {
    await this.authorize(context, "crm.customer.search.denied", "customers");
    const result = await this.customers.search(query);
    return page(result.items.map(mapCustomerSummary), query.page, query.pageSize, result.totalItems);
  }

  async getCustomer(customerId: string, context: CrmContext) {
    await this.authorize(context, "crm.customer.read.denied", customerId);
    const customer = await this.customers.get(customerId);
    if (customer === undefined) throw new CrmApplicationError("CUSTOMER_NOT_FOUND", "Customer not found");
    const [orders, paidFacts, crm] = await Promise.all([
      this.orders.listByCustomer(customerId, 20),
      this.orders.getPaidCustomerFacts(customerId),
      this.transactions.runReadOnly(async (session) => ({
        notes: await this.repository.listNotes(session, customerId),
        followups: await this.repository.listFollowups(session, customerId),
      })),
    ]);
    const calculatedAt = this.now();
    return {
      customer: mapCustomerDetail(customer),
      orders: orders.map((order) => ({ ...order })),
      paidFacts: { ...paidFacts },
      segments: calculateSegments(paidFacts, calculatedAt),
      calculatedAt,
      notes: crm.notes.map(mapCrmNote),
      followups: crm.followups.map(mapFollowup),
    };
  }

  async listNotes(customerId: string, context: CrmContext) {
    await this.authorize(context, "crm.note.read.denied", customerId);
    await this.requireCustomer(customerId);
    return this.transactions.runReadOnly(async (session) =>
      (await this.repository.listNotes(session, customerId)).map(mapCrmNote),
    );
  }

  async createNote(
    customerId: string,
    input: { readonly body: string; readonly correctsNoteId?: string },
    context: CrmContext,
  ) {
    await this.authorize(context, "crm.note.create.denied", customerId);
    await this.requireCustomer(customerId);
    return this.transactions.run(async (session) => {
      const createdAt = this.now();
      const base = { id: this.generateId(), customerId, authorId: context.actorId, body: input.body, createdAt };
      const note = input.correctsNoteId === undefined
        ? createNote(base)
        : createCorrection(
            base,
            await this.repository.findNote(session, customerId, input.correctsNoteId)
              ?? notFound("NOTE_NOT_FOUND", "Corrected note not found"),
          );
      await this.repository.createNote(session, note);
      await this.repository.appendAudit(session, {
        id: this.generateId(), customerId, actorId: context.actorId,
        action: "crm.note.created", resourceType: "crm_note", resourceId: note.id,
        correlationId: context.correlationId,
        metadata: { correction: note.correctsNoteId !== undefined }, occurredAt: createdAt,
      });
      return mapCrmNote(note);
    });
  }

  async listFollowups(customerId: string, context: CrmContext) {
    await this.authorize(context, "crm.followup.read.denied", customerId);
    await this.requireCustomer(customerId);
    return this.transactions.runReadOnly(async (session) =>
      (await this.repository.listFollowups(session, customerId)).map(mapFollowup),
    );
  }

  async createFollowup(
    customerId: string,
    input: { readonly dueAt: string; readonly description: string },
    context: CrmContext,
  ) {
    await this.authorize(context, "crm.followup.create.denied", customerId);
    await this.requireCustomer(customerId);
    return this.transactions.run(async (session) => {
      const createdAt = this.now();
      const followup = createFollowup({
        id: this.generateId(), customerId, dueAt: input.dueAt,
        description: input.description, createdById: context.actorId, createdAt,
      });
      await this.repository.createFollowup(session, followup);
      await this.repository.appendAudit(session, auditFollowup(
        this.generateId(), followup, context, "crm.followup.created", createdAt,
      ));
      return mapFollowup(followup);
    });
  }

  async updateFollowup(
    customerId: string,
    followupId: string,
    input: { readonly action: "claim" | "complete"; readonly version: number },
    context: CrmContext,
  ) {
    await this.authorize(context, `crm.followup.${input.action}.denied`, followupId);
    return this.transactions.run(async (session) => {
      const current = await this.repository.findFollowup(session, customerId, followupId, true);
      if (current === undefined) throw new CrmApplicationError("FOLLOWUP_NOT_FOUND", "Follow-up not found");
      const occurredAt = this.now();
      const updated = input.action === "claim"
        ? claimFollowup(current, context.actorId, input.version, occurredAt)
        : completeFollowup(current, context.actorId, input.version, occurredAt);
      if (updated !== current && !await this.repository.updateFollowup(session, updated, input.version)) {
        throw new CrmApplicationError("STALE_VERSION", "Follow-up version is stale");
      }
      await this.repository.appendAudit(session, auditFollowup(
        this.generateId(), updated, context,
        input.action === "claim" ? "crm.followup.claimed" : "crm.followup.completed",
        occurredAt,
      ));
      return mapFollowup(updated);
    });
  }

  async listSegments(context: CrmContext) {
    await this.authorize(context, "crm.segment.read.denied", "segments");
    const calculatedAt = this.now();
    const counts = await Promise.all(segmentDefinitions.map(async (definition) =>
      (await this.orders.listPaidSegmentCustomers({
        segmentId: definition.id,
        asOf: calculatedAt,
        page: 1,
        pageSize: 1,
      })).totalItems,
    ));
    return {
      items: segmentDefinitions.map((definition, index) => ({
        ...definition,
        customerCount: counts[index]!,
      })),
      calculatedAt,
    };
  }

  async listSegmentCustomers(
    segmentId: CustomerSegment,
    query: { readonly page: number; readonly pageSize: number },
    context: CrmContext,
  ) {
    await this.authorize(context, "crm.segment.read.denied", String(segmentId));
    if (!segmentIds.has(segmentId)) throw new CrmApplicationError("INVALID_SEGMENT", "Segment is invalid");
    const calculatedAt = this.now();
    const factsPage = await this.orders.listPaidSegmentCustomers({
      segmentId: segmentId as PaidCustomerSegmentId,
      asOf: calculatedAt,
      ...query,
    });
    const customerItems = await this.customers.getMany(factsPage.items.map((item) => item.customerId));
    const customersById = new Map(customerItems.map((customer) => [customer.id, customer]));
    const items: SegmentCustomerDto[] = factsPage.items.map((facts) => {
      const customer = customersById.get(facts.customerId);
      if (customer === undefined) throw new CrmApplicationError("CUSTOMER_NOT_FOUND", "Customer not found");
      const { customerId: _customerId, ...paidFacts } = facts;
      return {
        customer: mapCustomerSummary(customer),
        paidFacts,
        segments: calculateSegments(paidFacts, calculatedAt),
      };
    });
    return { ...page(items, query.page, query.pageSize, factsPage.totalItems), calculatedAt };
  }

  async countOverdueFollowups(asOf: string): Promise<number> {
    const parsed = new Date(asOf);
    if (Number.isNaN(parsed.getTime()) || parsed.toISOString() !== asOf) {
      throw new RangeError("Overdue follow-up calculation time must be an ISO instant");
    }
    return this.transactions.runReadOnly((session) => this.repository.countOverdueFollowups(session, asOf));
  }

  private async requireCustomer(customerId: string): Promise<void> {
    if (await this.customers.get(customerId) === undefined) {
      throw new CrmApplicationError("CUSTOMER_NOT_FOUND", "Customer not found");
    }
  }

  private async authorize(context: CrmContext, action: string, resourceId: string): Promise<void> {
    if (context.roles.some((role) => role === "administrator" || role === "crm_operator")) return;
    const occurredAt = this.now();
    await this.transactions.run((session) => this.repository.appendDeniedAudit(session, {
      id: this.generateId(), actorId: context.actorId, action, resourceId,
      correlationId: context.correlationId, metadata: {}, occurredAt,
    }));
    throw new CrmApplicationError("FORBIDDEN", "Insufficient permissions");
  }
}

function page<T>(items: readonly T[], current: number, pageSize: number, totalItems: number): CrmPage<T> {
  return {
    items,
    page: current,
    pageSize,
    totalItems,
    totalPages: totalItems === 0 ? 0 : Math.ceil(totalItems / pageSize),
  };
}

function notFound(code: "NOTE_NOT_FOUND", message: string): never {
  throw new CrmApplicationError(code, message);
}

function auditFollowup(
  id: string,
  followup: Followup,
  context: CrmContext,
  action: string,
  occurredAt: string,
) {
  return {
    id,
    customerId: followup.customerId,
    actorId: context.actorId,
    action,
    resourceType: "followup" as const,
    resourceId: followup.id,
    correlationId: context.correlationId,
    metadata: { version: followup.version },
    occurredAt,
  };
}
