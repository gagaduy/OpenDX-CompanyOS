// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { MigrationBuilder } from "node-pg-migrate";

export function up(pgm: MigrationBuilder): void {
  pgm.sql(`
    ALTER TABLE agentic_agents DROP CONSTRAINT IF EXISTS agentic_agents_kind_check;
    ALTER TABLE agentic_agents ADD CONSTRAINT agentic_agents_kind_check
      CHECK (kind IN ('ai_ceo','catalog','inventory','order','finance','crm','support','marketing_content','marketing_visual','marketing_publisher'));

    INSERT INTO agentic_agents(kind, keycloak_client_id) VALUES
      ('marketing_content', 'agent-marketing-content'),
      ('marketing_visual', 'agent-marketing-visual'),
      ('marketing_publisher', 'agent-marketing-publisher')
    ON CONFLICT DO NOTHING;
  `);
}

export function down(pgm: MigrationBuilder): void {
  pgm.sql(`
    ALTER TABLE agentic_agents DISABLE TRIGGER agentic_agents_immutable;

    DELETE FROM agentic_agents
    WHERE kind IN ('marketing_content', 'marketing_visual', 'marketing_publisher');

    ALTER TABLE agentic_agents ENABLE TRIGGER agentic_agents_immutable;

    ALTER TABLE agentic_agents DROP CONSTRAINT IF EXISTS agentic_agents_kind_check;
    ALTER TABLE agentic_agents ADD CONSTRAINT agentic_agents_kind_check
      CHECK (kind IN ('ai_ceo','catalog','inventory','order','finance','crm','support'));
  `);
}
