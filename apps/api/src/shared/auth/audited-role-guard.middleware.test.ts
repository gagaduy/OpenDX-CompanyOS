// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { correlationIdMiddleware } from "../http/correlation-id.middleware";
import { createErrorHandler } from "../http/error-handler.middleware";
import { createAuditedRoleGuard } from "./audited-role-guard.middleware";

describe("createAuditedRoleGuard", () => {
  it("awaits a denied audit before returning forbidden", async () => {
    const appendDenied = vi.fn(async () => undefined);
    const app = express();
    app.use(correlationIdMiddleware);
    app.post(
      "/stock/:id",
      (_request, response, next) => {
        response.locals.staffPrincipal = {
          subject: "catalog-user",
          displayName: "Catalog User",
          roles: ["catalog_manager"],
        };
        next();
      },
      createAuditedRoleGuard({
        allowedRoles: ["administrator", "inventory_manager"],
        action: "inventory.stock.received",
        resourceId: (pending) => pending.params.id as string,
        appendDenied,
      }),
      (_request, response) => response.sendStatus(201),
    );
    app.use(createErrorHandler());

    await request(app)
      .post("/stock/item-1")
      .set("x-correlation-id", "corr-denied")
      .expect(403);

    expect(appendDenied).toHaveBeenCalledWith({
      actorId: "catalog-user",
      action: "inventory.stock.received",
      resourceId: "item-1",
      correlationId: "corr-denied",
    });
  });
});
