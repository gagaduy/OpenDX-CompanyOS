// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it, vi } from "vitest";
import type { Pool } from "pg";
import { PostgresqlWorkflowBlueprintRepository } from "./postgresql-workflow-blueprint.repository";

describe("PostgresqlWorkflowBlueprintRepository", () => {
  const mockRow = {
    id: "wf-customer-recovery-v1",
    code: "WF-CSKH-RECOVERY",
    name: "Cứu Khách Hàng Khiếu Nại",
    category: "customer_recovery",
    description: "Tự động phân loại bức xúc",
    target_outcome: "Xoa dịu khách hàng trong 5 phút",
    version: "v1.0",
    status: "published" as const,
    nodes: [{ id: "node-1", type: "event" }],
    edges: [{ id: "e1-2", source: "node-1", target: "node-2" }],
    policy_rules: { auto_approval_threshold: 200000 },
    published_at: "2026-09-25T09:00:00.000Z",
    created_at: "2026-09-25T09:00:00.000Z",
    updated_at: "2026-09-25T09:00:00.000Z",
    updated_by: "system",
  };

  it("lists all workflow blueprints", async () => {
    const mockPool = {
      query: vi.fn().mockResolvedValue({ rows: [mockRow] }),
    } as unknown as Pool;

    const repo = new PostgresqlWorkflowBlueprintRepository(mockPool);
    const result = await repo.listBlueprints();

    expect(result).toHaveLength(1);
    expect(result[0].code).toBe("WF-CSKH-RECOVERY");
    expect(result[0].policyRules).toEqual({ auto_approval_threshold: 200000 });
  });

  it("finds blueprint by code", async () => {
    const mockPool = {
      query: vi.fn().mockResolvedValue({ rows: [mockRow] }),
    } as unknown as Pool;

    const repo = new PostgresqlWorkflowBlueprintRepository(mockPool);
    const result = await repo.findByCode("WF-CSKH-RECOVERY");

    expect(result).not.toBeNull();
    expect(result?.name).toBe("Cứu Khách Hàng Khiếu Nại");
  });

  it("saves a draft update", async () => {
    const mockPool = {
      query: vi
        .fn()
        .mockResolvedValueOnce({ rows: [mockRow] }) // findById
        .mockResolvedValueOnce({
          rows: [
            {
              ...mockRow,
              status: "draft",
              policy_rules: { auto_approval_threshold: 500000 },
            },
          ],
        }), // update
    } as unknown as Pool;

    const repo = new PostgresqlWorkflowBlueprintRepository(mockPool);
    const result = await repo.saveDraft("wf-customer-recovery-v1", {
      policyRules: { auto_approval_threshold: 500000 },
      updatedBy: "operator-1",
    });

    expect(result.status).toBe("draft");
    expect(result.policyRules).toEqual({ auto_approval_threshold: 500000 });
  });

  it("publishes and activates a blueprint with incremented version", async () => {
    const mockPool = {
      query: vi
        .fn()
        .mockResolvedValueOnce({ rows: [mockRow] }) // findById
        .mockResolvedValueOnce({
          rows: [
            {
              ...mockRow,
              version: "v1.1",
              status: "published",
              policy_rules: { auto_approval_threshold: 500000 },
            },
          ],
        }), // update
    } as unknown as Pool;

    const repo = new PostgresqlWorkflowBlueprintRepository(mockPool);
    const result = await repo.publish("wf-customer-recovery-v1", {
      nodes: mockRow.nodes,
      edges: mockRow.edges,
      version: "v1.1",
      policyRules: { auto_approval_threshold: 500000 },
      updatedBy: "operator-1",
    });

    expect(result.status).toBe("published");
    expect(result.version).toBe("v1.1");
  });
});
