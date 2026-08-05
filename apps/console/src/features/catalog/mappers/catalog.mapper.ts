// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { z } from "zod";
import type { categorySchema, productListEnvelopeSchema, productSchema } from "../schemas/catalog-api.schema";
import type { Category, Product, ProductPage } from "../types/catalog.types";

export const mapCategory = (value: z.infer<typeof categorySchema>): Category => ({ ...value });
export const mapProduct = (value: z.infer<typeof productSchema>): Product => ({ ...value });
export const mapProductPage = (value: z.infer<typeof productListEnvelopeSchema>): ProductPage => ({
  items: value.data.map((item) => ({ ...item })),
  page: value.meta.page, pageSize: value.meta.pageSize, totalItems: value.meta.totalItems, totalPages: value.meta.totalPages,
});
