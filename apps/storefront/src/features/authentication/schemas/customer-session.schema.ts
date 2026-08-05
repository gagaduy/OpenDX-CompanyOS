// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { z } from "zod";
export const sessionSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("anonymous") }),
  z.object({ kind: z.literal("guest"), expiresAt: z.string() }),
  z.object({ kind: z.literal("customer"), customerId: z.string(), email: z.email(), expiresAt: z.string(), cartResolution: z.enum(["not_required", "required", "resolved"]).optional() }),
]);
export const sessionEnvelopeSchema = z.object({ success: z.literal(true), message: z.string(), data: sessionSchema });
export const logoutEnvelopeSchema = z.object({ success: z.literal(true), message: z.string(), data: z.object({}) });
