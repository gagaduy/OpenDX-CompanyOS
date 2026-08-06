// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { RequestHandler } from "express";
import type { StaffPrincipal } from "../../../../shared/auth/staff-principal";
import { successResponse } from "../../../../shared/http/api-response";
import type { OrderServiceContract } from "../../application/services/interfaces/order.service";
import { parseOrderId, parseOrderList, parseTransition } from "../validators/order.validator";

export class AdminOrderController {
  constructor(private readonly service: OrderServiceContract) {}
  readonly list: RequestHandler = async (request, response, next) => {
    try { response.json(successResponse("Orders retrieved", await this.service.listForStaff(parseOrderList(request.query), context(response.locals)))); }
    catch (error) { next(error); }
  };
  readonly get: RequestHandler = async (request, response, next) => {
    try { response.json(successResponse("Order retrieved", await this.service.getForStaff(parseOrderId(request.params.orderId), context(response.locals)))); }
    catch (error) { next(error); }
  };
  readonly transition: RequestHandler = async (request, response, next) => {
    try {
      const result = await this.service.transition(parseOrderId(request.params.orderId), parseTransition(request.body, request.header("idempotency-key")), context(response.locals));
      response.json(successResponse("Order status updated", result));
    } catch (error) { next(error); }
  };
}
function context(locals: Record<string, unknown>) {
  const principal = locals.staffPrincipal as StaffPrincipal;
  return { actorId: principal.subject, roles: principal.roles, correlationId: locals.correlationId as string };
}
