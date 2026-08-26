// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { useMemo } from "react";
import { Link, useSearchParams } from "react-router-dom";
import type { StaffRole } from "../../authentication/api/oidc-manager";
import { PageHeader } from "../../../shared/components/page-header";
import { SystemState } from "../../../shared/components/system-state";
import type { AgenticApi } from "../api/agentic-api";
import { AgenticMetrics } from "../components/agentic-metrics";
import { TaskTable } from "../components/task-table";
import { agenticTaskStates, TaskFilterBar } from "../components/task-filter-bar";
import { useAgenticTasks } from "../hooks/use-agentic-tasks";
import type { AgenticTaskState } from "../types/agentic.types";

export function AgenticTasksPage({ api, roles }: { readonly api: AgenticApi; readonly roles: readonly StaffRole[] }) { const [params, setParams] = useSearchParams(); const filter = useMemo(() => ({ page: 1, pageSize: 25, ...(agenticTaskStates.includes(params.get("state") as AgenticTaskState) ? { state: params.get("state") as AgenticTaskState } : {}) }), [params]); const { data, overview, error, loading, reload } = useAgenticTasks(api, filter); const canCreate = roles.some((role) => role === "administrator" || role === "agentic_operator"); return <section className="catalogWorkspace agenticWorkspace"><PageHeader eyebrow="Governed operations" title="Digital Workforce" description={`${data?.totalItems ?? 0} governed tasks`} actions={canCreate ? <Link className="primaryButton" to="/agentic/tasks/new">New task</Link> : undefined} />{overview && <AgenticMetrics overview={overview} />}<TaskFilterBar state={filter.state} onChange={(state) => setParams(state ? { state } : {})} />{loading && !data ? <SystemState kind="loading" title="Loading tasks…" /> : error ? <SystemState kind="error" title="Tasks could not be loaded" action={<button type="button" onClick={reload}>Retry</button>} /> : data?.items.length === 0 ? <SystemState kind="empty" title="No tasks match this view." /> : data ? <TaskTable tasks={data.items} /> : null}</section>; }
