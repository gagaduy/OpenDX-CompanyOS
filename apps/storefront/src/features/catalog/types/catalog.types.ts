// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { z } from "zod";
import type {
  categorySchema,
  heroSlideSchema,
  productSchema,
  storefrontAssuranceIconKeySchema,
  storefrontContentSchema,
  variantSchema,
} from "../schemas/storefront-catalog.schema";

export type StorefrontCategory = z.infer<typeof categorySchema>;
export type StorefrontHeroSlide = z.infer<typeof heroSlideSchema>;
export type StorefrontProduct = z.infer<typeof productSchema>;
export type StorefrontVariant = z.infer<typeof variantSchema>;
export type StorefrontAssuranceIconKey = z.infer<
  typeof storefrontAssuranceIconKeySchema
>;
export type StorefrontContent = z.infer<typeof storefrontContentSchema>;
export interface ProductPage {
  readonly items: readonly StorefrontProduct[];
  readonly page: number;
  readonly pageSize: number;
  readonly totalItems: number;
  readonly totalPages: number;
}
