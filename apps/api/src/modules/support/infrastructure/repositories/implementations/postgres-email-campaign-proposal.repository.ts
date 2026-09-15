// apps/api/src/modules/support/infrastructure/repositories/implementations/postgres-email-campaign-proposal.repository.ts
// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { Pool } from "pg";
import type {
  CampaignProposalStatus,
  SupportEmailCampaignProposal,
} from "../../../domain/entities/email-campaign.entity";
import type { EmailCampaignProposalRepository } from "../../../application/repositories/interfaces/email-campaign-proposal.repository";

interface ProposalRow {
  id: string;
  type: string;
  title: string;
  email_subject: string;
  target_segment: string;
  recipients: any;
  total_recipients: number;
  selected_count: number;
  featured_products: any;
  promotion_details: any;
  html_content: string;
  docx_filename: string;
  status: string;
  created_at: Date | string;
  updated_at: Date | string;
  sent_at: Date | string | null;
  execution_summary: any;
}

export class PostgresEmailCampaignProposalRepository
  implements EmailCampaignProposalRepository
{
  private readonly memoryStore = new Map<string, SupportEmailCampaignProposal>();

  constructor(private readonly pool?: Pool) {}

  async save(proposal: SupportEmailCampaignProposal): Promise<void> {
    if (!this.pool) {
      this.memoryStore.set(proposal.id, proposal);
      return;
    }

    await this.pool.query(
      `INSERT INTO support_email_campaign_proposals (
        id, type, title, email_subject, target_segment, recipients,
        total_recipients, selected_count, featured_products, promotion_details,
        html_content, docx_filename, status, created_at, updated_at, sent_at,
        execution_summary
      ) VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9::jsonb, $10::jsonb, $11, $12, $13, $14, $15, $16, $17::jsonb)
      ON CONFLICT (id) DO UPDATE SET
        title = EXCLUDED.title,
        email_subject = EXCLUDED.email_subject,
        recipients = EXCLUDED.recipients,
        total_recipients = EXCLUDED.total_recipients,
        selected_count = EXCLUDED.selected_count,
        featured_products = EXCLUDED.featured_products,
        promotion_details = EXCLUDED.promotion_details,
        html_content = EXCLUDED.html_content,
        docx_filename = EXCLUDED.docx_filename,
        status = EXCLUDED.status,
        updated_at = EXCLUDED.updated_at,
        sent_at = EXCLUDED.sent_at,
        execution_summary = EXCLUDED.execution_summary`,
      [
        proposal.id,
        proposal.type,
        proposal.title,
        proposal.emailSubject,
        proposal.targetSegment,
        JSON.stringify(proposal.recipients),
        proposal.totalRecipients,
        proposal.selectedCount,
        JSON.stringify(proposal.featuredProducts),
        proposal.promotionDetails ? JSON.stringify(proposal.promotionDetails) : null,
        proposal.htmlContent,
        proposal.docxFilename,
        proposal.status,
        proposal.createdAt,
        proposal.updatedAt,
        proposal.sentAt ?? null,
        proposal.executionSummary ? JSON.stringify(proposal.executionSummary) : null,
      ],
    );
  }

  async findById(id: string): Promise<SupportEmailCampaignProposal | undefined> {
    if (!this.pool) {
      return this.memoryStore.get(id);
    }

    const res = await this.pool.query<ProposalRow>(
      `SELECT * FROM support_email_campaign_proposals WHERE id = $1 LIMIT 1`,
      [id],
    );

    if (res.rows.length === 0) {
      return undefined;
    }

    return this.mapRow(res.rows[0]);
  }

  async list(filter?: {
    status?: CampaignProposalStatus;
    limit?: number;
  }): Promise<readonly SupportEmailCampaignProposal[]> {
    if (!this.pool) {
      let items = Array.from(this.memoryStore.values());
      if (filter?.status) {
        items = items.filter((p) => p.status === filter.status);
      }
      items.sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );
      if (filter?.limit) {
        items = items.slice(0, filter.limit);
      }
      return items;
    }

    const conditions: string[] = [];
    const values: unknown[] = [];

    if (filter?.status) {
      values.push(filter.status);
      conditions.push(`status = $${values.length}`);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const limit = filter?.limit ? `LIMIT ${Number(filter.limit)}` : "";

    const res = await this.pool.query<ProposalRow>(
      `SELECT * FROM support_email_campaign_proposals ${where} ORDER BY created_at DESC ${limit}`,
      values,
    );

    return res.rows.map((row) => this.mapRow(row));
  }

  private mapRow(row: ProposalRow): SupportEmailCampaignProposal {
    return {
      id: row.id,
      type: row.type as any,
      title: row.title,
      emailSubject: row.email_subject,
      targetSegment: row.target_segment as any,
      recipients: typeof row.recipients === "string" ? JSON.parse(row.recipients) : row.recipients,
      totalRecipients: Number(row.total_recipients),
      selectedCount: Number(row.selected_count),
      featuredProducts: typeof row.featured_products === "string" ? JSON.parse(row.featured_products) : (row.featured_products || []),
      promotionDetails: row.promotion_details
        ? (typeof row.promotion_details === "string" ? JSON.parse(row.promotion_details) : row.promotion_details)
        : undefined,
      htmlContent: row.html_content,
      docxFilename: row.docx_filename,
      status: row.status as any,
      createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
      updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : String(row.updated_at),
      sentAt: row.sent_at ? (row.sent_at instanceof Date ? row.sent_at.toISOString() : String(row.sent_at)) : undefined,
      executionSummary: row.execution_summary
        ? (typeof row.execution_summary === "string" ? JSON.parse(row.execution_summary) : row.execution_summary)
        : undefined,
    };
  }
}
