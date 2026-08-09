// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { createHash } from "node:crypto";
import type { TransactionRunner } from "../../../../../shared/database/transaction";
import type { SupportAttachment, SupportAttachmentFormat } from "../../../domain/entities/support-attachment";
import { validateAttachmentUpload } from "../../../domain/services/support-rules";
import type { SupportContext } from "../../dtos/support.dto";
import type { SupportRepository } from "../../repositories/interfaces/support.repository";
import type { SupportAttachmentStorage } from "../../storage/support-attachment-storage";
import { SupportApplicationError } from "../support-application.error";
import type { SupportAttachmentDownload, SupportAttachmentServiceContract, SupportAttachmentUploadRequest } from "../interfaces/support-attachment.service";

export class SupportAttachmentService implements SupportAttachmentServiceContract {
  constructor(
    private readonly repository: SupportRepository,
    private readonly storage: SupportAttachmentStorage,
    private readonly transactions: TransactionRunner,
    private readonly generateId: () => string,
    private readonly now: () => string,
  ) {}

  async upload(ticketId: string, request: SupportAttachmentUploadRequest, context: SupportContext): Promise<SupportAttachment> {
    const filename = cleanFilename(request.originalFilename);
    const extension = filename.slice(filename.lastIndexOf(".") + 1).toLowerCase();
    const signature = detectSignature(request.bytes, extension);
    const retained = await this.transactions.runReadOnly(async session => {
      const ticket = await this.requireTicket(session, ticketId);
      this.allowRead(context, ticket);
      return this.repository.countRetainedAttachments(session, ticketId);
    });
    const { format } = validateAttachmentUpload({ extension, mediaType: request.mediaType, signature, byteSize: request.bytes.byteLength, existingCount: retained.count, existingBytes: retained.bytes });
    const id = this.generateId();
    const objectKey = `support/${ticketId}/${id}.${format}`;
    const attachment: SupportAttachment = {
      id, ticketId, objectKey, originalFilename: filename, format, mediaType: request.mediaType, byteSize: request.bytes.byteLength,
      status: "quarantined", createdById: context.actorId, createdAt: this.now(),
    };
    createHash("sha256").update(request.bytes).digest("hex");
    await this.storage.put(objectKey, request.bytes, request.mediaType);
    try {
      await this.transactions.run(async session => {
        const ticket = await this.requireTicket(session, ticketId, true);
        this.allowRead(context, ticket);
        await this.repository.createAttachment(session, attachment);
        await this.repository.appendAudit(session, { id: this.generateId(), ticketId, actorId: context.actorId, action: "support.attachment.uploaded", resourceId: id, correlationId: context.correlationId, metadata: { status: "quarantined" }, occurredAt: attachment.createdAt });
      });
    } catch (error) {
      await this.storage.delete(objectKey).catch(() => undefined);
      throw error;
    }
    return { ...attachment };
  }

  async download(ticketId: string, attachmentId: string, context: SupportContext): Promise<SupportAttachmentDownload> {
    return this.transactions.runReadOnly(async session => {
      const ticket = await this.requireTicket(session, ticketId);
      this.allowRead(context, ticket);
      const attachment = await this.repository.findAttachment(session, ticketId, attachmentId);
      if (attachment === undefined) throw new SupportApplicationError("ATTACHMENT_NOT_FOUND", "Attachment not found");
      if (attachment.status !== "clean") throw new SupportApplicationError("ATTACHMENT_QUARANTINED", "Attachment is not available for download");
      return { attachment, content: await this.storage.open(attachment.objectKey) };
    });
  }

  private async requireTicket(session: Parameters<SupportRepository["find"]>[0], id: string, lock = false) {
    const ticket = await this.repository.find(session, id, lock);
    if (ticket === undefined) throw new SupportApplicationError("TICKET_NOT_FOUND", "Ticket not found");
    return ticket;
  }

  private allowRead(context: SupportContext, ticket: Awaited<ReturnType<SupportRepository["find"]>> extends infer T ? NonNullable<T> : never): void {
    if (context.roles.includes("administrator") || (context.roles.includes("support_operator") && (ticket.assigneeId === undefined || ticket.assigneeId === context.actorId)) || (context.roles.includes("crm_operator") && ticket.createdById === context.actorId)) return;
    if (context.roles.some(role => role === "support_operator" || role === "crm_operator")) throw new SupportApplicationError("TICKET_NOT_OWNED", "Ticket is not owned by this operator");
    throw new SupportApplicationError("FORBIDDEN", "Insufficient permissions");
  }
}

function cleanFilename(filename: string): string {
  const cleaned = filename.split(/[\\/]/).pop()?.trim() ?? "";
  if (cleaned.length < 1 || cleaned.length > 255 || !cleaned.includes(".")) throw new SupportApplicationError("VALIDATION_ERROR", "Attachment filename is invalid");
  return cleaned;
}

function detectSignature(bytes: Buffer, extension: string): string {
  if (extension === "txt" || extension === "csv") {
    try { new TextDecoder("utf-8", { fatal: true }).decode(bytes); return "text"; } catch { return "invalid"; }
  }
  if (bytes.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))) return "jpg";
  if (bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "png";
  if (bytes.subarray(0, 4).toString("ascii") === "RIFF" && bytes.subarray(8, 12).toString("ascii") === "WEBP") return "webp";
  if (bytes.subarray(0, 4).toString("ascii") === "%PDF") return "pdf";
  if (bytes.subarray(0, 2).toString("ascii") === "PK" && (extension === "docx" || extension === "xlsx")) return "zip";
  return "invalid";
}
