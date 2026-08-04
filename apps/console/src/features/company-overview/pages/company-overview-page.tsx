// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { opendxColors } from "@opendx/ui";
import { ShieldCheck } from "lucide-react";
import { GuardrailList } from "../components/guardrail-list";
import { OperatingTimeline } from "../components/operating-timeline";
import { OverviewPanel } from "../components/overview-panel";
import { guardrails, overviewPanels } from "../company-overview.data";

export function CompanyOverviewPage() {
  return (
    <main className="shell">
      <section className="hero">
        <div>
          <div className="eyebrow">OpenDX CompanyOS</div>
          <h1>Company operating console</h1>
          <p>
            A dark, dense product surface for governing the company, workflows,
            digital employees, approvals, graph memory, and audit trails.
          </p>
        </div>
        <div className="status" style={{ borderColor: opendxColors.hairline }}>
          <ShieldCheck aria-hidden="true" size={18} />
          <span>Phase 1 foundation shell</span>
        </div>
      </section>

      <section className="grid" aria-label="Mission control panels">
        {overviewPanels.map((panel) => (
          <OverviewPanel key={panel.label} {...panel} />
        ))}
      </section>

      <section className="lower">
        <OperatingTimeline />
        <GuardrailList guardrails={guardrails} />
      </section>
    </main>
  );
}
