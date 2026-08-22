// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0
import type { SupportTicket } from "../../domain/entities/support-ticket";
import type { TicketMessage } from "../../domain/entities/ticket-message";
import type { SupportEvent } from "../repositories/interfaces/support.repository";
export const mapTicket=(t:SupportTicket)=>({id:t.id,customerId:t.customerId,...(t.orderId===undefined?{}:{orderId:t.orderId}),subject:t.subject,description:t.description,priority:t.priority,status:t.status,version:t.version,createdById:t.createdById,...(t.assigneeId===undefined?{}:{assigneeId:t.assigneeId}),createdAt:t.createdAt,updatedAt:t.updatedAt});
export const mapMessage=(m:TicketMessage)=>({id:m.id,authorId:m.authorId,body:m.body,createdAt:m.createdAt});
export const mapEvent=(e:SupportEvent)=>({id:e.id,actorId:e.actorId,fromStatus:e.fromStatus,toStatus:e.toStatus,source:e.source,occurredAt:e.occurredAt});
