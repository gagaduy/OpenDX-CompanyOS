// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { CatalogApi } from "../api/catalog-api";
import { CatalogAuditTimeline } from "../components/catalog-audit-timeline";

const productId = "20000000-0000-4000-8000-000000000001";
function api(entries: readonly unknown[]) { return { getProductAudit: vi.fn(async () => entries) } as unknown as CatalogApi; }

describe("CatalogAuditTimeline", () => {
  it("renders an explicit empty state", async () => {
    render(<CatalogAuditTimeline api={api([])} productId={productId} />);
    expect(await screen.findByText(/no audit activity yet/i)).toBeVisible();
  });

  it("renders audit entries newest first with provenance", async () => {
    const entries = [
      { id: "60000000-0000-4000-8000-000000000001", actorId: "user_a", action: "catalog.product.created", resourceType: "product" as const, resourceId: productId, outcome: "success" as const, correlationId: "corr_1", metadata: { version: 1 }, occurredAt: "2026-08-05T01:00:00.000Z" },
      { id: "60000000-0000-4000-8000-000000000002", actorId: "user_b", action: "catalog.product.updated", resourceType: "product" as const, resourceId: productId, outcome: "success" as const, correlationId: "corr_2", metadata: { version: 2 }, occurredAt: "2026-08-05T02:00:00.000Z" },
    ];
    render(<CatalogAuditTimeline api={api(entries)} productId={productId} />);
    const items = await screen.findAllByRole("listitem");
    expect(items[0]).toHaveTextContent("catalog.product.updated");
    expect(items[0]).toHaveTextContent("user_b");
    expect(items[0]).toHaveTextContent("corr_2");
  });
});
