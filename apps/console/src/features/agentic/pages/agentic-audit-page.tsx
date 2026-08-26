// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { PageHeader } from "../../../shared/components/page-header";
import type { AgenticApi } from "../api/agentic-api";
import { AuditDetail } from "../components/audit-detail";
import { AuditFilterBar } from "../components/audit-filter-bar";
import { AuditTable } from "../components/audit-table";
import { useAgenticAudit } from "../hooks/use-agentic-audit";
import type { AgenticAuditEvent, AgenticAuditFilter } from "../types/agentic.types";

export function AgenticAuditPage({ api }: { readonly api: AgenticApi }) {
  const [params, setParams] = useSearchParams(); const [selected, setSelected] = useState<AgenticAuditEvent>();
  const filter = useMemo<AgenticAuditFilter>(() => ({ page: positive(params.get("page"), 1), pageSize: positive(params.get("pageSize"), 25), ...optional(params, "actorId"), ...optional(params, "action"), ...optional(params, "resourceType"), ...optional(params, "occurredFrom"), ...optional(params, "occurredTo"), ...(outcome(params.get("outcome")) ? { outcome: outcome(params.get("outcome")) } : {}) }), [params]);
  const audit = useAgenticAudit(api, filter);
  const apply = (next: AgenticAuditFilter) => { const updated = new URLSearchParams({ page: String(next.page), pageSize: String(next.pageSize) }); for (const key of ["actorId", "action", "outcome", "resourceType", "occurredFrom", "occurredTo"] as const) if (next[key]) updated.set(key, next[key]!); setParams(updated); };
  const hasNext = audit.page !== undefined && filter.page * filter.pageSize < audit.page.totalItems;
  return <section className="catalogWorkspace agenticWorkspace"><PageHeader eyebrow="Digital Workforce" title="Agentic Audit" description={`${audit.page?.totalItems ?? 0} safe audit events`} /><AuditFilterBar filter={filter} onApply={apply} />{audit.error && <p role="alert">{audit.error}</p>}{audit.page && audit.page.items.length === 0 ? <p>No audit events match these filters.</p> : audit.page && <><div className="agenticAuditGrid"><AuditTable events={audit.page.items} onSelect={setSelected} />{selected && <AuditDetail event={selected} />}</div><nav className="dialogActions" aria-label="Audit pagination"><button type="button" disabled={filter.page === 1} onClick={() => apply({ ...filter, page: filter.page - 1 })}>Previous</button><span>Page {filter.page}</span><button type="button" disabled={!hasNext} onClick={() => apply({ ...filter, page: filter.page + 1 })}>Next</button></nav></>}</section>;
}
function positive(value: string | null, fallback: number): number { const parsed = Number(value); return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback; }
function optional(params: URLSearchParams, key: "actorId" | "action" | "resourceType" | "occurredFrom" | "occurredTo") { const value = params.get(key); return value ? { [key]: value } : {}; }
function outcome(value: string | null): AgenticAuditFilter["outcome"] { return value === "allowed" || value === "denied" || value === "failed" ? value : undefined; }
