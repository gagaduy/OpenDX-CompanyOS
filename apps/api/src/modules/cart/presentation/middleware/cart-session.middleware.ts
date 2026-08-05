// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { RequestHandler, Response } from "express";
import {
  readCookie,
  setSessionCookie,
  type CustomerPrincipal,
  type CustomerSessionServiceContract,
  type GuestPrincipal,
  type StorefrontCookieConfig,
} from "../../../customer";
import { ApplicationError } from "../../../../shared/http/application-error";
import type { CartOwner } from "../../application/dtos/cart.dto";

interface CartSessionState {
  readonly customer?: CustomerPrincipal;
  readonly guest?: GuestPrincipal;
}

export function resolveCartSession(
  sessions: CustomerSessionServiceContract,
  cookies: StorefrontCookieConfig,
  requireOwner: boolean,
  requireCustomer = false,
): RequestHandler {
  return async (req, res, next) => {
    try {
      let customer: CustomerPrincipal | undefined;
      let guest: GuestPrincipal | undefined;
      const customerToken = readCookie(req, cookies.customerName);
      if (customerToken !== undefined) {
        const issued = await sessions.resolveCustomer(customerToken, true);
        customer = issued.principal;
        setSessionCookie(res, cookies.customerName, issued.rawToken, issued.principal.expiresAt, cookies);
      }
      const guestToken = readCookie(req, cookies.guestName);
      if (guestToken !== undefined) {
        try { guest = await sessions.resolveGuest(guestToken); }
        catch { guest = undefined; }
      }
      if (requireCustomer && customer === undefined) {
        throw new ApplicationError(401, "CUSTOMER_SESSION_EXPIRED", "Customer session is required");
      }
      if (requireOwner && customer === undefined && guest === undefined) {
        throw new ApplicationError(401, "CUSTOMER_SESSION_EXPIRED", "Guest or customer session is required");
      }
      res.locals.cartSession = { customer, guest } satisfies CartSessionState;
      next();
    } catch (error) { next(error); }
  };
}

export function cartSessionState(res: Response): CartSessionState {
  return (res.locals.cartSession ?? {}) as CartSessionState;
}

export function preferredCartOwner(res: Response): CartOwner | undefined {
  const state = cartSessionState(res);
  if (state.customer !== undefined) {
    return { kind: "customer", customerId: state.customer.customerId, expiresAt: state.customer.expiresAt };
  }
  return state.guest === undefined
    ? undefined
    : { kind: "guest", guestSessionId: state.guest.guestSessionId, expiresAt: state.guest.expiresAt };
}
