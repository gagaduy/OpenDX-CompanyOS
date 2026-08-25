// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { CatalogApi } from "../api/catalog-api";
import { MediaManager } from "../components/media-manager";

const productId = "20000000-0000-4000-8000-000000000001";
const media = { id: "50000000-0000-4000-8000-000000000001", productId, contentType: "image/png" as const, byteSize: 4, altText: "Bottle front", sortOrder: 0, isPrimary: false, previewUrl: `/v1/admin/catalog/products/${productId}/media/50000000-0000-4000-8000-000000000001/content`, createdAt: "2026-08-05T00:00:00.000Z" };

function client() {
  return {
    uploadMedia: vi.fn(async (_productId, _input, onProgress: (progress: number) => void) => { onProgress(55); return media; }),
    updateMedia: vi.fn(async (_productId, _mediaId, input) => ({ ...media, ...input })),
    deleteMedia: vi.fn(async () => undefined),
    loadMediaPreview: vi.fn(async () => "blob:http://api.test/preview"),
  } as unknown as CatalogApi;
}

describe("MediaManager", () => {
  it("validates upload, reports progress, edits metadata, previews, and confirms deletion", async () => {
    const api = client();
    render(<MediaManager api={api} productId={productId} maximumBytes={10} />);
    fireEvent.change(screen.getByLabelText("Product image"), { target: { files: [new File(["bad"], "bad.gif", { type: "image/gif" })] } });
    expect(screen.getByText(/jpeg, png, webp, or avif/i)).toBeVisible();
    fireEvent.change(screen.getByLabelText("Product image"), { target: { files: [new File(["12345678901"], "large.png", { type: "image/png" })] } });
    expect(screen.getByText(/no larger than 10 bytes/i)).toBeVisible();
    fireEvent.change(screen.getByLabelText("Product image"), { target: { files: [new File(["image"], "bottle.png", { type: "image/png" })] } });
    await userEvent.click(screen.getByRole("button", { name: /upload image/i }));
    expect(screen.getByText(/alt text is required/i)).toBeVisible();
    await userEvent.type(screen.getByLabelText("Image alt text"), "Bottle front");
    await userEvent.click(screen.getByRole("button", { name: /upload image/i }));
    expect(await screen.findByText("Upload 55%")).toBeVisible();
    expect(await screen.findByRole("img", { name: "Bottle front" })).toHaveAttribute("src", "blob:http://api.test/preview");
    await userEvent.click(screen.getByRole("button", { name: /make primary/i }));
    expect(api.updateMedia).toHaveBeenCalledWith(productId, media.id, { isPrimary: true });
    await userEvent.clear(screen.getByLabelText("Sort order for Bottle front"));
    await userEvent.type(screen.getByLabelText("Sort order for Bottle front"), "2");
    await userEvent.click(screen.getByRole("button", { name: /save media order/i }));
    expect(api.updateMedia).toHaveBeenCalledWith(productId, media.id, { sortOrder: 2 });
    await userEvent.clear(screen.getByLabelText("Alt text for Bottle front"));
    await userEvent.type(screen.getByLabelText("Alt text for Bottle front"), "Bottle close-up");
    await userEvent.click(screen.getByRole("button", { name: /save alt text/i }));
    expect(api.updateMedia).toHaveBeenCalledWith(productId, media.id, { altText: "Bottle close-up" });
    await userEvent.click(screen.getByRole("button", { name: /delete bottle close-up/i }));
    expect(screen.getByText(/delete this image/i)).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: /^delete$/i }));
    expect(api.deleteMedia).toHaveBeenCalledWith(productId, media.id);
  });
});
