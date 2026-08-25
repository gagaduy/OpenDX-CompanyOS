// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { RequestHandler } from "express";
import type { StaffPrincipal } from "../../../../shared/auth/staff-principal";
import { successResponse } from "../../../../shared/http/api-response";
import type { CrmContext } from "../../application/dtos/crm.dto";
import type { CrmServiceContract } from "../../application/services/interfaces/crm.service";
import {
  parseCustomerId,
  parseCustomerSearch,
  parseFollowup,
  parseFollowupId,
  parseFollowupUpdate,
  parseNote,
  parsePage,
  parseSegmentId,
} from "../validators/crm.validator";

export class CrmController {
  constructor(private readonly service: CrmServiceContract) {}

  readonly searchCustomers: RequestHandler = async (request, response, next) => {
    try {
      response.json(successResponse("Customers retrieved", await this.service.searchCustomers(
        parseCustomerSearch(request.query), context(response.locals),
      )));
    } catch (error) { next(error); }
  };

  readonly getCustomer: RequestHandler = async (request, response, next) => {
    try {
      response.json(successResponse("Customer retrieved", await this.service.getCustomer(
        parseCustomerId(request.params.customerId), context(response.locals),
      )));
    } catch (error) { next(error); }
  };

  readonly listNotes: RequestHandler = async (request, response, next) => {
    try {
      response.json(successResponse("Customer notes retrieved", await this.service.listNotes(
        parseCustomerId(request.params.customerId), context(response.locals),
      )));
    } catch (error) { next(error); }
  };

  readonly createNote: RequestHandler = async (request, response, next) => {
    try {
      response.status(201).json(successResponse("Customer note created", await this.service.createNote(
        parseCustomerId(request.params.customerId), parseNote(request.body), context(response.locals),
      )));
    } catch (error) { next(error); }
  };

  readonly listFollowups: RequestHandler = async (request, response, next) => {
    try {
      response.json(successResponse("Customer follow-ups retrieved", await this.service.listFollowups(
        parseCustomerId(request.params.customerId), context(response.locals),
      )));
    } catch (error) { next(error); }
  };

  readonly createFollowup: RequestHandler = async (request, response, next) => {
    try {
      response.status(201).json(successResponse("Customer follow-up created", await this.service.createFollowup(
        parseCustomerId(request.params.customerId), parseFollowup(request.body), context(response.locals),
      )));
    } catch (error) { next(error); }
  };

  readonly updateFollowup: RequestHandler = async (request, response, next) => {
    try {
      response.json(successResponse("Customer follow-up updated", await this.service.updateFollowup(
        parseCustomerId(request.params.customerId),
        parseFollowupId(request.params.followupId),
        parseFollowupUpdate(request.body),
        context(response.locals),
      )));
    } catch (error) { next(error); }
  };

  readonly listSegments: RequestHandler = async (_request, response, next) => {
    try {
      response.json(successResponse("Customer segments retrieved", await this.service.listSegments(context(response.locals))));
    } catch (error) { next(error); }
  };

  readonly listSegmentCustomers: RequestHandler = async (request, response, next) => {
    try {
      response.json(successResponse("Segment customers retrieved", await this.service.listSegmentCustomers(
        parseSegmentId(request.params.segmentId), parsePage(request.query), context(response.locals),
      )));
    } catch (error) { next(error); }
  };
}

function context(locals: Record<string, unknown>): CrmContext {
  const principal = locals.staffPrincipal as StaffPrincipal;
  const roles = principal.roles.filter(
    (role): role is "administrator" | "crm_operator" => role === "administrator" || role === "crm_operator",
  );
  return { actorId: principal.subject, roles, correlationId: locals.correlationId as string };
}
