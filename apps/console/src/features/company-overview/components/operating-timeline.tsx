// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { Activity, CheckCircle2, GitBranch, Network } from "lucide-react";

export function OperatingTimeline() {
  return (
    <article className="widePanel">
      <div className="sectionTitle">
        <Activity aria-hidden="true" size={18} />
        Operating timeline
      </div>
      <div className="timelineRow">
        <CheckCircle2 aria-hidden="true" size={16} />
        <span>Commerce Foundation: Clean Architecture, Order & Inventory Truth (2.45B+ đ)</span>
      </div>
      <div className="timelineRow">
        <CheckCircle2 aria-hidden="true" size={16} />
        <span>Autonomous Workforce: 10 Digital Employees with RBAC & Keycloak Security</span>
      </div>
      <div className="timelineRow">
        <CheckCircle2 aria-hidden="true" size={16} />
        <span>Visual Workflow Studio: 3 Published Workflows with Temporal Durable Execution</span>
      </div>
      <div className="timelineRow">
        <CheckCircle2 aria-hidden="true" size={16} />
        <span>Governed Operations: Multi-stage Human Approval Gates & Immutable Audit Trails</span>
      </div>
    </article>
  );
}
