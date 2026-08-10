// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { createMetricsRouter } from "../http/metrics.routes";
import { requestLogging } from "../http/request-logging.middleware";
import { createLogger } from "./logger";
import { createMetricsRegistry } from "./metrics";

describe("observability", () => {
  it("redacts secret-bearing fields from JSON logs", () => {
    const entries: string[] = [];
    const logger = createLogger({
      format: "json",
      level: "info",
      sink: (line) => entries.push(line),
    });

    logger.info("payment", {
      customerEmail: "buyer@example.com",
      SEPAY_SECRET_KEY: "secret",
      token: "raw-token",
      errorCode: "PAYMENT_PROVIDER_TIMEOUT",
    });

    const line = entries.join("\n");
    expect(line).not.toContain("buyer@example.com");
    expect(line).not.toContain("secret");
    expect(line).not.toContain("raw-token");
    expect(line).toContain("PAYMENT_PROVIDER_TIMEOUT");
  });

  it("exposes bounded request metrics without PII labels", async () => {
    const metrics = createMetricsRegistry();
    const app = express()
      .use(
        requestLogging(
          createLogger({
            format: "json",
            level: "info",
            sink: () => undefined,
          }),
          metrics,
        ),
      )
      .get("/customers/buyer@example.com", (_request, response) =>
        response.json({ ok: true }),
      )
      .use("/metrics", createMetricsRouter(metrics));

    await request(app).get("/customers/buyer@example.com").expect(200);
    const response = await request(app).get("/metrics").expect(200);

    expect(response.text).toContain("opendx_http_requests_total");
    expect(response.text).not.toContain("buyer@example.com");
  });
});
