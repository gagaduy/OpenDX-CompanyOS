// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { formatVnd } from "../../../shared/format/currency";
import type { PaymentEventView, PaymentReconciliationView } from "../types/payment.types";
import { EvidenceBadge } from "./payment-status-badge";

export function PaymentEvents({ events }: { readonly events: readonly PaymentEventView[] }) {
  if (events.length === 0) return <p className="subtleState">No provider events recorded.</p>;
  return <div className="evidenceList">{events.map((event) => <article key={event.id}><header><div><strong className="technicalText">{event.notificationType}</strong><span className="technicalText">{new Date(event.receivedAt).toLocaleString("en-GB")}</span></div><EvidenceBadge label={event.resultLabel} attention={event.attention} /></header><dl><div><dt>Normalized</dt><dd>{event.normalizedState}</dd></div>{event.amountVnd !== undefined && <div><dt>Amount</dt><dd>{formatVnd(event.amountVnd)}</dd></div>}<div><dt>Correlation</dt><dd className="technicalText">{event.correlationId}</dd></div></dl><EvidenceJson value={event.redactedPayload} /></article>)}</div>;
}
export function PaymentReconciliations({ records }: { readonly records: readonly PaymentReconciliationView[] }) {
  if (records.length === 0) return <p className="subtleState">No reconciliation evidence recorded.</p>;
  return <div className="evidenceList">{records.map((record) => <article key={record.id}><header><div><strong className="technicalText">{record.providerStatus ?? "Provider status unavailable"}</strong><span className="technicalText">{record.triggerActorType} · {new Date(record.createdAt).toLocaleString("en-GB")}</span></div><EvidenceBadge label={record.resultLabel} attention={record.attention} /></header><dl><div><dt>Internal amount</dt><dd>{formatVnd(record.internalAmountVnd)}</dd></div><div><dt>Provider amount</dt><dd>{record.providerAmountVnd === undefined ? "Unavailable" : formatVnd(record.providerAmountVnd)}</dd></div><div><dt>Correlation</dt><dd className="technicalText">{record.correlationId}</dd></div></dl>{record.redactedResponse && <EvidenceJson value={record.redactedResponse} />}</article>)}</div>;
}
function EvidenceJson({ value }: { readonly value: Readonly<Record<string, unknown>> }) { return <details><summary>Redacted evidence</summary><pre>{JSON.stringify(value, null, 2)}</pre></details>; }
