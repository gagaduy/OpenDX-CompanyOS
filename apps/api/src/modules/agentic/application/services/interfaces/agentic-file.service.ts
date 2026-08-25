// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { StaffPrincipal } from "../../../../../shared/auth/staff-principal";
import type { AgentTask } from "../../../domain/entities/agent-task";
import type { AgenticIntakeFile } from "../../../domain/entities/agentic-file";

export interface AgenticFileUploadRequest { readonly idempotencyKey: string; readonly originalFilename: string; readonly mediaType: "text/csv" | "text/plain"; readonly content: Buffer; }
export interface AgenticFileUploadResult { readonly disposition: "created" | "replayed"; readonly file: AgenticIntakeFile; }
export interface AgenticFilePreviewDto { readonly fileId: string; readonly fileVersion: number; readonly previewVersion: number; readonly parserVersion: string; readonly payloadDigest: string; readonly previewDigest: string; readonly format: "csv" | "txt"; readonly rowCount: number; readonly columnCount: number; readonly invalidRows: number; readonly samples: readonly string[]; readonly sourceReferences: readonly { readonly fileId: string; readonly line: number; readonly column?: number }[]; }
export interface ApproveAgenticFilePreviewRequest { readonly fileId: string; readonly expectedFileVersion: number; readonly previewVersion: number; readonly previewPayloadDigest: string; readonly idempotencyKey: string; }
export interface AgenticFileService { upload(input: AgenticFileUploadRequest, principal: StaffPrincipal): Promise<AgenticFileUploadResult>; get(fileId: string, principal: StaffPrincipal): Promise<AgenticIntakeFile>; scanAndPreview(fileId: string, principal: StaffPrincipal): Promise<AgenticFilePreviewDto>; reject(fileId: string, expectedFileVersion: number, principal: StaffPrincipal): Promise<AgenticIntakeFile>; delete(fileId: string, expectedFileVersion: number, principal: StaffPrincipal): Promise<AgenticIntakeFile>; approvePreview(input: ApproveAgenticFilePreviewRequest, principal: StaffPrincipal): Promise<AgentTask>; }
