// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { RequestHandler } from "express";
import type { StaffPrincipal } from "../../../../shared/auth/staff-principal";
import { successResponse } from "../../../../shared/http/api-response";
import { ApplicationError } from "../../../../shared/http/application-error";
import { CatalogApplicationError } from "../../application/services/catalog-application.error";
import type { ProductPublicationServiceContract } from "../../application/services/interfaces/product-publication.service";
import type { PublicationCommandContext } from "../../application/services/interfaces/product-publication.service";
import { parsePublicId, parsePublicationVersion } from "../validators/public-catalog.validator";

export class ProductPublicationController {
  constructor(private readonly service: ProductPublicationServiceContract) {}

  readonly readiness: RequestHandler = async (request, response, next) => {
    try { response.json(successResponse("Publication readiness retrieved", await this.service.checkReadiness(parsePublicId(request.params.productId)))); }
    catch (error) { next(toHttpError(error)); }
  };

  readonly publish: RequestHandler = async (request, response, next) => {
    try { response.json(successResponse("Product published", await this.service.publish(parsePublicId(request.params.productId), parsePublicationVersion(request.body), context(response.locals)))); }
    catch (error) { next(toHttpError(error)); }
  };

  readonly unpublish: RequestHandler = async (request, response, next) => {
    try { response.json(successResponse("Product unpublished", await this.service.unpublish(parsePublicId(request.params.productId), parsePublicationVersion(request.body), context(response.locals)))); }
    catch (error) { next(toHttpError(error)); }
  };
}

function context(locals: Record<string, unknown>) {
  const principal = locals.staffPrincipal as StaffPrincipal;
  return {
    actorId: principal.subject,
    roles: principal.roles.filter(isPublicationRole),
    correlationId: locals.correlationId as string,
  };
}

type PublicationRole = PublicationCommandContext["roles"][number];

function isPublicationRole(role: StaffPrincipal["roles"][number]): role is PublicationRole {
  return role === "administrator" || role === "catalog_manager" || role === "inventory_manager";
}

function toHttpError(error: unknown): unknown {
  if (!(error instanceof CatalogApplicationError)) return error;
  const status = error.code === "NOT_FOUND" ? 404 : error.code === "FORBIDDEN" ? 403 : error.code === "VALIDATION_ERROR" ? 400 : 409;
  return new ApplicationError(status, error.code, error.message);
}
