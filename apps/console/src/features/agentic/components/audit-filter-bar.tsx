// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { useEffect, useState, type FormEvent } from "react";
import type { AgenticAuditFilter } from "../types/agentic.types";

export function AuditFilterBar({ filter, onApply }: { readonly filter: AgenticAuditFilter; readonly onApply: (filter: AgenticAuditFilter) => void }) {
  const [actorId, setActorId] = useState(filter.actorId ?? ""); const [action, setAction] = useState(filter.action ?? ""); const [outcome, setOutcome] = useState(filter.outcome ?? ""); const [resourceType, setResourceType] = useState(filter.resourceType ?? "");
  const [occurredFrom, setOccurredFrom] = useState(localTime(filter.occurredFrom)); const [occurredTo, setOccurredTo] = useState(localTime(filter.occurredTo));
  useEffect(() => { setActorId(filter.actorId ?? ""); setAction(filter.action ?? ""); setOutcome(filter.outcome ?? ""); setResourceType(filter.resourceType ?? ""); setOccurredFrom(localTime(filter.occurredFrom)); setOccurredTo(localTime(filter.occurredTo)); }, [filter]);
  const submit = (event: FormEvent) => { event.preventDefault(); onApply({ page: 1, pageSize: filter.pageSize, ...(actorId.trim() ? { actorId: actorId.trim() } : {}), ...(action.trim() ? { action: action.trim() } : {}), ...(outcome ? { outcome: outcome as AgenticAuditFilter["outcome"] } : {}), ...(resourceType.trim() ? { resourceType: resourceType.trim() } : {}), ...(occurredFrom ? { occurredFrom: new Date(occurredFrom).toISOString() } : {}), ...(occurredTo ? { occurredTo: new Date(occurredTo).toISOString() } : {}) }); };
  return <form className="agenticAuditFilters" onSubmit={submit}><label>Actor<input value={actorId} onChange={(event) => setActorId(event.target.value)} /></label><label>Action<input value={action} onChange={(event) => setAction(event.target.value)} /></label><label>Outcome<select value={outcome} onChange={(event) => setOutcome(event.target.value)}><option value="">All</option><option value="allowed">Allowed</option><option value="denied">Denied</option><option value="failed">Failed</option></select></label><label>Resource type<input value={resourceType} onChange={(event) => setResourceType(event.target.value)} /></label><label>Occurred from<input type="datetime-local" value={occurredFrom} onChange={(event) => setOccurredFrom(event.target.value)} /></label><label>Occurred to<input type="datetime-local" value={occurredTo} onChange={(event) => setOccurredTo(event.target.value)} /></label><button className="primaryButton" type="submit">Apply filters</button></form>;
}
function localTime(value?: string): string { return value ? value.slice(0, 16) : ""; }
