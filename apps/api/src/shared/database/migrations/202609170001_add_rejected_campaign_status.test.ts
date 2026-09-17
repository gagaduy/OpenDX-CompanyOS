// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it, vi } from "vitest";
import { down, downSql, up, upSql } from "./202609170001_add_rejected_campaign_status";

describe("202609170001_add_rejected_campaign_status migration", () => {
  it("allows rejected and scheduled campaign lifecycle states", () => {
    expect(upSql).toContain("'rejected'");
    expect(upSql).toContain("'scheduled'");
    expect(upSql).toContain("merchandising_campaigns_status_check");
  });

  it("restores the original campaign status constraint on rollback", () => {
    expect(downSql).toContain("'draft', 'active', 'completed', 'reverted'");
  });

  it("uses the node-pg-migrate builder contract scanned by the catalog runner", () => {
    const pgm = { sql: vi.fn() };

    up(pgm as never);
    down(pgm as never);

    expect(pgm.sql).toHaveBeenNthCalledWith(1, upSql);
    expect(pgm.sql).toHaveBeenNthCalledWith(2, downSql);
  });
});
