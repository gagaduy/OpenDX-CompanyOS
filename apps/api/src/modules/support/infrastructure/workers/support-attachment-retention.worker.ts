// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { TransactionRunner } from "../../../../shared/database/transaction";
import type { SupportRepository } from "../../application/repositories/interfaces/support.repository";
import type { SupportAttachmentStorage } from "../../application/storage/support-attachment-storage";

export class SupportAttachmentRetentionWorker {
  private timer: ReturnType<typeof setInterval> | undefined;
  constructor(private readonly transactions:TransactionRunner,private readonly repository:SupportRepository,private readonly storage:SupportAttachmentStorage,private readonly generateId:()=>string,private readonly now:()=>string,private readonly intervalMs=3_600_000,private readonly onError:(e:unknown)=>void=()=>{}) {}
  start(){if(this.timer===undefined)this.timer=setInterval(()=>void this.tick().catch(this.onError),this.intervalMs);}
  stop(){if(this.timer!==undefined){clearInterval(this.timer);this.timer=undefined;}}
  async tick(){const at=this.now();const claims=await this.transactions.run(s=>this.repository.claimAttachmentsForRetention(s,at,20));for(const claim of claims){await this.storage.delete(claim.objectKey).catch(()=>undefined);await this.transactions.run(async s=>{if(await this.repository.markAttachmentDeleted(s,claim.id,claim.version,at))await this.repository.appendAudit(s,{id:this.generateId(),ticketId:claim.ticketId,actorId:"support-attachment-retention",action:"support.attachment.deleted",resourceId:claim.id,correlationId:`retention:${claim.id}`,metadata:{},occurredAt:at});});}return claims.length;}
}
