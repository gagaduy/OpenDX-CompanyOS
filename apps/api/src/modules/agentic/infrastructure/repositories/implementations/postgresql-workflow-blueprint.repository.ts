// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { Pool } from "pg";
import { ApplicationError } from "../../../../../shared/http/application-error";
import type {
  WorkflowBlueprintDto,
  SaveWorkflowDraftDto,
  PublishWorkflowDto,
} from "../../../application/dtos/workflow-blueprint.dto";
import type { WorkflowBlueprintRepository } from "../../../application/repositories/interfaces/workflow-blueprint.repository";

interface WorkflowBlueprintRow {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly category: string;
  readonly description: string | null;
  readonly target_outcome: string | null;
  readonly version: string;
  readonly status: "draft" | "published";
  readonly nodes: unknown;
  readonly edges: unknown;
  readonly policy_rules: unknown;
  readonly published_at: Date | string;
  readonly created_at: Date | string;
  readonly updated_at: Date | string;
  readonly updated_by: string | null;
}

function mapRowToDto(row: WorkflowBlueprintRow): WorkflowBlueprintDto {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    category: row.category,
    description: row.description ?? "",
    targetOutcome: row.target_outcome ?? "",
    version: row.version,
    status: row.status,
    nodes: typeof row.nodes === "string" ? JSON.parse(row.nodes) : (row.nodes as readonly unknown[] ?? []),
    edges: typeof row.edges === "string" ? JSON.parse(row.edges) : (row.edges as readonly unknown[] ?? []),
    policyRules: typeof row.policy_rules === "string" ? JSON.parse(row.policy_rules) : (row.policy_rules as Record<string, unknown> ?? {}),
    publishedAt: new Date(row.published_at).toISOString(),
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
    updatedBy: row.updated_by ?? undefined,
  };
}

export class PostgresqlWorkflowBlueprintRepository implements WorkflowBlueprintRepository {
  constructor(private readonly pool: Pool) {}

  async listBlueprints(): Promise<readonly WorkflowBlueprintDto[]> {
    const result = await this.pool.query<WorkflowBlueprintRow>(`
      SELECT id, code, name, category, description, target_outcome, version, status,
             nodes, edges, policy_rules, published_at, created_at, updated_at, updated_by
      FROM workflow_blueprints
      ORDER BY created_at ASC
    `);
    return result.rows.map(mapRowToDto);
  }

  async findById(id: string): Promise<WorkflowBlueprintDto | null> {
    const result = await this.pool.query<WorkflowBlueprintRow>(`
      SELECT id, code, name, category, description, target_outcome, version, status,
             nodes, edges, policy_rules, published_at, created_at, updated_at, updated_by
      FROM workflow_blueprints
      WHERE id = $1
    `, [id]);

    if (result.rows.length === 0) return null;
    return mapRowToDto(result.rows[0]);
  }

  async findByCode(code: string): Promise<WorkflowBlueprintDto | null> {
    const result = await this.pool.query<WorkflowBlueprintRow>(`
      SELECT id, code, name, category, description, target_outcome, version, status,
             nodes, edges, policy_rules, published_at, created_at, updated_at, updated_by
      FROM workflow_blueprints
      WHERE code = $1
    `, [code]);

    if (result.rows.length === 0) return null;
    return mapRowToDto(result.rows[0]);
  }

  async saveDraft(id: string, draft: SaveWorkflowDraftDto): Promise<WorkflowBlueprintDto> {
    const existing = await this.findById(id);
    if (!existing) {
      throw new ApplicationError(404, "WORKFLOW_NOT_FOUND", `Workflow blueprint '${id}' not found`);
    }

    const nodesJson = draft.nodes !== undefined ? JSON.stringify(draft.nodes) : null;
    const edgesJson = draft.edges !== undefined ? JSON.stringify(draft.edges) : null;
    const policyRulesJson = draft.policyRules !== undefined ? JSON.stringify(draft.policyRules) : null;

    const result = await this.pool.query<WorkflowBlueprintRow>(`
      UPDATE workflow_blueprints
      SET nodes = COALESCE($2::jsonb, nodes),
          edges = COALESCE($3::jsonb, edges),
          policy_rules = COALESCE($4::jsonb, policy_rules),
          description = COALESCE($5, description),
          target_outcome = COALESCE($6, target_outcome),
          status = 'draft',
          updated_at = NOW(),
          updated_by = $7
      WHERE id = $1
      RETURNING id, code, name, category, description, target_outcome, version, status,
                nodes, edges, policy_rules, published_at, created_at, updated_at, updated_by
    `, [
      id,
      nodesJson,
      edgesJson,
      policyRulesJson,
      draft.description ?? null,
      draft.targetOutcome ?? null,
      draft.updatedBy ?? null,
    ]);

    return mapRowToDto(result.rows[0]);
  }

  async publish(id: string, publish: PublishWorkflowDto): Promise<WorkflowBlueprintDto> {
    const existing = await this.findById(id);
    if (!existing) {
      throw new ApplicationError(404, "WORKFLOW_NOT_FOUND", `Workflow blueprint '${id}' not found`);
    }

    const nodesJson = JSON.stringify(publish.nodes);
    const edgesJson = JSON.stringify(publish.edges);
    const policyRulesJson = publish.policyRules !== undefined ? JSON.stringify(publish.policyRules) : null;

    const result = await this.pool.query<WorkflowBlueprintRow>(`
      UPDATE workflow_blueprints
      SET nodes = $2::jsonb,
          edges = $3::jsonb,
          policy_rules = COALESCE($4::jsonb, policy_rules),
          version = COALESCE($5, version),
          status = 'published',
          published_at = NOW(),
          updated_at = NOW(),
          updated_by = $6
      WHERE id = $1
      RETURNING id, code, name, category, description, target_outcome, version, status,
                nodes, edges, policy_rules, published_at, created_at, updated_at, updated_by
    `, [
      id,
      nodesJson,
      edgesJson,
      policyRulesJson,
      publish.version ?? null,
      publish.updatedBy ?? null,
    ]);

    return mapRowToDto(result.rows[0]);
  }
}
