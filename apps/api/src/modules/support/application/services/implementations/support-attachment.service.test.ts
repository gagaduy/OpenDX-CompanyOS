// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { Readable } from "node:stream";
import { describe, expect, it, vi } from "vitest";
import type { TransactionRunner } from "../../../../../shared/database/transaction";
import type { SupportAttachment } from "../../../domain/entities/support-attachment";
import type { SupportTicket } from "../../../domain/entities/support-ticket";
import type { SupportRepository } from "../../repositories/interfaces/support.repository";
import { SupportAttachmentService } from "./support-attachment.service";

const at = "2026-08-10T00:00:00.000Z";
const pdf = Buffer.from("%PDF-1.7\n");

describe("SupportAttachmentService", () => {
  it("stores one validated file as quarantined metadata and cleans up object storage when metadata fails", async () => {
    const { service, repository, storage } = fixture();
    const createAttachment = repository.createAttachment as unknown as { mockRejectedValueOnce(error: Error): void };
    createAttachment.mockRejectedValueOnce(new Error("db"));

    await expect(service.upload("ticket-1", {
      originalFilename: "evidence.pdf", mediaType: "application/pdf", bytes: pdf,
    }, admin())).rejects.toThrow("db");

    expect(storage.put).toHaveBeenCalledWith("support/ticket-1/id-1.pdf", pdf, "application/pdf");
    expect(storage.delete).toHaveBeenCalledWith("support/ticket-1/id-1.pdf");
    expect(repository.createAttachment).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      id: "id-1", ticketId: "ticket-1", status: "quarantined", objectKey: "support/ticket-1/id-1.pdf",
    }));
  });

  it("rejects spoofed content before object storage", async () => {
    const { service, storage } = fixture();

    await expect(service.upload("ticket-1", {
      originalFilename: "evidence.pdf", mediaType: "application/pdf", bytes: Buffer.from("not pdf"),
    }, admin())).rejects.toMatchObject({ code: "ATTACHMENT_TYPE_NOT_ALLOWED" });
    expect(storage.put).not.toHaveBeenCalled();
  });

  it("streams only clean attachments for actors allowed to read the ticket", async () => {
    const { service, storage } = fixture({ attachment: attachment({ status: "clean" }) });

    await expect(service.download("ticket-1", "attachment-1", support("support-a"))).resolves.toMatchObject({
      attachment: expect.objectContaining({ id: "attachment-1", originalFilename: "evidence.pdf" }),
      content: expect.anything(),
    });
    expect(storage.open).toHaveBeenCalledWith("support/ticket-1/attachment-1.pdf");
  });

  it("denies quarantined downloads and cross-operator ticket access", async () => {
    const { service } = fixture({ ticket: ticket({ assigneeId: "support-a" }) });

    await expect(service.download("ticket-1", "attachment-1", support("support-a"))).rejects.toMatchObject({ code: "ATTACHMENT_QUARANTINED" });
    await expect(service.download("ticket-1", "attachment-1", support("support-b"))).rejects.toMatchObject({ code: "TICKET_NOT_OWNED" });
  });
});

function fixture(options: { readonly ticket?: SupportTicket; readonly attachment?: SupportAttachment } = {}) {
  const currentTicket = options.ticket ?? ticket({ assigneeId: "support-a" });
  const currentAttachment = options.attachment ?? attachment();
  const repository = {
    create: vi.fn(async () => undefined),
    find: vi.fn(async () => currentTicket),
    list: vi.fn(async () => ({ items: [], totalItems: 0 })),
    update: vi.fn(async () => false),
    appendEvent: vi.fn(async () => false),
    findEventByKey: vi.fn(async () => undefined),
    appendMessage: vi.fn(async () => undefined),
    listMessages: vi.fn(async () => []),
    listEvents: vi.fn(async () => []),
    createAttachment: vi.fn(async () => undefined),
    findAttachment: vi.fn(async () => currentAttachment),
    countRetainedAttachments: vi.fn(async () => ({ count: 0, bytes: 0 })),
    claimAttachmentsForScan: vi.fn(async () => []),
    markAttachmentClean: vi.fn(async () => false),
    markAttachmentRejected: vi.fn(async () => false),
    claimAttachmentsForRetention: vi.fn(async () => []),
    markAttachmentDeleted: vi.fn(async () => false),
    appendAudit: vi.fn(async () => undefined),
    claimBreached: vi.fn(async () => []),
    countSummary: vi.fn(async () => ({ openTickets: 0, slaBreaches: 0 })),
    appendDeniedAudit: vi.fn(async () => undefined),
  } satisfies Record<keyof SupportRepository, ReturnType<typeof vi.fn>>;
  const storage = { put: vi.fn(async () => undefined), open: vi.fn(async () => Readable.from([pdf])), delete: vi.fn(async () => undefined) };
  const transactions: TransactionRunner = { run: async work => work({ query: vi.fn() }), runReadOnly: async work => work({ query: vi.fn() }) };
  return { service: new SupportAttachmentService(repository, storage, transactions, nextId(), () => at), repository, storage };
}

function ticket(overrides: Partial<SupportTicket> = {}): SupportTicket {
  return { id: "ticket-1", customerId: "customer-1", subject: "Subject", description: "Description", priority: "normal", status: "assigned", version: 1, createdById: "crm-1", slaPausedSeconds: 0, slaStoppedSeconds: 0, createdAt: at, updatedAt: at, ...overrides };
}

function attachment(overrides: Partial<SupportAttachment> = {}): SupportAttachment {
  return { id: "attachment-1", ticketId: "ticket-1", objectKey: "support/ticket-1/attachment-1.pdf", originalFilename: "evidence.pdf", format: "pdf", mediaType: "application/pdf", byteSize: pdf.byteLength, status: "quarantined", createdById: "support-a", createdAt: at, ...overrides };
}

function nextId() { let i = 0; return () => `id-${++i}`; }
function admin() { return { actorId: "admin-1", roles: ["administrator" as const], correlationId: "c" }; }
function support(actorId: string) { return { actorId, roles: ["support_operator" as const], correlationId: "c" }; }
