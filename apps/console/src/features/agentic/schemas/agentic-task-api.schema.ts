// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { z } from "zod";

const state = z.enum(["draft", "ready", "received", "planning", "awaiting_plan_approval", "dispatching", "department_analysis", "quality_review", "collaboration", "executive_synthesis", "awaiting_human_approval", "retrying", "partially_completed", "failed", "canceled", "completed"]);
const task = z.object({ id: z.uuid(), state, createdBy: z.string(), goal: z.string(), version: z.number().int().positive(), createdAt: z.iso.datetime({ offset: true }), updatedAt: z.iso.datetime({ offset: true }) }).passthrough();
const overview = z.object({ counts: z.object({ running: z.number(), waiting: z.number(), failed: z.number(), completed: z.number(), canceled: z.number() }).strict(), pendingApprovals: z.number(), settledCostMicros: z.number(), refreshedAt: z.iso.datetime({ offset: true }) }).strict();
const page = z.object({ items: z.array(task), totalItems: z.number().int().nonnegative(), refreshedAt: z.iso.datetime({ offset: true }) }).strict();
const detail = z.object({ task, subtasks: z.array(z.object({ id: z.uuid().optional(), agentKind: z.string(), title: z.string() }).strict()), dependencies: z.array(z.object({ from: z.uuid(), to: z.uuid() }).strict()) }).strict();
const envelope = <T extends z.ZodType>(data: T) => z.object({ success: z.literal(true), data }).passthrough();
export const agenticOverviewEnvelopeSchema = envelope(overview);
export const agenticTaskPageEnvelopeSchema = envelope(page);
export const agenticTaskDetailEnvelopeSchema = envelope(detail);
export const agenticErrorEnvelopeSchema = z.object({ errorCode: z.string(), message: z.string() }).passthrough();
const file = z.object({ id: z.uuid(), originalFilename: z.string(), format: z.enum(["csv", "txt"]), mediaType: z.enum(["text/csv", "text/plain"]), byteSize: z.number().int().nonnegative(), payloadDigest: z.string().regex(/^[a-f0-9]{64}$/), status: z.enum(["uploaded", "scanning", "clean", "previewed", "approved", "rejected", "deleted"]), createdBy: z.string(), version: z.number().int().positive(), scannedAt: z.iso.datetime({ offset: true }).optional(), approvedAt: z.iso.datetime({ offset: true }).optional(), rejectedAt: z.iso.datetime({ offset: true }).optional(), deletedAt: z.iso.datetime({ offset: true }).optional(), createdAt: z.iso.datetime({ offset: true }), updatedAt: z.iso.datetime({ offset: true }) }).strict();
const governance = z.object({ coordinator: z.literal("ai_ceo"), eligibleDepartments: z.array(z.enum(["catalog", "inventory", "order", "finance", "crm", "support"])), allowedTools: z.array(z.string()), dataClasses: z.array(z.string()), riskSignals: z.array(z.string()), dependencyStatus: z.literal("planned_after_task_start"), configurationRevisionId: z.uuid(), configurationVersion: z.number().int().positive() }).strict();
const filePreview = z.object({ fileId: z.uuid(), fileVersion: z.number().int().positive(), previewVersion: z.number().int().positive(), parserVersion: z.string(), payloadDigest: z.string().regex(/^[a-f0-9]{64}$/), previewDigest: z.string().regex(/^[a-f0-9]{64}$/), format: z.enum(["csv", "txt"]), rowCount: z.number().int().nonnegative(), columnCount: z.number().int().nonnegative(), invalidRows: z.number().int().nonnegative(), samples: z.array(z.string()), sourceReferences: z.array(z.object({ fileId: z.uuid(), line: z.number().int().positive(), column: z.number().int().positive().optional() }).strict()), governance }).strict();
export const agenticFileEnvelopeSchema = envelope(file);
export const agenticFilePreviewEnvelopeSchema = envelope(filePreview);
