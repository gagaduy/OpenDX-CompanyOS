// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { CrmNote } from "../entities/crm-note";
import type { Followup } from "../entities/followup";
import { CrmDomainError } from "../exceptions/crm-domain.error";

export type CustomerSegment = "new_customer" | "first_time_buyer" | "repeat_customer" | "high_value" | "inactive_90d";

export interface PaidCustomerFacts {
  readonly paidOrderCount: number;
  readonly lifetimePaidVnd: number;
  readonly latestPaidAt?: string;
}

export interface CreateNoteInput {
  readonly id: string;
  readonly customerId: string;
  readonly authorId: string;
  readonly body: string;
  readonly createdAt: string;
}

export interface CreateFollowupInput {
  readonly id: string;
  readonly customerId: string;
  readonly dueAt: string;
  readonly description: string;
  readonly createdById: string;
  readonly createdAt: string;
}

export function calculateSegments(facts: PaidCustomerFacts, now: string): readonly CustomerSegment[] {
  assertIsoInstant(now, "CRM segment calculation time is invalid");
  if (!Number.isSafeInteger(facts.paidOrderCount) || facts.paidOrderCount < 0
    || !Number.isSafeInteger(facts.lifetimePaidVnd) || facts.lifetimePaidVnd < 0) {
    invalidFollowup("Paid customer facts are invalid");
  }
  if (facts.paidOrderCount === 0 && facts.latestPaidAt !== undefined) {
    invalidFollowup("A customer without paid orders cannot have a latest payment");
  }
  if (facts.paidOrderCount > 0 && facts.latestPaidAt === undefined) {
    invalidFollowup("A paid customer must have a latest payment");
  }
  if (facts.latestPaidAt !== undefined) assertIsoInstant(facts.latestPaidAt, "Latest paid time is invalid");

  const segments: CustomerSegment[] = [
    facts.paidOrderCount === 0
      ? "new_customer"
      : facts.paidOrderCount === 1
        ? "first_time_buyer"
        : "repeat_customer",
  ];
  if (facts.lifetimePaidVnd >= 50_000_000) segments.push("high_value");
  if (facts.paidOrderCount > 0 && facts.latestPaidAt !== undefined
    && Date.parse(facts.latestPaidAt) <= Date.parse(now) - 90 * 24 * 60 * 60 * 1000) {
    segments.push("inactive_90d");
  }
  return segments;
}

export function createNote(input: CreateNoteInput): CrmNote {
  const body = validateBoundedText(input.body, 4_000, "CRM note body is invalid", invalidNote);
  assertIdentity(input.id, "CRM note identity is invalid", invalidNote);
  assertIdentity(input.customerId, "CRM note customer is invalid", invalidNote);
  assertActorId(input.authorId, "CRM note author is invalid", invalidNote);
  assertIsoInstant(input.createdAt, "CRM note creation time is invalid", invalidNote);
  return { id: input.id, customerId: input.customerId, authorId: input.authorId, body, createdAt: input.createdAt };
}

export function createCorrection(input: CreateNoteInput, original: CrmNote): CrmNote {
  assertIdentity(original.id, "Corrected CRM note identity is invalid", invalidNote);
  return { ...createNote(input), correctsNoteId: original.id };
}

export function createFollowup(input: CreateFollowupInput): Followup {
  assertIdentity(input.id, "Follow-up identity is invalid", invalidFollowup);
  assertIdentity(input.customerId, "Follow-up customer is invalid", invalidFollowup);
  assertActorId(input.createdById, "Follow-up creator is invalid", invalidFollowup);
  assertIsoInstant(input.createdAt, "Follow-up creation time is invalid", invalidFollowup);
  assertIsoInstant(input.dueAt, "Follow-up due time is invalid", invalidFollowup);
  const description = validateBoundedText(input.description, 500, "Follow-up description is invalid", invalidFollowup);
  return {
    id: input.id, customerId: input.customerId, dueAt: input.dueAt, description,
    status: "open", version: 1, createdById: input.createdById,
    createdAt: input.createdAt, updatedAt: input.createdAt,
  };
}

