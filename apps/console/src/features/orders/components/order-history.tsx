// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { Check } from "lucide-react";
import { orderStatusLabel } from "../mappers/order.mapper";
import type { OrderDetailView } from "../types/order.types";

export function OrderHistory({ history }: { readonly history: OrderDetailView["history"] }) {
  return <ol className="operationsTimeline">{history.map((entry, index) => <li key={`${entry.occurredAt}-${index}`}><span className="timelineMark"><Check size={13} /></span><div><strong>{orderStatusLabel(entry.newStatus)}</strong><span className="technicalText">{entry.actorType} · {new Date(entry.occurredAt).toLocaleString("en-GB")}</span><small className="technicalText">{entry.reasonCode}</small></div></li>)}</ol>;
}
