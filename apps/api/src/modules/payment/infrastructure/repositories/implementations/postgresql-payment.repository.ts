// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { DatabaseSession } from "../../../../../shared/database/transaction";
import type { PaymentAggregate, PaymentRepository } from "../../../application/repositories/interfaces/payment.repository";
import type { Payment, PaymentStatus } from "../../../domain/entities/payment";
import type { PaymentAttempt, PaymentMethod } from "../../../domain/entities/payment-attempt";
import type { PaymentEvent } from "../../../domain/entities/payment-event";

type Row = Record<string, unknown>;

export class PostgresqlPaymentRepository implements PaymentRepository {
  async create(session: DatabaseSession, payment: Payment, attempt: PaymentAttempt): Promise<void> {
    await session.query(
      `INSERT INTO payments
       (id,order_id,provider,expected_amount_vnd,currency,status,active_attempt_id,version,created_at,updated_at)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [payment.id, payment.orderId, payment.provider, payment.expectedAmountVnd, payment.currency, payment.status, payment.activeAttemptId, payment.version, payment.createdAt, payment.updatedAt],
    );
    await session.query(
      `INSERT INTO payment_attempts
       (id,payment_id,provider_invoice_number,provider_order_id,payment_method,state,idempotency_key,expires_at,created_at,updated_at)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [attempt.id, attempt.paymentId, attempt.providerInvoiceNumber, attempt.providerOrderId ?? null, attempt.paymentMethod ?? null, attempt.state, attempt.idempotencyKey, attempt.expiresAt, attempt.createdAt, attempt.updatedAt],
    );
  }

  async findById(session: DatabaseSession, paymentId: string, lock = false): Promise<PaymentAggregate | undefined> {
    return this.find(session, "p.id=$1", paymentId, lock);
  }

  async findByOrderId(session: DatabaseSession, orderId: string, lock = false): Promise<PaymentAggregate | undefined> {
    return this.find(session, "p.order_id=$1", orderId, lock);
  }
  async findByInvoiceNumber(session: DatabaseSession, invoiceNumber: string, lock = false): Promise<PaymentAggregate | undefined> {
    return this.find(session, "a.provider_invoice_number=$1", invoiceNumber, lock);
  }

  async insertEvent(session: DatabaseSession, event: PaymentEvent): Promise<boolean> {
    const result = await session.query(
      `INSERT INTO payment_events
       (id,payment_id,attempt_id,provider,authentication_result,notification_type,provider_event_id,provider_order_id,provider_transaction_id,provider_invoice_number,amount_vnd,currency,redacted_payload,payload_hash,normalized_state,processing_result,failure_reason,correlation_id,received_at,processed_at)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb,$14,$15,$16,$17,$18,$19,$20)
       ON CONFLICT DO NOTHING`,
      [event.id,event.paymentId??null,event.attemptId??null,event.provider,event.authenticationResult,event.notificationType,event.providerEventId??null,event.providerOrderId??null,event.providerTransactionId??null,event.providerInvoiceNumber,event.amountVnd??null,event.currency??null,JSON.stringify(event.redactedPayload),event.payloadHash,event.normalizedState,event.processingResult,event.failureReason??null,event.correlationId,event.receivedAt,event.processedAt??null],
    );
    return result.rowCount === 1;
  }
  async linkEvent(session: DatabaseSession, eventId: string, paymentId: string, attemptId: string): Promise<void> {
    await session.query("UPDATE payment_events SET payment_id=$2,attempt_id=$3 WHERE id=$1", [eventId,paymentId,attemptId]);
  }

  async updateEventResult(session: DatabaseSession, eventId: string, result: PaymentEvent["processingResult"], processedAt: string, failureReason?: string): Promise<void> {
    await session.query("UPDATE payment_events SET processing_result=$2,processed_at=$3,failure_reason=$4 WHERE id=$1", [eventId,result,processedAt,failureReason??null]);
  }

