// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { ShieldCheck } from "lucide-react";
import { PageHeader } from "../../../shared/components/page-header";
import { guardrails, overviewPanels } from "../company-overview.data";
import { GuardrailList } from "../components/guardrail-list";
import { OperatingTimeline } from "../components/operating-timeline";
import { OverviewPanel } from "../components/overview-panel";

export function CompanyOverviewPage() {
  return (
    <section className="catalogWorkspace operationsWorkspace companyOverviewWorkspace">
      <PageHeader
        eyebrow="OpenDX CompanyOS"
        title="Company operating console"
        description="A dark, dense product surface for governing the company, workflows, digital employees, approvals, graph memory, and audit trails."
        metadata={<span className="status"><ShieldCheck aria-hidden="true" size={16} />Alpha foundation</span>}
      />
      <section className="grid" aria-label="Mission control panels">
        {overviewPanels.map((panel) => <OverviewPanel key={panel.label} {...panel} />)}
      </section>
      <section className="lower">
        <OperatingTimeline />
        <GuardrailList guardrails={guardrails} />
      </section>
    </section>
  );
}
