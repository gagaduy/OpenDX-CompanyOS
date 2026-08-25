// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { useState, type FormEvent } from "react";
import { DialogShell } from "../../../shared/components/dialog-shell";
import type { AgenticApprovalDecision } from "../types/agentic.types";

export function ApprovalDecisionDialog({ decision, expectedVersion, onClose, onSubmit }: { readonly decision?: AgenticApprovalDecision["decision"]; readonly expectedVersion: number; readonly onClose: () => void; readonly onSubmit: (input: AgenticApprovalDecision) => Promise<boolean> }) {
  const [reason, setReason] = useState(""); const [pending, setPending] = useState(false); const [error, setError] = useState<string>();
  if (decision === undefined) return null;
  const label = decision === "approved" ? "approve" : decision === "rejected" ? "reject" : "request revision";
  const submit = async (event: FormEvent) => { event.preventDefault(); const normalized = reason.trim(); if (normalized.length === 0 || normalized.length > 1_000) { setError("Decision reason is required and must be at most 1,000 characters."); return; } setPending(true); if (await onSubmit({ expectedVersion, decision, reason: normalized })) onClose(); else setError("Decision was not applied."); setPending(false); };
  return <DialogShell open title={`${title(label)} approval`} onClose={onClose}><form className="compactForm" onSubmit={(event) => void submit(event)}><label>Decision reason<textarea aria-label="Decision reason" value={reason} maxLength={1000} required onChange={(event) => setReason(event.target.value)} /></label>{error && <p role="alert">{error}</p>}<div className="dialogActions"><button type="button" onClick={onClose}>Cancel</button><button className="primaryButton" type="submit" disabled={pending}>{pending ? "Submitting…" : `Confirm ${label}`}</button></div></form></DialogShell>;
}
function title(value: string): string { return `${value.charAt(0).toUpperCase()}${value.slice(1)}`; }
