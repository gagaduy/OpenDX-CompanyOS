// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { MigrationBuilder } from "node-pg-migrate";

export function up(pgm: MigrationBuilder): void {
  pgm.sql(`
    ALTER TABLE agentic_tools
      ADD COLUMN execution_cost_micros bigint NOT NULL DEFAULT 1
        CHECK(execution_cost_micros>0),
      ADD COLUMN maximum_attempts integer NOT NULL DEFAULT 1
        CHECK(maximum_attempts>0 AND maximum_attempts<=10);

    INSERT INTO agentic_tools
      (name,version,input_schema_digest,output_schema_digest,active,
       execution_cost_micros,maximum_attempts)
    VALUES
      ('catalog.product_completeness',1,'71fc596a20f27da3dec80050e5d1f553eba34aea24c2853b853488a811e6b892','b107a15fb2f162cb36f6935d1c60a106e111723426af7e213b94d0d2164c3adf',true,1,2),
      ('catalog.publication_readiness',1,'cd89090da8377ff6b4720778ad2f805273a61043777b990c562c1fa7a0cf1043','5f0dfbc7c27d1ddaea4f5a16b6c13691be15400ac2d8c933d92bcc0fd8aa9c86',true,1,2),
      ('catalog.merchandising_summary',1,'71fc596a20f27da3dec80050e5d1f553eba34aea24c2853b853488a811e6b892','fbd42799da677e8cc3a1f2ed811e573968c0f7fc52f24062430859fe3405969c',true,1,2),
      ('inventory.stock_risk',1,'37854c7e7b2266c2a7efc25830fdf4166eab30863b33a8f924c63bd2aeabf18a','03edc9c3adba9738296e547f84d7ac9dbe204ba0bd0a58cd943965aef8c63afd',true,1,2),
      ('inventory.slow_stock',1,'446a44ac60abc52cd7b1cc9c13f4a72bf0383d7a6ff0c0c3e9d7b070384570bb','6c6ce164efc92f63cda175f142e474514d18494917057734252ec5bb4c4c8088',true,1,2),
      ('inventory.reservation_anomalies',1,'cd89090da8377ff6b4720778ad2f805273a61043777b990c562c1fa7a0cf1043','70b3a6c883b26dc970df88074b9efd2ed7c3242b9316f5ee79533d60b1bb71e8',true,1,2),
      ('order.stalled_summary',1,'6bb59812b9db52fa649ec694454cf4dd5033d936d48d7ada73e3eb7dd65a3660','f1205f45af765a5e6cfa0b8cac25b934fd8daa6a638ad57a08476fd1ce6c256d',true,1,2),
      ('order.invalid_state_evidence',1,'cd89090da8377ff6b4720778ad2f805273a61043777b990c562c1fa7a0cf1043','2b8b920878a0468b9d07da88bc1b2412cab2b703a4252eb39f05c18d4e38fa76',true,1,2),
      ('order.expiry_risk',1,'936c3c8b825acb5892ec7d6a24f28f39360828006ddc1713763fa08f8db54014','e832eee7c5a19a04933a7545666fdc2addd0efd1ca84c4ed642b2b820126f5ab',true,1,2),
      ('finance.pending_payments',1,'b45bfd794efa08669c613cf1f4635892f87ee7b2c05685a097b7dfd2da0ae9c2','953b02fbecb9d30e8850ae5bede3c722dce3600392b466c677a0f3b74e64cfb2',true,1,2),
      ('finance.reconciliation_discrepancies',1,'cd89090da8377ff6b4720778ad2f805273a61043777b990c562c1fa7a0cf1043','4bc90183dd92f0767e02e000ec4ba273b7fc3d9da5e63b10890fb2bfbdb1df60',true,1,2),
      ('finance.provider_evidence_status',1,'b45bfd794efa08669c613cf1f4635892f87ee7b2c05685a097b7dfd2da0ae9c2','36ad9872610acdb430e98252d73d82282f897c064d7b42221c5ca8fcca90d63c',true,1,2),
      ('crm.segment_summary',1,'b45bfd794efa08669c613cf1f4635892f87ee7b2c05685a097b7dfd2da0ae9c2','655bc738ddd4e1a3ff09631a930954d54c31d47022fcaa10b5bd1f69fe2f59ca',true,1,2),
      ('crm.followup_opportunities',1,'b45bfd794efa08669c613cf1f4635892f87ee7b2c05685a097b7dfd2da0ae9c2','898fd39bc5a9d2b849cd16d5ffc3c2cb2772453c425095e30e95cf918d525238',true,1,2),
      ('support.sla_risk',1,'67a727c4445d88e07cc2e1a91f58be5f8074e3a03137aeea70f05b6d7841ea43','8c186d5c6ec5a1ee7d98b463e8f6dfb506fe079c4f3d92f3ad49f240a1e9f2e1',true,1,2),
      ('support.classification_summary',1,'b45bfd794efa08669c613cf1f4635892f87ee7b2c05685a097b7dfd2da0ae9c2','2040134606e4c84e726177d72db69e75a5e4d98f1fa0dbcc175c6729f7195c19',true,1,2),
      ('support.related_order_context',1,'5e90ef450131a2dbcf8693be8ca040ef4624ab867ee62d80fa055633503a2702','5eaab701630accd03910d706d619d0174f8f05b794cae3d5f2e28bb4c62a2b50',true,1,2);

    CREATE TABLE agentic_tool_invocations (
      id uuid PRIMARY KEY,
      task_id uuid NOT NULL REFERENCES agentic_tasks(id),
      agent_kind text NOT NULL REFERENCES agentic_agents(kind),
      tool_name text NOT NULL,
      tool_version integer NOT NULL CHECK(tool_version>0),
      idempotency_key text NOT NULL CHECK(length(idempotency_key) BETWEEN 1 AND 255),
      parameters_digest text NOT NULL CHECK(parameters_digest~'^[a-f0-9]{64}$'),
      status text NOT NULL CHECK(status IN ('reserved','completed','retryable_failed','failed')),
      attempt integer NOT NULL CHECK(attempt>0),
      safe_result jsonb,
      result_digest text CHECK(result_digest IS NULL OR result_digest~'^[a-f0-9]{64}$'),
      error_code text CHECK(error_code IS NULL OR error_code~'^[A-Z][A-Z0-9_]{0,63}$'),
      correlation_id text NOT NULL CHECK(length(correlation_id) BETWEEN 1 AND 255),
      causation_id text NOT NULL CHECK(length(causation_id) BETWEEN 1 AND 255),
      version integer NOT NULL DEFAULT 1 CHECK(version>0),
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      completed_at timestamptz,
      FOREIGN KEY(tool_name,tool_version) REFERENCES agentic_tools(name,version),
      UNIQUE(task_id,agent_kind,idempotency_key),
      CHECK(split_part(tool_name,'.',1)=agent_kind),
      CHECK(safe_result IS NULL OR octet_length(safe_result::text)<=262144),
      CHECK(
        (status='reserved' AND safe_result IS NULL AND result_digest IS NULL
          AND error_code IS NULL AND completed_at IS NULL)
        OR (status='completed' AND safe_result IS NOT NULL AND result_digest IS NOT NULL
          AND error_code IS NULL AND completed_at IS NOT NULL)
        OR (status IN ('retryable_failed','failed') AND safe_result IS NULL
          AND result_digest IS NULL AND error_code IS NOT NULL AND completed_at IS NOT NULL)
      )
    );
    CREATE INDEX agentic_tool_invocations_task_idx
      ON agentic_tool_invocations(task_id,created_at,id);

    CREATE FUNCTION agentic_guard_completed_tool_invocation()
      RETURNS trigger LANGUAGE plpgsql AS $function$
      BEGIN
        IF OLD.status='completed' THEN
          RAISE EXCEPTION 'Completed Agentic tool invocation is immutable'
            USING ERRCODE='P0001';
        END IF;
        RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
      END;
      $function$;
    CREATE TRIGGER agentic_completed_tool_invocation_immutable
      BEFORE UPDATE OR DELETE ON agentic_tool_invocations
      FOR EACH ROW EXECUTE FUNCTION agentic_guard_completed_tool_invocation();
  `);
}

