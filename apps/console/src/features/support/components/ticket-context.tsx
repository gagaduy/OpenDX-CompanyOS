// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { formatVnd } from "../../../shared/format/currency";
import type { SupportTicketDetailView } from "../types/support.types";

export function TicketContext({detail}:{readonly detail:SupportTicketDetailView}){ return <section className="detailCard"><h2>Support context</h2><p>{detail.context.customer.email}</p><p>{detail.context.customer.fullName??"No customer name"}</p>{detail.context.order?<p><span>{detail.context.order.publicNumber}</span><span className="subtleText"> · {detail.context.order.status} · {formatVnd(detail.context.order.totalVnd)}</span></p>:<p>No order context.</p>}</section>; }
