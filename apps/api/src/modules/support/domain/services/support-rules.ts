// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { SupportAttachment, SupportAttachmentFormat, SupportAttachmentStatus } from "../entities/support-attachment";
import type { SupportTicket, TicketPriority, TicketStatus } from "../entities/support-ticket";
import { SupportDomainError } from "../exceptions/support-domain.error";

export const SLA_SECONDS = { urgent: 7_200, high: 28_800, normal: 86_400, low: 259_200 } as const;
export const ATTACHMENT_LIMITS = { maxFileBytes: 25 * 1024 * 1024, maxFilesPerTicket: 20, maxTicketBytes: 200 * 1024 * 1024 } as const;

const allowedTransitions: Readonly<Record<TicketStatus, readonly TicketStatus[]>> = {
  new: ["assigned", "escalated"], assigned: ["in_progress", "escalated"],
  in_progress: ["waiting_customer", "waiting_internal", "escalated", "resolved"],
  waiting_customer: ["in_progress", "escalated", "resolved"],
  waiting_internal: ["in_progress", "escalated", "resolved"],
  escalated: ["in_progress", "waiting_customer", "waiting_internal", "resolved"],
  resolved: ["in_progress", "closed"], closed: [],
};

const attachmentFormats: Readonly<Record<SupportAttachmentFormat, { readonly mediaType: string; readonly signature: string }>> = {
  jpg: { mediaType: "image/jpeg", signature: "jpg" }, png: { mediaType: "image/png", signature: "png" },
  webp: { mediaType: "image/webp", signature: "webp" }, pdf: { mediaType: "application/pdf", signature: "pdf" },
  txt: { mediaType: "text/plain", signature: "text" }, csv: { mediaType: "text/csv", signature: "text" },
  docx: { mediaType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", signature: "zip" },
  xlsx: { mediaType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", signature: "zip" },
};

export function transitionTicket(ticket: SupportTicket, target: TicketStatus, actorId: string, now: string, source: "manual" | "automatic" = "manual"): SupportTicket {
  assertTicket(ticket);
  assertActorId(actorId);
  assertInstant(now);
  if (source === "automatic" && ticket.status === "escalated" && target === "escalated") return ticket;
  if (!allowedTransitions[ticket.status].includes(target)) invalidTransition();

  const pausedSeconds = ticket.slaPausedSeconds + activePauseSeconds(ticket, now);
  const stoppedSeconds = ticket.slaStoppedSeconds
    + (ticket.status === "resolved" && target === "in_progress" && ticket.slaStoppedAt !== undefined
      ? secondsBetween(ticket.slaStoppedAt, now)
      : 0);
  const base: SupportTicket = {
    ...ticket, status: target, version: ticket.version + 1, updatedAt: now,
    slaPausedSeconds: pausedSeconds, slaStoppedSeconds: stoppedSeconds, slaPauseStartedAt: undefined,
    slaStoppedAt: target === "resolved" ? now : target === "closed" ? ticket.slaStoppedAt ?? now : undefined,
  };
  if (target === "waiting_customer") return { ...base, slaPauseStartedAt: now };
  return base;
}

export function effectiveSlaConsumedSeconds(ticket: SupportTicket, now: string): number {
  assertTicket(ticket);
  assertInstant(now);
  const end = ticket.slaStoppedAt ?? now;
  const elapsed = secondsBetween(ticket.createdAt, end);
  const paused = ticket.slaPausedSeconds + activePauseSeconds(ticket, end);
  return Math.max(0, elapsed - paused - ticket.slaStoppedSeconds);
}

export function isSlaBreached(ticket: SupportTicket, now: string): boolean {
  assertTicket(ticket);
  assertInstant(now);
  return effectiveSlaConsumedSeconds(ticket, now) >= SLA_SECONDS[ticket.priority];
}

export interface AttachmentUploadInput {
  readonly extension: string;
  readonly mediaType: string;
  readonly signature: string;
  readonly byteSize: number;
  readonly existingCount: number;
  readonly existingBytes: number;
}

export function validateAttachmentUpload(input: AttachmentUploadInput): { readonly format: SupportAttachmentFormat } {
  const format = input.extension.toLowerCase() as SupportAttachmentFormat;
  const expected = attachmentFormats[format];
  if (expected === undefined || input.mediaType !== expected.mediaType || input.signature !== expected.signature) attachmentTypeNotAllowed();
  if (!Number.isSafeInteger(input.byteSize) || input.byteSize < 1 || input.byteSize > ATTACHMENT_LIMITS.maxFileBytes) attachmentTooLarge();
  if (!Number.isSafeInteger(input.existingCount) || input.existingCount < 0 || input.existingCount >= ATTACHMENT_LIMITS.maxFilesPerTicket
    || !Number.isSafeInteger(input.existingBytes) || input.existingBytes < 0 || input.existingBytes + input.byteSize > ATTACHMENT_LIMITS.maxTicketBytes) attachmentLimitExceeded();
  return { format };
}

export function transitionAttachment(attachment: SupportAttachment, target: SupportAttachmentStatus, now: string): SupportAttachment {
  assertInstant(now);
  const allowed: Readonly<Record<SupportAttachmentStatus, readonly SupportAttachmentStatus[]>> = {
    quarantined: ["clean", "rejected"], clean: ["deleted"], rejected: ["deleted"], deleted: [],
  };
  if (!allowed[attachment.status].includes(target)) throw new SupportDomainError("INVALID_ATTACHMENT_TRANSITION", "Attachment transition is not allowed");
  return {
    ...attachment, status: target,
    scannedAt: target === "clean" ? now : attachment.scannedAt,
    rejectedAt: target === "rejected" ? now : attachment.rejectedAt,
    deletedAt: target === "deleted" ? now : attachment.deletedAt,
  };
}

export function isAttachmentRetentionDue(attachment: SupportAttachment, closedAt: string, now: string): boolean {
  assertInstant(closedAt);
  assertInstant(now);
  return attachment.status === "clean" && Date.parse(now) >= Date.parse(closedAt) + 365 * 24 * 60 * 60 * 1000;
}

function assertTicket(ticket: SupportTicket): void {
  if (!isNonBlank(ticket.id) || !isNonBlank(ticket.customerId) || !isBoundedText(ticket.subject, 240)
    || !isBoundedText(ticket.description, 4_000) || !isNonBlank(ticket.createdById)
    || !Object.hasOwn(SLA_SECONDS, ticket.priority as TicketPriority) || !Object.hasOwn(allowedTransitions, ticket.status)
    || !Number.isSafeInteger(ticket.version) || ticket.version < 1 || !Number.isSafeInteger(ticket.slaPausedSeconds) || ticket.slaPausedSeconds < 0
    || !Number.isSafeInteger(ticket.slaStoppedSeconds) || ticket.slaStoppedSeconds < 0) invalidTicket();
  assertInstant(ticket.createdAt);
  assertInstant(ticket.updatedAt);
  if (ticket.slaPauseStartedAt !== undefined) assertInstant(ticket.slaPauseStartedAt);
  if (ticket.slaStoppedAt !== undefined) assertInstant(ticket.slaStoppedAt);
}

function activePauseSeconds(ticket: SupportTicket, end: string): number {
  return ticket.status === "waiting_customer" && ticket.slaPauseStartedAt !== undefined ? secondsBetween(ticket.slaPauseStartedAt, end) : 0;
}

function secondsBetween(start: string, end: string): number { return Math.max(0, Math.floor((Date.parse(end) - Date.parse(start)) / 1000)); }
function isNonBlank(value: string): boolean { return value.trim().length > 0 && value.length <= 255; }
function isBoundedText(value: string, maximum: number): boolean { return value.trim().length > 0 && value.length <= maximum; }
function assertActorId(value: string): void { if (!isNonBlank(value)) invalidTicket(); }
function assertInstant(value: string): void { const parsed = new Date(value); if (Number.isNaN(parsed.getTime()) || parsed.toISOString() !== value) invalidTicket(); }
function invalidTicket(): never { throw new SupportDomainError("INVALID_SUPPORT_TICKET", "Support ticket is invalid"); }
function invalidTransition(): never { throw new SupportDomainError("INVALID_TICKET_TRANSITION", "Ticket transition is not allowed"); }
function attachmentTypeNotAllowed(): never { throw new SupportDomainError("ATTACHMENT_TYPE_NOT_ALLOWED", "Attachment type is not allowed"); }
function attachmentTooLarge(): never { throw new SupportDomainError("ATTACHMENT_TOO_LARGE", "Attachment is too large"); }
function attachmentLimitExceeded(): never { throw new SupportDomainError("ATTACHMENT_LIMIT_EXCEEDED", "Attachment limit is exceeded"); }
