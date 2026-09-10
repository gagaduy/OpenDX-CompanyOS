// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { MigrationBuilder } from "node-pg-migrate";

export const upSql = `
  CREATE TABLE IF NOT EXISTS marketing_social_accounts (
    id uuid PRIMARY KEY,
    platform text NOT NULL CHECK (platform IN ('facebook', 'instagram')),
    account_id text NOT NULL CHECK (length(btrim(account_id)) BETWEEN 1 AND 255),
    account_name text NOT NULL CHECK (length(btrim(account_name)) BETWEEN 1 AND 255),
    access_token text NOT NULL CHECK (length(btrim(access_token)) >= 10),
    token_type text NOT NULL DEFAULT 'bearer',
    token_status text NOT NULL CHECK (token_status IN (
      'healthy', 'expiring_soon', 'expired', 'invalid', 'unconfigured'
    )),
    token_expires_at timestamptz,
    data_access_expires_at timestamptz,
    scopes jsonb NOT NULL DEFAULT '[]'::jsonb,
    is_long_lived boolean NOT NULL DEFAULT false,
    last_checked_at timestamptz,
    last_error text,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT marketing_social_accounts_platform_account_id_key UNIQUE (platform, account_id)
  );

  CREATE INDEX IF NOT EXISTS idx_social_accounts_status ON marketing_social_accounts(token_status);
  CREATE INDEX IF NOT EXISTS idx_social_accounts_expires ON marketing_social_accounts(token_expires_at);
`;

export const downSql = `
  DROP TABLE IF EXISTS marketing_social_accounts CASCADE;
`;

export function up(pgm: MigrationBuilder): void {
  pgm.sql(upSql);
}

export function down(pgm: MigrationBuilder): void {
  pgm.sql(downSql);
}
