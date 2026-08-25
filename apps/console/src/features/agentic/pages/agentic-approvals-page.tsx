// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { useState } from "react";
import type { StaffRole } from "../../authentication/api/oidc-manager";
import { PageHeader } from "../../../shared/components/page-header";
import type { AgenticApi } from "../api/agentic-api";
import { ApprovalDecisionDialog } from "../components/approval-decision-dialog";
import { ApprovalDetail } from "../components/approval-detail";
import { ApprovalList } from "../components/approval-list";
import { useAgenticApprovals } from "../hooks/use-agentic-approvals";
import type { AgenticApprovalDecision } from "../types/agentic.types";

export function AgenticApprovalsPage({ api, roles }: { readonly api: AgenticApi; readonly roles: readonly StaffRole[] }) {
  const approvals = useAgenticApprovals(api); const [decision, setDecision] = useState<AgenticApprovalDecision["decision"]>();
  const canDecide = roles.some((role) => role === "administrator" || role === "agentic_approver");
  return <section className="catalogWorkspace agenticWorkspace"><PageHeader eyebrow="Digital Workforce" title="Approval Inbox" description={`${approvals.page?.totalItems ?? 0} governed approval requests`} />{approvals.error && <p role="alert">{approvals.error}</p>}{approvals.loading && approvals.page === undefined ? <p>Loading approvals…</p> : <div className="agenticApprovalGrid"><ApprovalList approvals={approvals.page?.items ?? []} selectedId={approvals.detail?.approval.id} onSelect={(id) => void approvals.select(id)} />{approvals.detail ? <ApprovalDetail detail={approvals.detail} canDecide={canDecide} onDecision={setDecision} /> : <section><h2>Approval evidence</h2><p>Select a request to inspect exact evidence.</p></section>}</div>}<ApprovalDecisionDialog decision={decision} expectedVersion={approvals.detail?.approval.version ?? 1} onClose={() => setDecision(undefined)} onSubmit={approvals.decide} /></section>;
}
