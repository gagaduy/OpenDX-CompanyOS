// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { AgenticEmployeeSummary, AgentKind } from "../types/agentic.types";

export function EmployeeTable({ employees, onSelect }: { readonly employees: readonly AgenticEmployeeSummary[]; readonly onSelect: (kind: AgentKind) => void }) {
  return <table className="operationsTable agenticEmployeeTable"><thead><tr><th>Digital Employee</th><th>Department</th><th>Governance</th><th>Evidence</th></tr></thead><tbody>{employees.map((employee) => <tr key={employee.kind}><td data-label="Digital Employee"><strong>{label(employee.kind)}</strong></td><td data-label="Department">{employee.department}</td><td data-label="Governance">{employee.active ? "Active" : "Inactive"}</td><td data-label="Evidence"><button type="button" onClick={() => onSelect(employee.kind)}>View {label(employee.kind)}</button></td></tr>)}</tbody></table>;
}
function label(kind: string): string { return kind === "ai_ceo" ? "AI CEO" : kind === "crm" ? "CRM" : `${kind.charAt(0).toUpperCase()}${kind.slice(1)}`; }
