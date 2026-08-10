// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { z } from "zod";

const timestamp = z.iso.datetime();
export const ticketPrioritySchema = z.enum(["urgent","high","normal","low"]);
export const ticketStatusSchema = z.enum(["new","assigned","in_progress","waiting_customer","waiting_internal","escalated","resolved","closed"]);
const ticket = z.object({ id:z.uuid(), customerId:z.uuid(), orderId:z.uuid().optional(), subject:z.string(), description:z.string(), priority:ticketPrioritySchema, status:ticketStatusSchema, version:z.number().int().positive(), createdById:z.string(), assigneeId:z.string().optional(), createdAt:timestamp, updatedAt:timestamp });
const page = z.object({ items:z.array(ticket), page:z.number().int().positive(), pageSize:z.number().int().positive(), totalItems:z.number().int().nonnegative(), totalPages:z.number().int().nonnegative() });
const message = z.object({ id:z.string(), authorId:z.string(), body:z.string(), createdAt:timestamp });
const event = z.object({ id:z.string(), actorId:z.string(), fromStatus:ticketStatusSchema, toStatus:ticketStatusSchema, source:z.enum(["manual","automatic"]), occurredAt:timestamp });
const attachment = z.object({ id:z.string(), ticketId:z.string(), originalFilename:z.string(), format:z.enum(["jpg","png","pdf","docx","txt"]), mediaType:z.string(), byteSize:z.number().int().nonnegative(), status:z.enum(["quarantined","clean","rejected","deleted"]), version:z.number().int().positive().default(1), createdById:z.string(), createdAt:timestamp });
const detail = z.object({ ticket, context:z.object({ customer:z.object({ id:z.uuid(), email:z.email(), fullName:z.string().optional(), phoneNumber:z.string().optional() }), order:z.object({ id:z.string(), publicNumber:z.string(), status:z.string(), totalVnd:z.number().int(), createdAt:timestamp }).optional() }), messages:z.array(message), events:z.array(event), attachments:z.array(attachment).optional().default([]) });
export const supportPageEnvelopeSchema = z.object({ success:z.literal(true), message:z.string(), data:page });
export const supportTicketEnvelopeSchema = z.object({ success:z.literal(true), message:z.string(), data:ticket });
export const supportDetailEnvelopeSchema = z.object({ success:z.literal(true), message:z.string(), data:detail });
export const supportMessageEnvelopeSchema = z.object({ success:z.literal(true), message:z.string(), data:message });
export const supportAttachmentEnvelopeSchema = z.object({ success:z.literal(true), message:z.string(), data:attachment });
export const supportErrorEnvelopeSchema = z.object({ success:z.literal(false), message:z.string(), errorCode:z.string() });
