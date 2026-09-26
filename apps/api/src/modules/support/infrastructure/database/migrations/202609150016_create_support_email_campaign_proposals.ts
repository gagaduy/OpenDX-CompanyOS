// apps/api/src/modules/support/infrastructure/database/migrations/202609150016_create_support_email_campaign_proposals.ts
// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { MigrationBuilder } from "node-pg-migrate";

export function up(pgm: MigrationBuilder): void {
  pgm.sql(`
    CREATE TABLE support_email_campaign_proposals (
      id uuid PRIMARY KEY,
      type varchar(64) NOT NULL,
      title text NOT NULL,
      email_subject text NOT NULL,
      target_segment varchar(64) NOT NULL,
      recipients jsonb NOT NULL,
      total_recipients integer NOT NULL,
      selected_count integer NOT NULL,
      featured_products jsonb NOT NULL DEFAULT '[]'::jsonb,
      promotion_details jsonb,
      html_content text NOT NULL,
      docx_filename varchar(255) NOT NULL,
      status varchar(32) NOT NULL DEFAULT 'pending_approval',
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      sent_at timestamptz,
      execution_summary jsonb
    );

    CREATE INDEX support_email_campaign_proposals_status_idx
      ON support_email_campaign_proposals (status, created_at DESC);
  `);
}

export function down(pgm: MigrationBuilder): void {
  pgm.sql(`
    DROP TABLE support_email_campaign_proposals;
  `);
}
