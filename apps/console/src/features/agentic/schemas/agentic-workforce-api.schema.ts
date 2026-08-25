// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { z } from "zod";

const kind = z.enum(["ai_ceo", "catalog", "inventory", "order", "finance", "crm", "support"]);
const summary = z.object({ kind, department: z.string(), active: z.boolean() }).strict();
const envelope = <T extends z.ZodType>(data: T) => z.object({ success: z.literal(true), data }).passthrough();
export const agenticEmployeeListEnvelopeSchema = envelope(z.array(summary).length(7));
export const agenticEmployeeDetailEnvelopeSchema = envelope(z.object({
  kind, department: z.string(),
  governance: z.object({ active: z.boolean(), revoked: z.boolean(), configurationVersion: z.number().int().nonnegative() }).strict(),
  models: z.object({ primary: z.string(), fallbacks: z.array(z.string()) }).strict(),
  tools: z.array(z.object({ name: z.string(), version: z.number().int().positive(), dataScope: z.string() }).strict()),
  budgets: z.object({ taskCostMicros: z.number().int().nonnegative(), dailyCostMicros: z.number().int().nonnegative(), monthlyCostMicros: z.number().int().nonnegative() }).strict(),
  executionHealth: z.object({ state: z.enum(["available", "revoked", "degraded", "unknown"]), basis: z.string(), freshness: z.iso.datetime({ offset: true }) }).strict(),
  recentRuns: z.array(z.object({ taskId: z.uuid(), state: z.string(), settledCostMicros: z.number().int().nonnegative(), completedAt: z.iso.datetime({ offset: true }).optional() }).strict()).max(5),
}).strict());
