// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { EvidenceAttention } from "../types/payment.types";

export function EvidenceBadge({ label, attention }: { readonly label: string; readonly attention: EvidenceAttention }) {
  return <span className={`operationStatus evidence-${attention}`}>{label}</span>;
}
