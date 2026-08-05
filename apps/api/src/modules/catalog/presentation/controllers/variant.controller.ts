// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { RequestHandler } from "express";
import type { StaffPrincipal } from "../../../../shared/auth/staff-principal";
import { successResponse } from "../../../../shared/http/api-response";
import { ApplicationError } from "../../../../shared/http/application-error";
import { CatalogApplicationError } from "../../application/services/catalog-application.error";
import type { VariantServiceContract } from "../../application/services/interfaces/variant.service";
import {
  parseArchiveVariant,
  parseCatalogId,
  parseCreateVariant,
  parseReplacePrice,
  parseUpdateVariant,
} from "../validators/variant.validator";

export class VariantController {
  constructor(private readonly service: VariantServiceContract) {}

  readonly create: RequestHandler = async (request, response, next) => {
    try {
      const created = await this.service.create(
        parseCatalogId(request.params.productId),
        parseCreateVariant(request.body),
        context(response.locals),
      );
      response.status(201).json(successResponse("Variant created successfully", created));
    } catch (error) {
      next(toHttpError(error));
    }
  };

  readonly update: RequestHandler = async (request, response, next) => {
    try {
      const updated = await this.service.update(
        parseCatalogId(request.params.productId),
        parseCatalogId(request.params.variantId),
        parseUpdateVariant(request.body),
        context(response.locals),
      );
      response.json(successResponse("Variant updated successfully", updated));
    } catch (error) {
      next(toHttpError(error));
    }
  };

  readonly archive: RequestHandler = async (request, response, next) => {
    try {
      const { version } = parseArchiveVariant(request.body);
      const archived = await this.service.archive(
        parseCatalogId(request.params.productId),
        parseCatalogId(request.params.variantId),
        version,
        context(response.locals),
      );
      response.json(successResponse("Variant archived successfully", archived));
    } catch (error) {
      next(toHttpError(error));
    }
  };

  readonly replacePrice: RequestHandler = async (request, response, next) => {
    try {
      const price = await this.service.replacePrice(
        parseCatalogId(request.params.productId),
        parseCatalogId(request.params.variantId),
        parseReplacePrice(request.body),
        context(response.locals),
      );
      response.json(successResponse("Current price replaced successfully", price));
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

function toHttpError(error: unknown): unknown {
  if (!(error instanceof CatalogApplicationError)) return error;
  const status = error.code === "NOT_FOUND" ? 404 : error.code === "VALIDATION_ERROR" ? 400 : 409;
  return new ApplicationError(status, error.code, error.message);
}
