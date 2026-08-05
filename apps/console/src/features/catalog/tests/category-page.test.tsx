// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import type { CatalogApi } from "../api/catalog-api";
import { CategoryPage } from "../pages/category-page";

const category = { id: "10000000-0000-4000-8000-000000000001", name: "Drinkware", slug: "drinkware", sortOrder: 0, status: "active" as const, createdAt: "2026-08-05T00:00:00.000Z", updatedAt: "2026-08-05T00:00:00.000Z", version: 1 };
function api(): CatalogApi {
  return {
    listProducts: vi.fn(), listCategories: vi.fn(async () => [category]), getProduct: vi.fn(), createProduct: vi.fn(), updateProduct: vi.fn(), archiveProduct: vi.fn(),
    createCategory: vi.fn(async (input) => ({ ...category, ...input })), updateCategory: vi.fn(async (_id, input) => ({ ...category, ...input, version: 2 })), archiveCategory: vi.fn(async () => undefined),
    createVariant: vi.fn(), updateVariant: vi.fn(), archiveVariant: vi.fn(), replacePrice: vi.fn(),
    uploadMedia: vi.fn(), updateMedia: vi.fn(), deleteMedia: vi.fn(), loadMediaPreview: vi.fn(), getProductAudit: vi.fn(),
    checkPublicationReadiness: vi.fn(), publishProduct: vi.fn(), unpublishProduct: vi.fn(),
  };
}

describe("CategoryPage", () => {
  it("creates and confirms category archival", async () => {
    const client = api();
    render(<MemoryRouter><CategoryPage api={client} /></MemoryRouter>);
    expect(await screen.findByText("Drinkware")).toBeVisible();
    await userEvent.type(screen.getByLabelText("Category name"), "Accessories");
    await userEvent.click(screen.getByRole("button", { name: /add category/i }));
    expect(client.createCategory).toHaveBeenCalledWith(expect.objectContaining({ name: "Accessories" }));
    await userEvent.click(screen.getByRole("button", { name: /edit drinkware/i }));
    await userEvent.clear(screen.getByLabelText("Edit category name"));
    await userEvent.type(screen.getByLabelText("Edit category name"), "Drinkware and mugs");
    await userEvent.click(screen.getByRole("button", { name: /save category/i }));
    expect(client.updateCategory).toHaveBeenCalledWith(category.id, { name: "Drinkware and mugs", version: 1 });
    await userEvent.click(screen.getByRole("button", { name: /archive drinkware/i }));
    expect(screen.getByText(/archive this category/i)).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: /^archive$/i }));
    expect(client.archiveCategory).toHaveBeenCalledWith(category.id, 1);
  });
});
