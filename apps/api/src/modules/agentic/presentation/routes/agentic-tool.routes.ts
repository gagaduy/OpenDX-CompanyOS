// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { Router, type RequestHandler } from "express";

export function createAgenticToolRouter(
  controller: { readonly invoke: RequestHandler },
  authenticate: RequestHandler,
): Router {
  const router = Router();
  router.post("/invoke", authenticate, controller.invoke);
  return router;
}
