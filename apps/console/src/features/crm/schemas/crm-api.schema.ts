// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { z } from "zod";
import { customerSegmentSchema } from "../../customers/schemas/customer-api.schema";

const timestamp=z.iso.datetime();
const customer=z.object({ id:z.uuid(), email:z.email(), fullName:z.string().optional(), phoneNumber:z.string().optional(), status:z.enum(["active","disabled"]), createdAt:timestamp, addresses:z.array(z.object({ id:z.uuid(), recipientName:z.string(), phoneNumber:z.string(), addressLine:z.string(), ward:z.string(), provinceOrCity:z.string(), postalCode:z.string().optional(), isDefault:z.boolean() })) });
const order=z.object({ id:z.string(), publicNumber:z.string(), status:z.string(), totalVnd:z.number().int().nonnegative(), createdAt:timestamp, paidAt:timestamp.optional() });
const facts=z.object({ paidOrderCount:z.number().int().nonnegative(), lifetimePaidVnd:z.number().int().nonnegative(), latestPaidAt:timestamp.optional() });
const note=z.object({ id:z.string(), customerId:z.uuid(), authorId:z.string(), body:z.string(), correctsNoteId:z.string().optional(), createdAt:timestamp });
export const followupSchema=z.object({ id:z.string(), customerId:z.uuid(), dueAt:timestamp, description:z.string(), status:z.enum(["open","completed"]), version:z.number().int().positive(), createdById:z.string(), assigneeId:z.string().optional(), completedById:z.string().optional(), completedAt:timestamp.optional(), createdAt:timestamp, updatedAt:timestamp });
export const customer360EnvelopeSchema=z.object({ success:z.literal(true), message:z.string(), data:z.object({ customer, orders:z.array(order), paidFacts:facts, segments:z.array(customerSegmentSchema), calculatedAt:timestamp, notes:z.array(note), followups:z.array(followupSchema) }) });
export const followupEnvelopeSchema=z.object({ success:z.literal(true), message:z.string(), data:followupSchema });
export const noteEnvelopeSchema=z.object({ success:z.literal(true), message:z.string(), data:note });
export const errorEnvelopeSchema=z.object({ success:z.literal(false), message:z.string(), errorCode:z.string() });