export function claimFollowup(followup: Followup, actorId: string, expectedVersion: number, timestamp: string): Followup {
  assertFollowup(followup);
  assertActorId(actorId, "Follow-up actor is invalid", invalidFollowup);
  assertVersion(expectedVersion);
  assertIsoInstant(timestamp, "Follow-up claim time is invalid", invalidFollowup);
  if (expectedVersion !== followup.version) staleVersion();
  if (followup.assigneeId !== undefined) {
    if (followup.assigneeId === actorId) return followup;
    throw new CrmDomainError("FOLLOWUP_ALREADY_ASSIGNED", "Follow-up is already assigned");
  }
  if (followup.status !== "open") notOpen();
  return { ...followup, assigneeId: actorId, version: followup.version + 1, updatedAt: timestamp };
}

export function completeFollowup(followup: Followup, actorId: string, expectedVersion: number, timestamp: string): Followup {
  assertFollowup(followup);
  assertActorId(actorId, "Follow-up actor is invalid", invalidFollowup);
  assertVersion(expectedVersion);
  assertIsoInstant(timestamp, "Follow-up completion time is invalid", invalidFollowup);
  if (expectedVersion !== followup.version) staleVersion();
  if (followup.status !== "open") notOpen();
  if (followup.assigneeId === undefined) {
    throw new CrmDomainError("FOLLOWUP_UNASSIGNED", "Follow-up must be assigned before completion");
  }
  return {
    ...followup, status: "completed", version: followup.version + 1,
    completedById: actorId, completedAt: timestamp, updatedAt: timestamp,
  };
}

export function isFollowupOverdue(followup: Followup, now: string): boolean {
  assertFollowup(followup);
  assertIsoInstant(now, "Follow-up comparison time is invalid", invalidFollowup);
  return followup.status === "open" && Date.parse(followup.dueAt) < Date.parse(now);
}

function assertFollowup(followup: Followup): void {
  assertIdentity(followup.id, "Follow-up identity is invalid", invalidFollowup);
  assertIdentity(followup.customerId, "Follow-up customer is invalid", invalidFollowup);
  assertActorId(followup.createdById, "Follow-up creator is invalid", invalidFollowup);
  if (followup.assigneeId !== undefined) assertActorId(followup.assigneeId, "Follow-up assignee is invalid", invalidFollowup);
  if (followup.status !== "open" && followup.status !== "completed") invalidFollowup("Follow-up status is invalid");
  assertVersion(followup.version);
  assertIsoInstant(followup.dueAt, "Follow-up due time is invalid", invalidFollowup);
  assertIsoInstant(followup.createdAt, "Follow-up creation time is invalid", invalidFollowup);
  assertIsoInstant(followup.updatedAt, "Follow-up update time is invalid", invalidFollowup);
}

function validateBoundedText(value: string, maximum: number, message: string, fail: (message: string) => never): string {
  const normalized = value.trim();
  if (normalized.length === 0 || normalized.length > maximum) fail(message);
  return normalized;
}

function assertIdentity(value: string, message: string, fail: (message: string) => never): void {
  if (value.trim().length === 0) fail(message);
}

function assertActorId(value: string, message: string, fail: (message: string) => never): void {
  if (value.trim().length === 0 || value.length > 255) fail(message);
}

function assertVersion(version: number): void {
  if (!Number.isSafeInteger(version) || version < 1) invalidFollowup("Follow-up version is invalid");
}

function assertIsoInstant(value: string, message: string, fail = invalidFollowup): void {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString() !== value) fail(message);
}

function invalidNote(message: string): never {
  throw new CrmDomainError("INVALID_CRM_NOTE", message);
}

function invalidFollowup(message: string): never {
  throw new CrmDomainError("INVALID_FOLLOWUP", message);
}

function staleVersion(): never {
  throw new CrmDomainError("STALE_VERSION", "Follow-up version is stale");
}

function notOpen(): never {
  throw new CrmDomainError("FOLLOWUP_NOT_OPEN", "Follow-up is not open");
}
