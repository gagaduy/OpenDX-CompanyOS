// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { ProductResponseDto } from "../../dtos/responses/product-response.dto";
import type { PublicationReadinessDto } from "../../dtos/responses/public-catalog-response.dto";

export interface PublicationCommandContext {
  readonly actorId: string;
  readonly roles: readonly (
    | "administrator"
    | "catalog_manager"
    | "inventory_manager"
  )[];
  readonly correlationId: string;
}

export interface ProductPublicationServiceContract {
  checkReadiness(productId: string): Promise<PublicationReadinessDto>;
  publish(
    productId: string,
    request: { readonly version: number },
    context: PublicationCommandContext,
  ): Promise<ProductResponseDto>;
  unpublish(
    productId: string,
    request: { readonly version: number },
    context: PublicationCommandContext,
  ): Promise<ProductResponseDto>;
}
