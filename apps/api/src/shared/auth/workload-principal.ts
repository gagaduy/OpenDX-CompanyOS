// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

export interface WorkloadPrincipal {
  readonly subject: string;
  readonly clientId: string;
  readonly workload: "agentic_worker";
}
