// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { z } from "zod";

export const provenanceItemSchema = z.object({
  sourceType: z.string().trim().min(1).max(255),
  sourceId: z.string().trim().min(1).max(255),
  sourceDigest: z.string().regex(/^[a-f0-9]{64}$/, "sourceDigest must be a 64-character lowercase hex string"),
  classification: z.enum(["internal", "confidential"]),
});

export const subjectSchema = z.object({
  kind: z.enum(["catalog_product", "free_topic"]),
  reference: z.string().trim().min(1).max(500),
});

export const createMarketingCampaignSchema = z.object({
  assignmentMode: z.enum(["direct_department", "ai_ceo"]).default("direct_department"),
  idempotencyKey: z.string().trim().min(1).max(255).optional(),
  campaignName: z.string().trim().min(1).max(500),
  objective: z.string().trim().min(1).max(2000),
  subject: subjectSchema,
  audience: z.string().trim().min(1).max(500).optional(),
  language: z.enum(["vi", "en"]),
  tone: z.string().trim().min(1).max(200).optional(),
  mandatoryMessage: z.string().trim().min(1).max(5000),
  prohibitedClaims: z.array(z.string().trim().min(1).max(500)).default([]),
  callToAction: z.string().trim().min(1).max(500),
  facebookPageConfigurationId: z.string().trim().min(1).max(255),
  scheduledFor: z.string().datetime({ offset: true }),
  deadline: z.string().datetime({ offset: true }),
  approverId: z.string().trim().min(1).max(255),
  maximumCostMicros: z.number().int().positive().max(10_000_000_000),
  provenance: z.array(provenanceItemSchema).default([]),
  sourceTaskId: z.string().trim().min(1).max(255).optional(),
});

export const listMarketingCampaignsSchema = z.object({
  limit: z.coerce.number().int().positive().max(100).default(50),
  offset: z.coerce.number().int().nonnegative().default(0),
});

export const cancelMarketingCampaignSchema = z.object({
  reason: z.string().trim().min(1).max(1000).optional(),
});
