// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { AgenticEmployeeSummary, AgentKind } from "../types/agentic.types";

export function EmployeeTable({ employees, selectedKind, onSelect }: { readonly employees: readonly AgenticEmployeeSummary[]; readonly selectedKind?: AgentKind; readonly onSelect: (kind: AgentKind) => void }) {
  return <table className="operationsTable agenticEmployeeTable"><thead><tr><th>Digital Employee</th><th>Department</th><th>Governance</th><th>Evidence</th></tr></thead><tbody>{employees.map((employee) => <tr key={employee.kind} aria-selected={employee.kind === selectedKind}><td data-label="Digital Employee"><strong>{label(employee.kind)}</strong></td><td data-label="Department">{departmentLabel(employee.department)}</td><td data-label="Governance">{employee.active ? "Active" : "Inactive"}</td><td data-label="Evidence"><button type="button" aria-pressed={employee.kind === selectedKind} onClick={() => onSelect(employee.kind)}>View {label(employee.kind)}</button></td></tr>)}</tbody></table>;
}
function label(kind: string): string {
  switch (kind) {
    case "ai_ceo": return "AI CEO";
    case "crm": return "CRM";
    case "marketing_content": return "Marketing Content";
    case "marketing_visual": return "Marketing Visual";
    case "marketing_publisher": return "Marketing Publisher";
    default: return `${kind.charAt(0).toUpperCase()}${kind.slice(1)}`;
  }
}
function departmentLabel(department: string): string {
  switch (department.toLowerCase()) {
    case "marketing_content": return "Marketing (Content)";
    case "marketing_visual": return "Marketing (Visual)";
    case "marketing_publisher": return "Marketing (Publisher)";
    default: return department;
  }
}
