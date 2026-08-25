// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { TicketPriority, TicketStatus } from "../../domain/entities/support-ticket";

export interface SupportContext { readonly actorId: string; readonly roles: readonly ("administrator" | "crm_operator" | "support_operator")[]; readonly correlationId: string; }
export interface SupportTicketDto { readonly id:string; readonly customerId:string; readonly orderId?:string; readonly subject:string; readonly description:string; readonly priority:TicketPriority; readonly status:TicketStatus; readonly version:number; readonly createdById:string; readonly assigneeId?:string; readonly createdAt:string; readonly updatedAt:string; }
export interface SupportEventDto { readonly id:string; readonly actorId:string; readonly fromStatus:TicketStatus; readonly toStatus:TicketStatus; readonly source:"manual"|"automatic"; readonly occurredAt:string; }
export interface SupportMessageDto { readonly id:string; readonly authorId:string; readonly body:string; readonly createdAt:string; }
export interface SupportTicketDetailDto { readonly ticket:SupportTicketDto; readonly context:{ readonly customer:{readonly id:string; readonly email:string; readonly fullName?:string; readonly phoneNumber?:string}; readonly order?:{readonly id:string;readonly publicNumber:string;readonly status:string;readonly totalVnd:number;readonly createdAt:string} }; readonly messages:readonly SupportMessageDto[]; readonly events:readonly SupportEventDto[]; }
