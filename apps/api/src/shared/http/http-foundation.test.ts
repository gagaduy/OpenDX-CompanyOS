// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApiApp } from "../../app";
import { ApplicationError } from "./application-error";
import { createErrorHandler } from "./error-handler.middleware";

describe("HTTP foundation", () => {
  it("exposes liveness without checking dependencies", async () => {
    const response = await request(createApiApp()).get("/health/live");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: "ok", service: "opendx-api" });
  });

  it("reports dependency-aware readiness", async () => {
    const response = await request(
      createApiApp({
        readiness: async () => ({
          postgres: "up",
          keycloak: "up",
          minio: "up",
          migrations: "up",
        }),
      }),
    ).get("/health/ready");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      status: "ready",
      service: "opendx-api",
      dependencies: {
        postgres: "up",
        keycloak: "up",
        minio: "up",
        migrations: "up",
      },
    });
  });

  it("maps application errors with a correlation ID", async () => {
    const app = express();
    app.get("/invalid", () => {
      throw new ApplicationError(
        400,
        "VALIDATION_ERROR",
        "Validation failed",
        [{ path: "name", message: "Name is required" }],
      );
    });
    app.use(createErrorHandler());

    const response = await request(app)
      .get("/invalid")
      .set("x-correlation-id", "corr_test_request");

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      success: false,
      message: "Validation failed",
      errorCode: "VALIDATION_ERROR",
      errors: [{ path: "name", message: "Name is required" }],
    });
    expect(response.headers["x-correlation-id"]).toBe("corr_test_request");
  });

  it("hides unexpected error details", async () => {
    const app = express();
    app.get("/failure", () => {
      throw new Error("postgres://user:secret@database/internal");
    });
    app.use(createErrorHandler());

    const response = await request(app).get("/failure");

    expect(response.status).toBe(500);
    expect(response.body.errorCode).toBe("INTERNAL_ERROR");
    expect(JSON.stringify(response.body)).not.toContain("secret");
  });
});
