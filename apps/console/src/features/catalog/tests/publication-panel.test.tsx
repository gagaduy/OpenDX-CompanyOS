// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ProductStatus, PublicationPanel } from "../components/publication-panel";

const product = {
  id: "20000000-0000-4000-8000-000000000001",
  categoryId: "10000000-0000-4000-8000-000000000001",
  name: "Nova Phone Pro",
  slug: "phone-pro",
  description: "Technology phone",
  attributes: {},
  status: "draft" as const,
  createdAt: "2026-08-05T00:00:00.000Z",
  updatedAt: "2026-08-05T00:00:00.000Z",
  version: 2,
};

describe("PublicationPanel", () => {
  it("lists every missing publication requirement and disables publish", () => {
    render(<PublicationPanel product={product} readiness={{ ready: false, missing: ["CURRENT_PRICE", "PRIMARY_IMAGE", "INVENTORY_ITEM"] }} canPublish onPublish={vi.fn()} onUnpublish={vi.fn()} />);
    expect(screen.getByText("Current VND price")).toBeVisible();
    expect(screen.getByText("Primary image with alt text")).toBeVisible();
    expect(screen.getByText("Initialized inventory")).toBeVisible();
    expect(screen.getByRole("button", { name: "Publish product" })).toBeDisabled();
  });

  it("confirms before unpublishing", async () => {
    const onUnpublish = vi.fn(async () => undefined);
    render(<PublicationPanel product={{ ...product, status: "published" }} readiness={{ ready: true, missing: [] }} canPublish onPublish={vi.fn()} onUnpublish={onUnpublish} />);
    await userEvent.click(screen.getByRole("button", { name: "Unpublish product" }));
    expect(screen.getByText(/keep its inventory/i)).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: "Confirm unpublish" }));
    expect(onUnpublish).toHaveBeenCalledOnce();
  });
});

describe("ProductStatus", () => {
  it("shows published sold-out state without unpublishing", () => {
    render(<ProductStatus status="published" available={0} />);
    expect(screen.getByText("Published · Out of stock")).toBeVisible();
  });
});
