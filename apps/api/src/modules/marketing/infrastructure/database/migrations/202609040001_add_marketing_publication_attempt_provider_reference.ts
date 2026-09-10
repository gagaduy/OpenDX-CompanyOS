// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { MigrationBuilder } from "node-pg-migrate";

export function up(pgm: MigrationBuilder): void {
  pgm.sql(`
    ALTER TABLE marketing_publication_attempts
      ADD COLUMN provider_reference text CHECK (
        provider_reference IS NULL
        OR length(btrim(provider_reference)) BETWEEN 1 AND 255
      );
  `);
}

export function down(pgm: MigrationBuilder): void {
  pgm.sql(`
    ALTER TABLE marketing_publication_attempts
      DROP COLUMN IF EXISTS provider_reference;
  `);
}
