// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { AgenticAuditEvent } from "../types/agentic.types";
export function AuditTable({ events, onSelect }: { readonly events: readonly AgenticAuditEvent[]; readonly onSelect: (event: AgenticAuditEvent) => void }) {
  return <table className="operationsTable agenticAuditTable"><thead><tr><th>Time</th><th>Actor</th><th>Action</th><th>Outcome</th><th>Resource</th><th>Metadata</th></tr></thead><tbody>{events.map((event) => <tr key={event.id}><td data-label="Time">{event.occurredAt}</td><td data-label="Actor">{event.actorId}</td><td data-label="Action">{event.action}</td><td data-label="Outcome">{event.outcome}</td><td data-label="Resource">{event.resourceType} · {event.resourceId}</td><td data-label="Metadata"><button type="button" onClick={() => onSelect(event)}>View {event.action}</button></td></tr>)}</tbody></table>;
}
