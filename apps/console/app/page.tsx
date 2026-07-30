// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import {
  Activity,
  CheckCircle2,
  GitBranch,
  Network,
  ShieldCheck,
} from "lucide-react";
import { opendxColors } from "@opendx/ui";

const panels = [
  {
    label: "Mission Control",
    value: "Company overview",
    detail: "Goals, risks, approvals",
  },
  {
    label: "Digital Workforce",
    value: "7 planned agents",
    detail: "Governed by role and skill",
  },
  {
    label: "Workflow Operations",
    value: "Temporal boundary",
    detail: "Durable execution planned",
  },
  {
    label: "Approval Inbox",
    value: "Human-governed",
    detail: "Risk actions wait for approval",
  },
];

const guardrails = [
  "Company-first modeling",
  "Backend permission enforcement",
  "GraphRAG pre-retrieval filtering",
  "Audit and provenance by default",
];

export default function ConsoleHome() {
  return (
    <main className="shell">
      <section className="hero">
        <div>
          <div className="eyebrow">OpenDX CompanyOS</div>
          <h1>Company operating console</h1>
          <p>
            A dark, dense product surface for governing companies, workflows,
            digital employees, approvals, graph memory, and audit trails.
          </p>
        </div>
        <div className="status" style={{ borderColor: opendxColors.hairline }}>
          <ShieldCheck size={18} />
          <span>Phase 1 foundation shell</span>
        </div>
      </section>

      <section className="grid" aria-label="Mission control panels">
        {panels.map((panel) => (
          <article className="panel" key={panel.label}>
            <div className="panelLabel">{panel.label}</div>
            <strong>{panel.value}</strong>
            <span>{panel.detail}</span>
          </article>
        ))}
      </section>

      <section className="lower">
        <article className="widePanel">
          <div className="sectionTitle">
            <Activity size={18} />
            Operating timeline
          </div>
          <div className="timelineRow">
            <CheckCircle2 size={16} />
            <span>Repository foundation committed</span>
          </div>
          <div className="timelineRow">
            <GitBranch size={16} />
            <span>Phase-gated specs and plans active</span>
          </div>
          <div className="timelineRow">
            <Network size={16} />
            <span>Company graph and workflow modules remain gated</span>
          </div>
        </article>

        <article className="widePanel">
          <div className="sectionTitle">
            <ShieldCheck size={18} />
            Guardrail gates
          </div>
          <ul>
            {guardrails.map((guardrail) => (
              <li key={guardrail}>{guardrail}</li>
            ))}
          </ul>
        </article>
      </section>
    </main>
  );
}
