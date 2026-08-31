// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { CatalogApiError, type CatalogApi } from "../api/catalog-api";
import { ProductEditorPage } from "../pages/product-editor-page";

const category = { id: "10000000-0000-4000-8000-000000000001", name: "Drinkware", slug: "drinkware", sortOrder: 0, status: "active" as const, createdAt: "2026-08-05T00:00:00.000Z", updatedAt: "2026-08-05T00:00:00.000Z", version: 1 };
const product = { id: "20000000-0000-4000-8000-000000000001", categoryId: category.id, name: "Steel Bottle", slug: "steel-bottle", brand: "Nova", description: "Reusable", attributes: {}, status: "draft" as const, createdAt: category.createdAt, updatedAt: category.updatedAt, version: 3 };

function api(overrides: Partial<CatalogApi> = {}): CatalogApi {
  return {
    listProducts: vi.fn(), listCategories: vi.fn(async () => [category]), getProduct: vi.fn(async () => product),
    createProduct: vi.fn(async (input) => ({ ...product, ...input })), updateProduct: vi.fn(async () => product), archiveProduct: vi.fn(),
    createCategory: vi.fn(), updateCategory: vi.fn(), archiveCategory: vi.fn(), ...overrides,
    createVariant: vi.fn(), updateVariant: vi.fn(), archiveVariant: vi.fn(), replacePrice: vi.fn(),
    uploadMedia: vi.fn(), updateMedia: vi.fn(), deleteMedia: vi.fn(), loadMediaPreview: vi.fn(), getProductAudit: vi.fn(async () => []),
    checkPublicationReadiness: vi.fn(async () => ({ ready: true, missing: [] })), publishProduct: vi.fn(async () => ({ ...product, status: "published" as const, version: 4 })), unpublishProduct: vi.fn(async () => product),
    generateMerchandisingProposal: vi.fn(), applyMerchandisingProposal: vi.fn(),
  };
}

describe("ProductEditorPage", () => {
  it("validates fields and creates a product with attributes", async () => {
    const client = api();
    render(<MemoryRouter initialEntries={["/products/new"]}><Routes><Route path="/products/:productId" element={<ProductEditorPage api={client} />} /></Routes></MemoryRouter>);
    await screen.findByRole("option", { name: "Drinkware" });
    await userEvent.click(screen.getByRole("button", { name: /save product/i }));
    expect(screen.getByText(/name is required/i)).toBeVisible();
    await userEvent.selectOptions(screen.getByLabelText("Category"), category.id);
    await userEvent.type(screen.getByLabelText("Name"), "Travel Mug");
    await userEvent.type(screen.getByLabelText("Brand"), "Nova");
    await userEvent.type(screen.getByLabelText("Description"), "Insulated travel mug");
    await userEvent.type(screen.getByLabelText("Attribute name 1"), "material");
    await userEvent.type(screen.getByLabelText("Attribute value 1"), "steel");
    expect(screen.getByLabelText("Slug preview")).toHaveValue("travel-mug");
    await userEvent.click(screen.getByRole("button", { name: /save product/i }));
    expect(client.createProduct).toHaveBeenCalledWith(expect.objectContaining({ name: "Travel Mug", attributes: { material: "steel" } }));
    expect(await screen.findByText(/product created/i)).toBeVisible();
    expect(screen.getByRole("tab", { name: "Media" })).toBeEnabled();
  });

  it("organizes product setup into named operational groups with progress context", async () => {
    render(<MemoryRouter initialEntries={["/products/new"]}><Routes><Route path="/products/:productId" element={<ProductEditorPage api={api()} />} /></Routes></MemoryRouter>);

    await screen.findByRole("option", { name: "Drinkware" });
    expect(within(screen.getByRole("group", { name: "Basic details" })).getByLabelText("Name")).toBeVisible();
    expect(within(screen.getByRole("group", { name: "Classification" })).getByLabelText("Category")).toBeVisible();
    expect(within(screen.getByRole("group", { name: "Description and attributes" })).getByLabelText("Description")).toBeVisible();
    expect(screen.getByRole("complementary", { name: "Product setup progress" })).toBeVisible();
  });

  it.each([
    ["CONFLICT", /slug already exists/i],
    ["STALE_VERSION", /refresh required/i],
    ["FORBIDDEN", /permission denied/i],
  ] as const)("maps %s without exposing transport details", async (code, message) => {
    const client = api({ updateProduct: vi.fn(async () => { throw new CatalogApiError(code, "raw"); }) });
    render(<MemoryRouter initialEntries={[`/products/${product.id}`]}><Routes><Route path="/products/:productId" element={<ProductEditorPage api={client} />} /></Routes></MemoryRouter>);
    await screen.findByDisplayValue("Steel Bottle");
    await userEvent.click(screen.getByRole("button", { name: /save product/i }));
    expect(await screen.findByText(message)).toBeVisible();
    expect(client.updateProduct).toHaveBeenCalledWith(product.id, expect.objectContaining({ version: 3 }));
  });

  it("switches among flat operational editor tabs", async () => {
    const client = api();
    render(<MemoryRouter initialEntries={[`/products/${product.id}`]}><Routes><Route path="/products/:productId" element={<ProductEditorPage api={client} />} /></Routes></MemoryRouter>);
    await screen.findByDisplayValue("Steel Bottle");
    expect(screen.getByRole("tablist", { name: "Product editor sections" })).toBeVisible();
    expect(screen.getAllByRole("tab")).toHaveLength(5);
    expect(screen.getByRole("button", { name: /Product tags.*Coming soon/i })).toBeDisabled();
    await userEvent.click(screen.getByRole("tab", { name: /variants and prices/i }));
    expect(screen.getByLabelText("SKU")).toBeVisible();
    expect(screen.getByRole("button", { name: /Import.*Coming soon/i })).toBeDisabled();
    await userEvent.click(screen.getByRole("tab", { name: "Media" }));
    expect(screen.getByLabelText("Product image")).toBeVisible();
    await userEvent.click(screen.getByRole("tab", { name: "Publication" }));
    expect(screen.getByRole("button", { name: "Publish product" })).toBeEnabled();
    await userEvent.click(screen.getByRole("button", { name: "Publish product" }));
    expect(client.publishProduct).toHaveBeenCalledWith(product.id, product.version);
    expect(await screen.findByText("Product published.")).toBeVisible();
    await userEvent.click(screen.getByRole("tab", { name: "Audit" }));
    expect(await screen.findByText(/no audit activity yet/i)).toBeVisible();
    expect(screen.getByRole("button", { name: /Export CSV.*Coming soon/i })).toBeDisabled();
  });
});
