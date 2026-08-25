// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0
import express, { Router, type ErrorRequestHandler, type RequestHandler } from "express";
import type { SePayIpnController } from "../controllers/sepay-ipn.controller";
import { ApplicationError } from "../../../../shared/http/application-error";
export function createSePayIpnRouter(controller: SePayIpnController, authenticate: RequestHandler): Router {
  const router = Router();
  router.post("/", authenticate, express.json({ limit: "64kb", strict: true }), controller.handle);
  const malformedJson: ErrorRequestHandler = (error, _request, _response, next) => {
    if (typeof error === "object" && error !== null && "type" in error && error.type === "entity.too.large") { next(new ApplicationError(413, "SEPAY_NOTIFICATION_TOO_LARGE", "SePay notification payload is too large")); return; }
    if (error instanceof SyntaxError) { next(new ApplicationError(400, "INVALID_SEPAY_NOTIFICATION", "SePay notification payload is invalid")); return; }
    next(error);
  };
  router.use(malformedJson);
  return router;
}
