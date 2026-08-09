// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";
import { formatVnd } from "../../../shared/format/currency";
import type { PaymentSummaryView } from "../types/payment.types";
import { EvidenceBadge } from "./payment-status-badge";

export function PaymentTable({ payments }: { readonly payments: readonly PaymentSummaryView[] }) {
  return <div className="tableFrame"><table className="operationsTable paymentTable"><thead><tr><th>Invoice</th><th>Provider order</th><th>Status</th><th>Expected</th><th>Updated</th><th><span className="srOnly">Open</span></th></tr></thead><tbody>{payments.map((payment) => <tr key={payment.id}><td data-label="Invoice"><strong>{payment.invoiceNumber}</strong><small>Order {payment.orderId}</small></td><td data-label="Provider order">{payment.providerOrderId ?? "Not assigned"}</td><td data-label="Status"><EvidenceBadge label={payment.statusLabel} attention={payment.attention} /></td><td data-label="Expected"><strong>{formatVnd(payment.expectedAmountVnd)}</strong></td><td data-label="Updated">{new Date(payment.updatedAt).toLocaleString("en-GB")}</td><td data-label="Open"><Link className="iconButton" aria-label={`Open ${payment.invoiceNumber}`} to={`/payments/${payment.id}`}><ArrowRight size={16} /></Link></td></tr>)}</tbody></table></div>;
}
