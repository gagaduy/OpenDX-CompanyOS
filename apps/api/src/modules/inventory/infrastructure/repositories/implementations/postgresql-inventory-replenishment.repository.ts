// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { Pool } from "pg";
import type {
  CreateReplenishmentProposalInput,
  ReplenishmentProposalDto,
  ReplenishmentProposalItemDto,
  ReplenishmentProposalStatus,
} from "../../../application/dtos/inventory-replenishment.dto";
import type { InventoryReplenishmentRepositoryContract } from "../../../application/repositories/interfaces/inventory-replenishment.repository";

export class PostgresqlInventoryReplenishmentRepository implements InventoryReplenishmentRepositoryContract {
  constructor(private readonly db: Pool) {}

  async create(proposal: CreateReplenishmentProposalInput): Promise<void> {
    await this.db.query(
      `INSERT INTO inventory_replenishment_proposals (
        id, trigger_source, status, summary, risk_assessment, items, total_budget_vnd, docx_report_key, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())`,
      [
        proposal.id,
        proposal.triggerSource,
        proposal.status,
        proposal.summary,
        proposal.riskAssessment ?? null,
        JSON.stringify(proposal.items),
        proposal.totalBudgetVnd,
        proposal.docxReportKey ?? null,
      ],
    );
  }

  async findLatestPending(): Promise<ReplenishmentProposalDto | null> {
    const { rows } = await this.db.query(
      `SELECT id, trigger_source, status, summary, risk_assessment, items, total_budget_vnd, docx_report_key, created_at, updated_at, reviewed_at, reviewed_by
       FROM inventory_replenishment_proposals
       WHERE status = 'pending_review'
       ORDER BY created_at DESC
       LIMIT 1`,
    );
    if (rows.length === 0) return null;
    return this.mapRow(rows[0]);
  }

  async findById(id: string): Promise<ReplenishmentProposalDto | null> {
    const { rows } = await this.db.query(
      `SELECT id, trigger_source, status, summary, risk_assessment, items, total_budget_vnd, docx_report_key, created_at, updated_at, reviewed_at, reviewed_by
       FROM inventory_replenishment_proposals
       WHERE id = $1`,
      [id],
    );
    if (rows.length === 0) return null;
    return this.mapRow(rows[0]);
  }

  async updateStatus(id: string, status: ReplenishmentProposalStatus, reviewedBy?: string): Promise<void> {
    await this.db.query(
      `UPDATE inventory_replenishment_proposals
       SET status = $1, reviewed_by = $2, reviewed_at = NOW(), updated_at = NOW()
       WHERE id = $3`,
      [status, reviewedBy ?? null, id],
    );
  }

  private mapRow(row: any): ReplenishmentProposalDto {
    const rawItems = typeof row.items === "string" ? JSON.parse(row.items) : row.items;
    return {
      id: row.id,
      triggerSource: row.trigger_source,
      status: row.status,
      summary: row.summary,
      riskAssessment: row.risk_assessment ?? "",
      items: (rawItems as ReplenishmentProposalItemDto[]) ?? [],
      totalBudgetVnd: Number(row.total_budget_vnd),
      docxReportKey: row.docx_report_key ?? undefined,
      createdAt: new Date(row.created_at).toISOString(),
      updatedAt: new Date(row.updated_at).toISOString(),
      reviewedAt: row.reviewed_at ? new Date(row.reviewed_at).toISOString() : undefined,
      reviewedBy: row.reviewed_by ?? undefined,
    };
  }
}
