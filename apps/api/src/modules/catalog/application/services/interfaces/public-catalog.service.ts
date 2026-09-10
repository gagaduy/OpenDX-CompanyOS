// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { PublicProductListQuery } from "../../dtos/requests/public-catalog-request.dto";
import type {
  PaginatedPublicProductsDto,
  PublicCategoryDto,
  PublicProductDto,
  PublicStorefrontContentDto,
  StorefrontHeroSlideDto,
  StorefrontHeroPresentationDto,
} from "../../dtos/responses/public-catalog-response.dto";
import type {
  PublicHeroMediaAuthorization,
  PublicMediaAuthorization,
} from "../../repositories/interfaces/public-catalog.repository";

export interface PublicCatalogServiceContract {
  getStorefrontContent(): Promise<PublicStorefrontContentDto>;
  listCategories(): Promise<readonly PublicCategoryDto[]>;
  listHeroSlides(): Promise<readonly StorefrontHeroSlideDto[]>;
  getHeroPresentation(): Promise<StorefrontHeroPresentationDto>;
  listProducts(query: PublicProductListQuery): Promise<PaginatedPublicProductsDto>;
  getProductBySlug(slug: string): Promise<PublicProductDto>;
  getMediaContentAuthorization(
    productId: string,
    mediaId: string,
  ): Promise<PublicMediaAuthorization>;
  getHeroMediaContentAuthorization(
    mediaId: string,
  ): Promise<PublicHeroMediaAuthorization>;
}
