// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { MigrationBuilder } from "node-pg-migrate";

export function up(pgm: MigrationBuilder): void {
  pgm.sql(`
    ALTER TABLE agentic_approval_requests ADD COLUMN approver_scope text;
    UPDATE agentic_approval_requests
      SET approver_scope = CASE WHEN action='revocation.create'
        THEN 'emergency_revocation' ELSE 'tool_invocation' END;
    ALTER TABLE agentic_approval_requests ALTER COLUMN approver_scope SET NOT NULL;
    ALTER TABLE agentic_approval_requests ADD CONSTRAINT agentic_approval_scope_check
      CHECK (approver_scope IN ('tool_invocation','emergency_revocation','governance_configuration'));

    CREATE FUNCTION agentic_prevent_agent_mutation() RETURNS trigger LANGUAGE plpgsql AS $f$
      BEGIN RAISE EXCEPTION 'Agent identities are immutable' USING ERRCODE='P0001'; END; $f$;
    CREATE TRIGGER agentic_agents_immutable
      BEFORE UPDATE OR DELETE ON agentic_agents
      FOR EACH ROW EXECUTE FUNCTION agentic_prevent_agent_mutation();
  `);
}

export function down(pgm: MigrationBuilder): void {
  pgm.sql(`
    DROP TRIGGER IF EXISTS agentic_agents_immutable ON agentic_agents;
    DROP FUNCTION IF EXISTS agentic_prevent_agent_mutation;
    ALTER TABLE agentic_approval_requests DROP COLUMN approver_scope;
  `);
}
