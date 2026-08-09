// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { MigrationBuilder } from "node-pg-migrate";

export function up(pgm: MigrationBuilder): void {
  pgm.createTable("support_tickets", {
    id: { type: "uuid", primaryKey: true },
    customer_id: { type: "uuid", notNull: true, references: "customers", onDelete: "RESTRICT" },
    order_id: { type: "uuid", references: "orders", onDelete: "RESTRICT" },
    subject: { type: "varchar(240)", notNull: true }, description: { type: "varchar(4000)", notNull: true },
    priority: { type: "text", notNull: true, default: "normal" }, status: { type: "text", notNull: true, default: "new" },
    version: { type: "integer", notNull: true, default: 1 }, created_by_id: { type: "varchar(255)", notNull: true }, assignee_id: { type: "varchar(255)" },
    sla_paused_seconds: { type: "integer", notNull: true, default: 0 }, sla_stopped_seconds: { type: "integer", notNull: true, default: 0 },
    sla_pause_started_at: { type: "timestamptz" }, sla_stopped_at: { type: "timestamptz" }, closed_at: { type: "timestamptz" },
    created_at: { type: "timestamptz", notNull: true, default: pgm.func("current_timestamp") }, updated_at: { type: "timestamptz", notNull: true, default: pgm.func("current_timestamp") },
  });
  pgm.addConstraint("support_tickets", "support_tickets_subject_check", { check: "char_length(subject) BETWEEN 1 AND 240 AND subject = btrim(subject)" });
  pgm.addConstraint("support_tickets", "support_tickets_description_check", { check: "char_length(description) BETWEEN 1 AND 4000 AND description = btrim(description)" });
  pgm.addConstraint("support_tickets", "support_tickets_priority_check", { check: "priority IN ('urgent', 'high', 'normal', 'low')" });
  pgm.addConstraint("support_tickets", "support_tickets_status_check", { check: "status IN ('new', 'assigned', 'in_progress', 'waiting_customer', 'waiting_internal', 'escalated', 'resolved', 'closed')" });
  pgm.addConstraint("support_tickets", "support_tickets_version_check", { check: "version > 0" });
  pgm.addConstraint("support_tickets", "support_tickets_sla_check", { check: "sla_paused_seconds >= 0 AND sla_stopped_seconds >= 0 AND (status = 'waiting_customer') = (sla_pause_started_at IS NOT NULL) AND (status IN ('resolved', 'closed')) = (sla_stopped_at IS NOT NULL) AND (status = 'closed') = (closed_at IS NOT NULL)" });
  pgm.createIndex("support_tickets", ["status", "priority", "created_at"], { name: "support_tickets_queue_idx" });
  pgm.createIndex("support_tickets", ["status", "sla_stopped_at", "created_at"], { name: "support_tickets_sla_claim_idx" });

  pgm.createTable("support_ticket_messages", {
    id: { type: "uuid", primaryKey: true }, ticket_id: { type: "uuid", notNull: true, references: "support_tickets", onDelete: "RESTRICT" },
    author_id: { type: "varchar(255)", notNull: true }, body: { type: "varchar(4000)", notNull: true },
    created_at: { type: "timestamptz", notNull: true, default: pgm.func("current_timestamp") },
  });
  pgm.addConstraint("support_ticket_messages", "support_ticket_messages_body_check", { check: "char_length(body) BETWEEN 1 AND 4000 AND body = btrim(body)" });
  pgm.createIndex("support_ticket_messages", ["ticket_id", "created_at"], { name: "support_ticket_messages_ticket_created_at_idx" });

  pgm.createTable("support_ticket_events", {
    id: { type: "uuid", primaryKey: true }, ticket_id: { type: "uuid", notNull: true, references: "support_tickets", onDelete: "RESTRICT" },
    actor_id: { type: "varchar(255)", notNull: true }, from_status: { type: "text", notNull: true }, to_status: { type: "text", notNull: true },
    source: { type: "text", notNull: true }, idempotency_key: { type: "varchar(255)", notNull: true },
    occurred_at: { type: "timestamptz", notNull: true, default: pgm.func("current_timestamp") },
  });
  pgm.addConstraint("support_ticket_events", "support_ticket_events_status_check", { check: "from_status IN ('new', 'assigned', 'in_progress', 'waiting_customer', 'waiting_internal', 'escalated', 'resolved', 'closed') AND to_status IN ('new', 'assigned', 'in_progress', 'waiting_customer', 'waiting_internal', 'escalated', 'resolved', 'closed') AND source IN ('manual', 'automatic')" });
  pgm.createIndex("support_ticket_events", ["ticket_id", "occurred_at", "id"], { name: "support_ticket_events_ticket_occurred_at_idx" });
  pgm.addConstraint("support_ticket_events", "support_ticket_events_idempotency_key_key", { unique: "idempotency_key" });

  pgm.createTable("support_attachments", {
    id: { type: "uuid", primaryKey: true }, ticket_id: { type: "uuid", notNull: true, references: "support_tickets", onDelete: "RESTRICT" },
    object_key: { type: "varchar(255)", notNull: true }, original_filename: { type: "varchar(255)", notNull: true }, format: { type: "text", notNull: true }, media_type: { type: "varchar(255)", notNull: true }, byte_size: { type: "integer", notNull: true },
    status: { type: "text", notNull: true, default: "quarantined" }, version: { type: "integer", notNull: true, default: 1 }, created_by_id: { type: "varchar(255)", notNull: true },
    scanned_at: { type: "timestamptz" }, rejected_at: { type: "timestamptz" }, deleted_at: { type: "timestamptz" },
    created_at: { type: "timestamptz", notNull: true, default: pgm.func("current_timestamp") },
  });
  pgm.addConstraint("support_attachments", "support_attachments_format_check", { check: "format IN ('jpg', 'png', 'webp', 'pdf', 'txt', 'csv', 'docx', 'xlsx')" });
  pgm.addConstraint("support_attachments", "support_attachments_status_check", { check: "status IN ('quarantined', 'clean', 'rejected', 'deleted')" });
  pgm.addConstraint("support_attachments", "support_attachments_bytes_check", { check: "byte_size BETWEEN 1 AND 26214400" });
  pgm.addConstraint("support_attachments", "support_attachments_version_check", { check: "version > 0" });
  pgm.addConstraint("support_attachments", "support_attachments_metadata_check", { check: "char_length(original_filename) BETWEEN 1 AND 255 AND original_filename = btrim(original_filename) AND ((format = 'jpg' AND media_type = 'image/jpeg') OR (format = 'png' AND media_type = 'image/png') OR (format = 'webp' AND media_type = 'image/webp') OR (format = 'pdf' AND media_type = 'application/pdf') OR (format = 'txt' AND media_type = 'text/plain') OR (format = 'csv' AND media_type = 'text/csv') OR (format = 'docx' AND media_type = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') OR (format = 'xlsx' AND media_type = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'))" });
  pgm.addConstraint("support_attachments", "support_attachments_object_key_key", { unique: "object_key" });
  pgm.createIndex("support_attachments", ["status", "created_at"], { name: "support_attachments_scan_claim_idx" });
  pgm.createIndex("support_attachments", ["ticket_id", "status", "deleted_at"], { name: "support_attachments_retention_claim_idx" });

  pgm.createTable("support_audit_events", {
    id: { type: "uuid", primaryKey: true }, ticket_id: { type: "uuid", notNull: true, references: "support_tickets", onDelete: "RESTRICT" },
    actor_id: { type: "varchar(255)", notNull: true }, action: { type: "varchar(96)", notNull: true }, resource_type: { type: "varchar(96)", notNull: true }, resource_id: { type: "uuid", notNull: true }, correlation_id: { type: "varchar(255)", notNull: true }, metadata: { type: "jsonb", notNull: true, default: "{}" },
    occurred_at: { type: "timestamptz", notNull: true, default: pgm.func("current_timestamp") },
  });
  pgm.createIndex("support_audit_events", ["ticket_id", "occurred_at"], { name: "support_audit_events_ticket_occurred_at_idx" });

  pgm.sql(`
    CREATE FUNCTION support_tickets_guard_lifecycle() RETURNS trigger LANGUAGE plpgsql AS $function$
    DECLARE expected_paused_seconds integer; expected_stopped_seconds integer; expected_pause_started_at timestamptz; expected_stopped_at timestamptz; expected_closed_at timestamptz;
    BEGIN
      IF TG_OP = 'INSERT' THEN
        IF NEW.status <> 'new' OR NEW.version <> 1 OR NEW.assignee_id IS NOT NULL OR NEW.sla_paused_seconds <> 0 OR NEW.sla_stopped_seconds <> 0 OR NEW.sla_pause_started_at IS NOT NULL OR NEW.sla_stopped_at IS NOT NULL OR NEW.closed_at IS NOT NULL THEN RAISE EXCEPTION 'Support tickets must begin new and unassigned' USING ERRCODE = 'P0001'; END IF;
        RETURN NEW;
      END IF;
      IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Support tickets cannot be deleted' USING ERRCODE = 'P0001'; END IF;
      IF NEW.id IS DISTINCT FROM OLD.id OR NEW.customer_id IS DISTINCT FROM OLD.customer_id OR NEW.order_id IS DISTINCT FROM OLD.order_id OR NEW.subject IS DISTINCT FROM OLD.subject OR NEW.description IS DISTINCT FROM OLD.description OR NEW.priority IS DISTINCT FROM OLD.priority OR NEW.created_by_id IS DISTINCT FROM OLD.created_by_id OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN RAISE EXCEPTION 'Support ticket identity is immutable' USING ERRCODE = 'P0001'; END IF;
      IF NEW.updated_at < OLD.updated_at OR NEW.version <> OLD.version + 1 THEN RAISE EXCEPTION 'Support ticket version is invalid' USING ERRCODE = 'P0001'; END IF;
      IF NOT (NEW.status = OLD.status OR (OLD.status = 'new' AND NEW.status IN ('assigned','escalated')) OR (OLD.status = 'assigned' AND NEW.status IN ('in_progress','escalated')) OR (OLD.status = 'in_progress' AND NEW.status IN ('waiting_customer','waiting_internal','escalated','resolved')) OR (OLD.status = 'waiting_customer' AND NEW.status IN ('in_progress','escalated','resolved')) OR (OLD.status = 'waiting_internal' AND NEW.status IN ('in_progress','escalated','resolved')) OR (OLD.status = 'escalated' AND NEW.status IN ('in_progress','waiting_customer','waiting_internal','resolved')) OR (OLD.status = 'resolved' AND NEW.status IN ('in_progress','closed'))) THEN RAISE EXCEPTION 'Illegal support ticket lifecycle transition' USING ERRCODE = 'P0001'; END IF;
      expected_paused_seconds := OLD.sla_paused_seconds + CASE WHEN OLD.status = 'waiting_customer' THEN floor(extract(epoch FROM NEW.updated_at - OLD.sla_pause_started_at))::integer ELSE 0 END;
      expected_stopped_seconds := OLD.sla_stopped_seconds + CASE WHEN OLD.status = 'resolved' AND NEW.status = 'in_progress' THEN floor(extract(epoch FROM NEW.updated_at - OLD.sla_stopped_at))::integer ELSE 0 END;
      expected_pause_started_at := CASE WHEN NEW.status = 'waiting_customer' THEN NEW.updated_at ELSE NULL END;
      expected_stopped_at := CASE WHEN NEW.status = 'resolved' THEN NEW.updated_at WHEN NEW.status = 'closed' THEN OLD.sla_stopped_at ELSE NULL END;
      expected_closed_at := CASE WHEN NEW.status = 'closed' THEN NEW.updated_at ELSE NULL END;
      IF NEW.sla_paused_seconds <> expected_paused_seconds OR NEW.sla_stopped_seconds <> expected_stopped_seconds OR NEW.sla_pause_started_at IS DISTINCT FROM expected_pause_started_at OR NEW.sla_stopped_at IS DISTINCT FROM expected_stopped_at OR NEW.closed_at IS DISTINCT FROM expected_closed_at THEN RAISE EXCEPTION 'Support ticket SLA state is invalid' USING ERRCODE = 'P0001'; END IF;
      RETURN NEW;
    END;
    $function$;
    CREATE TRIGGER support_tickets_lifecycle_trigger BEFORE INSERT OR UPDATE OR DELETE ON support_tickets FOR EACH ROW EXECUTE FUNCTION support_tickets_guard_lifecycle();
    CREATE FUNCTION support_prevent_mutation() RETURNS trigger LANGUAGE plpgsql AS $function$ BEGIN RAISE EXCEPTION 'Support history is append-only' USING ERRCODE = 'P0001'; END; $function$;
    CREATE TRIGGER support_ticket_messages_immutable_trigger BEFORE UPDATE OR DELETE ON support_ticket_messages FOR EACH ROW EXECUTE FUNCTION support_prevent_mutation();
    CREATE TRIGGER support_ticket_events_immutable_trigger BEFORE UPDATE OR DELETE ON support_ticket_events FOR EACH ROW EXECUTE FUNCTION support_prevent_mutation();
    CREATE TRIGGER support_audit_events_immutable_trigger BEFORE UPDATE OR DELETE ON support_audit_events FOR EACH ROW EXECUTE FUNCTION support_prevent_mutation();
    CREATE FUNCTION support_attachments_guard_lifecycle() RETURNS trigger LANGUAGE plpgsql AS $function$
    BEGIN
      IF TG_OP = 'INSERT' THEN
        IF NEW.status <> 'quarantined' OR NEW.version <> 1 OR NEW.scanned_at IS NOT NULL OR NEW.rejected_at IS NOT NULL OR NEW.deleted_at IS NOT NULL THEN RAISE EXCEPTION 'Support attachments must begin quarantined' USING ERRCODE = 'P0001'; END IF;
        RETURN NEW;
      END IF;
      IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Support attachment tombstones cannot be deleted' USING ERRCODE = 'P0001'; END IF;
      IF NEW.id IS DISTINCT FROM OLD.id OR NEW.ticket_id IS DISTINCT FROM OLD.ticket_id OR NEW.object_key IS DISTINCT FROM OLD.object_key OR NEW.original_filename IS DISTINCT FROM OLD.original_filename OR NEW.format IS DISTINCT FROM OLD.format OR NEW.media_type IS DISTINCT FROM OLD.media_type OR NEW.byte_size IS DISTINCT FROM OLD.byte_size OR NEW.created_by_id IS DISTINCT FROM OLD.created_by_id OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN RAISE EXCEPTION 'Support attachment metadata is immutable' USING ERRCODE = 'P0001'; END IF;
      IF NEW.version <> OLD.version + 1 OR NOT ((OLD.status = 'quarantined' AND NEW.status IN ('clean','rejected')) OR (OLD.status IN ('clean','rejected') AND NEW.status = 'deleted')) OR (NEW.status = 'clean' AND (NEW.scanned_at IS NULL OR NEW.scanned_at < OLD.created_at OR NEW.rejected_at IS NOT NULL OR NEW.deleted_at IS NOT NULL)) OR (NEW.status = 'rejected' AND (NEW.scanned_at IS NOT NULL OR NEW.rejected_at IS NULL OR NEW.rejected_at < OLD.created_at OR NEW.deleted_at IS NOT NULL)) OR (NEW.status = 'deleted' AND (NEW.deleted_at IS NULL OR NEW.scanned_at IS DISTINCT FROM OLD.scanned_at OR NEW.rejected_at IS DISTINCT FROM OLD.rejected_at OR NEW.deleted_at < COALESCE(OLD.scanned_at, OLD.rejected_at, OLD.created_at))) THEN RAISE EXCEPTION 'Illegal support attachment lifecycle transition' USING ERRCODE = 'P0001'; END IF;
      RETURN NEW;
    END;
    $function$;
    CREATE TRIGGER support_attachments_lifecycle_trigger BEFORE INSERT OR UPDATE OR DELETE ON support_attachments FOR EACH ROW EXECUTE FUNCTION support_attachments_guard_lifecycle();
    CREATE FUNCTION support_attachments_enforce_ticket_limits() RETURNS trigger LANGUAGE plpgsql AS $function$
    DECLARE retained_count integer; retained_bytes bigint;
    BEGIN
      PERFORM 1 FROM support_tickets WHERE id = NEW.ticket_id FOR UPDATE;
      SELECT count(*), COALESCE(sum(byte_size), 0) INTO retained_count, retained_bytes
      FROM support_attachments WHERE ticket_id = NEW.ticket_id AND status IN ('quarantined', 'clean');
      IF retained_count >= 20 OR retained_bytes + NEW.byte_size > 209715200 THEN
        RAISE EXCEPTION 'Support attachment ticket limit is exceeded' USING ERRCODE = 'P0001';
      END IF;
      RETURN NEW;
    END;
    $function$;
    CREATE TRIGGER support_attachments_ticket_limits_trigger BEFORE INSERT ON support_attachments FOR EACH ROW EXECUTE FUNCTION support_attachments_enforce_ticket_limits();
  `);
}

