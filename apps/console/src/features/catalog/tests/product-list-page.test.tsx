// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createCatalogApi, type CatalogApi } from "../api/catalog-api";
import { ProductListPage } from "../pages/product-list-page";

const product = {
  id: "20000000-0000-4000-8000-000000000001",
  categoryId: "10000000-0000-4000-8000-000000000001",
  categoryName: "Drinkware",
  name: "Steel Bottle",
  slug: "steel-bottle",
  brand: "Nova",
  status: "draft" as const,
  primaryMediaId: "50000000-0000-4000-8000-000000000001",
  variantCount: 2,
  minimumPrice: 199000,
  maximumPrice: 249000,
  availabilitySummary: { totalAvailable: 8, purchasableVariantCount: 2 },
  updatedAt: "2026-08-05T03:00:00.000Z",
  version: 1,
};

function api(overrides: Partial<CatalogApi> = {}): CatalogApi {
  return {
    listProducts: vi.fn(async () => ({ items: [product], page: 1, pageSize: 20, totalItems: 1, totalPages: 1 })),
    listCategories: vi.fn(async () => []),
    getProduct: vi.fn(), createProduct: vi.fn(), updateProduct: vi.fn(), archiveProduct: vi.fn(async () => undefined),
    createCategory: vi.fn(), updateCategory: vi.fn(), archiveCategory: vi.fn(),
    createVariant: vi.fn(), updateVariant: vi.fn(), archiveVariant: vi.fn(), replacePrice: vi.fn(),
    uploadMedia: vi.fn(), updateMedia: vi.fn(), deleteMedia: vi.fn(), loadMediaPreview: vi.fn(async () => "blob:seed-image"), getProductAudit: vi.fn(),
    checkPublicationReadiness: vi.fn(), publishProduct: vi.fn(), unpublishProduct: vi.fn(),
    generateMerchandisingProposal: vi.fn(), applyMerchandisingProposal: vi.fn(),
    ...overrides,
  };
}

describe("ProductListPage", () => {
  it("renders loading, products, filters, pagination, and archive confirmation", async () => {
    let resolve!: (value: Awaited<ReturnType<CatalogApi["listProducts"]>>) => void;
    const client = api({ listProducts: vi.fn(() => new Promise<Awaited<ReturnType<CatalogApi["listProducts"]>>>((done) => { resolve = done; })) });
    render(<MemoryRouter><ProductListPage api={client} /></MemoryRouter>);
    expect(screen.getByText(/loading products/i)).toBeVisible();
    resolve({ items: [product], page: 1, pageSize: 20, totalItems: 21, totalPages: 2 });
    expect(await screen.findByText("Steel Bottle")).toBeVisible();
    expect(screen.getByRole("link", { name: /New product/i }))
      .toHaveAttribute("href", "/products/new");
    expect(screen.getByRole("region", { name: "Product filters" }))
      .toBeVisible();
    expect(screen.getByRole("table", { name: "Products" })).toBeVisible();
    expect(await screen.findByRole("img", { name: "Steel Bottle thumbnail" })).toHaveAttribute("src", "blob:seed-image");
    expect(screen.getByText("₫199,000 – ₫249,000")).toBeVisible();

    await userEvent.type(screen.getByRole("searchbox"), "bottle");
    await userEvent.selectOptions(screen.getByLabelText("Status"), "draft");
    await userEvent.click(screen.getByRole("button", { name: /next page/i }));
    await waitFor(() => expect(client.listProducts).toHaveBeenLastCalledWith(expect.objectContaining({ query: "bottle", status: "draft", page: 2 })));

    await userEvent.click(screen.getByRole("button", { name: /archive steel bottle/i }));
    expect(screen.getByText(/archive this product/i)).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: /^archive$/i }));
    expect(client.archiveProduct).toHaveBeenCalledWith(product.id, product.version);
  });

  it("renders empty and retryable error states", async () => {
    const listProducts = vi.fn()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce({ items: [], page: 1, pageSize: 20, totalItems: 0, totalPages: 0 });
    render(<MemoryRouter><ProductListPage api={api({ listProducts })} /></MemoryRouter>);
    await userEvent.click(await screen.findByRole("button", { name: /retry/i }));
    expect(await screen.findByText(/no products found/i)).toBeVisible();
    expect(listProducts).toHaveBeenCalledTimes(2);
  });

  it("shows published sold-out products and accepts the published filter", async () => {
    const published = { ...product, status: "published" as const, availabilitySummary: { totalAvailable: 0, purchasableVariantCount: 0 } };
    const client = api({ listProducts: vi.fn(async () => ({ items: [published], page: 1, pageSize: 20, totalItems: 1, totalPages: 1 })) });
    render(<MemoryRouter><ProductListPage api={client} /></MemoryRouter>);
    expect(await screen.findByText("Published · Out of stock")).toBeVisible();
    await userEvent.selectOptions(screen.getByLabelText("Status"), "published");
    await waitFor(() => expect(client.listProducts).toHaveBeenLastCalledWith(expect.objectContaining({ status: "published" })));
  });
});

describe("catalog API boundary", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("sends staff authorization and validates the response envelope", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ success: true, message: "Products retrieved", data: [product], meta: { page: 1, pageSize: 20, totalItems: 1, totalPages: 1 } }), { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    await createCatalogApi("http://api.test", "staff-token").listProducts({ page: 1, pageSize: 20 });
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("/v1/admin/catalog/products?"), expect.objectContaining({ headers: expect.objectContaining({ authorization: "Bearer staff-token", "x-correlation-id": expect.any(String) }) }));
  });

  it.each([
    [new Response(JSON.stringify({ success: true, data: [{ id: "broken" }] }), { status: 200 }), "INVALID_RESPONSE"],
    [new Response(JSON.stringify({ success: false, message: "raw", errorCode: "FORBIDDEN" }), { status: 403 }), "FORBIDDEN"],
  ] as const)("maps invalid or rejected responses to %s", async (response, code) => {
    vi.stubGlobal("fetch", vi.fn(async () => response));
    await expect(createCatalogApi("http://api.test", "token").listProducts({ page: 1, pageSize: 20 })).rejects.toMatchObject({ code });
  });
});
