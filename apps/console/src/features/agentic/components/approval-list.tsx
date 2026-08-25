// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { AgenticApproval } from "../types/agentic.types";
export function ApprovalList({ approvals, selectedId, onSelect }: { readonly approvals: readonly AgenticApproval[]; readonly selectedId?: string; readonly onSelect: (id: string) => void }) {
  return <section><h2>Requests</h2>{approvals.length === 0 ? <p>No approvals match this view.</p> : <ul className="agenticApprovalList">{approvals.map((approval) => <li key={approval.id}><button type="button" aria-pressed={selectedId === approval.id} onClick={() => onSelect(approval.id)}><strong>{label(approval.approverScope)}</strong><span>{approval.action}</span><span>{approval.state}</span></button></li>)}</ul>}</section>;
}
function label(value: string): string { return value.split("_").map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`).join(" "); }
