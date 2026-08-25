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
