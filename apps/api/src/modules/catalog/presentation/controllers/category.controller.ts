// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { RequestHandler } from "express";
import type { StaffPrincipal } from "../../../../shared/auth/staff-principal";
import { successResponse } from "../../../../shared/http/api-response";
import { ApplicationError } from "../../../../shared/http/application-error";
import { CatalogApplicationError } from "../../application/services/catalog-application.error";
import type { CategoryServiceContract } from "../../application/services/interfaces/category.service";
import {
  parseArchiveCategory,
  parseCreateCategory,
  parseUpdateCategory,
} from "../validators/category.validator";

export class CategoryController {
  constructor(private readonly service: CategoryServiceContract) {}

  readonly list: RequestHandler = async (_request, response) => {
    response.json(successResponse("Categories retrieved", await this.service.list()));
  };

  readonly create: RequestHandler = async (request, response, next) => {
    try {
      const created = await this.service.create(
        parseCreateCategory(request.body),
        commandContext(response.locals),
      );
      response.status(201).json(successResponse("Category created", created));
    } catch (error) {
      next(toHttpError(error));
    }
  };

  readonly update: RequestHandler = async (request, response, next) => {
    try {
      const updated = await this.service.update(
        routeId(request.params.categoryId),
        parseUpdateCategory(request.body),
        commandContext(response.locals),
      );
      response.json(successResponse("Category updated", updated));
    } catch (error) {
      next(toHttpError(error));
    }
  };

  readonly archive: RequestHandler = async (request, response, next) => {
    try {
      const { version } = parseArchiveCategory(request.body);
      const archived = await this.service.archive(
        routeId(request.params.categoryId),
        version,
        commandContext(response.locals),
      );
      response.json(successResponse("Category archived", archived));
    } catch (error) {
      next(toHttpError(error));
    }
  };
}

function commandContext(locals: Record<string, unknown>) {
  const principal = locals.staffPrincipal as StaffPrincipal;
  return {
    actorId: principal.subject,
    correlationId: locals.correlationId as string,
  };
}

function routeId(value: string | string[] | undefined): string {
  if (typeof value !== "string") {
    throw new ApplicationError(400, "VALIDATION_ERROR", "Invalid route ID");
  }
  return value;
}

function toHttpError(error: unknown): unknown {
  if (!(error instanceof CatalogApplicationError)) return error;
  const status = error.code === "NOT_FOUND" ? 404 : error.code === "CONFLICT" ? 409 : 400;
  return new ApplicationError(status, error.code, error.message);
}
