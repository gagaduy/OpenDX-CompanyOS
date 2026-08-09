// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { Pool } from "pg";
import { afterAll, describe, expect, it } from "vitest";
import { runCatalogMigrations, runCompanyCoreMigrations, runCrmMigrations } from "../../../../shared/database/run-migrations";
import { assertIntegrationEnvironment } from "../../../../shared/testing/assert-integration-environment";
import { runCartMigrations } from "../../../cart/infrastructure/database/run-cart-migrations";
import { runCheckoutMigrations } from "../../../checkout/infrastructure/database/run-checkout-migrations";
import { runCustomerMigrations } from "../../../customer/infrastructure/database/run-customer-migrations";
import { runInventoryMigrations } from "../../../inventory/infrastructure/database/run-inventory-migrations";
import { runOrderMigrations } from "../../../order/infrastructure/database/run-order-migrations";
import { runPaymentMigrations } from "../../../payment/infrastructure/database/run-payment-migrations";
import { runPromotionMigrations } from "../../../promotion/infrastructure/database/run-promotion-migrations";
import { runSupportMigrations } from "./run-support-migrations";

const databaseUrl = process.env.TEST_DATABASE_URL;
const suite = databaseUrl === undefined ? describe.skip : describe;

suite("Support migration", () => {
  if (new URL(databaseUrl!).pathname !== "/opendx_test") throw new Error("Support migrations must run only against opendx_test");
  assertIntegrationEnvironment({ TEST_DATABASE_URL: databaseUrl });
  const pool = new Pool({ connectionString: databaseUrl });

  afterAll(async () => {
    await runSupportMigrations(databaseUrl!, "down").catch(() => undefined);
    await runCrmMigrations(databaseUrl!, "down").catch(() => undefined);
    await runPaymentMigrations(databaseUrl!, "down").catch(() => undefined);
    await runOrderMigrations(databaseUrl!, "down").catch(() => undefined);
    await runCheckoutMigrations(databaseUrl!, "down", 999999).catch(() => undefined);
    await runPromotionMigrations(databaseUrl!, "down").catch(() => undefined);
    await runCartMigrations(databaseUrl!, "down").catch(() => undefined);
    await runCustomerMigrations(databaseUrl!, "down").catch(() => undefined);
    await runInventoryMigrations(databaseUrl!, "down").catch(() => undefined);
    await runCompanyCoreMigrations(databaseUrl!, "down").catch(() => undefined);
    await runCatalogMigrations(databaseUrl!, "down").catch(() => undefined);
    await pool.end();
  });

  it("creates constrained Support tables, rolls them back, and reapplies them", async () => {
    await runCatalogMigrations(databaseUrl!, "up"); await runCompanyCoreMigrations(databaseUrl!, "up"); await runInventoryMigrations(databaseUrl!, "up");
    await runCustomerMigrations(databaseUrl!, "up"); await runCartMigrations(databaseUrl!, "up"); await runPromotionMigrations(databaseUrl!, "up");
    await runCheckoutMigrations(databaseUrl!, "up"); await runOrderMigrations(databaseUrl!, "up"); await runPaymentMigrations(databaseUrl!, "up");
    await runCrmMigrations(databaseUrl!, "up"); await runSupportMigrations(databaseUrl!, "up");

    const tables = ["support_tickets", "support_ticket_messages", "support_ticket_events", "support_attachments", "support_audit_events"];
    expect((await pool.query<{ table_name: string }>("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name = ANY($1::text[]) ORDER BY table_name", [tables])).rows.map(({ table_name }) => table_name)).toEqual([...tables].sort());
    const constraints = (await pool.query<{ constraint_name: string }>("SELECT constraint_name FROM information_schema.table_constraints WHERE table_schema = 'public' AND table_name = ANY($1::text[])", [tables])).rows.map(({ constraint_name }) => constraint_name);
    expect(constraints).toEqual(expect.arrayContaining(["support_tickets_priority_check", "support_tickets_status_check", "support_tickets_version_check", "support_tickets_sla_check", "support_ticket_messages_body_check", "support_ticket_events_status_check", "support_attachments_status_check", "support_attachments_bytes_check"]));
    const indexes = (await pool.query<{ indexname: string }>("SELECT indexname FROM pg_indexes WHERE schemaname = 'public' AND tablename = ANY($1::text[])", [tables])).rows.map(({ indexname }) => indexname);
    expect(indexes).toEqual(expect.arrayContaining(["support_tickets_queue_idx", "support_tickets_sla_claim_idx", "support_ticket_events_ticket_occurred_at_idx", "support_attachments_scan_claim_idx", "support_attachments_retention_claim_idx", "support_attachments_object_key_key", "support_ticket_events_idempotency_key_key"]));
    const foreignKeys = await pool.query<{ table_name: string; constraint_name: string }>("SELECT table_name, constraint_name FROM information_schema.table_constraints WHERE table_schema = 'public' AND constraint_type = 'FOREIGN KEY' AND table_name = ANY($1::text[])", [tables]);
    expect(foreignKeys.rows).toEqual(expect.arrayContaining([
      expect.objectContaining({ table_name: "support_tickets", constraint_name: "support_tickets_customer_id_fkey" }),
      expect.objectContaining({ table_name: "support_tickets", constraint_name: "support_tickets_order_id_fkey" }),
      expect.objectContaining({ table_name: "support_ticket_messages", constraint_name: "support_ticket_messages_ticket_id_fkey" }),
      expect.objectContaining({ table_name: "support_attachments", constraint_name: "support_attachments_ticket_id_fkey" }),
    ]));
    expect((await pool.query("SELECT table_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = ANY($1::text[]) AND column_name = 'company_id'", [tables])).rowCount).toBe(0);

    await runSupportMigrations(databaseUrl!, "down");
    expect((await pool.query("SELECT to_regclass('public.support_tickets') AS name")).rows[0]).toEqual({ name: null });
    await runSupportMigrations(databaseUrl!, "up");
    expect((await pool.query("SELECT to_regclass('public.support_tickets') AS name")).rows[0]).toEqual({ name: "support_tickets" });
  });

  it("enforces ticket lifecycle, append-only histories, and attachment tombstones", async () => {
    const customerId = "d7000000-0000-4000-8000-000000000001";
    const ticketId = "d7000000-0000-4000-8000-000000000002";
    const createdAt = "2026-08-10T00:00:00.000Z";
    await pool.query("INSERT INTO customers (id, email, email_verified_at) VALUES ($1, $2, $3)", [customerId, "support-migration@example.com", createdAt]);
    await expect(pool.query("INSERT INTO support_tickets (id, customer_id, subject, description, priority, status, version, created_by_id) VALUES ($1, $2, ' ', 'Description', 'normal', 'new', 1, 'staff-1')", [ticketId, customerId])).rejects.toMatchObject({ code: "23514" });
    await expect(pool.query("INSERT INTO support_tickets (id, customer_id, subject, description, priority, status, version, created_by_id) VALUES ($1, $2, 'Subject', 'Description', 'invalid', 'new', 1, 'staff-1')", [ticketId, customerId])).rejects.toMatchObject({ code: "23514" });
    await pool.query("INSERT INTO support_tickets (id, customer_id, subject, description, priority, status, version, created_by_id, created_at, updated_at) VALUES ($1, $2, 'Subject', 'Description', 'normal', 'new', 1, 'staff-1', $3, $3)", [ticketId, customerId, createdAt]);
    await expect(pool.query("UPDATE support_tickets SET customer_id = gen_random_uuid(), version = 2, updated_at = $2 WHERE id = $1", [ticketId, "2026-08-10T01:00:00.000Z"])).rejects.toMatchObject({ code: "P0001" });
    await expect(pool.query("UPDATE support_tickets SET status = 'resolved', version = 2, updated_at = $2, sla_stopped_at = $2 WHERE id = $1", [ticketId, "2026-08-10T01:00:00.000Z"])).rejects.toMatchObject({ code: "P0001" });
    await expect(pool.query("UPDATE support_tickets SET status = 'assigned', version = 2, updated_at = $2 WHERE id = $1", [ticketId, "2026-08-10T01:00:00.000Z"])).resolves.toMatchObject({ rowCount: 1 });
    await expect(pool.query("UPDATE support_tickets SET status = 'in_progress', version = 3, updated_at = $2 WHERE id = $1", [ticketId, "2026-08-10T02:00:00.000Z"])).resolves.toMatchObject({ rowCount: 1 });
    await expect(pool.query("UPDATE support_tickets SET status = 'waiting_customer', version = 4, updated_at = $2, sla_pause_started_at = $2 WHERE id = $1", [ticketId, "2026-08-10T03:00:00.000Z"])).resolves.toMatchObject({ rowCount: 1 });
    await expect(pool.query("UPDATE support_tickets SET status = 'in_progress', version = 5, updated_at = $2, sla_paused_seconds = 3600, sla_pause_started_at = NULL WHERE id = $1", [ticketId, "2026-08-10T04:00:00.000Z"])).resolves.toMatchObject({ rowCount: 1 });

    const messageId = "d7000000-0000-4000-8000-000000000003";
    await pool.query("INSERT INTO support_ticket_messages (id, ticket_id, author_id, body) VALUES ($1, $2, 'staff-1', 'Investigating')", [messageId, ticketId]);
    await expect(pool.query("UPDATE support_ticket_messages SET body = 'Changed' WHERE id = $1", [messageId])).rejects.toMatchObject({ code: "P0001" });
    await expect(pool.query("DELETE FROM support_ticket_messages WHERE id = $1", [messageId])).rejects.toMatchObject({ code: "P0001" });
    await pool.query("INSERT INTO support_ticket_events (id, ticket_id, actor_id, from_status, to_status, source, idempotency_key) VALUES (gen_random_uuid(), $1, 'staff-1', 'new', 'assigned', 'manual', 'event-1')", [ticketId]);
    await expect(pool.query("UPDATE support_ticket_events SET source = 'automatic' WHERE idempotency_key = 'event-1'"))
      .rejects.toMatchObject({ code: "P0001" });
    await expect(pool.query("DELETE FROM support_ticket_events WHERE idempotency_key = 'event-1'"))
      .rejects.toMatchObject({ code: "P0001" });
    await expect(pool.query("INSERT INTO support_ticket_events (id, ticket_id, actor_id, from_status, to_status, source, idempotency_key) VALUES (gen_random_uuid(), $1, 'staff-1', 'new', 'assigned', 'manual', 'event-1')", [ticketId])).rejects.toMatchObject({ code: "23505" });

    await pool.query("INSERT INTO support_audit_events (id, ticket_id, actor_id, action, resource_type, resource_id, correlation_id) VALUES (gen_random_uuid(), $1, 'staff-1', 'support.ticket.created', 'support_ticket', $1, 'audit-1')", [ticketId]);
    await expect(pool.query("UPDATE support_audit_events SET action = 'changed' WHERE correlation_id = 'audit-1'"))
      .rejects.toMatchObject({ code: "P0001" });
    await expect(pool.query("DELETE FROM support_audit_events WHERE correlation_id = 'audit-1'"))
      .rejects.toMatchObject({ code: "P0001" });

    const attachmentId = "d7000000-0000-4000-8000-000000000004";
    await pool.query("INSERT INTO support_attachments (id, ticket_id, object_key, original_filename, format, media_type, byte_size, status, created_by_id) VALUES ($1, $2, '00000000-0000-4000-8000-000000000004', 'evidence.pdf', 'pdf', 'application/pdf', 10, 'quarantined', 'staff-1')", [attachmentId, ticketId]);
    await expect(pool.query("UPDATE support_attachments SET original_filename = 'changed.pdf', version = 2 WHERE id = $1", [attachmentId])).rejects.toMatchObject({ code: "P0001" });
    await expect(pool.query("UPDATE support_attachments SET status = 'clean', scanned_at = now(), version = 2 WHERE id = $1", [attachmentId])).resolves.toMatchObject({ rowCount: 1 });
    await expect(pool.query("UPDATE support_attachments SET status = 'deleted', scanned_at = NULL, deleted_at = now(), version = 3 WHERE id = $1", [attachmentId]))
      .rejects.toMatchObject({ code: "P0001" });
    await expect(pool.query("UPDATE support_attachments SET status = 'deleted', deleted_at = now(), version = 3 WHERE id = $1", [attachmentId])).resolves.toMatchObject({ rowCount: 1 });
    await expect(pool.query("DELETE FROM support_attachments WHERE id = $1", [attachmentId])).rejects.toMatchObject({ code: "P0001" });
    const rejectedAttachmentId = "d7000000-0000-4000-8000-000000000007";
    await pool.query("INSERT INTO support_attachments (id, ticket_id, object_key, original_filename, format, media_type, byte_size, status, created_by_id) VALUES ($1, $2, '00000000-0000-4000-8000-000000000007', 'rejected.pdf', 'pdf', 'application/pdf', 10, 'quarantined', 'staff-1')", [rejectedAttachmentId, ticketId]);
    await pool.query("UPDATE support_attachments SET status = 'rejected', rejected_at = now(), version = 2 WHERE id = $1", [rejectedAttachmentId]);
    await expect(pool.query("UPDATE support_attachments SET status = 'deleted', rejected_at = NULL, deleted_at = now(), version = 3 WHERE id = $1", [rejectedAttachmentId]))
      .rejects.toMatchObject({ code: "P0001" });
    await pool.query("UPDATE support_attachments SET status = 'deleted', deleted_at = now(), version = 3 WHERE id = $1", [rejectedAttachmentId]);

    const countTicketId = "d7000000-0000-4000-8000-000000000005";
    await pool.query("INSERT INTO support_tickets (id, customer_id, subject, description, priority, status, version, created_by_id, created_at, updated_at) VALUES ($1, $2, 'Count limit', 'Description', 'normal', 'new', 1, 'staff-1', $3, $3)", [countTicketId, customerId, createdAt]);
    for (let sequence = 0; sequence < 20; sequence += 1) {
      await pool.query("INSERT INTO support_attachments (id, ticket_id, object_key, original_filename, format, media_type, byte_size, status, created_by_id) VALUES (gen_random_uuid(), $1, $2, 'evidence.pdf', 'pdf', 'application/pdf', 1, 'quarantined', 'staff-1')", [countTicketId, `count-${sequence}`]);
    }
    await expect(pool.query("INSERT INTO support_attachments (id, ticket_id, object_key, original_filename, format, media_type, byte_size, status, created_by_id) VALUES (gen_random_uuid(), $1, 'count-21', 'evidence.pdf', 'pdf', 'application/pdf', 1, 'quarantined', 'staff-1')", [countTicketId])).rejects.toMatchObject({ code: "P0001" });

    const byteTicketId = "d7000000-0000-4000-8000-000000000006";
    await pool.query("INSERT INTO support_tickets (id, customer_id, subject, description, priority, status, version, created_by_id, created_at, updated_at) VALUES ($1, $2, 'Byte limit', 'Description', 'normal', 'new', 1, 'staff-1', $3, $3)", [byteTicketId, customerId, createdAt]);
    for (let sequence = 0; sequence < 8; sequence += 1) {
      await pool.query("INSERT INTO support_attachments (id, ticket_id, object_key, original_filename, format, media_type, byte_size, status, created_by_id) VALUES (gen_random_uuid(), $1, $2, 'evidence.pdf', 'pdf', 'application/pdf', 26214400, 'quarantined', 'staff-1')", [byteTicketId, `bytes-${sequence}`]);
    }
    await expect(pool.query("INSERT INTO support_attachments (id, ticket_id, object_key, original_filename, format, media_type, byte_size, status, created_by_id) VALUES (gen_random_uuid(), $1, 'bytes-9', 'evidence.pdf', 'pdf', 'application/pdf', 1, 'quarantined', 'staff-1')", [byteTicketId])).rejects.toMatchObject({ code: "P0001" });
  });

  it("enforces exact SLA state arithmetic for every legal clock transition", async () => {
    const customerId = "d7000000-0000-4000-8000-000000000010";
    const ticketId = "d7000000-0000-4000-8000-000000000011";
    const createdAt = "2026-08-10T00:00:00.000Z";
    await pool.query("INSERT INTO customers (id, email, email_verified_at) VALUES ($1, $2, $3)", [customerId, "support-sla@example.com", createdAt]);
    await pool.query("INSERT INTO support_tickets (id, customer_id, subject, description, priority, status, version, created_by_id, created_at, updated_at) VALUES ($1, $2, 'SLA', 'Description', 'normal', 'new', 1, 'staff-1', $3, $3)", [ticketId, customerId, createdAt]);
    await expect(pool.query("UPDATE support_tickets SET status = 'assigned', version = 2, updated_at = $2, sla_paused_seconds = 99 WHERE id = $1", [ticketId, "2026-08-10T01:00:00.000Z"]))
      .rejects.toMatchObject({ code: "P0001" });
    await pool.query("UPDATE support_tickets SET status = 'assigned', version = 2, updated_at = $2 WHERE id = $1", [ticketId, "2026-08-10T01:00:00.000Z"]);
    await pool.query("UPDATE support_tickets SET status = 'in_progress', version = 3, updated_at = $2 WHERE id = $1", [ticketId, "2026-08-10T02:00:00.000Z"]);
    await expect(pool.query("UPDATE support_tickets SET status = 'waiting_customer', version = 4, updated_at = $2, sla_pause_started_at = $3 WHERE id = $1", [ticketId, "2026-08-10T03:00:00.000Z", "2026-08-10T02:59:59.000Z"]))
      .rejects.toMatchObject({ code: "P0001" });
    await pool.query("UPDATE support_tickets SET status = 'waiting_customer', version = 4, updated_at = $2, sla_pause_started_at = $2 WHERE id = $1", [ticketId, "2026-08-10T03:00:00.000Z"]);
    await expect(pool.query("UPDATE support_tickets SET status = 'in_progress', version = 5, updated_at = $2, sla_paused_seconds = 1, sla_pause_started_at = NULL WHERE id = $1", [ticketId, "2026-08-10T04:00:00.000Z"]))
      .rejects.toMatchObject({ code: "P0001" });
    await pool.query("UPDATE support_tickets SET status = 'in_progress', version = 5, updated_at = $2, sla_paused_seconds = 3600, sla_pause_started_at = NULL WHERE id = $1", [ticketId, "2026-08-10T04:00:00.000Z"]);
    await expect(pool.query("UPDATE support_tickets SET status = 'resolved', version = 6, updated_at = $2, sla_stopped_at = $3 WHERE id = $1", [ticketId, "2026-08-10T05:00:00.000Z", "2026-08-10T04:59:59.000Z"]))
      .rejects.toMatchObject({ code: "P0001" });
    await pool.query("UPDATE support_tickets SET status = 'resolved', version = 6, updated_at = $2, sla_stopped_at = $2 WHERE id = $1", [ticketId, "2026-08-10T05:00:00.000Z"]);
    await expect(pool.query("UPDATE support_tickets SET status = 'in_progress', version = 7, updated_at = $2, sla_stopped_at = NULL, sla_stopped_seconds = 1 WHERE id = $1", [ticketId, "2026-08-10T06:00:00.000Z"]))
      .rejects.toMatchObject({ code: "P0001" });
    await pool.query("UPDATE support_tickets SET status = 'in_progress', version = 7, updated_at = $2, sla_stopped_at = NULL, sla_stopped_seconds = 3600 WHERE id = $1", [ticketId, "2026-08-10T06:00:00.000Z"]);
    await pool.query("UPDATE support_tickets SET status = 'resolved', version = 8, updated_at = $2, sla_stopped_at = $2 WHERE id = $1", [ticketId, "2026-08-10T07:00:00.000Z"]);
    await expect(pool.query("UPDATE support_tickets SET status = 'closed', version = 9, updated_at = $2, closed_at = $3 WHERE id = $1", [ticketId, "2026-08-10T08:00:00.000Z", "2026-08-10T07:59:59.000Z"]))
      .rejects.toMatchObject({ code: "P0001" });
    await pool.query("UPDATE support_tickets SET status = 'closed', version = 9, updated_at = $2, closed_at = $2 WHERE id = $1", [ticketId, "2026-08-10T08:00:00.000Z"]);
  });

  it("serializes concurrent attachment inserts at the per-ticket quota boundary", async () => {
    const customerId = "d7000000-0000-4000-8000-000000000020";
    const ticketId = "d7000000-0000-4000-8000-000000000021";
    const createdAt = "2026-08-10T00:00:00.000Z";
    await pool.query("INSERT INTO customers (id, email, email_verified_at) VALUES ($1, $2, $3)", [customerId, "support-quota@example.com", createdAt]);
    await pool.query("INSERT INTO support_tickets (id, customer_id, subject, description, priority, status, version, created_by_id, created_at, updated_at) VALUES ($1, $2, 'Quota', 'Description', 'normal', 'new', 1, 'staff-1', $3, $3)", [ticketId, customerId, createdAt]);
    for (let sequence = 0; sequence < 19; sequence += 1) {
      await pool.query("INSERT INTO support_attachments (id, ticket_id, object_key, original_filename, format, media_type, byte_size, status, created_by_id) VALUES (gen_random_uuid(), $1, $2, 'evidence.pdf', 'pdf', 'application/pdf', 1, 'quarantined', 'staff-1')", [ticketId, `race-${sequence}`]);
    }
    const holder = await pool.connect();
    const first = await pool.connect();
    const second = await pool.connect();
    try {
      await holder.query("BEGIN");
      await holder.query("SELECT id FROM support_tickets WHERE id = $1 FOR NO KEY UPDATE", [ticketId]);
      const insert = "INSERT INTO support_attachments (id, ticket_id, object_key, original_filename, format, media_type, byte_size, status, created_by_id) VALUES (gen_random_uuid(), $1, $2, 'evidence.pdf', 'pdf', 'application/pdf', 1, 'quarantined', 'staff-1')";
      const firstInsert = first.query(insert, [ticketId, "race-first"]);
      const secondInsert = second.query(insert, [ticketId, "race-second"]);
      await holder.query("COMMIT");
      const results = await Promise.allSettled([firstInsert, secondInsert]);
      expect(results.filter(({ status }) => status === "fulfilled")).toHaveLength(1);
      expect(results.filter(({ status }) => status === "rejected")).toHaveLength(1);
      expect((await pool.query<{ count: string }>("SELECT count(*) FROM support_attachments WHERE ticket_id = $1", [ticketId])).rows[0]?.count).toBe("20");
    } finally {
      await holder.query("ROLLBACK").catch(() => undefined);
      first.release(); second.release(); holder.release();
    }
  });
});
