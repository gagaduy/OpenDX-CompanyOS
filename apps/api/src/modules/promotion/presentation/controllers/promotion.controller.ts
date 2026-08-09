// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { RequestHandler } from "express";
import type { StaffPrincipal } from "../../../../shared/auth/staff-principal";
import { successResponse } from "../../../../shared/http/api-response";
import { ApplicationError } from "../../../../shared/http/application-error";
import type { PromotionServiceContract } from "../../application/services/interfaces/promotion.service";
import { PromotionApplicationError } from "../../application/services/promotion-application.error";
import { PromotionDomainError } from "../../domain/exceptions/promotion-domain.error";
import { parseCreatePromotion, parsePromotionId, parseUpdatePromotion } from "../validators/promotion.validator";

export class PromotionController {
  constructor(private readonly service: PromotionServiceContract) {}

  readonly list: RequestHandler = async (_request, response, next) => {
    try {
      response.json(successResponse("Promotions retrieved", await this.service.list()));
    } catch (error) { next(toHttpError(error)); }
  };

  readonly create: RequestHandler = async (request, response, next) => {
    try {
      const result = await this.service.create(parseCreatePromotion(request.body), commandContext(response.locals));
      response.status(201).json(successResponse("Promotion created", result));
    } catch (error) { next(toHttpError(error)); }
  };

  readonly update: RequestHandler = async (request, response, next) => {
    try {
      const result = await this.service.update(parsePromotionId(request.params.promotionId), parseUpdatePromotion(request.body), commandContext(response.locals));
      response.json(successResponse("Promotion updated", result));
    } catch (error) { next(toHttpError(error)); }
  };
}

function commandContext(locals: Record<string, unknown>) {
  const principal = locals.staffPrincipal as StaffPrincipal;
  return { actorId: principal.subject, roles: principal.roles, correlationId: locals.correlationId as string };
}

function toHttpError(error: unknown): unknown {
  if (error instanceof PromotionDomainError) return new ApplicationError(409, error.code, error.message);
  if (!(error instanceof PromotionApplicationError)) return error;
  const status = error.code === "NOT_FOUND" ? 404 : error.code === "FORBIDDEN" ? 403 : 409;
  return new ApplicationError(status, error.code, error.message);
}
