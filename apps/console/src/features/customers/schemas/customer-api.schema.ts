// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { z } from "zod";

export const customerSegmentSchema = z.enum(["new_customer","first_time_buyer","repeat_customer","high_value","inactive_90d"]);
const timestamp = z.iso.datetime();
const customerSummary = z.object({ id:z.uuid(), email:z.email(), fullName:z.string().optional(), phoneNumber:z.string().optional(), status:z.enum(["active","disabled"]), createdAt:timestamp });
const page = z.object({ items:z.array(customerSummary), page:z.number().int().positive(), pageSize:z.number().int().positive(), totalItems:z.number().int().nonnegative(), totalPages:z.number().int().nonnegative() });
export const customerPageEnvelopeSchema = z.object({ success:z.literal(true), message:z.string(), data:page });
export const segmentListEnvelopeSchema = z.object({ success:z.literal(true), message:z.string(), data:z.object({ items:z.array(z.object({ id:customerSegmentSchema, name:z.string(), description:z.string(), customerCount:z.number().int().nonnegative() })), calculatedAt:timestamp }) });
export const errorEnvelopeSchema = z.object({ success:z.literal(false), message:z.string(), errorCode:z.string() });