  async updateState(session: DatabaseSession, payment: Payment, attempt: PaymentAttempt, expectedPaymentVersion: number): Promise<boolean> {
    const result = await session.query(
      `UPDATE payments SET status=$2,paid_at=$3,version=$4,updated_at=$5
       WHERE id=$1 AND version=$6`,
      [payment.id, payment.status, payment.paidAt ?? null, payment.version, payment.updatedAt, expectedPaymentVersion],
    );
    if (result.rowCount !== 1) return false;
    const attemptResult = await session.query(
      `UPDATE payment_attempts SET provider_order_id=$2,state=$3,updated_at=$4 WHERE id=$1`,
      [attempt.id, attempt.providerOrderId ?? null, attempt.state, attempt.updatedAt],
    );
    return attemptResult.rowCount === 1;
  }

  async appendAudit(session: DatabaseSession, entry: Parameters<PaymentRepository["appendAudit"]>[1]): Promise<void> {
    const actorType = entry.actorType === "staff" ? "user" : entry.actorType === "system" ? "service_account" : entry.actorType === "provider" ? "connector" : "customer";
    await session.query(
      `INSERT INTO audit_events
       (id,actor_type,actor_id,action,resource_type,resource_id,outcome,correlation_id,metadata,occurred_at)
       VALUES($1,$2,$3,$4,'payment',$5,'success',$6,$7::jsonb,$8)`,
      [entry.id, actorType, entry.actorId, entry.action, entry.resourceId, entry.correlationId, JSON.stringify(entry.metadata), entry.occurredAt],
    );
  }

  private async find(session: DatabaseSession, predicate: string, value: string, lock: boolean): Promise<PaymentAggregate | undefined> {
    const result = await session.query<Row>(
      `SELECT p.id AS payment_id,p.order_id,p.provider,p.expected_amount_vnd,p.currency,
              p.status AS payment_status,p.active_attempt_id,p.paid_at,p.version,
              p.created_at AS payment_created_at,p.updated_at AS payment_updated_at,
              a.id AS attempt_id,a.provider_invoice_number,a.provider_order_id,
              a.payment_method,a.state AS attempt_state,a.idempotency_key,a.expires_at,
              a.created_at AS attempt_created_at,a.updated_at AS attempt_updated_at
       FROM payments p JOIN payment_attempts a ON a.id=p.active_attempt_id
       WHERE ${predicate}${lock ? " FOR UPDATE OF p,a" : ""}`,
      [value],
    );
    return result.rows[0] === undefined ? undefined : mapAggregate(result.rows[0]);
  }
}

function mapAggregate(row: Row): PaymentAggregate {
  const payment: Payment = {
    id: String(row.payment_id), orderId: String(row.order_id), provider: "sepay",
    expectedAmountVnd: money(row.expected_amount_vnd), currency: "VND", status: status(row.payment_status),
    activeAttemptId: String(row.active_attempt_id),
    ...(row.paid_at === null ? {} : { paidAt: iso(row.paid_at) }),
    version: Number(row.version), createdAt: iso(row.payment_created_at), updatedAt: iso(row.payment_updated_at),
  };
  const activeAttempt: PaymentAttempt = {
    id: String(row.attempt_id), paymentId: payment.id, providerInvoiceNumber: String(row.provider_invoice_number),
    ...(row.provider_order_id === null ? {} : { providerOrderId: String(row.provider_order_id) }),
    ...(row.payment_method === null ? {} : { paymentMethod: method(row.payment_method) }),
    state: status(row.attempt_state), idempotencyKey: String(row.idempotency_key), expiresAt: iso(row.expires_at),
    createdAt: iso(row.attempt_created_at), updatedAt: iso(row.attempt_updated_at),
  };
  return { payment, activeAttempt };
}

function status(value: unknown): PaymentStatus {
  const parsed = String(value) as PaymentStatus;
  if (!["created", "pending_provider", "paid", "failed", "canceled", "expired"].includes(parsed)) throw new Error("Invalid persisted payment status");
  return parsed;
}
function method(value: unknown): PaymentMethod {
  const parsed = String(value) as PaymentMethod;
  if (!["CARD", "BANK_TRANSFER", "NAPAS_BANK_TRANSFER"].includes(parsed)) throw new Error("Invalid persisted payment method");
  return parsed;
}
function money(value: unknown): number { const parsed = Number(value); if (!Number.isSafeInteger(parsed)) throw new Error("Unsafe persisted VND value"); return parsed; }
function iso(value: unknown): string { return (value instanceof Date ? value : new Date(String(value))).toISOString(); }
