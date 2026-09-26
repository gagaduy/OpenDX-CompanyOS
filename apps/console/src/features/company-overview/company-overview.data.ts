// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

export interface OverviewPanelData {
  readonly label: string;
  readonly value: string;
  readonly detail: string;
  readonly state: "live" | "foundation" | "alpha" | "planned";
}

export const overviewPanels: readonly OverviewPanelData[] = [
  {
    label: "Mission Control",
    value: "Tổng quan điều hành",
    detail: "Mục tiêu, rủi ro, phân quyền RBAC",
    state: "live",
  },
  {
    label: "Digital Workforce",
    value: "10 Digital Employees",
    detail: "AI CEO, Marketing, CSKH, Kho hàng, Kế toán, CRM...",
    state: "live",
  },
  {
    label: "Workflow Operations",
    value: "Visual Workflow Studio",
    detail: "3 Published business workflows (Marketing, CSKH, Kho)",
    state: "live",
  },
  {
    label: "Approval Inbox",
    value: "Human-governed",
    detail: "Cổng duyệt bồi thường, ngân sách & phát hành",
    state: "live",
  },
];

export const guardrails: readonly string[] = [
  "Company-first modeling",
  "Backend permission enforcement",
  "GraphRAG pre-retrieval filtering",
  "Audit and provenance by default",
];
