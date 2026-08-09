// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { SupportContext } from "../../dtos/support.dto";
import type { SupportAttachment } from "../../../domain/entities/support-attachment";

export interface SupportAttachmentUploadRequest {
  readonly originalFilename: string;
  readonly mediaType: string;
  readonly bytes: Buffer;
}

export interface SupportAttachmentDownload {
  readonly attachment: SupportAttachment;
  readonly content: NodeJS.ReadableStream;
}

export interface SupportAttachmentServiceContract {
  upload(ticketId: string, request: SupportAttachmentUploadRequest, context: SupportContext): Promise<SupportAttachment>;
  download(ticketId: string, attachmentId: string, context: SupportContext): Promise<SupportAttachmentDownload>;
}
