// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { OverviewPanelData } from "../company-overview.data";

export function OverviewPanel({
  label,
  value,
  detail,
}: OverviewPanelData) {
  return (
    <article className="panel">
      <div className="panelLabel">{label}</div>
      <strong>{value}</strong>
      <span>{detail}</span>
    </article>
  );
}
