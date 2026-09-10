// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import { upSql, downSql } from "./202609100002_create_marketing_social_accounts";

describe("202609100002_create_marketing_social_accounts migration", () => {
  it("contains valid up SQL creating marketing_social_accounts table and indexes", () => {
    expect(upSql).toContain("CREATE TABLE IF NOT EXISTS marketing_social_accounts");
    expect(upSql).toContain("platform text NOT NULL CHECK (platform IN ('facebook', 'instagram'))");
    expect(upSql).toContain("token_status text NOT NULL CHECK (token_status IN (");
    expect(upSql).toContain("'healthy', 'expiring_soon', 'expired', 'invalid', 'unconfigured'");
    expect(upSql).toContain("marketing_social_accounts_platform_account_id_key UNIQUE (platform, account_id)");
    expect(upSql).toContain("idx_social_accounts_status");
    expect(upSql).toContain("idx_social_accounts_expires");
  });

  it("contains valid down SQL dropping marketing_social_accounts table", () => {
    expect(downSql).toContain("DROP TABLE IF EXISTS marketing_social_accounts CASCADE");
  });
});
