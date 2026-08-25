// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { MigrationBuilder } from "node-pg-migrate";

export function up(pgm: MigrationBuilder): void {
  pgm.addConstraint(
    "checkout_sessions",
    "checkout_sessions_source_cart_version_unique",
    { unique: ["source_cart_id", "source_cart_version"] },
  );
}

export function down(pgm: MigrationBuilder): void {
  pgm.dropConstraint(
    "checkout_sessions",
    "checkout_sessions_source_cart_version_unique",
  );
}
