// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { PublicWishlistProductReader } from "../../../../catalog";
import type { TransactionRunner } from "../../../../../shared/database/transaction";
import type { CustomerRepository } from "../../repositories/interfaces/customer.repository";
import { CustomerApplicationError } from "../customer-application.error";
import type {
  CustomerWishlistServiceContract,
  WishlistPageQuery,
} from "../interfaces/customer-wishlist.service";

const storageBatchSize = 48;

export class CustomerWishlistService
  implements CustomerWishlistServiceContract
{
  constructor(
    private readonly repository: CustomerRepository,
    private readonly products: PublicWishlistProductReader,
    private readonly transactions: TransactionRunner,
    private readonly now: () => string,
  ) {}

  async list(customerId: string, query: WishlistPageQuery) {
    const publicProducts = [];
    let storagePage = 1;
    let storedTotal = 0;
    do {
      const stored = await this.transactions.runReadOnly((session) =>
        this.repository.listWishlist(session, customerId, {
          page: storagePage,
          pageSize: storageBatchSize,
        }),
      );
      storedTotal = stored.totalItems;
      publicProducts.push(
        ...(await this.products.getPublishedByIds(stored.productIds)),
      );
      storagePage += 1;
    } while ((storagePage - 1) * storageBatchSize < storedTotal);

    const totalItems = publicProducts.length;
    const start = (query.page - 1) * query.pageSize;
    return {
      items: publicProducts.slice(start, start + query.pageSize),
      page: query.page,
      pageSize: query.pageSize,
      totalItems,
      totalPages: Math.ceil(totalItems / query.pageSize),
    };
  }

  async add(customerId: string, productId: string) {
    if ((await this.products.getPublishedByIds([productId])).length !== 1) {
      throw new CustomerApplicationError(
        "WISHLIST_PRODUCT_NOT_FOUND",
        "Published product not found",
      );
    }
    await this.transactions.run((session) =>
      this.repository.addWishlistItem(
        session,
        customerId,
        productId,
        this.now(),
      ),
    );
    return { productId, wished: true } as const;
  }

  async remove(customerId: string, productId: string) {
    await this.transactions.run((session) =>
      this.repository.removeWishlistItem(session, customerId, productId),
    );
    return { productId, wished: false } as const;
  }
}
