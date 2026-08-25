// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { MigrationBuilder } from "node-pg-migrate";

export function up(pgm: MigrationBuilder): void {
  pgm.sql(`
    CREATE TABLE agentic_staff_intake_idempotency (
      kind text NOT NULL CHECK(kind IN ('task_intake','file_upload')),
      actor_id text NOT NULL CHECK(length(btrim(actor_id)) BETWEEN 1 AND 255),
      idempotency_key text NOT NULL
        CHECK(idempotency_key ~ '^[A-Za-z0-9][A-Za-z0-9:._/-]{0,254}$'),
      request_digest text NOT NULL CHECK(request_digest ~ '^[a-f0-9]{64}$'),
      resource_id uuid NOT NULL,
      created_at timestamptz NOT NULL CHECK(isfinite(created_at)),
      PRIMARY KEY(kind, actor_id, idempotency_key)
    );
    CREATE TRIGGER agentic_staff_intake_idempotency_immutable
      BEFORE UPDATE OR DELETE ON agentic_staff_intake_idempotency
      FOR EACH ROW EXECUTE FUNCTION agentic_prevent_mutation();
  `);
}

export function down(pgm: MigrationBuilder): void {
  pgm.sql("DROP TABLE IF EXISTS agentic_staff_intake_idempotency;");
}
