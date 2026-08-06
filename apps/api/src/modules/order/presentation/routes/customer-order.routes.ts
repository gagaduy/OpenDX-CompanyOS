// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { Router, type RequestHandler } from "express";
import type { CustomerOrderController } from "../controllers/customer-order.controller";
export function createCustomerOrderRouter(controller: CustomerOrderController, authenticate: RequestHandler): Router {
  const router = Router();
  router.get("/orders", authenticate, controller.list);
  router.get("/orders/:orderId", authenticate, controller.get);
  return router;
}
