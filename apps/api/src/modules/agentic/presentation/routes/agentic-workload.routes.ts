// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { Router, type RequestHandler } from "express";

export interface AgenticWorkloadControllerHandlers {
  readonly loadPlan: RequestHandler;
  readonly projectState: RequestHandler;
  readonly reserveActivity: RequestHandler;
  readonly completeActivity: RequestHandler;
  readonly failActivity: RequestHandler;
}

export function createAgenticWorkloadRouter(
  controller: AgenticWorkloadControllerHandlers,
  authenticate: RequestHandler,
): Router {
  const router = Router();
  router.get("/workflow-runs/:runId/plan", authenticate, controller.loadPlan);
  router.post("/workflow-runs/:runId/state", authenticate, controller.projectState);
  router.post("/activity-invocations/reserve", authenticate, controller.reserveActivity);
  router.post("/activity-invocations/:invocationKey/complete", authenticate, controller.completeActivity);
  router.post("/activity-invocations/:invocationKey/fail", authenticate, controller.failActivity);
  return router;
}
