// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { MigrationBuilder } from "node-pg-migrate";

export function up(pgm: MigrationBuilder): void {
  pgm.sql(`
    CREATE TABLE agentic_command_activity_events (
      id uuid PRIMARY KEY,
      actor_id text NOT NULL,
      department text NOT NULL CHECK (department IN ('marketing','merchandising','operations','support')),
      decision text NOT NULL CHECK (decision IN ('approved','canceled')),
      resource_type text NOT NULL CHECK (resource_type IN ('marketing_campaign','merchandising_proposal','operations_proposal','support_proposal')),
      resource_id text NOT NULL CHECK (char_length(resource_id) BETWEEN 1 AND 255),
      summary text NOT NULL CHECK (char_length(summary) BETWEEN 1 AND 240 AND summary = btrim(summary)),
      idempotency_key text NOT NULL UNIQUE CHECK (char_length(idempotency_key) BETWEEN 1 AND 255),
      occurred_at timestamptz NOT NULL
    );
    CREATE INDEX agentic_command_activity_recent_idx
      ON agentic_command_activity_events (occurred_at DESC, id DESC);
    CREATE TRIGGER agentic_command_activity_immutable
      BEFORE UPDATE OR DELETE ON agentic_command_activity_events
      FOR EACH ROW EXECUTE FUNCTION agentic_prevent_mutation();
  `);
}

export function down(pgm: MigrationBuilder): void {
  pgm.sql(`
    DROP TRIGGER IF EXISTS agentic_command_activity_immutable ON agentic_command_activity_events;
    DROP TABLE agentic_command_activity_events;
  `);
}
