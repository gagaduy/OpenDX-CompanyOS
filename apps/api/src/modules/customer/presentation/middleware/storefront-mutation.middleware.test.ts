// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { createErrorHandler } from "../../../../shared/http/error-handler.middleware";
import { requireCsrf } from "./storefront-mutation.middleware";

const cookieConfig = {
  guestName: "opendx_guest",
  customerName: "opendx_customer",
  csrfName: "opendx_csrf",
  secure: false,
} as const;

function createApp() {
  const app = express();
  app.post("/mutation", requireCsrf(cookieConfig), (_request, response) => {
    response.status(204).end();
  });
  app.use(createErrorHandler());
  return app;
}

describe("storefront CSRF middleware", () => {
  it("accepts the header token when a legacy path cookie is also present", async () => {
    await request(createApp())
      .post("/mutation")
      .set("Cookie", "opendx_csrf=legacy-token; opendx_csrf=current-token")
      .set("x-csrf-token", "current-token")
      .expect(204);
  });

  it("rejects a token that matches none of the submitted cookies", async () => {
    const response = await request(createApp())
      .post("/mutation")
      .set("Cookie", "opendx_csrf=legacy-token; opendx_csrf=current-token")
      .set("x-csrf-token", "attacker-token")
      .expect(403);

    expect(response.body.errorCode).toBe("CSRF_INVALID");
  });
});
