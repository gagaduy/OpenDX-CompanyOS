// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

export type TicketPriority = "urgent" | "high" | "normal" | "low";
export type TicketStatus = "new" | "assigned" | "in_progress" | "waiting_customer" | "waiting_internal" | "escalated" | "resolved" | "closed";
export type AttachmentStatus = "quarantined" | "clean" | "rejected" | "deleted";
export type AttachmentFormat = "jpg" | "png" | "pdf" | "docx" | "txt";
export interface SupportTicketView { readonly id:string; readonly customerId:string; readonly orderId?:string; readonly subject:string; readonly description:string; readonly priority:TicketPriority; readonly status:TicketStatus; readonly version:number; readonly createdById:string; readonly assigneeId?:string; readonly createdAt:string; readonly updatedAt:string; }
export interface SupportTicketPageView { readonly items:readonly SupportTicketView[]; readonly page:number; readonly pageSize:number; readonly totalItems:number; readonly totalPages:number; }
export interface SupportQuery { readonly status?:TicketStatus; readonly priority?:TicketPriority; readonly assignment?:"all"|"mine"|"unassigned"; readonly page:number; readonly pageSize:number; }
export interface SupportMessageView { readonly id:string; readonly authorId:string; readonly body:string; readonly createdAt:string; }
export interface SupportEventView { readonly id:string; readonly actorId:string; readonly fromStatus:TicketStatus; readonly toStatus:TicketStatus; readonly source:"manual"|"automatic"; readonly occurredAt:string; }
export interface SupportAttachmentView { readonly id:string; readonly ticketId:string; readonly originalFilename:string; readonly format:AttachmentFormat; readonly mediaType:string; readonly byteSize:number; readonly status:AttachmentStatus; readonly version:number; readonly createdById:string; readonly createdAt:string; }
export interface SupportTicketDetailView { readonly ticket:SupportTicketView; readonly context:{ readonly customer:{readonly id:string;readonly email:string;readonly fullName?:string;readonly phoneNumber?:string}; readonly order?:{readonly id:string;readonly publicNumber:string;readonly status:string;readonly totalVnd:number;readonly createdAt:string}; }; readonly messages:readonly SupportMessageView[]; readonly events:readonly SupportEventView[]; readonly attachments:readonly SupportAttachmentView[]; }
export interface SupportTicketCreateInput { readonly customerId:string; readonly orderId?:string; readonly subject:string; readonly description:string; readonly priority:TicketPriority; }
