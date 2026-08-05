// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { InventoryApiError, type InventoryApi } from "../api/inventory-api";
import { InventoryPage } from "../pages/inventory-page";
import type { InventoryItemView } from "../types/inventory.types";
import type { StaffRole } from "../../authentication/api/oidc-manager";

const item: InventoryItemView = {
  id: "60000000-0000-4000-8000-000000000001",
  variantId: "30000000-0000-4000-8000-000000000001",
  productName: "Nova Phone Pro",
  variantTitle: "Black",
  sku: "TECH-PHONE-BLACK",
  onHand: 8,
  reserved: 3,
  available: 5,
  stockStatus: "low",
  version: 2,
};

function api(overrides: Partial<InventoryApi> = {}): InventoryApi {
  return {
    listItems: vi.fn(async () => ({ items: [item], page: 1, pageSize: 20, totalItems: 1, totalPages: 1 })),
    getItem: vi.fn(async () => item),
    receive: vi.fn(async () => ({ ...item, onHand: 13, available: 10, stockStatus: "healthy" as const, version: 3 })),
    adjust: vi.fn(async () => ({ ...item, onHand: 6, available: 3, version: 3 })),
    listMovements: vi.fn(async () => ({
      items: [{ id: "70000000-0000-4000-8000-000000000001", movementType: "receive" as const, onHandDelta: 8, reservedDelta: 0, reasonCode: "INITIAL_STOCK", actorType: "system" as const, actorId: "seed", occurredAt: "2026-08-05T00:00:00.000Z" }],
      page: 1, pageSize: 20, totalItems: 1, totalPages: 1,
    })),
    ...overrides,
  };
}

function renderPage(client: InventoryApi, roles: readonly StaffRole[] = ["inventory_manager"]) {
  return render(<MemoryRouter><InventoryPage api={client} roles={roles} /></MemoryRouter>);
}

describe("InventoryPage", () => {
  it("shows balances and opens movement history", async () => {
    renderPage(api());
    expect(await screen.findByText("TECH-PHONE-BLACK")).toBeVisible();
    expect(screen.getByText("5 available")).toBeVisible();
    expect(screen.getByLabelText("Stock status: Low stock")).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: /view tech-phone-black/i }));
    expect(await screen.findByRole("heading", { name: /movement history/i })).toBeVisible();
    expect(screen.getByText("INITIAL_STOCK")).toBeVisible();
  });

  it("requires an adjustment reason and preserves entered values", async () => {
    renderPage(api());
    await screen.findByText("TECH-PHONE-BLACK");
    await userEvent.click(screen.getByRole("button", { name: /adjust tech-phone-black/i }));
    await userEvent.type(screen.getByLabelText("Quantity change"), "-2");
    await userEvent.click(screen.getByRole("button", { name: /save adjustment/i }));
    expect(screen.getByText(/reason is required/i)).toBeVisible();
    expect(screen.getByLabelText("Quantity change")).toHaveValue(-2);
  });

  it("preserves mutation input after a recoverable stale-version error", async () => {
    const client = api({ adjust: vi.fn(async () => { throw new InventoryApiError("STALE_VERSION", "Refresh required"); }) });
    renderPage(client);
    await screen.findByText("TECH-PHONE-BLACK");
    await userEvent.click(screen.getByRole("button", { name: /adjust tech-phone-black/i }));
    await userEvent.type(screen.getByLabelText("Quantity change"), "-2");
    await userEvent.type(screen.getByLabelText("Reason"), "Cycle count");
    await userEvent.click(screen.getByRole("button", { name: /save adjustment/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Refresh required");
    expect(screen.getByLabelText("Quantity change")).toHaveValue(-2);
  });

  it("hides mutation controls from catalog-only readers", async () => {
    renderPage(api(), ["catalog_manager"]);
    await screen.findByText("TECH-PHONE-BLACK");
    expect(screen.queryByRole("button", { name: /receive tech-phone-black/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /adjust tech-phone-black/i })).not.toBeInTheDocument();
  });

  it("announces loading and renders sold-out stock without hiding it", async () => {
    let resolve!: (value: Awaited<ReturnType<InventoryApi["listItems"]>>) => void;
    const listItems = vi.fn(() => new Promise<Awaited<ReturnType<InventoryApi["listItems"]>>>((done) => { resolve = done; }));
    renderPage(api({ listItems }));
    expect(screen.getByRole("status")).toHaveTextContent("Loading inventory");
    resolve({ items: [{ ...item, available: 0, reserved: 8, stockStatus: "out_of_stock" }], page: 1, pageSize: 20, totalItems: 1, totalPages: 1 });
    expect(await screen.findByLabelText("Stock status: Out of stock")).toBeVisible();
  });

  it("receives and adjusts stock then announces success", async () => {
    const client = api();
    renderPage(client);
    await screen.findByText("TECH-PHONE-BLACK");
    await userEvent.click(screen.getByRole("button", { name: /receive tech-phone-black/i }));
    await userEvent.type(screen.getByLabelText("Quantity received"), "5");
    await userEvent.click(screen.getByRole("button", { name: /^receive stock$/i }));
    expect(client.receive).toHaveBeenCalledWith(expect.objectContaining({ variantId: item.variantId, quantity: 5 }));
    expect(await screen.findByRole("status")).toHaveTextContent("Stock receipt saved");
    await userEvent.click(screen.getByRole("button", { name: /adjust tech-phone-black/i }));
    await userEvent.type(screen.getByLabelText("Quantity change"), "-1");
    await userEvent.type(screen.getByLabelText("Reason"), "Cycle count");
    await userEvent.click(screen.getByRole("button", { name: /save adjustment/i }));
    expect(client.adjust).toHaveBeenCalledWith(item.id, expect.objectContaining({ delta: -1, reasonNote: "Cycle count", version: 2 }));
    expect(await screen.findByRole("status")).toHaveTextContent("Stock adjustment saved");
  });

  it("reads filters and pagination from the URL and resets page on filter change", async () => {
    const client = api({ listItems: vi.fn(async (query) => ({ items: [item], page: query.page, pageSize: 20, totalItems: 21, totalPages: 2 })) });
    render(<MemoryRouter initialEntries={["/inventory?query=phone&stockStatus=low&page=2"]}><InventoryPage api={client} roles={["inventory_manager"]} /></MemoryRouter>);
    await waitFor(() => expect(client.listItems).toHaveBeenCalledWith(expect.objectContaining({ query: "phone", stockStatus: "low", page: 2 }), expect.any(AbortSignal)));
    await userEvent.selectOptions(screen.getByLabelText("Stock status"), "out_of_stock");
    await waitFor(() => expect(client.listItems).toHaveBeenLastCalledWith(expect.objectContaining({ stockStatus: "out_of_stock", page: 1 }), expect.any(AbortSignal)));
  });

  it("shows an empty state and retries a failed list", async () => {
    const listItems = vi.fn()
      .mockRejectedValueOnce(new Error("network"))
      .mockResolvedValue({ items: [], page: 1, pageSize: 20, totalItems: 0, totalPages: 0 });
    renderPage(api({ listItems }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/could not be loaded/i);
    await userEvent.click(screen.getByRole("button", { name: /retry/i }));
    expect(await screen.findByText(/no inventory items found/i)).toBeVisible();
  });
});
