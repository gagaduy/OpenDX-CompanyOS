// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { TransactionRunner } from "../../../../shared/database/transaction";
import type { SupportRepository } from "../../application/repositories/interfaces/support.repository";
import type { SupportAttachmentScanner } from "../../application/security/support-attachment-scanner";
import type { SupportAttachmentStorage } from "../../application/storage/support-attachment-storage";

export class SupportAttachmentScanWorker {
  private timer: ReturnType<typeof setInterval> | undefined;
  constructor(private readonly transactions:TransactionRunner,private readonly repository:SupportRepository,private readonly storage:SupportAttachmentStorage,private readonly scanner:SupportAttachmentScanner,private readonly generateId:()=>string,private readonly now:()=>string,private readonly intervalMs=30_000,private readonly onError:(e:unknown)=>void=()=>{}) {}
  start(){if(this.timer===undefined)this.timer=setInterval(()=>void this.tick().catch(this.onError),this.intervalMs);}
  stop(){if(this.timer!==undefined){clearInterval(this.timer);this.timer=undefined;}}
  async tick(){const at=this.now();const claims=await this.transactions.run(s=>this.repository.claimAttachmentsForScan(s,at,20));for(const claim of claims){try{const stream=await this.storage.open(claim.objectKey);const result=await this.scanner.scan(stream);if(result.status==="clean"){await this.transactions.run(async s=>{if(await this.repository.markAttachmentClean(s,claim.id,claim.version,at))await this.repository.appendAudit(s,{id:this.generateId(),ticketId:claim.ticketId,actorId:"support-attachment-scanner",action:"support.attachment.clean",resourceId:claim.id,correlationId:`scan:${claim.id}`,metadata:{},occurredAt:at});});}else{await this.storage.delete(claim.objectKey).catch(()=>undefined);await this.transactions.run(async s=>{if(await this.repository.markAttachmentRejected(s,claim.id,claim.version,at))await this.repository.appendAudit(s,{id:this.generateId(),ticketId:claim.ticketId,actorId:"support-attachment-scanner",action:"support.attachment.rejected",resourceId:claim.id,correlationId:`scan:${claim.id}`,metadata:{signature:result.signature},occurredAt:at});});}}catch(error){this.onError(error);}}return claims.length;}
}
