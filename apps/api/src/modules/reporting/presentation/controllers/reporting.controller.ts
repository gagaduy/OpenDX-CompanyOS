// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { RequestHandler } from "express";
import type { StaffPrincipal } from "../../../../shared/auth/staff-principal";
import type {
  ReportingContext,
  ReportingServiceContract,
} from "../../application/services/interfaces/reporting.service";
import { parseReportingRange } from "../validators/reporting.validator";

export class ReportingController {
  constructor(private readonly service: ReportingServiceContract) {}

  getCommerce: RequestHandler = async (request, response, next) => {
    try {
      response.json(await this.service.getCommerce(parseReportingRange(request.query), context(response.locals)));
    } catch (error) {
      next(error);
    }
  };

  getProducts: RequestHandler = async (request, response, next) => {
    try {
      response.json(await this.service.getProducts(parseReportingRange(request.query), context(response.locals)));
    } catch (error) {
      next(error);
    }
  };

  getCustomers: RequestHandler = async (request, response, next) => {
    try {
      response.json(await this.service.getCustomers(parseReportingRange(request.query), context(response.locals)));
    } catch (error) {
      next(error);
    }
  };

  getOperations: RequestHandler = async (request, response, next) => {
    try {
      response.json(await this.service.getOperations(parseReportingRange(request.query), context(response.locals)));
    } catch (error) {
      next(error);
    }
  };
}

function context(locals: Record<string, unknown>): ReportingContext {
  const principal = locals.staffPrincipal as StaffPrincipal;
  return {
    actorId: principal.subject,
    roles: principal.roles,
    correlationId: locals.correlationId as string,
  };
}
