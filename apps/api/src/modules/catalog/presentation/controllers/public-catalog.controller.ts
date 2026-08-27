// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { RequestHandler } from "express";
import { successResponse } from "../../../../shared/http/api-response";
import { ApplicationError } from "../../../../shared/http/application-error";
import { CatalogApplicationError } from "../../application/services/catalog-application.error";
import type { PublicCatalogServiceContract } from "../../application/services/interfaces/public-catalog.service";
import type { ProductMediaStorage } from "../../application/storage/product-media.storage";
import { parsePublicId, parsePublicProductList, parsePublicSlug } from "../validators/public-catalog.validator";

export class PublicCatalogController {
  constructor(
    private readonly service: PublicCatalogServiceContract,
    private readonly storage: ProductMediaStorage,
  ) {}

  readonly content: RequestHandler = async (_request, response, next) => {
    try {
      response.json(
        successResponse(
          "Storefront content retrieved",
          await this.service.getStorefrontContent(),
        ),
      );
    } catch (error) {
      next(toHttpError(error));
    }
  };

  readonly categories: RequestHandler = async (_request, response, next) => {
    try { response.json(successResponse("Categories retrieved", await this.service.listCategories())); }
    catch (error) { next(toHttpError(error)); }
  };

  readonly heroSlides: RequestHandler = async (_request, response, next) => {
    try {
      response.json(
        successResponse(
          "Hero slides retrieved",
          await this.service.listHeroSlides(),
        ),
      );
    } catch (error) {
      next(toHttpError(error));
    }
  };

  readonly products: RequestHandler = async (request, response, next) => {
    try {
      const result = await this.service.listProducts(parsePublicProductList(request.query));
      response.json(successResponse("Products retrieved", result.items, {
        page: result.page, pageSize: result.pageSize,
        totalItems: result.totalItems, totalPages: result.totalPages,
      }));
    } catch (error) { next(toHttpError(error)); }
  };

  readonly product: RequestHandler = async (request, response, next) => {
    try { response.json(successResponse("Product retrieved", await this.service.getProductBySlug(parsePublicSlug(request.params.slug)))); }
    catch (error) { next(toHttpError(error)); }
  };

  readonly media: RequestHandler = async (request, response, next) => {
    try {
      const authorization = await this.service.getMediaContentAuthorization(
        parsePublicId(request.params.productId),
        parsePublicId(request.params.mediaId),
      );
      const bytes = await this.storage.get(authorization.objectKey);
      response.type(authorization.contentType).send(Buffer.from(bytes));
    } catch (error) { next(toHttpError(error)); }
  };
}

function toHttpError(error: unknown): unknown {
  if (!(error instanceof CatalogApplicationError)) return error;
  const status = error.code === "NOT_FOUND" || error.code === "PRODUCT_NOT_PUBLISHED" ? 404 : error.code === "FORBIDDEN" ? 403 : 409;
  return new ApplicationError(status, error.code, error.message);
}
