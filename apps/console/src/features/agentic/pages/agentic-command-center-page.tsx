// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { useMemo } from "react";
import type { StaffRole } from "../../authentication/api/oidc-manager";
import type { AgenticOperationsApi } from "../api/agentic-api";
import type { MarketingApi } from "../../marketing/api/marketing-api";
import type { CatalogApi } from "../../catalog/api/catalog-api";
import type { InventoryApi } from "../../inventory/api/inventory-api";
import type { SupportOperationsApi } from "../../support/api/support-api";
import { AgenticCommandCenter } from "../components/agentic-command-center";
import { useAgenticTasks } from "../hooks/use-agentic-tasks";

export function AgenticCommandCenterPage({
  api,
  marketingApi,
  catalogApi,
  inventoryApi,
  supportApi,
  roles,
}: {
  readonly api: AgenticOperationsApi;
  readonly marketingApi?: MarketingApi;
  readonly catalogApi?: CatalogApi;
  readonly inventoryApi?: InventoryApi;
  readonly supportApi?: SupportOperationsApi;
  readonly roles?: readonly StaffRole[];
}) {
  const filter = useMemo(() => ({ page: 1, pageSize: 10 }), []);
  const { data, overview, reload } = useAgenticTasks(api, filter);

  return (
    <AgenticCommandCenter
      api={api}
      marketingApi={marketingApi}
      catalogApi={catalogApi}
      inventoryApi={inventoryApi}
      supportApi={supportApi}
      overview={overview}
      tasks={data}
      onTaskCreated={reload}
    />
  );
}
