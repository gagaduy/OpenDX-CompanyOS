// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { MigrationBuilder } from "node-pg-migrate";

export function up(pgm: MigrationBuilder): void {
  pgm.createTable("payments", {
    id: { type: "uuid", primaryKey: true },
    order_id: { type: "uuid", notNull: true, references: "orders", onDelete: "RESTRICT" },
    provider: { type: "text", notNull: true },
    expected_amount_vnd: { type: "bigint", notNull: true },
    currency: { type: "char(3)", notNull: true, default: "VND" },
    status: { type: "text", notNull: true },
    active_attempt_id: { type: "uuid" },
    paid_at: { type: "timestamptz" },
    version: { type: "integer", notNull: true, default: 1 },
    created_at: { type: "timestamptz", notNull: true, default: pgm.func("current_timestamp") },
    updated_at: { type: "timestamptz", notNull: true, default: pgm.func("current_timestamp") },
  });
  pgm.addConstraint("payments", "payments_order_unique", { unique: ["order_id"] });
  pgm.addConstraint("payments", "payments_provider_check", { check: "provider = 'sepay'" });
  pgm.addConstraint("payments", "payments_amount_check", { check: "expected_amount_vnd BETWEEN 1 AND 9007199254740991" });
  pgm.addConstraint("payments", "payments_currency_check", { check: "currency = 'VND'" });
  pgm.addConstraint("payments", "payments_status_check", { check: "status IN ('created', 'pending_provider', 'paid', 'failed', 'canceled', 'expired')" });
  pgm.addConstraint("payments", "payments_version_check", { check: "version > 0" });

  pgm.createTable("payment_attempts", {
    id: { type: "uuid", primaryKey: true },
    payment_id: { type: "uuid", notNull: true, references: "payments", onDelete: "CASCADE" },
    provider_invoice_number: { type: "varchar(96)", notNull: true },
    provider_order_id: { type: "varchar(160)" },
    payment_method: { type: "text" },
    state: { type: "text", notNull: true },
    idempotency_key: { type: "varchar(128)", notNull: true },
    expires_at: { type: "timestamptz", notNull: true },
    created_at: { type: "timestamptz", notNull: true, default: pgm.func("current_timestamp") },
    updated_at: { type: "timestamptz", notNull: true, default: pgm.func("current_timestamp") },
  });
  pgm.addConstraint("payment_attempts", "payment_attempts_invoice_unique", { unique: ["provider_invoice_number"] });
  pgm.addConstraint("payment_attempts", "payment_attempts_payment_key_unique", { unique: ["payment_id", "idempotency_key"] });
  pgm.addConstraint("payment_attempts", "payment_attempts_invoice_check", { check: "provider_invoice_number ~ '^NVC-PAY-[A-F0-9]{32}$'" });
  pgm.addConstraint("payment_attempts", "payment_attempts_method_check", { check: "payment_method IS NULL OR payment_method IN ('CARD', 'BANK_TRANSFER', 'NAPAS_BANK_TRANSFER')" });
  pgm.addConstraint("payment_attempts", "payment_attempts_state_check", { check: "state IN ('created', 'pending_provider', 'paid', 'failed', 'canceled', 'expired')" });
  pgm.sql("ALTER TABLE payments ADD CONSTRAINT payments_active_attempt_fk FOREIGN KEY (active_attempt_id) REFERENCES payment_attempts(id) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED");

  pgm.createTable("payment_events", {
    id: { type: "uuid", primaryKey: true },
    payment_id: { type: "uuid", references: "payments", onDelete: "RESTRICT" },
    attempt_id: { type: "uuid", references: "payment_attempts", onDelete: "RESTRICT" },
    provider: { type: "text", notNull: true },
    authentication_result: { type: "text", notNull: true },
    notification_type: { type: "varchar(96)", notNull: true },
    provider_event_id: { type: "varchar(160)" },
    provider_order_id: { type: "varchar(160)" },
    provider_transaction_id: { type: "varchar(160)" },
    provider_invoice_number: { type: "varchar(96)", notNull: true },
    amount_vnd: { type: "bigint" },
    currency: { type: "char(3)" },
    redacted_payload: { type: "jsonb", notNull: true },
    payload_hash: { type: "char(64)", notNull: true },
    normalized_state: { type: "text", notNull: true },
    processing_result: { type: "text", notNull: true },
    failure_reason: { type: "varchar(255)" },
    correlation_id: { type: "varchar(255)", notNull: true },
    received_at: { type: "timestamptz", notNull: true },
    processed_at: { type: "timestamptz" },
  });
  pgm.addConstraint("payment_events", "payment_events_payload_unique", { unique: ["provider", "payload_hash"] });
  pgm.addConstraint("payment_events", "payment_events_provider_transaction_unique", { unique: ["provider", "provider_transaction_id"] });
  pgm.addConstraint("payment_events", "payment_events_provider_check", { check: "provider = 'sepay'" });
  pgm.addConstraint("payment_events", "payment_events_auth_check", { check: "authentication_result IN ('authenticated', 'rejected')" });
  pgm.addConstraint("payment_events", "payment_events_amount_currency_check", { check: "(amount_vnd IS NULL OR amount_vnd BETWEEN 0 AND 9007199254740991) AND (currency IS NULL OR currency = 'VND')" });
  pgm.addConstraint("payment_events", "payment_events_hash_check", { check: "payload_hash ~ '^[a-f0-9]{64}$'" });
  pgm.addConstraint("payment_events", "payment_events_state_check", { check: "normalized_state IN ('paid', 'unsupported', 'invalid') AND processing_result IN ('received', 'applied', 'already_processed', 'review_required', 'rejected')" });

  pgm.createTable("payment_reconciliations", {
    id: { type: "uuid", primaryKey: true },
    payment_id: { type: "uuid", notNull: true, references: "payments", onDelete: "CASCADE" },
    attempt_id: { type: "uuid", notNull: true, references: "payment_attempts", onDelete: "CASCADE" },
    trigger_actor_type: { type: "text", notNull: true },
    trigger_actor_id: { type: "varchar(255)", notNull: true },
    provider_order_id: { type: "varchar(160)" },
    internal_status: { type: "text", notNull: true },
    provider_status: { type: "varchar(96)" },
    internal_amount_vnd: { type: "bigint", notNull: true },
    provider_amount_vnd: { type: "bigint" },
    comparison_result: { type: "text", notNull: true },
    redacted_response: { type: "jsonb" },
    correlation_id: { type: "varchar(255)", notNull: true },
    created_at: { type: "timestamptz", notNull: true, default: pgm.func("current_timestamp") },
  });
  pgm.addConstraint("payment_reconciliations", "payment_reconciliations_actor_check", { check: "trigger_actor_type IN ('staff', 'system')" });
  pgm.addConstraint("payment_reconciliations", "payment_reconciliations_amount_check", { check: "internal_amount_vnd BETWEEN 1 AND 9007199254740991 AND (provider_amount_vnd IS NULL OR provider_amount_vnd BETWEEN 0 AND 9007199254740991)" });
  pgm.addConstraint("payment_reconciliations", "payment_reconciliations_result_check", { check: "comparison_result IN ('matched_paid', 'still_pending', 'mismatch', 'unsupported', 'provider_error')" });
}

export function down(pgm: MigrationBuilder): void {
  pgm.dropTable("payment_reconciliations");
  pgm.dropTable("payment_events");
  pgm.sql("ALTER TABLE payments DROP CONSTRAINT IF EXISTS payments_active_attempt_fk");
  pgm.dropTable("payment_attempts");
  pgm.dropTable("payments");
}
