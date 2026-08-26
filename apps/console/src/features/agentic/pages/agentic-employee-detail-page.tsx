// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { PageHeader } from "../../../shared/components/page-header";
import type { AgenticApi } from "../api/agentic-api";
import { EmployeeGovernancePanel } from "../components/employee-governance-panel";
import { useAgenticEmployee } from "../hooks/use-agentic-employees";
import type { AgentKind } from "../types/agentic.types";

export function AgenticEmployeeDetailPage({ api, agentKind }: { readonly api: AgenticApi; readonly agentKind: AgentKind }) {
  const employee = useAgenticEmployee(api, agentKind);
  return <section className="catalogWorkspace agenticWorkspace"><PageHeader eyebrow="Digital Workforce" title="Digital Employee" description="Read-only governed execution profile" />{employee.error && <p role="alert">{employee.error}</p>}{employee.detail ? <EmployeeGovernancePanel employee={employee.detail} /> : !employee.error && <p>Loading Digital Employee…</p>}</section>;
}
