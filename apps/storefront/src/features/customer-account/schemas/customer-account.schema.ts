// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { z } from "zod";
export const profileSchema = z.object({ id: z.string(), email: z.email(), fullName: z.string().optional(), phoneNumber: z.string().optional(), version: z.number().int().positive() });
export const addressSchema = z.object({ id: z.string(), customerId: z.string(), recipientName: z.string(), phoneNumber: z.string(), addressLine: z.string(), ward: z.string(), provinceOrCity: z.string(), postalCode: z.string().optional(), deliveryNote: z.string().optional(), isDefault: z.boolean(), version: z.number().int().positive(), createdAt: z.string(), updatedAt: z.string() });
export const profileEnvelopeSchema = z.object({ success: z.literal(true), message: z.string(), data: profileSchema });
export const addressEnvelopeSchema = z.object({ success: z.literal(true), message: z.string(), data: addressSchema });
export const addressesEnvelopeSchema = z.object({ success: z.literal(true), message: z.string(), data: z.array(addressSchema) });
export const emptyEnvelopeSchema = z.object({ success: z.literal(true), message: z.string(), data: z.object({}) });
