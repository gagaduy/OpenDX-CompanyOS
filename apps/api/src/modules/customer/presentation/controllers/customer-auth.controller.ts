// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { randomBytes } from "node:crypto";
import type { RequestHandler } from "express";
import { successResponse } from "../../../../shared/http/api-response";
import type { CustomerAuthenticationServiceContract } from "../../application/services/interfaces/customer-authentication.service";
import type { CustomerCartLoginResolver } from "../../application/services/interfaces/customer-cart-login-resolver";
import type { CustomerSessionServiceContract } from "../../application/services/interfaces/customer-session.service";
import {
  clearCookie,
  readCookie,
  setCsrfCookie,
  setSessionCookie,
  type StorefrontCookieConfig,
} from "../middleware/storefront-cookies";
import { googleSchema, parseBody } from "../validators/customer.validator";

export class CustomerAuthController {
  constructor(
    private readonly auth: CustomerAuthenticationServiceContract,
    private readonly sessions: CustomerSessionServiceContract,
    private readonly cookies: StorefrontCookieConfig,
    private readonly cartResolver?: CustomerCartLoginResolver,
  ) {}

  guest: RequestHandler = async (_req, res, next) => {
    try {
      const issued = await this.sessions.createGuest();
      setSessionCookie(
        res,
        this.cookies.guestName,
        issued.rawToken,
        issued.principal.expiresAt,
        this.cookies,
      );
      this.setCsrf(res);
      res.status(201).json(
        successResponse("Guest session created", {
          kind: "guest",
          expiresAt: issued.principal.expiresAt,
        }),
      );
    } catch (error) {
      next(error);
    }
  };

  google: RequestHandler = async (req, res, next) => {
    try {
      const issued = await this.auth.loginWithGoogle(
        parseBody(googleSchema, req.body).credential,
      );
      let guest;
      const guestToken = readCookie(req, this.cookies.guestName);
      if (guestToken !== undefined) {
        try {
          guest = await this.sessions.resolveGuest(guestToken);
        } catch {
          clearCookie(res, this.cookies.guestName, this.cookies);
        }
      }
      let cartResolution = "not_required";
      if (this.cartResolver !== undefined) {
        try {
          cartResolution = (
            await this.cartResolver.inspect(
              issued.principal.customerId,
              issued.principal.expiresAt,
              guest?.guestSessionId,
              guest?.expiresAt,
              true,
            )
          ).status;
        } catch (error) {
          await this.auth.logout(issued.rawToken);
          throw error;
        }
      }
      setSessionCookie(
        res,
        this.cookies.customerName,
        issued.rawToken,
        issued.principal.expiresAt,
        this.cookies,
      );
      this.setCsrf(res);
      res.json(
        successResponse("Customer signed in", {
          kind: "customer",
          customerId: issued.principal.customerId,
          email: issued.principal.email,
          expiresAt: issued.principal.expiresAt,
          cartResolution,
        }),
      );
    } catch (error) {
      next(error);
    }
  };

  session: RequestHandler = async (req, res, next) => {
    try {
      const customer = readCookie(req, this.cookies.customerName);
      if (customer !== undefined) {
        try {
          const issued = await this.sessions.resolveCustomer(customer, true);
          setSessionCookie(
            res,
            this.cookies.customerName,
            issued.rawToken,
            issued.principal.expiresAt,
            this.cookies,
          );
          this.setCsrf(res);
          res.json(
            successResponse("Customer session restored", {
              kind: "customer",
              customerId: issued.principal.customerId,
              email: issued.principal.email,
              expiresAt: issued.principal.expiresAt,
            }),
          );
          return;
        } catch {
          clearCookie(res, this.cookies.customerName, this.cookies);
        }
      }
      const guest = readCookie(req, this.cookies.guestName);
      if (guest !== undefined) {
        const principal = await this.sessions.resolveGuest(guest);
        this.setCsrf(res);
        res.json(
          successResponse("Guest session restored", {
            kind: "guest",
            expiresAt: principal.expiresAt,
          }),
        );
        return;
      }
      res.json(successResponse("Anonymous session", { kind: "anonymous" }));
    } catch (error) {
      next(error);
    }
  };

  logout: RequestHandler = async (req, res, next) => {
    try {
      const raw = readCookie(req, this.cookies.customerName);
      if (raw !== undefined) await this.auth.logout(raw);
      clearCookie(res, this.cookies.customerName, this.cookies);
      clearCookie(res, this.cookies.csrfName, this.cookies);
      res.json(successResponse("Customer signed out", {}));
    } catch (error) {
      next(error);
    }
  };

  private setCsrf(res: Parameters<RequestHandler>[1]): void {
    setCsrfCookie(res, randomBytes(24).toString("base64url"), this.cookies);
  }
}
