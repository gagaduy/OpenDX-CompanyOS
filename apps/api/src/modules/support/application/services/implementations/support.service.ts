// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0
import type { TransactionRunner } from "../../../../../shared/database/transaction";
import type { CustomerOperationsReader } from "../../../../customer";
import type { CustomerOrderOperationsReader } from "../../../../order";
import { transitionTicket } from "../../../domain/services/support-rules";
import type { SupportTicket } from "../../../domain/entities/support-ticket";
import { mapEvent, mapMessage, mapTicket } from "../../mappers/support.mapper";
import type { SupportContext } from "../../dtos/support.dto";
import type { SupportRepository } from "../../repositories/interfaces/support.repository";
import { SupportApplicationError } from "../support-application.error";
import type { SupportOperationsSummaryReader, SupportServiceContract } from "../interfaces/support.service";
import type { EmailDispatcherPort } from "../../ports/email-dispatcher.port";

export class SupportService implements SupportServiceContract, SupportOperationsSummaryReader {
  constructor(
    private readonly repository: SupportRepository,
    private readonly customers: CustomerOperationsReader,
    private readonly orders: CustomerOrderOperationsReader,
    private readonly transactions: TransactionRunner,
    private readonly generateId: () => string,
    private readonly now: () => string,
    private readonly emailDispatcher?: EmailDispatcherPort,
  ) {}
  async list(query:{page:number;pageSize:number},context:SupportContext) { const scope=this.listScope(context); const result=await this.transactions.runReadOnly(s=>this.repository.list(s,{...query,...scope})); return {...result,items:result.items.map(mapTicket),page:query.page,pageSize:query.pageSize,totalPages:Math.max(1,Math.ceil(result.totalItems/query.pageSize))}; }
  async create(input:{customerId:string;orderId?:string;subject:string;description:string;priority:SupportTicket["priority"]},context:SupportContext) { this.allowCreate(context); if(await this.customers.get(input.customerId)===undefined) throw new SupportApplicationError("CUSTOMER_NOT_FOUND","Customer not found"); if(input.orderId!==undefined && await this.orders.getOwned(input.customerId,input.orderId)===undefined) throw new SupportApplicationError("ORDER_NOT_OWNED_BY_CUSTOMER","Order is not owned by customer"); return this.transactions.run(async s=>{const now=this.now();const ticket:SupportTicket={id:this.generateId(),...input,status:"new",version:1,createdById:context.actorId,slaPausedSeconds:0,slaStoppedSeconds:0,createdAt:now,updatedAt:now};await this.repository.create(s,ticket);await this.audit(s,ticket,context,"support.ticket.created",now);return mapTicket(ticket);}); }
  async detail(id:string,context:SupportContext) { return this.transactions.runReadOnly(async s=>{const ticket=await this.require(s,id);this.allowRead(context,ticket);const customer=await this.customers.getSupportContext(ticket.customerId);if(customer===undefined)throw new SupportApplicationError("CUSTOMER_NOT_FOUND","Customer not found");const [messages,events,order]=await Promise.all([this.repository.listMessages(s,id),this.repository.listEvents(s,id),ticket.orderId===undefined?undefined:this.orders.getOwned(ticket.customerId,ticket.orderId)]);return {ticket:mapTicket(ticket),context:{customer,...(order===undefined?{}:{order})},messages:messages.map(mapMessage),events:events.map(mapEvent)};}); }
  async claim(id:string,version:number,context:SupportContext) { this.allowOperate(context); return this.transactions.run(async s=>{const ticket=await this.require(s,id,true);if(ticket.assigneeId!==undefined&&ticket.assigneeId!==context.actorId)throw new SupportApplicationError("ALREADY_CLAIMED","Ticket is already claimed");if(ticket.assigneeId===context.actorId)return mapTicket(ticket);if(ticket.version!==version)throw new SupportApplicationError("STALE_VERSION","Ticket version is stale");const at=this.now();const updated=ticket.status==="escalated"?{...ticket,assigneeId:context.actorId,version:ticket.version+1,updatedAt:at}:{...transitionTicket(ticket,"assigned",context.actorId,at),assigneeId:context.actorId};if(!await this.repository.update(s,updated,version))throw new SupportApplicationError("STALE_VERSION","Ticket version is stale");await this.repository.appendEvent(s,{id:this.generateId(),ticketId:id,actorId:context.actorId,fromStatus:ticket.status,toStatus:updated.status,source:"manual",idempotencyKey:`claim:${id}:${version}`,occurredAt:updated.updatedAt});await this.audit(s,updated,context,"support.ticket.claimed",updated.updatedAt);return mapTicket(updated);}); }
  async transition(id:string,input:{status:SupportTicket["status"];version:number;idempotencyKey:string},context:SupportContext) { this.allowOperate(context); return this.transactions.run(async s=>{const ticket=await this.require(s,id,true);this.allowRead(context,ticket);const prior=await this.repository.findEventByKey(s,id,input.idempotencyKey);if(prior!==undefined)return mapTicket(ticket);if(ticket.version!==input.version)throw new SupportApplicationError("STALE_VERSION","Ticket version is stale");const updated=transitionTicket(ticket,input.status,context.actorId,this.now());if(!await this.repository.update(s,updated,input.version))throw new SupportApplicationError("STALE_VERSION","Ticket version is stale");await this.repository.appendEvent(s,{id:this.generateId(),ticketId:id,actorId:context.actorId,fromStatus:ticket.status,toStatus:updated.status,source:"manual",idempotencyKey:input.idempotencyKey,occurredAt:updated.updatedAt});await this.audit(s,updated,context,"support.ticket.transitioned",updated.updatedAt);return mapTicket(updated);}); }
  async reassign(id:string,input:{assigneeId?:string;version:number;idempotencyKey:string},context:SupportContext) { if(!context.roles.includes("administrator"))throw new SupportApplicationError("FORBIDDEN","Insufficient permissions");return this.transactions.run(async s=>{const ticket=await this.require(s,id,true);const prior=await this.repository.findEventByKey(s,id,input.idempotencyKey);if(prior!==undefined)return mapTicket(ticket);if(ticket.version!==input.version)throw new SupportApplicationError("STALE_VERSION","Ticket version is stale");const updated={...ticket,...(input.assigneeId===undefined?{assigneeId:undefined}:{assigneeId:input.assigneeId}),version:ticket.version+1,updatedAt:this.now()};if(!await this.repository.update(s,updated,input.version))throw new SupportApplicationError("STALE_VERSION","Ticket version is stale");await this.repository.appendEvent(s,{id:this.generateId(),ticketId:id,actorId:context.actorId,fromStatus:ticket.status,toStatus:ticket.status,source:"manual",idempotencyKey:input.idempotencyKey,occurredAt:updated.updatedAt});await this.audit(s,updated,context,"support.ticket.reassigned",updated.updatedAt);return mapTicket(updated);}); }
  async appendMessage(id:string,body:string,context:SupportContext) {
    this.allowOperate(context);
    const { message, ticket } = await this.transactions.run(async s=>{
      const ticket=await this.require(s,id,true);
      this.allowRead(context,ticket);
      if(ticket.status==="closed")throw new SupportApplicationError("TICKET_CLOSED","Closed tickets do not accept messages");
      const message={id:this.generateId(),ticketId:id,authorId:context.actorId,body,createdAt:this.now()};
      await this.repository.appendMessage(s,message);
      await this.audit(s,ticket,context,"support.ticket.message.appended",message.createdAt);
      return { message: mapMessage(message), ticket };
    });

    if (this.emailDispatcher && context.actorId !== "customer" && context.actorId !== "customer-email") {
      try {
        const customer = await this.customers.getSupportContext(ticket.customerId);
        if (customer?.email) {
          const shortId = ticket.id.slice(0, 8);
          await this.emailDispatcher.sendSupportResolutionEmail({
            to: customer.email,
            customerName: customer.fullName || "Quý khách",
            subject: `[Ticket #${shortId}] Phản hồi từ CSKH NovaCommerce: ${ticket.subject}`,
            textBody: `Kính gửi ${customer.fullName || "Quý khách"},\n\nĐội ngũ CSKH NovaCommerce vừa gửi phản hồi về yêu cầu hỗ trợ #${shortId}:\n\n"${body}"\n\nQuý khách có thể trả lời trực tiếp email này nếu cần hỗ trợ thêm.\n\nTrân trọng,\nNovaCommerce Support`,
            htmlBody: `
              <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #1e293b; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
                <h2 style="color: #2563eb; margin-top: 0;">NovaCommerce CSKH</h2>
                <p>Kính gửi <strong>${customer.fullName || "Quý khách"}</strong>,</p>
                <p>Đội ngũ CSKH xin gửi phản hồi về yêu cầu hỗ trợ <strong>#${shortId}</strong> (<em>${ticket.subject}</em>):</p>
                <div style="background-color: #f8fafc; border-left: 4px solid #3b82f6; padding: 15px; margin: 20px 0; border-radius: 4px; font-size: 15px;">
                  ${body.replace(/\n/g, "<br>")}
                </div>
                <p style="color: #64748b; font-size: 13px;">Quý khách chỉ cần bấm <strong>Trả lời (Reply)</strong> trực tiếp email này nếu cần phản hồi thêm.</p>
                <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 20px 0;" />
                <p style="font-size: 12px; color: #94a3b8; text-align: center;">Mã Ticket: #${ticket.id} · NovaCommerce Support Care</p>
              </div>
            `,
          });
        }
      } catch (emailErr) {
        console.error("[SupportService] Failed to dispatch email notification to customer:", emailErr);
      }
    }

    return message;
  }
  async summarize(asOf:string,start:string,end:string){return this.transactions.runReadOnly(s=>this.repository.countSummary(s,asOf,start,end));}
  private allowCreate(c:SupportContext){if(!c.roles.some(r=>r==="administrator"||r==="crm_operator"||r==="support_operator"))throw new SupportApplicationError("FORBIDDEN","Insufficient permissions");}
  private listScope(c:SupportContext){if(c.roles.includes("administrator"))return {};if(c.roles.includes("support_operator"))return {availableOrAssigneeId:c.actorId};throw new SupportApplicationError("FORBIDDEN","Insufficient permissions");}
  private allowQueue(c:SupportContext){if(!c.roles.some(r=>r==="administrator"||r==="support_operator"))throw new SupportApplicationError("FORBIDDEN","Insufficient permissions");}
  private allowOperate(c:SupportContext){this.allowQueue(c);}
  private allowRead(c:SupportContext,t:SupportTicket){if(c.roles.includes("administrator")||(c.roles.includes("support_operator")&&(t.assigneeId===undefined||t.assigneeId===c.actorId))||(c.roles.includes("crm_operator")&&t.createdById===c.actorId))return;if(c.roles.some(r=>r==="support_operator"||r==="crm_operator"))throw new SupportApplicationError("TICKET_NOT_OWNED","Ticket is not owned by this operator");throw new SupportApplicationError("FORBIDDEN","Insufficient permissions");}
  private async require(s:Parameters<SupportRepository["find"]>[0],id:string,lock=false){const t=await this.repository.find(s,id,lock);if(t===undefined)throw new SupportApplicationError("TICKET_NOT_FOUND","Ticket not found");return t;}
  private async audit(s:Parameters<SupportRepository["appendAudit"]>[0],t:SupportTicket,c:SupportContext,action:string,at:string){await this.repository.appendAudit(s,{id:this.generateId(),ticketId:t.id,actorId:c.actorId,action,resourceId:t.id,correlationId:c.correlationId,metadata:{},occurredAt:at});}
}
