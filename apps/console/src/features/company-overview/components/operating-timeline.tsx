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
        <span>Repository foundation committed</span>
      </div>
      <div className="timelineRow">
        <GitBranch aria-hidden="true" size={16} />
        <span>Phase-gated specs and plans active</span>
      </div>
      <div className="timelineRow">
        <Network aria-hidden="true" size={16} />
        <span>Company graph and workflow modules remain gated</span>
      </div>
    </article>
  );
}
