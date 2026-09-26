// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { MigrationBuilder } from "node-pg-migrate";

export const upSql = `
ALTER TABLE merchandising_campaigns
  DROP CONSTRAINT IF EXISTS merchandising_campaigns_status_check;
ALTER TABLE merchandising_campaigns
  ADD CONSTRAINT merchandising_campaigns_status_check
  CHECK (status IN ('draft', 'active', 'scheduled', 'completed', 'reverted', 'rejected'));
`;

export const downSql = `
UPDATE merchandising_campaigns
SET status = 'draft', updated_at = NOW()
WHERE status IN ('scheduled', 'rejected');
ALTER TABLE merchandising_campaigns
  DROP CONSTRAINT IF EXISTS merchandising_campaigns_status_check;
ALTER TABLE merchandising_campaigns
  ADD CONSTRAINT merchandising_campaigns_status_check
  CHECK (status IN ('draft', 'active', 'completed', 'reverted'));
`;

export function up(pgm: MigrationBuilder): void {
  pgm.sql(upSql);
}

export function down(pgm: MigrationBuilder): void {
  pgm.sql(downSql);
}
