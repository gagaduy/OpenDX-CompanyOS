// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { AgenticApplicationError } from "../../application/services/agentic-application.error";
import type { DepartmentToolAdapter, DepartmentToolAdapterRegistry } from "../../application/services/interfaces/department-tool-adapter";
import type { DepartmentToolName } from "../../application/tools/department-tool-contracts";
import type { CatalogHealthReader } from "../../../catalog";
import type { CrmHealthReader } from "../../../crm";
import type { InventoryHealthReader } from "../../../inventory";
import type { OrderHealthReader } from "../../../order";
import type { PaymentHealthReader } from "../../../payment";
import type { SupportHealthReader, SupportOrderReferenceReader } from "../../../support";
import { CatalogDepartmentToolAdapter } from "./catalog-department-tool.adapter";
import { CrmDepartmentToolAdapter } from "./crm-department-tool.adapter";
import { FinanceDepartmentToolAdapter } from "./finance-department-tool.adapter";
import { InventoryDepartmentToolAdapter } from "./inventory-department-tool.adapter";
import { OrderDepartmentToolAdapter } from "./order-department-tool.adapter";
import { SupportDepartmentToolAdapter } from "./support-department-tool.adapter";
import { SignedDepartmentToolCursorAdapter } from "./signed-department-tool-cursor";

export interface FixedDepartmentAdapters {
  readonly catalog: DepartmentToolAdapter;
  readonly inventory: DepartmentToolAdapter;
  readonly order: DepartmentToolAdapter;
  readonly finance: DepartmentToolAdapter;
  readonly crm: DepartmentToolAdapter;
  readonly support: DepartmentToolAdapter;
}

const owner: Readonly<Record<DepartmentToolName, keyof FixedDepartmentAdapters>> = {
  "catalog.product_completeness": "catalog",
  "catalog.publication_readiness": "catalog",
  "catalog.merchandising_summary": "catalog",
  "inventory.stock_risk": "inventory",
  "inventory.slow_stock": "inventory",
  "inventory.reservation_anomalies": "inventory",
  "order.stalled_summary": "order",
  "order.invalid_state_evidence": "order",
  "order.expiry_risk": "order",
  "finance.pending_payments": "finance",
  "finance.reconciliation_discrepancies": "finance",
  "finance.provider_evidence_status": "finance",
  "crm.segment_summary": "crm",
  "crm.followup_opportunities": "crm",
  "support.sla_risk": "support",
  "support.classification_summary": "support",
  "support.related_order_context": "support",
};

export class FixedDepartmentToolAdapterRegistry implements DepartmentToolAdapterRegistry {
  constructor(private readonly adapters: FixedDepartmentAdapters) {}
  resolve(name: DepartmentToolName, version: 1): DepartmentToolAdapter {
    const department = owner[name];
    if (version !== 1 || department === undefined) {
      throw new AgenticApplicationError("TOOL_UNAVAILABLE", "Department tool is unavailable");
    }
    return this.adapters[department];
  }
}

export function createFixedDepartmentToolAdapterRegistry(readers: {
  readonly catalog: CatalogHealthReader;
  readonly inventory: InventoryHealthReader;
  readonly order: OrderHealthReader;
  readonly finance: PaymentHealthReader;
  readonly crm: CrmHealthReader;
  readonly support: SupportHealthReader & SupportOrderReferenceReader;
}, now: () => string, cursorSecret: string): FixedDepartmentToolAdapterRegistry {
  const wrap = (adapter: DepartmentToolAdapter) =>
    new SignedDepartmentToolCursorAdapter(adapter, cursorSecret, now);
  return new FixedDepartmentToolAdapterRegistry({
    catalog: wrap(new CatalogDepartmentToolAdapter(readers.catalog, now)),
    inventory: wrap(new InventoryDepartmentToolAdapter(readers.inventory, now)),
    order: wrap(new OrderDepartmentToolAdapter(readers.order, now)),
    finance: wrap(new FinanceDepartmentToolAdapter(readers.finance, now)),
    crm: wrap(new CrmDepartmentToolAdapter(readers.crm, now)),
    support: wrap(new SupportDepartmentToolAdapter(readers.support, readers.support, now)),
  });
}
