// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { z } from "zod";

const state = z.enum(["pending", "approved", "rejected", "revision_requested"]);
export const approvalSchema = z.object({ id: z.uuid(), state, requesterId: z.string(), approverScope: z.enum(["tool_invocation", "emergency_revocation", "governance_configuration", "workflow_execution"]), action: z.string(), resourceType: z.string(), resourceId: z.string(), parametersDigest: z.string().regex(/^[a-f0-9]{64}$/), taskId: z.uuid().optional(), policyVersion: z.number().int().positive(), workflowVersion: z.number().int().positive().optional(), configurationRevisionId: z.uuid(), expiresAt: z.iso.datetime({ offset: true }), version: z.number().int().positive(), createdAt: z.iso.datetime({ offset: true }), decidedBy: z.string().optional(), decisionReason: z.string().optional(), decidedAt: z.iso.datetime({ offset: true }).optional() }).strict();
const envelope = <T extends z.ZodType>(data: T) => z.object({ success: z.literal(true), data }).passthrough();
export const agenticApprovalPageEnvelopeSchema = envelope(z.object({ items: z.array(approvalSchema), totalItems: z.number().int().nonnegative() }).strict());
export const agenticApprovalDetailEnvelopeSchema = envelope(z.object({ approval: approvalSchema.omit({ taskId: true, decidedBy: true, decisionReason: true, decidedAt: true }), payloadDigest: z.string().regex(/^[a-f0-9]{64}$/).optional(), risk: z.object({ level: z.enum(["low", "medium", "high"]), basis: z.string() }).strict(), expectedEffect: z.string(), sources: z.array(z.object({ sourceType: z.string(), sourceId: z.string(), sourceDigest: z.string().regex(/^[a-f0-9]{64}$/) }).strict()), refreshedAt: z.iso.datetime({ offset: true }) }).strict());
export const agenticApprovalEnvelopeSchema = envelope(approvalSchema);
