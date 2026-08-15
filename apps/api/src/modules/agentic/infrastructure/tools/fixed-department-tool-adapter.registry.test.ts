// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { CatalogDepartmentToolAdapter } from "./catalog-department-tool.adapter";
import { CrmDepartmentToolAdapter } from "./crm-department-tool.adapter";
import { FinanceDepartmentToolAdapter } from "./finance-department-tool.adapter";
import { FixedDepartmentToolAdapterRegistry } from "./fixed-department-tool-adapter.registry";
import { InventoryDepartmentToolAdapter } from "./inventory-department-tool.adapter";
import { OrderDepartmentToolAdapter } from "./order-department-tool.adapter";
import { SupportDepartmentToolAdapter } from "./support-department-tool.adapter";

const now = () => "2026-08-16T05:00:00.000Z";

describe("FixedDepartmentToolAdapterRegistry", () => {
  it("resolves exactly the 17 immutable name/version pairs", () => {
    const adapters = adapterFixture();
    const registry = new FixedDepartmentToolAdapterRegistry(adapters);
    for (const [names, adapter] of [
      [["catalog.product_completeness", "catalog.publication_readiness", "catalog.merchandising_summary"], adapters.catalog],
      [["inventory.stock_risk", "inventory.slow_stock", "inventory.reservation_anomalies"], adapters.inventory],
      [["order.stalled_summary", "order.invalid_state_evidence", "order.expiry_risk"], adapters.order],
      [["finance.pending_payments", "finance.reconciliation_discrepancies", "finance.provider_evidence_status"], adapters.finance],
      [["crm.segment_summary", "crm.followup_opportunities"], adapters.crm],
      [["support.sla_risk", "support.classification_summary", "support.related_order_context"], adapters.support],
    ] as const) {
      for (const name of names) expect(registry.resolve(name, 1)).toBe(adapter);
    }
    expect(() => registry.resolve("catalog.product_completeness", 2 as never))
      .toThrowError(expect.objectContaining({ code: "TOOL_UNAVAILABLE" }));
    expect(() => registry.resolve("catalog.query" as never, 1))
      .toThrowError(expect.objectContaining({ code: "TOOL_UNAVAILABLE" }));
  });

  it("wraps one public reader call with immutable result metadata", async () => {
    const readers = readersFixture();
    const adapter = new CatalogDepartmentToolAdapter(readers.catalog as never, now);
    const output = await adapter.execute(context(), {});
    expect(readers.catalog.productCompleteness).toHaveBeenCalledWith(now());
    expect(output).toEqual(expect.objectContaining({
      source: "catalog.health",
      sourceVersion: 1,
      retrievedAt: now(),
      window: null,
      freshness: { asOf: now(), maxAgeSeconds: 60, status: "fresh" },
      classification: "internal",
      shareability: "executive_summary",
      provenanceId: context().invocationId,
      summary: { totalProducts: 0 },
    }));
  });

  it("keeps adapters free of SQL, database clients, private repositories, and mutations", async () => {
    const directory = dirname(fileURLToPath(import.meta.url));
    const files = ["catalog", "inventory", "order", "finance", "crm", "support"]
      .map((name) => join(directory, `${name}-department-tool.adapter.ts`));
    const source = (await Promise.all(files.map((file) => readFile(file, "utf8")))).join("\n");
    expect(source).not.toMatch(/infrastructure\/repositories|\b(pg|Pool|DatabaseSession)\b/i);
    expect(source).not.toMatch(/\b(SELECT|INSERT|UPDATE|DELETE|CREATE|DROP|ALTER)\b/);
    expect(source).not.toMatch(/\b(create|update|delete|mutate|transition|reserve|complete)[A-Z]/);
  });
});

function adapterFixture() {
  const readers = readersFixture();
  return {
    catalog: new CatalogDepartmentToolAdapter(readers.catalog as never, now),
    inventory: new InventoryDepartmentToolAdapter(readers.inventory as never, now),
    order: new OrderDepartmentToolAdapter(readers.order as never, now),
    finance: new FinanceDepartmentToolAdapter(readers.finance as never, now),
    crm: new CrmDepartmentToolAdapter(readers.crm as never, now),
    support: new SupportDepartmentToolAdapter(readers.support as never, readers.support as never, now),
  };
}

function readersFixture() {
  return {
    catalog: {
      productCompleteness: vi.fn(async () => ({ totalProducts: 0 })),
      publicationReadiness: vi.fn(), merchandisingSummary: vi.fn(),
    },
    inventory: { stockRisk: vi.fn(), slowStock: vi.fn(), reservationAnomalies: vi.fn() },
    order: { stalledSummary: vi.fn(), invalidStateEvidence: vi.fn(), expiryRisk: vi.fn() },
    finance: { pendingPayments: vi.fn(), reconciliationDiscrepancies: vi.fn(), providerEvidenceStatus: vi.fn() },
    crm: { segmentSummary: vi.fn(), followupOpportunities: vi.fn() },
    support: { slaRisk: vi.fn(), classificationSummary: vi.fn(), findRelatedOrder: vi.fn() },
  };
}

function context() {
  return {
    invocationId: "11111111-1111-4111-8111-111111111111",
    taskId: "22222222-2222-4222-8222-222222222222",
    agentKind: "catalog" as const,
    toolName: "catalog.product_completeness" as const,
    toolVersion: 1 as const,
    attempt: 1,
    correlationId: "correlation",
    causationId: "causation",
  };
}
