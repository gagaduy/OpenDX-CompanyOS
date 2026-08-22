// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { formatVnd } from "../../../shared/format/currency";
import type { Customer360View } from "../types/crm.types";

export function CustomerSummary({view}:{readonly view:Customer360View}){ return <section className="detailCard" aria-label="Customer summary"><h2>Read-only profile</h2><p>{view.customer.email}</p><p>{view.customer.phoneNumber??"No phone"}</p><p>{view.paidFacts.paidOrderCount} paid orders · {formatVnd(view.paidFacts.lifetimePaidVnd)}</p><div className="chipRow">{view.segments.map(segment=><span className="statusChip" key={segment}>{segmentLabel(segment)}</span>)}</div><h3>Addresses</h3>{view.customer.addresses.map(address=><address key={address.id}>{address.recipientName}<br/>{address.phoneNumber}<br/><span>{address.addressLine}</span><br/>{address.ward}, {address.provinceOrCity}</address>)}</section>; }
export function segmentLabel(value:string){ const text=value.replaceAll("_"," "); return text.charAt(0).toUpperCase()+text.slice(1); }
