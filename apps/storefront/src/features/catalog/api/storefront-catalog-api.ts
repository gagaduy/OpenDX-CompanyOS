// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { ApiClient } from "../../../shared/http/api-client";
import {
  categoriesEnvelopeSchema,
  productEnvelopeSchema,
  productsEnvelopeSchema,
} from "../schemas/storefront-catalog.schema";
import { mapProductPage } from "../mappers/catalog.mapper";

export class StorefrontCatalogApi {
  constructor(private readonly client: ApiClient) {}
  async categories() {
    return (
      await this.client.request(
        "/v1/storefront/categories",
        categoriesEnvelopeSchema,
      )
    ).data;
  }
  async products(parameters: URLSearchParams) {
    return mapProductPage(
      await this.client.request(
        `/v1/storefront/products?${parameters}`,
        productsEnvelopeSchema,
      ),
    );
  }
  async product(slug: string) {
    return (
      await this.client.request(
        `/v1/storefront/products/${encodeURIComponent(slug)}`,
        productEnvelopeSchema,
      )
    ).data;
  }
}
