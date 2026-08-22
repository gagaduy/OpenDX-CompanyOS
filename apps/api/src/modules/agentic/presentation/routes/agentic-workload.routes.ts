// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { Router, type RequestHandler } from "express";

export interface AgenticWorkloadControllerHandlers {
  readonly loadPlan: RequestHandler;
  readonly projectState: RequestHandler;
  readonly reserveActivity: RequestHandler;
  readonly completeActivity: RequestHandler;
  readonly failActivity: RequestHandler;
  readonly reserveModelRun: RequestHandler;
  readonly startModelRun: RequestHandler;
  readonly completeModelRun: RequestHandler;
  readonly failModelRun: RequestHandler;
  readonly acceptOrchestrationPlan: RequestHandler;
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
  router.post("/model-runs/reserve", authenticate, controller.reserveModelRun);
  router.post("/model-runs/:runId/start", authenticate, controller.startModelRun);
  router.post("/model-runs/:runId/complete", authenticate, controller.completeModelRun);
  router.post("/model-runs/:runId/fail", authenticate, controller.failModelRun);
  router.post("/orchestration/plans", authenticate, controller.acceptOrchestrationPlan);
  return router;
}
