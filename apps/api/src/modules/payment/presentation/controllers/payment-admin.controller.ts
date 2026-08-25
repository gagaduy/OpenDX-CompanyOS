// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0
import type { RequestHandler } from "express";
import type { StaffPrincipal } from "../../../../shared/auth/staff-principal";
import { successResponse } from "../../../../shared/http/api-response";
import type { PaymentReconciliationServiceContract } from "../../application/services/interfaces/payment-reconciliation.service";
import {
  parsePaymentId,
  parsePaymentList,
  parseReconcile,
} from "../validators/payment-admin.validator";

export class PaymentAdminController {
  constructor(private readonly service: PaymentReconciliationServiceContract) {}

  readonly list: RequestHandler = async (request, response, next) => {
    try {
      response.json(
        successResponse(
          "Payments retrieved",
          await this.service.list(parsePaymentList(request.query), context(response.locals)),
        ),
      );
    } catch (error) {
      next(error);
    }
  };

  readonly get: RequestHandler = async (request, response, next) => {
    try {
      response.json(
        successResponse(
          "Payment retrieved",
          await this.service.get(
            parsePaymentId(request.params.paymentId),
            context(response.locals),
          ),
        ),
      );
    } catch (error) {
      next(error);
    }
  };

  readonly reconcile: RequestHandler = async (request, response, next) => {
    try {
      response.json(
        successResponse(
          "Payment reconciled",
          await this.service.reconcile(
            parsePaymentId(request.params.paymentId),
            parseReconcile(request.body),
            context(response.locals),
          ),
        ),
      );
    } catch (error) {
      next(error);
    }
  };
}

function context(locals: Record<string, unknown>) {
  const principal = locals.staffPrincipal as StaffPrincipal;
  return {
    actorId: principal.subject,
    roles: principal.roles,
    correlationId: locals.correlationId as string,
  };
}
