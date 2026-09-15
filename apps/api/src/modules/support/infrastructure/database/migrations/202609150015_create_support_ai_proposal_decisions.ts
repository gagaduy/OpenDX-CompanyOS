// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { MigrationBuilder } from "node-pg-migrate";

export function up(pgm: MigrationBuilder): void {
  pgm.sql(`
    CREATE TABLE support_ai_proposal_decisions (
      id uuid PRIMARY KEY,
      proposal_id text NOT NULL UNIQUE CHECK (length(btrim(proposal_id)) BETWEEN 1 AND 255),
      actor_id text NOT NULL CHECK (length(btrim(actor_id)) BETWEEN 1 AND 255),
      occurred_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX support_ai_proposal_decisions_recent_idx
      ON support_ai_proposal_decisions (occurred_at DESC, id DESC);
    CREATE FUNCTION support_ai_proposal_decisions_immutable() RETURNS trigger
      LANGUAGE plpgsql AS $f$ BEGIN
        RAISE EXCEPTION 'Support proposal decisions are immutable' USING ERRCODE='P0001';
      END; $f$;
    CREATE TRIGGER support_ai_proposal_decisions_immutable_trigger
      BEFORE UPDATE OR DELETE ON support_ai_proposal_decisions
      FOR EACH ROW EXECUTE FUNCTION support_ai_proposal_decisions_immutable();
  `);
}

export function down(pgm: MigrationBuilder): void {
  pgm.sql(`
    DROP TABLE support_ai_proposal_decisions;
    DROP FUNCTION support_ai_proposal_decisions_immutable();
  `);
}
