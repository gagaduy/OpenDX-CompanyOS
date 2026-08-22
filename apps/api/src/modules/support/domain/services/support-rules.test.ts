// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import type { SupportAttachment } from "../entities/support-attachment";
import type { SupportTicket, TicketStatus } from "../entities/support-ticket";
import { SupportDomainError } from "../exceptions/support-domain.error";
import {
  ATTACHMENT_LIMITS,
  effectiveSlaConsumedSeconds,
  isAttachmentRetentionDue,
  isSlaBreached,
  transitionAttachment,
  transitionTicket,
  validateAttachmentUpload,
} from "./support-rules";

const createdAt = "2026-08-10T00:00:00.000Z";

function ticket(status: TicketStatus = "new"): SupportTicket {
  return {
    id: "ticket-1", customerId: "customer-1", subject: "Delivery issue",
    description: "The order has not arrived.", priority: "normal", status,
    version: 1, createdById: "staff-creator", slaPausedSeconds: 0, slaStoppedSeconds: 0,
    createdAt, updatedAt: createdAt,
  };
}

function attachment(status: SupportAttachment["status"] = "quarantined"): SupportAttachment {
  return {
    id: "attachment-1", ticketId: "ticket-1", objectKey: "00000000-0000-4000-8000-000000000001",
    originalFilename: "evidence.pdf", format: "pdf", mediaType: "application/pdf",
    byteSize: 10, status, createdById: "staff-creator", createdAt,
  };
}

