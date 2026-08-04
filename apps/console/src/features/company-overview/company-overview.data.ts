// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

export interface OverviewPanelData {
  readonly label: string;
  readonly value: string;
  readonly detail: string;
}

export const overviewPanels: readonly OverviewPanelData[] = [
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

export const guardrails: readonly string[] = [
  "Company-first modeling",
  "Backend permission enforcement",
  "GraphRAG pre-retrieval filtering",
  "Audit and provenance by default",
];