export function down(pgm: MigrationBuilder): void {
  pgm.sql(`
    DROP TRIGGER IF EXISTS agentic_completed_tool_invocation_immutable
      ON agentic_tool_invocations;
    DROP FUNCTION IF EXISTS agentic_guard_completed_tool_invocation;
    DROP TABLE IF EXISTS agentic_tool_invocations;

    ALTER TABLE agentic_tools DISABLE TRIGGER agentic_tools_immutable;
    ALTER TABLE agentic_tool_grants DISABLE TRIGGER agentic_tool_grants_draft_only;
    DELETE FROM agentic_tool_grants WHERE (tool_name,tool_version) IN (
      ('catalog.product_completeness',1),('catalog.publication_readiness',1),
      ('catalog.merchandising_summary',1),('inventory.stock_risk',1),
      ('inventory.slow_stock',1),('inventory.reservation_anomalies',1),
      ('order.stalled_summary',1),('order.invalid_state_evidence',1),
      ('order.expiry_risk',1),('finance.pending_payments',1),
      ('finance.reconciliation_discrepancies',1),('finance.provider_evidence_status',1),
      ('crm.segment_summary',1),('crm.followup_opportunities',1),
      ('support.sla_risk',1),('support.classification_summary',1),
      ('support.related_order_context',1)
    );
    ALTER TABLE agentic_tool_grants ENABLE TRIGGER agentic_tool_grants_draft_only;
    DELETE FROM agentic_tools WHERE (name,version) IN (
      ('catalog.product_completeness',1),('catalog.publication_readiness',1),
      ('catalog.merchandising_summary',1),('inventory.stock_risk',1),
      ('inventory.slow_stock',1),('inventory.reservation_anomalies',1),
      ('order.stalled_summary',1),('order.invalid_state_evidence',1),
      ('order.expiry_risk',1),('finance.pending_payments',1),
      ('finance.reconciliation_discrepancies',1),('finance.provider_evidence_status',1),
      ('crm.segment_summary',1),('crm.followup_opportunities',1),
      ('support.sla_risk',1),('support.classification_summary',1),
      ('support.related_order_context',1)
    );
    ALTER TABLE agentic_tools
      DROP COLUMN maximum_attempts,
      DROP COLUMN execution_cost_micros;
    ALTER TABLE agentic_tools ENABLE TRIGGER agentic_tools_immutable;
  `);
}
