// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { Router, type RequestHandler } from "express";
import type { CartController } from "../controllers/cart.controller";

export function createCartRouter(
  controller: CartController,
  optionalSession: RequestHandler,
  ownerSession: RequestHandler,
  customerSession: RequestHandler,
  origin: RequestHandler,
  csrf: RequestHandler,
): Router {
  const router = Router();
  router.get("/cart", optionalSession, controller.get);
  router.post("/cart/items", ownerSession, origin, csrf, controller.add);
  router.patch("/cart/items/:cartItemId", ownerSession, origin, csrf, controller.update);
  router.delete("/cart/items/:cartItemId", ownerSession, origin, csrf, controller.remove);
  router.get("/cart/resolution", customerSession, controller.inspectResolution);
  router.post("/cart/resolution", customerSession, origin, csrf, controller.resolve);
  router.post("/cart/checkout-readiness", customerSession, origin, csrf, controller.checkoutReadiness);
  return router;
}
