// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { AgenticTaskSummary } from "../types/agentic.types";
export function TaskTable({ tasks }: { readonly tasks: readonly AgenticTaskSummary[] }) { return <div className="tableScroll"><table className="operationsTable"><thead><tr><th>Task</th><th>State</th><th>Owner</th><th>Updated</th></tr></thead><tbody>{tasks.map((task) => <tr key={task.id}><td data-label="Task">{task.goal}</td><td data-label="State">{task.state.replaceAll("_", " ")}</td><td data-label="Owner">{task.createdBy}</td><td data-label="Updated">{new Date(task.updatedAt).toLocaleString()}</td></tr>)}</tbody></table></div>; }
