// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it, vi } from "vitest";
import type { PublicProductDto } from "../../../../catalog";
import type { TransactionRunner } from "../../../../../shared/database/transaction";
import type { CustomerRepository } from "../../repositories/interfaces/customer.repository";
import { CustomerWishlistService } from "./customer-wishlist.service";

const customerId = "c1000000-0000-4000-8000-000000000001";
const ids = [
  "c2000000-0000-4000-8000-000000000001",
  "c2000000-0000-4000-8000-000000000002",
  "c2000000-0000-4000-8000-000000000003",
] as const;

describe("CustomerWishlistService", () => {
  it("rejects an unpublished product before persistence", async () => {
    const repository = { addWishlistItem: vi.fn() } as unknown as CustomerRepository;
    const products = { getPublishedByIds: vi.fn(async () => []) };
    const service = new CustomerWishlistService(
      repository,
      products,
      transactions(),
      () => "2026-08-27T12:00:00.000Z",
    );

    await expect(service.add(customerId, ids[0])).rejects.toMatchObject({
      code: "WISHLIST_PRODUCT_NOT_FOUND",
    });
    expect(repository.addWishlistItem).not.toHaveBeenCalled();
  });

  it("adds and removes idempotently with server-confirmed state", async () => {
    const repository = {
      addWishlistItem: vi.fn(async () => undefined),
      removeWishlistItem: vi.fn(async () => undefined),
    } as unknown as CustomerRepository;
    const products = { getPublishedByIds: vi.fn(async () => [product(ids[0])]) };
    const service = new CustomerWishlistService(
      repository,
      products,
      transactions(),
      () => "2026-08-27T12:00:00.000Z",
    );

    await expect(service.add(customerId, ids[0])).resolves.toEqual({
      productId: ids[0],
      wished: true,
    });
    await expect(service.remove(customerId, ids[0])).resolves.toEqual({
      productId: ids[0],
      wished: false,
    });
  });

  it("filters unpublished records and derives public pagination metadata", async () => {
    const repository = {
      listWishlist: vi.fn(async () => ({
        productIds: [...ids],
        totalItems: 3,
      })),
    } as unknown as CustomerRepository;
    const products = {
      getPublishedByIds: vi.fn(async () => [product(ids[0]), product(ids[2])]),
    };
    const service = new CustomerWishlistService(
      repository,
      products,
      transactions(),
      () => "2026-08-27T12:00:00.000Z",
    );

    await expect(service.list(customerId, { page: 1, pageSize: 1 })).resolves.toEqual({
      items: [product(ids[0])],
      page: 1,
      pageSize: 1,
      totalItems: 2,
      totalPages: 2,
    });
  });
});

function transactions(): TransactionRunner {
  return {
    run: (work) => work({ query: vi.fn() }),
    runReadOnly: (work) => work({ query: vi.fn() }),
  };
}

function product(id: string): PublicProductDto {
  return {
    id,
    categoryId: "c3000000-0000-4000-8000-000000000001",
    categoryName: "Phones",
    name: `Phone ${id.at(-1)}`,
    slug: `phone-${id.at(-1)}`,
    description: "Phone",
    attributes: {},
    primaryMedia: { id: `${id}-media`, altText: "Phone", contentUrl: "/phone.png" },
    variants: [],
  };
}
