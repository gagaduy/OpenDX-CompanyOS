// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { Router } from "express";
import { SERVICE_NAMES } from "@opendx/domain";

export type DependencyStatus = "up" | "down";
export interface ReadinessDependencies {
  readonly postgres: DependencyStatus;
  readonly keycloak: DependencyStatus;
  readonly minio: DependencyStatus;
  readonly migrations: DependencyStatus;
}
export type ReadinessProbe = () => Promise<ReadinessDependencies>;

const defaultReadiness: ReadinessProbe = async () => ({
  postgres: "up",
  keycloak: "up",
  minio: "up",
  migrations: "up",
});

export function createHealthRouter(
  readiness: ReadinessProbe = defaultReadiness,
): Router {
  const router = Router();
  const liveness = {
    status: "ok",
    service: SERVICE_NAMES.api,
  } as const;

  router.get("/health", (_request, response) => response.json(liveness));
  router.get("/health/live", (_request, response) => response.json(liveness));
  router.get("/health/ready", async (_request, response) => {
    const dependencies = await readiness();
    const ready = Object.values(dependencies).every((status) => status === "up");
    response.status(ready ? 200 : 503).json({
      status: ready ? "ready" : "unavailable",
      service: SERVICE_NAMES.api,
      dependencies,
    });
  });

  return router;
}
