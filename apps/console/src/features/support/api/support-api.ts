// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { ZodType } from "zod";
import { mapAttachment, mapDetail, mapMessage, mapTicket, mapTicketPage } from "../mappers/support.mapper";
import { supportAttachmentEnvelopeSchema, supportDetailEnvelopeSchema, supportErrorEnvelopeSchema, supportMessageEnvelopeSchema, supportPageEnvelopeSchema, supportTicketEnvelopeSchema } from "../schemas/support-api.schema";
import type {
  SupportAttachmentView,
  SupportMessageView,
  SupportQuery,
  SupportTicketCreateInput,
  SupportTicketDetailView,
  SupportTicketPageView,
  SupportTicketView,
  TicketStatus,
  AiSupportProposalView,
} from "../types/support.types";

export type SupportErrorCode = "UNAUTHORIZED"|"FORBIDDEN"|"STALE_VERSION"|"ALREADY_CLAIMED"|"TICKET_NOT_FOUND"|"VALIDATION_ERROR"|"ATTACHMENT_TOO_LARGE"|"ATTACHMENT_TYPE_NOT_ALLOWED"|"INVALID_RESPONSE"|"UNAVAILABLE";
export class SupportApiError extends Error { constructor(readonly code: SupportErrorCode, message: string) { super(message); this.name = "SupportApiError"; } }
export interface SupportOperationsApi {
  list(query:SupportQuery, signal?:AbortSignal):Promise<SupportTicketPageView>;
  create(input:SupportTicketCreateInput):Promise<SupportTicketView>;
  detail(ticketId:string, signal?:AbortSignal):Promise<SupportTicketDetailView>;
  claim(ticketId:string, version:number):Promise<SupportTicketView>;
  update(ticketId:string, input:{status?:TicketStatus; assigneeId?:string; version:number; idempotencyKey:string}):Promise<SupportTicketView>;
  message(ticketId:string, body:string):Promise<SupportMessageView>;
  uploadAttachment(ticketId:string, file:File):Promise<SupportAttachmentView>;
  downloadAttachment(ticketId:string, attachmentId:string):Promise<Blob>;
  generateSupportProposal(prompt: string): Promise<AiSupportProposalView>;
  downloadSupportDocx(proposalId: string, filename: string): Promise<void>;
  applySupportProposal(proposalId: string, items: readonly { ticketId: string; responseMessage?: string; resolutionStatus?: string }[]): Promise<any>;
  subscribeEvents?(ticketId: string, onEvent: (event: any) => void, signal?: AbortSignal): void;
}
export function createSupportOperationsApi(baseUrl:string, accessToken:string):SupportOperationsApi {
  const request=createRequest(baseUrl,accessToken);
  return {
    async list(query,signal){const p=new URLSearchParams({page:String(query.page),pageSize:String(query.pageSize)}); if(query.status)p.set("status",query.status); if(query.priority)p.set("priority",query.priority); if(query.assignment)p.set("assignment",query.assignment); return mapTicketPage(parse(supportPageEnvelopeSchema,await request(`/v1/admin/support/tickets?${p}`,{signal})).data as SupportTicketPageView);},
    async create(input){return mapTicket(parse(supportTicketEnvelopeSchema,await request("/v1/admin/support/tickets",{method:"POST",body:JSON.stringify(input)})).data as SupportTicketView);},
    async detail(id,signal){return mapDetail(parse(supportDetailEnvelopeSchema,await request(`/v1/admin/support/tickets/${id}`,{signal})).data as SupportTicketDetailView);},
    async claim(id,version){return mapTicket(parse(supportTicketEnvelopeSchema,await request(`/v1/admin/support/tickets/${id}/claim`,{method:"POST",body:JSON.stringify({version})})).data as SupportTicketView);},
    async update(id,input){return mapTicket(parse(supportTicketEnvelopeSchema,await request(`/v1/admin/support/tickets/${id}`,{method:"PATCH",body:JSON.stringify(input)})).data as SupportTicketView);},
    async message(id,body){return mapMessage(parse(supportMessageEnvelopeSchema,await request(`/v1/admin/support/tickets/${id}/messages`,{method:"POST",body:JSON.stringify({body})})).data as SupportMessageView);},
    async uploadAttachment(id,file){const body=new FormData(); body.append("file",file); return mapAttachment(parse(supportAttachmentEnvelopeSchema,await request(`/v1/admin/support/tickets/${id}/attachments`,{method:"POST",body,skipJson:true})).data as SupportAttachmentView);},
    async downloadAttachment(id,attachmentId){return requestBlob(`/v1/admin/support/tickets/${id}/attachments/${attachmentId}/content`);},
    async generateSupportProposal(prompt: string): Promise<AiSupportProposalView> {
      const envelope: any = await request("/v1/admin/support/tickets/ai-proposal", {
        method: "POST",
        body: JSON.stringify({ prompt }),
      });
      return envelope.data as AiSupportProposalView;
    },
    async downloadSupportDocx(proposalId: string, filename: string): Promise<void> {
      const response = await fetch(`${baseUrl}/v1/admin/support/tickets/ai-proposal/${proposalId}/docx`, {
        headers: { authorization: `Bearer ${accessToken}`, "x-correlation-id": crypto.randomUUID() },
      });
      if (!response.ok) throw new SupportApiError("UNAVAILABLE", "Failed to download DOCX report.");
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename || `bao_cao_cskh_${proposalId.slice(0, 8)}.docx`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    },
    async applySupportProposal(proposalId: string, items: readonly { ticketId: string; responseMessage?: string; resolutionStatus?: string }[]): Promise<any> {
      const envelope: any = await request(`/v1/admin/support/tickets/ai-proposal/${proposalId}/apply`, {
        method: "POST",
        body: JSON.stringify({ items }),
      });
      return envelope.data;
    },
    subscribeEvents(id: string, onEvent: (event: any) => void, signal?: AbortSignal) {
      void (async () => {
        try {
          const response = await fetch(`${baseUrl}/v1/admin/support/tickets/${id}/events`, {
            headers: { authorization: `Bearer ${accessToken}`, Accept: "text/event-stream" },
            signal,
          });
          if (!response.ok || !response.body) return;
          const reader = response.body.getReader();
          const decoder = new TextDecoder();
          let buffer = "";
          while (!signal?.aborted) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n\n");
            buffer = lines.pop() || "";
            for (const line of lines) {
              const trimmed = line.trim();
              if (trimmed.startsWith("data: ")) {
                try {
                  const event = JSON.parse(trimmed.slice(6));
                  onEvent(event);
                } catch {}
              }
            }
          }
        } catch {}
      })();
    },
  };
  function requestBlob(path:string){return fetch(`${baseUrl}${path}`,{headers:{authorization:`Bearer ${accessToken}`,"x-correlation-id":crypto.randomUUID()}}).then(async r=>{if(!r.ok)throw new SupportApiError("UNAVAILABLE","Attachment could not be downloaded."); return r.blob();});}
}
function createRequest(baseUrl:string, accessToken:string){ return async(path:string, init?:RequestInit&{skipJson?:boolean}):Promise<unknown>=>{ let response:Response; try{ const headers:Record<string,string>={authorization:`Bearer ${accessToken}`,"x-correlation-id":crypto.randomUUID()}; if(init?.skipJson!==true)headers["content-type"]="application/json"; response=await fetch(`${baseUrl}${path}`,{...init,headers:{...headers,...init?.headers}}); }catch(error){ if(error instanceof DOMException&&error.name==="AbortError")throw error; throw new SupportApiError("UNAVAILABLE","Support service is unavailable."); } const body:unknown=await response.json().catch(()=>undefined); if(!response.ok){ const parsed=supportErrorEnvelopeSchema.safeParse(body); const code=parsed.success?normalize(parsed.data.errorCode):"UNAVAILABLE"; const msg=(body as any)?.message||(body as any)?.error?.message||(body as any)?.errorMessage||message(code); throw new SupportApiError(code,msg); } return body; }; }
function parse<T>(schema:ZodType<T>, value:unknown):T{ const parsed=schema.safeParse(value); if(!parsed.success)throw new SupportApiError("INVALID_RESPONSE","Invalid support response."); return parsed.data; }
function normalize(code:string):SupportErrorCode{ return ["UNAUTHORIZED","FORBIDDEN","STALE_VERSION","ALREADY_CLAIMED","TICKET_NOT_FOUND","VALIDATION_ERROR","ATTACHMENT_TOO_LARGE","ATTACHMENT_TYPE_NOT_ALLOWED"].includes(code)?code as SupportErrorCode:"UNAVAILABLE"; }
function message(code:SupportErrorCode){ if(code==="FORBIDDEN")return "Permission denied."; if(code==="STALE_VERSION"||code==="ALREADY_CLAIMED")return "Refresh required."; if(code==="ATTACHMENT_TOO_LARGE")return "Attachment is too large."; if(code==="ATTACHMENT_TYPE_NOT_ALLOWED")return "Attachment type is not allowed."; return "Support request could not be completed."; }
