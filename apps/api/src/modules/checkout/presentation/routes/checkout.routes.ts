// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { Router, type RequestHandler } from "express";
import type { CheckoutController } from "../controllers/checkout.controller";
export function createCheckoutRouter(controller: CheckoutController, customer: RequestHandler, origin: RequestHandler, csrf: RequestHandler, mutationLimit: RequestHandler): Router {
  const router = Router();
  router.post("/checkouts", customer, origin, csrf, mutationLimit, controller.create);
  router.get("/checkouts/:checkoutId", customer, controller.get);
  router.post("/checkouts/:checkoutId/payment-initiation", customer, origin, csrf, mutationLimit, controller.initiate);
  return router;
}
