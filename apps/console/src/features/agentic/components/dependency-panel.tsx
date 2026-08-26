// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { AgenticExecutionBranch } from "../types/agentic.types";

export function DependencyPanel({ branches }: { readonly branches: readonly AgenticExecutionBranch[] }) {
  const names = new Map(branches.map((branch) => [branch.id, title(branch.owner)]));
  return <section><h2>Department dependencies</h2><ol className="agenticDependencies">
    {branches.map((branch) => <li key={branch.id}><strong>{title(branch.owner)}</strong><span>{branch.state}</span><p>{branch.dependencies.length === 0 ? "Starts independently" : branch.dependencies.map((id) => `${names.get(id) ?? id} → ${title(branch.owner)}`).join(", ")}</p><small>{branch.toolNames.join(", ")} · {branch.dataClasses.join(", ")}</small></li>)}
  </ol></section>;
}
function title(value: string): string { return `${value.charAt(0).toUpperCase()}${value.slice(1)}`; }
