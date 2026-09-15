// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import express, { type RequestHandler } from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createErrorHandler } from "../../../shared/http/error-handler.middleware";
import { SupportController } from "../presentation/controllers/support.controller";
import { createSupportRouter } from "../presentation/routes/support.routes";

describe("Support AI proposal decisions", () => {
  it("cancels a pending proposal through the authenticated Support API", async () => {
    const cancelSupportProposal = vi.fn(async () => ({ id: "proposal-1", status: "canceled" as const }));
    const controller = new SupportController({} as never, undefined, { cancelSupportProposal } as never);
    const authenticate: RequestHandler = (_request, response, next) => {
      response.locals.staffPrincipal = { subject: "admin", displayName: "Admin", roles: ["administrator"] };
      next();
    };
    const app = express();
    app.use(express.json());
    app.use("/v1/admin/support/tickets", createSupportRouter(controller, authenticate, vi.fn(async () => undefined)));
    app.use(createErrorHandler());

    const response = await request(app)
      .post("/v1/admin/support/tickets/ai-proposal/proposal-1/cancel")
      .expect(200);

    expect(response.body.data).toEqual({ id: "proposal-1", status: "canceled" });
    expect(cancelSupportProposal).toHaveBeenCalledWith("proposal-1");
  });
});
