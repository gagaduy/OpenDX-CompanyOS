// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { OverviewPanelData } from "../company-overview.data";

export function OverviewPanel({
  label,
  value,
  detail,
  state,
}: OverviewPanelData) {
  return (
    <article className="panel" aria-label={label}>
      <div className="panelLabel">{label}<span className={`capabilityState capabilityState-${state}`}>{stateLabel(state)}</span></div>
      <strong>{value}</strong>
      <span>{detail}</span>
    </article>
  );
}

function stateLabel(state: OverviewPanelData["state"]) {
  return state.charAt(0).toUpperCase() + state.slice(1);
}
