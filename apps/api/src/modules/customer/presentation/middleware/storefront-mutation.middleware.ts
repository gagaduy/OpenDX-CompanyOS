// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0
import { timingSafeEqual } from "node:crypto";
import type { RequestHandler } from "express";
import { ApplicationError } from "../../../../shared/http/application-error";
import {
  readCookieValues,
  type StorefrontCookieConfig,
} from "./storefront-cookies";
export function requireStorefrontOrigin(origin: string): RequestHandler {
  return (req, _res, next) => {
    if (req.header("origin") !== origin) {
      next(
        new ApplicationError(
          403,
          "CSRF_INVALID",
          "Storefront origin is invalid",
        ),
      );
      return;
    }
    next();
  };
}
export function requireCsrf(config: StorefrontCookieConfig): RequestHandler {
  return (req, _res, next) => {
    const cookies = readCookieValues(req, config.csrfName);
    const header = req.header("x-csrf-token");
    if (cookies.length === 0 || header === undefined) {
      next(new ApplicationError(403, "CSRF_INVALID", "CSRF token is invalid"));
      return;
    }
    const headerToken = Buffer.from(header);
    const matches = cookies.some((cookie) => {
      const cookieToken = Buffer.from(cookie);
      return (
        cookieToken.length === headerToken.length &&
        timingSafeEqual(cookieToken, headerToken)
      );
    });
    if (!matches) {
      next(new ApplicationError(403, "CSRF_INVALID", "CSRF token is invalid"));
      return;
    }
    next();
  };
}
