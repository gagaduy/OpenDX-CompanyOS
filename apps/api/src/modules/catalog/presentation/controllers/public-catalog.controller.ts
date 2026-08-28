// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { RequestHandler } from "express";
import { successResponse } from "../../../../shared/http/api-response";
import { ApplicationError } from "../../../../shared/http/application-error";
import { CatalogApplicationError } from "../../application/services/catalog-application.error";
import type { PublicCatalogServiceContract } from "../../application/services/interfaces/public-catalog.service";
import type { ProductMediaStorage } from "../../application/storage/product-media.storage";
import type { StorefrontHeroMediaStorage } from "../../application/storage/storefront-hero-media.storage";
import { parsePublicId, parsePublicProductList, parsePublicSlug } from "../validators/public-catalog.validator";
import {
  type HttpByteRange,
  HttpByteRangeError,
  parseSingleByteRange,
} from "../validators/http-byte-range";

export class PublicCatalogController {
  constructor(
    private readonly service: PublicCatalogServiceContract,
    private readonly storage: ProductMediaStorage,
    private readonly heroStorage: StorefrontHeroMediaStorage,
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

  readonly heroPresentation: RequestHandler = async (_request, response, next) => {
    try {
      response.json(
        successResponse(
          "Hero presentation retrieved",
          await this.service.getHeroPresentation(),
        ),
      );
    } catch (error) {
      next(toHttpError(error));
    }
  };

  readonly heroMediaHead: RequestHandler = async (request, response, next) => {
    try {
      const authorization =
        await this.service.getHeroMediaContentAuthorization(
          parsePublicId(request.params.mediaId),
        );
      response
        .status(200)
        .set("Accept-Ranges", "bytes")
        .set("Content-Type", authorization.contentType)
        .set("Content-Length", String(authorization.byteSize))
        .set("Cache-Control", "no-store")
        .end();
    } catch (error) {
      next(toHttpError(error));
    }
  };

  readonly heroMedia: RequestHandler = async (request, response, next) => {
    try {
      const mediaId = parsePublicId(request.params.mediaId);
      const authorization =
        await this.service.getHeroMediaContentAuthorization(mediaId);
      let range: HttpByteRange | undefined;
      try {
        range = parseSingleByteRange(
          request.header("range"),
          authorization.byteSize,
        );
      } catch (error) {
        if (!(error instanceof HttpByteRangeError)) throw error;
        response
          .status(416)
          .set("Accept-Ranges", "bytes")
          .set("Content-Range", `bytes */${authorization.byteSize}`)
          .end();
        return;
      }

      const stream = await this.heroStorage.open(
        authorization.objectKey,
        range === undefined
          ? undefined
          : { offset: range.offset, length: range.length },
      );
      response
        .status(range === undefined ? 200 : 206)
        .set("Accept-Ranges", "bytes")
        .set("Content-Type", authorization.contentType)
        .set("Content-Length", String(range?.length ?? authorization.byteSize))
        .set("Cache-Control", "no-store");
      if (range !== undefined) {
        response.set(
          "Content-Range",
          `bytes ${range.offset}-${range.end}/${authorization.byteSize}`,
        );
      }
      await pipeline(Readable.from(stream), response);
    } catch (error) {
      if (response.headersSent) {
        response.destroy(error instanceof Error ? error : undefined);
        return;
      }
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
