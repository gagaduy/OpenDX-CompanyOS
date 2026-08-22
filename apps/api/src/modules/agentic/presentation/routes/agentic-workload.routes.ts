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
  readonly loadTaskBrief: RequestHandler;
  readonly loadDispatchPlan: RequestHandler;
  readonly loadExecutionDescriptor: RequestHandler;
  readonly acceptOrchestrationResult: RequestHandler;
  readonly mediateOrchestrationCollaboration: RequestHandler;
  readonly acceptExecutiveReport: RequestHandler;
}

export function createAgenticWorkloadRouter(
  controller: AgenticWorkloadControllerHandlers,
  authenticateWorker: RequestHandler,
  authenticateAgent: RequestHandler,
): Router {
  const router = Router();
  router.get("/workflow-runs/:runId/plan", authenticateWorker, controller.loadPlan);
  router.post("/workflow-runs/:runId/state", authenticateWorker, controller.projectState);
  router.post("/activity-invocations/reserve", authenticateWorker, controller.reserveActivity);
  router.post("/activity-invocations/:invocationKey/complete", authenticateWorker, controller.completeActivity);
  router.post("/activity-invocations/:invocationKey/fail", authenticateWorker, controller.failActivity);
  router.post("/model-runs/reserve", authenticateWorker, controller.reserveModelRun);
  router.post("/model-runs/:runId/start", authenticateWorker, controller.startModelRun);
  router.post("/model-runs/:runId/complete", authenticateWorker, controller.completeModelRun);
  router.post("/model-runs/:runId/fail", authenticateWorker, controller.failModelRun);
  router.post("/orchestration/plans", authenticateAgent, controller.acceptOrchestrationPlan);
  router.get("/orchestration/task-briefs/:taskId", authenticateWorker, controller.loadTaskBrief);
  router.get("/orchestration/dispatch-plans/:runId", authenticateWorker, controller.loadDispatchPlan);
  router.get("/orchestration/descriptors/:descriptorId", authenticateWorker, controller.loadExecutionDescriptor);
  router.post("/orchestration/results", authenticateWorker, controller.acceptOrchestrationResult);
  router.post("/orchestration/collaborations", authenticateWorker, controller.mediateOrchestrationCollaboration);
  router.post("/orchestration/reports", authenticateWorker, controller.acceptExecutiveReport);
  return router;
}
