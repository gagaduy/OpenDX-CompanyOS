// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { useEffect, useState } from "react";
import type { CatalogApi } from "../api/catalog-api";
import type { CatalogAuditEntry } from "../types/catalog.types";

export function CatalogAuditTimeline({ api, productId }: { readonly api: CatalogApi; readonly productId: string }) {
  const [entries, setEntries] = useState<readonly CatalogAuditEntry[]>(); const [error, setError] = useState(false);
  useEffect(() => { let active = true; api.getProductAudit(productId).then((value) => { if (active) setEntries([...value].sort((left, right) => right.occurredAt.localeCompare(left.occurredAt))); }).catch(() => { if (active) setError(true); }); return () => { active = false; }; }, [api, productId]);
  if (error) return <div className="pageState">Audit activity could not be loaded.</div>;
  if (entries === undefined) return <div className="pageState">Loading audit activity…</div>;
  if (entries.length === 0) return <div className="emptyState">No audit activity yet.</div>;
  return <ol className="auditTimeline">{entries.map((entry) => <li key={entry.id}><span className={`auditOutcome audit-${entry.outcome}`} aria-hidden="true" /><div><strong>{entry.action}</strong><p>{entry.actorId} · {new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short" }).format(new Date(entry.occurredAt))}</p><small>Correlation: {entry.correlationId}</small></div></li>)}</ol>;
}
