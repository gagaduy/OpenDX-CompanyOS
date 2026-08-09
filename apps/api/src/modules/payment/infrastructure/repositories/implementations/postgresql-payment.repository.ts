// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { DatabaseSession } from "../../../../../shared/database/transaction";
import type { PaymentAggregate, PaymentRepository } from "../../../application/repositories/interfaces/payment.repository";
import type { Payment, PaymentStatus } from "../../../domain/entities/payment";
import type { PaymentAttempt, PaymentMethod } from "../../../domain/entities/payment-attempt";
import type { PaymentEvent } from "../../../domain/entities/payment-event";
import type { PaymentReconciliation } from "../../../domain/entities/payment-reconciliation";
import type { PaymentListQuery, PaymentSummaryDto } from "../../../application/dtos/payment-admin.dto";

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
  async list(
    session: DatabaseSession,
    query: PaymentListQuery,
  ): Promise<{ readonly items: readonly PaymentSummaryDto[]; readonly totalItems: number }> {
    const values: unknown[] = [];
    const clauses: string[] = [];
    if (query.status !== undefined) {
      values.push(query.status);
      clauses.push(`p.status=$${values.length}`);
    }
    const where = clauses.length === 0 ? "TRUE" : clauses.join(" AND ");
    const count = await session.query<{ total: string }>(
      `SELECT count(*)::text total FROM payments p WHERE ${where}`,
      values,
    );
    const rows = await session.query<Row>(
      `SELECT p.id,p.order_id,p.status,p.expected_amount_vnd,p.updated_at,
              a.provider_invoice_number,a.provider_order_id
       FROM payments p JOIN payment_attempts a ON a.id=p.active_attempt_id
       WHERE ${where} ORDER BY p.updated_at DESC,p.id
       LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
      [...values, query.pageSize, (query.page - 1) * query.pageSize],
    );
    return {
      items: rows.rows.map(mapSummary),
      totalItems: Number(count.rows[0]?.total ?? 0),
    };
  }
  async listReconciliations(
    session: DatabaseSession,
    paymentId: string,
  ): Promise<readonly PaymentReconciliation[]> {
    const result = await session.query<Row>(
      "SELECT * FROM payment_reconciliations WHERE payment_id=$1 ORDER BY created_at DESC,id",
      [paymentId],
    );
    return result.rows.map(mapReconciliation);
  }
  async listEvents(
    session: DatabaseSession,
    paymentId: string,
  ): Promise<readonly PaymentEvent[]> {
    const result = await session.query<Row>(
      "SELECT * FROM payment_events WHERE payment_id=$1 ORDER BY received_at DESC,id",
      [paymentId],
    );
    return result.rows.map(mapEvent);
  }
  async insertReconciliation(
    session: DatabaseSession,
    reconciliation: PaymentReconciliation,
  ): Promise<void> {
    await session.query(
      `INSERT INTO payment_reconciliations
       (id,payment_id,attempt_id,trigger_actor_type,trigger_actor_id,
        provider_order_id,internal_status,provider_status,internal_amount_vnd,
        provider_amount_vnd,comparison_result,redacted_response,correlation_id,created_at)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,$13,$14)`,
      [
        reconciliation.id, reconciliation.paymentId, reconciliation.attemptId,
        reconciliation.triggerActorType, reconciliation.triggerActorId,
        reconciliation.providerOrderId ?? null, reconciliation.internalStatus,
        reconciliation.providerStatus ?? null, reconciliation.internalAmountVnd,
        reconciliation.providerAmountVnd ?? null, reconciliation.comparisonResult,
        reconciliation.redactedResponse === undefined
          ? null
          : JSON.stringify(reconciliation.redactedResponse),
        reconciliation.correlationId, reconciliation.createdAt,
      ],
    );
  }
  async attachProviderOrderId(
    session: DatabaseSession,
    attemptId: string,
    providerOrderId: string,
  ): Promise<boolean> {
    const result = await session.query(
      `UPDATE payment_attempts SET provider_order_id=$2,updated_at=current_timestamp
       WHERE id=$1 AND (provider_order_id IS NULL OR provider_order_id=$2)`,
      [attemptId, providerOrderId],
    );
    return result.rowCount === 1;
  }
  async listDuePending(
    session: DatabaseSession,
    limit: number,
  ): Promise<readonly PaymentAggregate[]> {
    const result = await session.query<Row>(
      `SELECT p.id payment_id,p.order_id,p.provider,p.expected_amount_vnd,
              p.currency,p.status payment_status,p.active_attempt_id,p.paid_at,
              p.version,p.created_at payment_created_at,p.updated_at payment_updated_at,
              a.id attempt_id,a.provider_invoice_number,a.provider_order_id,
              a.payment_method,a.state attempt_state,a.idempotency_key,a.expires_at,
              a.created_at attempt_created_at,a.updated_at attempt_updated_at
       FROM payments p JOIN payment_attempts a ON a.id=p.active_attempt_id
       LEFT JOIN LATERAL (
         SELECT count(*)::integer reconciliation_count,max(r.created_at) last_reconciled_at
         FROM payment_reconciliations r WHERE r.payment_id=p.id
       ) reconciliation ON TRUE
       WHERE p.status='pending_provider' AND a.provider_order_id IS NOT NULL
         AND (
           reconciliation.reconciliation_count=0 OR
           reconciliation.last_reconciled_at <= current_timestamp -
             CASE LEAST(reconciliation.reconciliation_count,5)
               WHEN 1 THEN interval '1 minute'
               WHEN 2 THEN interval '2 minutes'
               WHEN 3 THEN interval '4 minutes'
               WHEN 4 THEN interval '8 minutes'
               ELSE interval '16 minutes'
             END
         )
       ORDER BY p.updated_at,p.id LIMIT $1`,
      [limit],
    );
    return result.rows.map(mapAggregate);
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

function mapSummary(row: Row): PaymentSummaryDto {
  return {
    id: String(row.id), orderId: String(row.order_id), status: status(row.status),
    expectedAmountVnd: money(row.expected_amount_vnd), currency: "VND",
    invoiceNumber: String(row.provider_invoice_number),
    ...(row.provider_order_id === null
      ? {}
      : { providerOrderId: String(row.provider_order_id) }),
    updatedAt: iso(row.updated_at),
  };
}

function mapReconciliation(row: Row): PaymentReconciliation {
  return {
    id: String(row.id), paymentId: String(row.payment_id),
    attemptId: String(row.attempt_id),
    triggerActorType: String(row.trigger_actor_type) as "staff" | "system",
    triggerActorId: String(row.trigger_actor_id),
    ...(row.provider_order_id === null
      ? {}
      : { providerOrderId: String(row.provider_order_id) }),
    internalStatus: status(row.internal_status),
    ...(row.provider_status === null
      ? {}
      : { providerStatus: String(row.provider_status) }),
    internalAmountVnd: money(row.internal_amount_vnd),
    ...(row.provider_amount_vnd === null
      ? {}
      : { providerAmountVnd: money(row.provider_amount_vnd) }),
    comparisonResult: String(
      row.comparison_result,
    ) as PaymentReconciliation["comparisonResult"],
    ...(row.redacted_response === null
      ? {}
      : { redactedResponse: row.redacted_response as Record<string, unknown> }),
    correlationId: String(row.correlation_id), createdAt: iso(row.created_at),
  };
}

function mapEvent(row: Row): PaymentEvent {
  return {
    id: String(row.id),
    ...(row.payment_id === null ? {} : { paymentId: String(row.payment_id) }),
    ...(row.attempt_id === null ? {} : { attemptId: String(row.attempt_id) }),
    provider: "sepay",
    authenticationResult: String(row.authentication_result) as PaymentEvent["authenticationResult"],
    notificationType: String(row.notification_type),
    ...(row.provider_event_id === null ? {} : { providerEventId: String(row.provider_event_id) }),
    ...(row.provider_order_id === null ? {} : { providerOrderId: String(row.provider_order_id) }),
    ...(row.provider_transaction_id === null ? {} : { providerTransactionId: String(row.provider_transaction_id) }),
    providerInvoiceNumber: String(row.provider_invoice_number),
    ...(row.amount_vnd === null ? {} : { amountVnd: money(row.amount_vnd) }),
    ...(row.currency === null ? {} : { currency: "VND" as const }),
    redactedPayload: row.redacted_payload as Record<string, unknown>,
    payloadHash: String(row.payload_hash),
    normalizedState: String(row.normalized_state) as PaymentEvent["normalizedState"],
    processingResult: String(row.processing_result) as PaymentEvent["processingResult"],
    ...(row.failure_reason === null ? {} : { failureReason: String(row.failure_reason) }),
    correlationId: String(row.correlation_id),
    receivedAt: iso(row.received_at),
    ...(row.processed_at === null ? {} : { processedAt: iso(row.processed_at) }),
  };
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
