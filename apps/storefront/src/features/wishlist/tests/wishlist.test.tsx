// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import type { CustomerSessionApi } from "../../authentication/api/customer-session-api";
import { CustomerSessionProvider } from "../../authentication/hooks/customer-session-context";
import type { ApiClient } from "../../../shared/http/api-client";
import { WishlistApi } from "../api/wishlist-api";
import { WishlistButton } from "../components/wishlist-button";
import { WishlistProvider } from "../hooks/wishlist-context";
import { useWishlist } from "../hooks/wishlist-context";

const productId = "b2000000-0000-4000-8000-000000000001";
const wishlistProduct = {
  id: productId,
  categoryId: "b1000000-0000-4000-8000-000000000001",
  categoryName: "Phones",
  name: "Nova Phone",
  slug: "nova-phone",
  description: "Nova phone",
  attributes: {},
  primaryMedia: { id: "media-1", altText: "Nova Phone", contentUrl: "/phone.png" },
  variants: [],
};

describe("WishlistApi", () => {
  it("uses authenticated list and CSRF-protected mutation routes", async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce({
        data: [],
        meta: { page: 1, pageSize: 24, totalItems: 0, totalPages: 0 },
      })
      .mockResolvedValueOnce({ data: { productId, wished: true } })
      .mockResolvedValueOnce({ data: { productId, wished: false } });
    const api = new WishlistApi({ request } as unknown as ApiClient);

    await api.list();
    await api.add(productId);
    await api.remove(productId);

    expect(request.mock.calls[0]?.[0]).toBe(
      "/v1/storefront/account/wishlist?page=1&pageSize=24",
    );
    expect(request.mock.calls[1]?.[0]).toBe(
      `/v1/storefront/account/wishlist/items/${productId}`,
    );
    expect(request.mock.calls[1]?.[2]).toMatchObject({ method: "PUT" });
    expect(request.mock.calls[2]?.[2]).toMatchObject({ method: "DELETE" });
  });
});

describe("WishlistButton", () => {
  it("routes an anonymous customer to sign-in with a safe local return URL", async () => {
    const sessionApi = {
      get: vi.fn(async () => ({ kind: "anonymous" as const })),
    } as unknown as CustomerSessionApi;
    const wishlistApi = {
      list: vi.fn(),
      add: vi.fn(),
      remove: vi.fn(),
    };
    render(
      <MemoryRouter initialEntries={["/products/nova-phone?variant=blue#buy"]}>
        <CustomerSessionProvider api={sessionApi}>
          <WishlistProvider api={wishlistApi}>
            <WishlistButton productId={productId} productName="Nova Phone" />
            <LocationProbe />
          </WishlistProvider>
        </CustomerSessionProvider>
      </MemoryRouter>,
    );

    await userEvent.click(
      await screen.findByRole("button", { name: "Thêm Nova Phone vào yêu thích" }),
    );
    expect(screen.getByLabelText("location")).toHaveTextContent(
      "/sign-in?returnTo=%2Fproducts%2Fnova-phone%3Fvariant%3Dblue%23buy",
    );
    expect(wishlistApi.add).not.toHaveBeenCalled();
  });

  it("waits for server confirmation and retains wished state after a failed remove", async () => {
    const sessionApi = {
      get: vi.fn(async () => ({
        kind: "customer" as const,
        customerId: "customer-1",
        email: "buyer@example.com",
        expiresAt: "2099-01-01T00:00:00.000Z",
      })),
    } as unknown as CustomerSessionApi;
    const remove = vi.fn(async () => {
      throw new Error("offline");
    });
    const wishlistApi = {
      list: vi.fn(async () => ({
        items: [wishlistProduct],
        page: 1,
        pageSize: 24,
        totalItems: 1,
        totalPages: 1,
      })),
      add: vi.fn(),
      remove,
    };
    render(
      <MemoryRouter initialEntries={["/products/nova-phone"]}>
        <CustomerSessionProvider api={sessionApi}>
          <WishlistProvider api={wishlistApi}>
            <WishlistButton productId={productId} productName="Nova Phone" />
          </WishlistProvider>
        </CustomerSessionProvider>
      </MemoryRouter>,
    );

    const button = await screen.findByRole("button", {
      name: "Xóa Nova Phone khỏi yêu thích",
    });
    await userEvent.click(button);
    await waitFor(() => expect(remove).toHaveBeenCalledWith(productId));
    expect(button).toHaveAttribute(
      "aria-label",
      "Xóa Nova Phone khỏi yêu thích",
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Không thể cập nhật danh sách yêu thích",
    );
  });

  it("refreshes the public server count after an idempotent add", async () => {
    const sessionApi = {
      get: vi.fn(async () => ({
        kind: "customer" as const,
        customerId: "customer-1",
        email: "buyer@example.com",
        expiresAt: "2099-01-01T00:00:00.000Z",
      })),
    } as unknown as CustomerSessionApi;
    const list = vi.fn(async () => ({
      items: [],
      page: 1,
      pageSize: 48,
      totalItems: 5,
      totalPages: 1,
    }));
    const wishlistApi = {
      list,
      add: vi.fn(async () => ({ productId, wished: true as const })),
      remove: vi.fn(),
    };
    render(
      <MemoryRouter initialEntries={["/products/nova-phone"]}>
        <CustomerSessionProvider api={sessionApi}>
          <WishlistProvider api={wishlistApi}>
            <WishlistButton productId={productId} productName="Nova Phone" />
            <WishlistCountProbe />
          </WishlistProvider>
        </CustomerSessionProvider>
      </MemoryRouter>,
    );

    await waitFor(() => expect(list).toHaveBeenCalledTimes(1));
    await userEvent.click(
      screen.getByRole("button", { name: "Thêm Nova Phone vào yêu thích" }),
    );
    await waitFor(() => expect(list).toHaveBeenCalledTimes(2));
    expect(screen.getByLabelText("wishlist count")).toHaveTextContent("5");
  });
});

function LocationProbe() {
  const location = useLocation();
  return (
    <output aria-label="location">
      {location.pathname}{location.search}{location.hash}
    </output>
  );
}

function WishlistCountProbe() {
  const wishlist = useWishlist();
  return <output aria-label="wishlist count">{wishlist.totalItems}</output>;
}
