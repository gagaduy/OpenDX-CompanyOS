// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { MigrationBuilder } from "node-pg-migrate";

export function up(pgm: MigrationBuilder): void {
  pgm.dropConstraint("products", "products_status_check");
  pgm.addConstraint("products", "products_status_check", {
    check: "status IN ('draft', 'published', 'archived')",
  });
}

export function down(pgm: MigrationBuilder): void {
  pgm.sql("UPDATE products SET status = 'draft' WHERE status = 'published'");
  pgm.dropConstraint("products", "products_status_check");
  pgm.addConstraint("products", "products_status_check", {
    check: "status IN ('draft', 'archived')",
  });
}