describe("support domain rules", () => {
  it.each([
    ["new", "assigned"], ["new", "escalated"],
    ["assigned", "in_progress"], ["assigned", "escalated"],
    ["in_progress", "waiting_customer"], ["in_progress", "waiting_internal"], ["in_progress", "escalated"], ["in_progress", "resolved"],
    ["waiting_customer", "in_progress"], ["waiting_customer", "escalated"], ["waiting_customer", "resolved"],
    ["waiting_internal", "in_progress"], ["waiting_internal", "escalated"], ["waiting_internal", "resolved"],
    ["escalated", "in_progress"], ["escalated", "waiting_customer"], ["escalated", "waiting_internal"], ["escalated", "resolved"],
    ["resolved", "in_progress"], ["resolved", "closed"],
  ] as const)("accepts the approved %s to %s transition", (from, target) => {
    expect(transitionTicket(ticket(from), target, "staff-1", "2026-08-10T01:00:00.000Z"))
      .toMatchObject({ status: target, version: 2 });
  });

  it("rejects forbidden reverse and skip transitions, and treats closed as terminal", () => {
    for (const [from, target] of [["new", "resolved"], ["assigned", "new"], ["waiting_customer", "waiting_internal"], ["resolved", "escalated"], ["closed", "in_progress"]] as const) {
      expect(() => transitionTicket(ticket(from), target, "staff-1", "2026-08-10T01:00:00.000Z"))
        .toThrowError(expect.objectContaining<Partial<SupportDomainError>>({ code: "INVALID_TICKET_TRANSITION" }));
    }
  });

  it("pauses only waiting customer time, accumulates pauses, and resumes a reopened resolution", () => {
    const waiting = transitionTicket(ticket("in_progress"), "waiting_customer", "staff-1", "2026-08-10T01:00:00.000Z");
    const resumed = transitionTicket(waiting, "in_progress", "staff-1", "2026-08-10T02:00:00.000Z");
    const waitingAgain = transitionTicket(resumed, "waiting_customer", "staff-1", "2026-08-10T03:00:00.000Z");
    const resolved = transitionTicket(transitionTicket(waitingAgain, "resolved", "staff-1", "2026-08-10T04:00:00.000Z"), "in_progress", "staff-1", "2026-08-10T10:00:00.000Z");

    expect(resumed.slaPausedSeconds).toBe(3_600);
    expect(effectiveSlaConsumedSeconds(waitingAgain, "2026-08-10T04:00:00.000Z")).toBe(7_200);
    expect(effectiveSlaConsumedSeconds({ ...ticket("waiting_internal"), updatedAt: "2026-08-10T01:00:00.000Z" }, "2026-08-10T02:00:00.000Z")).toBe(7_200);
    expect(resolved.slaPausedSeconds).toBe(7_200);
    expect(effectiveSlaConsumedSeconds(resolved, "2026-08-10T11:00:00.000Z")).toBe(10_800);
  });

  it("stops resolved and closed SLA clocks, breaches at the exact boundary, and makes automatic escalation idempotent", () => {
    const resolved = transitionTicket(ticket("in_progress"), "resolved", "staff-1", "2026-08-10T01:00:00.000Z");
    const closed = transitionTicket(resolved, "closed", "staff-1", "2026-08-10T02:00:00.000Z");
    expect(effectiveSlaConsumedSeconds(resolved, "2026-08-10T10:00:00.000Z")).toBe(3_600);
    expect(effectiveSlaConsumedSeconds(closed, "2026-08-10T10:00:00.000Z")).toBe(3_600);
    expect(isSlaBreached({ ...ticket(), priority: "urgent" }, "2026-08-10T02:00:00.000Z")).toBe(true);
    const manuallyEscalated = transitionTicket(ticket(), "escalated", "staff-1", "2026-08-10T00:01:00.000Z");
    expect(transitionTicket(manuallyEscalated, "escalated", "system", "2026-08-10T02:00:00.000Z", "automatic")).toBe(manuallyEscalated);
  });

  it.each([["urgent", 7_200], ["high", 28_800], ["normal", 86_400], ["low", 259_200]] as const)("breaches %s at its exact SLA target", (priority, target) => {
    expect(isSlaBreached({ ...ticket(), priority }, new Date(Date.parse(createdAt) + target * 1_000).toISOString())).toBe(true);
  });

  it.each([
    ["jpg", "image/jpeg", "jpg"], ["png", "image/png", "png"], ["webp", "image/webp", "webp"],
    ["pdf", "application/pdf", "pdf"], ["txt", "text/plain", "text"], ["csv", "text/csv", "text"],
    ["docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "zip"],
    ["xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "zip"],
  ] as const)("accepts allow-listed %s metadata at exact file, count, and total bounds", (extension, mediaType, signature) => {
    expect(validateAttachmentUpload({ extension, mediaType, signature, byteSize: ATTACHMENT_LIMITS.maxFileBytes, existingCount: 19, existingBytes: ATTACHMENT_LIMITS.maxTicketBytes - ATTACHMENT_LIMITS.maxFileBytes })).toEqual(expect.objectContaining({ format: extension }));
  });

  it("rejects mismatched and unsafe attachment metadata and over-limit requests", () => {
    for (const input of [
      { extension: "docm", mediaType: "application/vnd.ms-word.document.macroEnabled.12", signature: "zip" },
      { extension: "exe", mediaType: "application/octet-stream", signature: "exe" },
      { extension: "pdf", mediaType: "image/png", signature: "pdf" },
      { extension: "png", mediaType: "image/png", signature: "jpg" },
    ]) {
      expect(() => validateAttachmentUpload({ ...input, byteSize: 1, existingCount: 0, existingBytes: 0 }))
        .toThrowError(expect.objectContaining<Partial<SupportDomainError>>({ code: "ATTACHMENT_TYPE_NOT_ALLOWED" }));
    }
    expect(() => validateAttachmentUpload({ extension: "pdf", mediaType: "application/pdf", signature: "pdf", byteSize: ATTACHMENT_LIMITS.maxFileBytes + 1, existingCount: 0, existingBytes: 0 }))
      .toThrowError(expect.objectContaining<Partial<SupportDomainError>>({ code: "ATTACHMENT_TOO_LARGE" }));
    expect(() => validateAttachmentUpload({ extension: "pdf", mediaType: "application/pdf", signature: "pdf", byteSize: 1, existingCount: 20, existingBytes: 0 }))
      .toThrowError(expect.objectContaining<Partial<SupportDomainError>>({ code: "ATTACHMENT_LIMIT_EXCEEDED" }));
    expect(() => validateAttachmentUpload({ extension: "pdf", mediaType: "application/pdf", signature: "pdf", byteSize: 1, existingCount: 0, existingBytes: ATTACHMENT_LIMITS.maxTicketBytes }))
      .toThrowError(expect.objectContaining<Partial<SupportDomainError>>({ code: "ATTACHMENT_LIMIT_EXCEEDED" }));
  });

  it("permits only quarantine scan and tombstone attachment transitions and deletes at the 365-day boundary", () => {
    const clean = transitionAttachment(attachment(), "clean", "2026-08-10T01:00:00.000Z");
    expect(transitionAttachment(clean, "deleted", "2027-08-10T00:00:00.000Z")).toMatchObject({ status: "deleted", deletedAt: "2027-08-10T00:00:00.000Z" });
    expect(transitionAttachment(attachment(), "rejected", "2026-08-10T01:00:00.000Z")).toMatchObject({ status: "rejected" });
    expect(() => transitionAttachment(clean, "quarantined", "2026-08-10T01:00:00.000Z"))
      .toThrowError(expect.objectContaining<Partial<SupportDomainError>>({ code: "INVALID_ATTACHMENT_TRANSITION" }));
    expect(isAttachmentRetentionDue(clean, "2026-08-10T00:00:00.000Z", "2027-08-10T00:00:00.000Z")).toBe(true);
    expect(isAttachmentRetentionDue(clean, "2026-08-10T00:00:00.001Z", "2027-08-10T00:00:00.000Z")).toBe(false);
  });
});
