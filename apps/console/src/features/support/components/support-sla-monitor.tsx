// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

export function SupportSlaMonitor() {
  return <section className="detailCard supportSlaMonitor" aria-label="SLA monitor">
    <h2>SLA monitor</h2>
    <strong>SLA timing unavailable</strong>
    <p className="subtleText">The support API does not currently expose a ticket-level SLA deadline or remaining duration.</p>
  </section>;
}
