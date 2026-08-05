// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { RequestHandler } from "express";
import type { StaffPrincipal } from "../../../../shared/auth/staff-principal";
import { successResponse } from "../../../../shared/http/api-response";
import { ApplicationError } from "../../../../shared/http/application-error";
import { CatalogApplicationError } from "../../application/services/catalog-application.error";
import type { ProductServiceContract } from "../../application/services/interfaces/product.service";
import {
  parseArchiveProduct,
  parseCreateProduct,
  parseProductListQuery,
  parseUpdateProduct,
} from "../validators/product.validator";

export class ProductController {
  constructor(private readonly service: ProductServiceContract) {}

  readonly list: RequestHandler = async (request, response, next) => {
    try {
      const result = await this.service.list(parseProductListQuery(request.query));
      response.json(
        successResponse("Products retrieved", result.items, {
          page: result.page,
          pageSize: result.pageSize,
          totalItems: result.totalItems,
          totalPages: result.totalPages,
        }),
      );
    } catch (error) {
      next(toHttpError(error));
    }
  };

  readonly get: RequestHandler = async (request, response, next) => {
    try {
      response.json(
        successResponse(
          "Product retrieved",
          await this.service.get(routeId(request.params.productId)),
        ),
      );
    } catch (error) {
      next(toHttpError(error));
    }
  };

  readonly create: RequestHandler = async (request, response, next) => {
    try {
      const created = await this.service.create(
        parseCreateProduct(request.body),
        context(response.locals),
      );
      response.status(201).json(successResponse("Product created successfully", created));
    } catch (error) {
      next(toHttpError(error));
    }
  };

  readonly update: RequestHandler = async (request, response, next) => {
    try {
      const updated = await this.service.update(
        routeId(request.params.productId),
        parseUpdateProduct(request.body),
        context(response.locals),
      );
      response.json(successResponse("Product updated successfully", updated));
    } catch (error) {
      next(toHttpError(error));
    }
  };

  readonly archive: RequestHandler = async (request, response, next) => {
    try {
      const { version } = parseArchiveProduct(request.body);
      const archived = await this.service.archive(
        routeId(request.params.productId),
        version,
        context(response.locals),
      );
      response.json(successResponse("Product archived successfully", archived));
    } catch (error) {
      next(toHttpError(error));
    }
  };
}

function context(locals: Record<string, unknown>) {
  return {
    actorId: (locals.staffPrincipal as StaffPrincipal).subject,
    correlationId: locals.correlationId as string,
  };
}

function routeId(value: string | string[] | undefined): string {
  if (typeof value !== "string") throw new ApplicationError(400, "VALIDATION_ERROR", "Invalid route ID");
  return value;
}

function toHttpError(error: unknown): unknown {
  if (!(error instanceof CatalogApplicationError)) return error;
  const status = error.code === "NOT_FOUND" ? 404 : error.code === "VALIDATION_ERROR" ? 400 : 409;
  return new ApplicationError(status, error.code, error.message);
}
