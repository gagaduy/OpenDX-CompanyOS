// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import { upSql, downSql } from "./202609090001_create_merchandising_campaigns";

describe("202609090001_create_merchandising_campaigns migration", () => {
  it("contains valid up SQL creating tables and indexes", () => {
    expect(upSql).toContain("CREATE TABLE IF NOT EXISTS merchandising_campaigns");
    expect(upSql).toContain("CREATE TABLE IF NOT EXISTS merchandising_campaign_items");
    expect(upSql).toContain("idx_merchandising_campaigns_status_dates");
    expect(upSql).toContain("idx_campaign_items_campaign_id");
  });

  it("contains valid down SQL dropping tables and indexes", () => {
    expect(downSql).toContain("DROP TABLE IF EXISTS merchandising_campaign_items CASCADE");
    expect(downSql).toContain("DROP TABLE IF EXISTS merchandising_campaigns CASCADE");
  });
});
