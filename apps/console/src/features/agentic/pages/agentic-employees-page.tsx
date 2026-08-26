// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { PageHeader } from "../../../shared/components/page-header";
import type { AgenticApi } from "../api/agentic-api";
import { EmployeeGovernancePanel } from "../components/employee-governance-panel";
import { EmployeeTable } from "../components/employee-table";
import { useAgenticEmployees } from "../hooks/use-agentic-employees";

export function AgenticEmployeesPage({ api }: { readonly api: AgenticApi }) {
  const workforce = useAgenticEmployees(api);
  return <section className="catalogWorkspace agenticWorkspace"><PageHeader eyebrow="Digital Workforce" title="Digital Employees" description="Read-only governance and execution evidence" />{workforce.error && <p role="alert">{workforce.error}</p>}{workforce.loading ? <p>Loading Digital Employees…</p> : workforce.employees.length === 0 ? <p>No Digital Employees are available.</p> : <div className="agenticEmployeeGrid"><EmployeeTable employees={workforce.employees} onSelect={(kind) => void workforce.select(kind)} />{workforce.detail ? <EmployeeGovernancePanel employee={workforce.detail} /> : <section><h2>Governance evidence</h2><p>Select a Digital Employee to inspect its active configuration.</p></section>}</div>}</section>;
}
