// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { MigrationBuilder } from "node-pg-migrate";

export function up(pgm: MigrationBuilder): void {
  pgm.createTable("crm_notes", {
    id: { type: "uuid", primaryKey: true },
    customer_id: { type: "uuid", notNull: true, references: "customers", onDelete: "RESTRICT" },
    author_id: { type: "varchar(255)", notNull: true },
    body: { type: "varchar(4000)", notNull: true },
    corrects_note_id: { type: "uuid", references: "crm_notes", onDelete: "RESTRICT" },
    created_at: { type: "timestamptz", notNull: true, default: pgm.func("current_timestamp") },
  });
  pgm.addConstraint("crm_notes", "crm_notes_body_check", { check: "char_length(body) BETWEEN 1 AND 4000 AND body = btrim(body)" });
  pgm.createIndex("crm_notes", ["customer_id", "created_at"], { name: "crm_notes_customer_created_at_idx" });
  pgm.sql(`
    CREATE FUNCTION crm_notes_prevent_mutation() RETURNS trigger
    LANGUAGE plpgsql AS $function$
    BEGIN
      RAISE EXCEPTION 'CRM notes are immutable' USING ERRCODE = 'P0001';
    END;
    $function$;
    CREATE TRIGGER crm_notes_immutable_trigger
      BEFORE UPDATE OR DELETE ON crm_notes
      FOR EACH ROW EXECUTE FUNCTION crm_notes_prevent_mutation();
  `);

  pgm.createTable("crm_followups", {
    id: { type: "uuid", primaryKey: true },
    customer_id: { type: "uuid", notNull: true, references: "customers", onDelete: "RESTRICT" },
    due_at: { type: "timestamptz", notNull: true },
    description: { type: "varchar(500)", notNull: true },
    status: { type: "text", notNull: true, default: "open" },
    version: { type: "integer", notNull: true, default: 1 },
    created_by_id: { type: "varchar(255)", notNull: true },
    assignee_id: { type: "varchar(255)" },
    completed_by_id: { type: "varchar(255)" },
    completed_at: { type: "timestamptz" },
    created_at: { type: "timestamptz", notNull: true, default: pgm.func("current_timestamp") },
    updated_at: { type: "timestamptz", notNull: true, default: pgm.func("current_timestamp") },
  });
  pgm.addConstraint("crm_followups", "crm_followups_description_check", { check: "char_length(description) BETWEEN 1 AND 500 AND description = btrim(description)" });
  pgm.addConstraint("crm_followups", "crm_followups_status_check", { check: "status IN ('open', 'completed')" });
  pgm.addConstraint("crm_followups", "crm_followups_version_check", { check: "version > 0" });
  pgm.addConstraint("crm_followups", "crm_followups_completion_check", { check: "(status = 'open' AND completed_by_id IS NULL AND completed_at IS NULL) OR (status = 'completed' AND assignee_id IS NOT NULL AND completed_by_id IS NOT NULL AND completed_at IS NOT NULL)" });
  pgm.createIndex("crm_followups", ["status", "due_at"], { name: "crm_followups_status_due_at_idx" });
  pgm.createIndex("crm_followups", "assignee_id", { name: "crm_followups_assignee_id_idx" });
  pgm.sql(`
    CREATE FUNCTION crm_followups_guard_lifecycle() RETURNS trigger
    LANGUAGE plpgsql AS $function$
    BEGIN
      IF TG_OP = 'INSERT' THEN
        IF NEW.status <> 'open' OR NEW.version <> 1
           OR NEW.assignee_id IS NOT NULL
           OR NEW.completed_by_id IS NOT NULL OR NEW.completed_at IS NOT NULL THEN
          RAISE EXCEPTION 'CRM follow-ups must begin open and unassigned' USING ERRCODE = 'P0001';
        END IF;
        RETURN NEW;
      END IF;

      IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'CRM follow-ups cannot be deleted' USING ERRCODE = 'P0001';
      END IF;

      IF NEW.id IS DISTINCT FROM OLD.id
         OR NEW.customer_id IS DISTINCT FROM OLD.customer_id
         OR NEW.due_at IS DISTINCT FROM OLD.due_at
         OR NEW.description IS DISTINCT FROM OLD.description
         OR NEW.created_by_id IS DISTINCT FROM OLD.created_by_id
         OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
        RAISE EXCEPTION 'Follow-up identity is immutable' USING ERRCODE = 'P0001';
      END IF;

      IF NEW.updated_at < OLD.updated_at THEN
        RAISE EXCEPTION 'Follow-up updated_at cannot move backwards' USING ERRCODE = 'P0001';
      END IF;

      IF OLD.status = 'open' AND OLD.assignee_id IS NULL
         AND NEW.status = 'open' AND NEW.assignee_id IS NOT NULL
         AND NEW.completed_by_id IS NULL AND NEW.completed_at IS NULL
         AND NEW.version = OLD.version + 1 THEN
        RETURN NEW;
      END IF;

      IF OLD.status = 'open' AND OLD.assignee_id IS NOT NULL
         AND NEW.status = 'completed' AND NEW.assignee_id = OLD.assignee_id
         AND NEW.completed_by_id IS NOT NULL
         AND NEW.completed_by_id !~ '^[[:space:]]*$'
         AND NEW.completed_at IS NOT NULL
         AND NEW.version = OLD.version + 1 THEN
        RETURN NEW;
      END IF;

      RAISE EXCEPTION 'Illegal CRM follow-up lifecycle transition' USING ERRCODE = 'P0001';
    END;
    $function$;
    CREATE TRIGGER crm_followups_lifecycle_trigger
      BEFORE INSERT OR UPDATE OR DELETE ON crm_followups
      FOR EACH ROW EXECUTE FUNCTION crm_followups_guard_lifecycle();
  `);

  pgm.createTable("crm_audit_events", {
    id: { type: "uuid", primaryKey: true },
    customer_id: { type: "uuid", notNull: true, references: "customers", onDelete: "RESTRICT" },
    actor_id: { type: "varchar(255)", notNull: true },
    action: { type: "varchar(96)", notNull: true },
    resource_type: { type: "text", notNull: true },
    resource_id: { type: "uuid", notNull: true },
    correlation_id: { type: "varchar(255)", notNull: true },
    metadata: { type: "jsonb", notNull: true, default: "{}" },
    occurred_at: { type: "timestamptz", notNull: true, default: pgm.func("current_timestamp") },
  });
  pgm.addConstraint("crm_audit_events", "crm_audit_events_resource_type_check", { check: "resource_type IN ('crm_note', 'followup')" });
  pgm.createIndex("crm_audit_events", ["customer_id", "occurred_at"], { name: "crm_audit_events_customer_occurred_at_idx" });
}

export function down(pgm: MigrationBuilder): void {
  pgm.dropTable("crm_audit_events");
  pgm.sql("DROP TRIGGER IF EXISTS crm_followups_lifecycle_trigger ON crm_followups");
  pgm.sql("DROP FUNCTION IF EXISTS crm_followups_guard_lifecycle()");
  pgm.dropTable("crm_followups");
  pgm.sql("DROP TRIGGER IF EXISTS crm_notes_immutable_trigger ON crm_notes");
  pgm.sql("DROP FUNCTION IF EXISTS crm_notes_prevent_mutation()");
  pgm.dropTable("crm_notes");
}
