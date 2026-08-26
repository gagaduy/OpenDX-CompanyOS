// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { useMemo } from "react";
import type { StaffRole } from "../../authentication/api/oidc-manager";
import type { AgenticOperationsApi } from "../api/agentic-api";
import { AgenticCommandCenter } from "../components/agentic-command-center";
import { useAgenticTasks } from "../hooks/use-agentic-tasks";

export function AgenticCommandCenterPage({
  api,
  roles,
}: {
  readonly api: AgenticOperationsApi;
  readonly roles?: readonly StaffRole[];
}) {
  const filter = useMemo(() => ({ page: 1, pageSize: 10 }), []);
  const { data, overview, reload } = useAgenticTasks(api, filter);

  return (
    <AgenticCommandCenter
      api={api}
      overview={overview}
      tasks={data}
      onTaskCreated={reload}
    />
  );
}
