// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { MigrationBuilder } from "node-pg-migrate";

export function up(pgm: MigrationBuilder): void {
  pgm.sql(`
    ALTER TABLE audit_events DROP CONSTRAINT IF EXISTS audit_events_actor_type_check;
    ALTER TABLE audit_events
      ADD CONSTRAINT audit_events_actor_type_check
      CHECK (actor_type IN ('user', 'customer', 'agent', 'workflow', 'service_account', 'connector'));
  `);

  pgm.createTable("customers", {
    id: { type: "uuid", primaryKey: true },
    email: { type: "varchar(320)", notNull: true },
    email_verified_at: { type: "timestamptz", notNull: true },
    full_name: { type: "varchar(120)" },
    phone_number: { type: "varchar(30)" },
    status: { type: "text", notNull: true, default: "active" },
    version: { type: "integer", notNull: true, default: 1 },
    created_at: {
      type: "timestamptz",
      notNull: true,
      default: pgm.func("current_timestamp"),
    },
    updated_at: {
      type: "timestamptz",
      notNull: true,
      default: pgm.func("current_timestamp"),
    },
  });
  pgm.addConstraint("customers", "customers_status_check", {
    check: "status IN ('active', 'disabled')",
  });
  pgm.addConstraint("customers", "customers_version_check", {
    check: "version > 0",
  });
  pgm.addConstraint("customers", "customers_email_check", {
    check: "length(trim(email)) > 3",
  });
  pgm.sql(
    "CREATE UNIQUE INDEX customers_email_lower_unique ON customers (lower(email))",
  );

  pgm.createTable("customer_external_identities", {
    id: { type: "uuid", primaryKey: true },
    customer_id: {
      type: "uuid",
      notNull: true,
      references: "customers",
      onDelete: "RESTRICT",
    },
    provider: { type: "text", notNull: true },
    provider_subject: { type: "varchar(255)", notNull: true },
    provider_email: { type: "varchar(320)", notNull: true },
    last_authenticated_at: { type: "timestamptz", notNull: true },
    created_at: {
      type: "timestamptz",
      notNull: true,
      default: pgm.func("current_timestamp"),
    },
    updated_at: {
      type: "timestamptz",
      notNull: true,
      default: pgm.func("current_timestamp"),
    },
  });
  pgm.addConstraint(
    "customer_external_identities",
    "customer_external_identities_provider_check",
    { check: "provider = 'google'" },
  );
  pgm.addConstraint(
    "customer_external_identities",
    "customer_external_identities_provider_subject_unique",
    { unique: ["provider", "provider_subject"] },
  );
  pgm.createIndex("customer_external_identities", "customer_id");

  pgm.createTable("customer_sessions", {
    id: { type: "uuid", primaryKey: true },
    customer_id: {
      type: "uuid",
      notNull: true,
      references: "customers",
      onDelete: "CASCADE",
    },
    token_hash: { type: "char(64)", notNull: true, unique: true },
    expires_at: { type: "timestamptz", notNull: true },
    last_seen_at: { type: "timestamptz", notNull: true },
    rotated_at: { type: "timestamptz" },
    revoked_at: { type: "timestamptz" },
    created_at: {
      type: "timestamptz",
      notNull: true,
      default: pgm.func("current_timestamp"),
    },
  });
  pgm.addConstraint("customer_sessions", "customer_sessions_token_hash_check", {
    check: "token_hash ~ '^[a-f0-9]{64}$'",
  });
  pgm.createIndex("customer_sessions", ["customer_id", "expires_at"]);

  pgm.createTable("guest_sessions", {
    id: { type: "uuid", primaryKey: true },
    token_hash: { type: "char(64)", notNull: true, unique: true },
    expires_at: { type: "timestamptz", notNull: true },
    last_seen_at: { type: "timestamptz", notNull: true },
    revoked_at: { type: "timestamptz" },
    created_at: {
      type: "timestamptz",
      notNull: true,
      default: pgm.func("current_timestamp"),
    },
  });
  pgm.addConstraint("guest_sessions", "guest_sessions_token_hash_check", {
    check: "token_hash ~ '^[a-f0-9]{64}$'",
  });
  pgm.createIndex("guest_sessions", "expires_at");

  pgm.createTable("customer_addresses", {
    id: { type: "uuid", primaryKey: true },
    customer_id: {
      type: "uuid",
      notNull: true,
      references: "customers",
      onDelete: "CASCADE",
    },
    recipient_name: { type: "varchar(120)", notNull: true },
    phone_number: { type: "varchar(30)", notNull: true },
    address_line: { type: "varchar(300)", notNull: true },
    ward: { type: "varchar(120)", notNull: true },
    province_or_city: { type: "varchar(120)", notNull: true },
    postal_code: { type: "varchar(20)" },
    delivery_note: { type: "varchar(500)" },
    is_default: { type: "boolean", notNull: true, default: false },
    version: { type: "integer", notNull: true, default: 1 },
    created_at: {
      type: "timestamptz",
      notNull: true,
      default: pgm.func("current_timestamp"),
    },
    updated_at: {
      type: "timestamptz",
      notNull: true,
      default: pgm.func("current_timestamp"),
    },
  });
  pgm.addConstraint("customer_addresses", "customer_addresses_version_check", {
    check: "version > 0",
  });
  pgm.sql(
    "CREATE UNIQUE INDEX customer_addresses_one_default ON customer_addresses (customer_id) WHERE is_default",
  );
  pgm.createIndex("customer_addresses", "customer_id");
}

export function down(pgm: MigrationBuilder): void {
  pgm.dropTable("customer_addresses");
  pgm.dropTable("guest_sessions");
  pgm.dropTable("customer_sessions");
  pgm.dropTable("customer_external_identities");
  pgm.dropTable("customers");
  pgm.sql(`
    DELETE FROM audit_events WHERE actor_type = 'customer';
    ALTER TABLE audit_events DROP CONSTRAINT IF EXISTS audit_events_actor_type_check;
    DO $block$
    BEGIN
      IF to_regclass('public.company_core_migrations') IS NOT NULL
         AND EXISTS (
           SELECT 1 FROM company_core_migrations
           WHERE name = '202608050002_create_company_operating_core'
         ) THEN
        ALTER TABLE audit_events
          ADD CONSTRAINT audit_events_actor_type_check
          CHECK (actor_type IN ('user', 'agent', 'workflow', 'service_account', 'connector'));
      END IF;
    END
    $block$;
  `);
}
