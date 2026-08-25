// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { Router } from "express";
import type { MetricsRegistry } from "../observability/metrics";

export function createMetricsRouter(metrics: MetricsRegistry): Router {
  const router = Router();
  router.get("/", (_request, response) => {
    response.type("text/plain; version=0.0.4; charset=utf-8");
    response.send(metrics.render());
  });
  return router;
}