export function down(pgm: MigrationBuilder): void {
  pgm.sql("DROP TRIGGER IF EXISTS support_attachments_lifecycle_trigger ON support_attachments");
  pgm.sql("DROP TRIGGER IF EXISTS support_attachments_ticket_limits_trigger ON support_attachments");
  pgm.sql("DROP FUNCTION IF EXISTS support_attachments_enforce_ticket_limits");
  pgm.sql("DROP FUNCTION IF EXISTS support_attachments_guard_lifecycle");
  pgm.sql("DROP TRIGGER IF EXISTS support_audit_events_immutable_trigger ON support_audit_events");
  pgm.sql("DROP TRIGGER IF EXISTS support_ticket_events_immutable_trigger ON support_ticket_events");
  pgm.sql("DROP TRIGGER IF EXISTS support_ticket_messages_immutable_trigger ON support_ticket_messages");
  pgm.sql("DROP FUNCTION IF EXISTS support_prevent_mutation");
  pgm.sql("DROP TRIGGER IF EXISTS support_tickets_lifecycle_trigger ON support_tickets");
  pgm.sql("DROP FUNCTION IF EXISTS support_tickets_guard_lifecycle");
  pgm.dropTable("support_audit_events"); pgm.dropTable("support_attachments"); pgm.dropTable("support_ticket_events"); pgm.dropTable("support_ticket_messages"); pgm.dropTable("support_tickets");
}
