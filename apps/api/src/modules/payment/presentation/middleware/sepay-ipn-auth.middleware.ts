// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0
import { createHash, timingSafeEqual } from "node:crypto";
import type { RequestHandler } from "express";
import { ApplicationError } from "../../../../shared/http/application-error";
export function authenticateSePayIpn(secret?: string): RequestHandler {
  return (request, _response, next) => {
    if (secret === undefined) { next(new ApplicationError(503, "PAYMENT_PROVIDER_NOT_CONFIGURED", "Payment provider is not configured")); return; }
    const supplied = request.header("x-secret-key") ?? "";
    const expectedHash = createHash("sha256").update(secret).digest();
    const suppliedHash = createHash("sha256").update(supplied).digest();
    if (!timingSafeEqual(expectedHash, suppliedHash)) { next(new ApplicationError(401, "SEPAY_IPN_UNAUTHORIZED", "SePay notification authentication failed")); return; }
    next();
  };
}
