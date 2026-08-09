// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0
import type { MigrationBuilder } from "node-pg-migrate";
export function up(pgm: MigrationBuilder): void {
  pgm.dropConstraint("support_ticket_events", "support_ticket_events_idempotency_key_key");
  pgm.addConstraint("support_ticket_events", "support_ticket_events_ticket_idempotency_key_key", { unique: ["ticket_id", "idempotency_key"] });
  pgm.sql(`CREATE FUNCTION support_messages_reject_closed() RETURNS trigger LANGUAGE plpgsql AS $f$
    BEGIN IF EXISTS (SELECT 1 FROM support_tickets WHERE id=NEW.ticket_id AND status='closed') THEN RAISE EXCEPTION 'Closed support tickets do not accept messages' USING ERRCODE='P0001'; END IF; RETURN NEW; END; $f$;
    CREATE TRIGGER support_messages_closed_ticket_trigger BEFORE INSERT ON support_ticket_messages FOR EACH ROW EXECUTE FUNCTION support_messages_reject_closed();`);
}
export function down(pgm: MigrationBuilder): void {
  pgm.sql("DROP TRIGGER IF EXISTS support_messages_closed_ticket_trigger ON support_ticket_messages; DROP FUNCTION IF EXISTS support_messages_reject_closed;");
  pgm.dropConstraint("support_ticket_events", "support_ticket_events_ticket_idempotency_key_key");
  pgm.addConstraint("support_ticket_events", "support_ticket_events_idempotency_key_key", { unique: "idempotency_key" });
}
