// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0
import type { RequestHandler } from "express";
import type { CustomerSessionServiceContract } from "../../application/services/interfaces/customer-session.service";
import { ApplicationError } from "../../../../shared/http/application-error";
import { readCookie, type StorefrontCookieConfig } from "./storefront-cookies";
export interface CustomerRequestState {
  readonly customerId: string;
  readonly sessionId: string;
  readonly email: string;
  readonly expiresAt: string;
}
export function requireCustomerSession(
  service: CustomerSessionServiceContract,
  config: StorefrontCookieConfig,
): RequestHandler {
  return async (req, res, next) => {
    const raw = readCookie(req, config.customerName);
    if (raw === undefined) {
      next(
        new ApplicationError(
          401,
          "CUSTOMER_SESSION_EXPIRED",
          "Customer session is required",
        ),
      );
      return;
    }
    try {
      const issued = await service.resolveCustomer(raw, false);
      res.locals.customer = issued.principal;
      next();
    } catch {
      next(
        new ApplicationError(
          401,
          "CUSTOMER_SESSION_EXPIRED",
          "Customer session is invalid",
        ),
      );
    }
  };
}
export function customerState(res: {
  locals: Record<string, unknown>;
}): CustomerRequestState {
  return res.locals.customer as CustomerRequestState;
}
