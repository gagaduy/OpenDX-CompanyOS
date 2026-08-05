// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { CatalogApiError, type CatalogApi } from "../api/catalog-api";
import { VariantEditor } from "../components/variant-editor";

const productId = "20000000-0000-4000-8000-000000000001";
const variant = { id: "30000000-0000-4000-8000-000000000001", productId, sku: "BOTTLE BLACK", title: "Black", optionValues: { color: "Black" }, status: "active" as const, createdAt: "2026-08-05T00:00:00.000Z", updatedAt: "2026-08-05T00:00:00.000Z", version: 1 };

function client(overrides: Record<string, unknown> = {}) {
  return {
    createVariant: vi.fn(async () => variant),
    updateVariant: vi.fn(), archiveVariant: vi.fn(),
    replacePrice: vi.fn(async () => ({ id: "40000000-0000-4000-8000-000000000001", variantId: variant.id, amountMinor: 299000, currency: "VND" as const, validFrom: variant.createdAt, createdBy: "user_catalog" })),
    ...overrides,
  } as unknown as CatalogApi;
}

describe("VariantEditor", () => {
  it("normalizes SKU, captures options, and confirms VND price replacement", async () => {
    const api = client();
    render(<VariantEditor api={api} productId={productId} />);
    await userEvent.type(screen.getByLabelText("SKU"), " bottle black ");
    await userEvent.type(screen.getByLabelText("Variant title"), "Black");
    await userEvent.type(screen.getByLabelText("Option name 1"), "color");
    await userEvent.type(screen.getByLabelText("Option value 1"), "Black");
    expect(screen.getByText("BOTTLE BLACK")).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: /add variant/i }));
    expect(api.createVariant).toHaveBeenCalledWith(productId, { sku: "BOTTLE BLACK", title: "Black", optionValues: { color: "Black" } });
    await userEvent.type(await screen.findByLabelText("VND price for BOTTLE BLACK"), "299000");
    expect(screen.getByText("₫299,000")).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: /replace price/i }));
    expect(screen.getByText(/replace the current price/i)).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: /confirm replacement/i }));
    expect(api.replacePrice).toHaveBeenCalledWith(productId, variant.id, 299000);
  });

  it("shows option validation and SKU conflicts", async () => {
    const api = client({ createVariant: vi.fn(async () => { throw new CatalogApiError("CONFLICT", "raw"); }) });
    render(<VariantEditor api={api} productId={productId} />);
    await userEvent.click(screen.getByRole("button", { name: /add variant/i }));
    expect(screen.getByText(/sku, title, and one option are required/i)).toBeVisible();
    await userEvent.type(screen.getByLabelText("SKU"), "duplicate");
    await userEvent.type(screen.getByLabelText("Variant title"), "Duplicate");
    await userEvent.type(screen.getByLabelText("Option name 1"), "size");
    await userEvent.type(screen.getByLabelText("Option value 1"), "M");
    await userEvent.click(screen.getByRole("button", { name: /add variant/i }));
    expect(await screen.findByText(/sku already exists/i)).toBeVisible();
  });
});
