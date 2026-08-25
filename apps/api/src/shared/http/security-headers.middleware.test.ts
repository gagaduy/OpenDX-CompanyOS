// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { securityHeaders } from "./security-headers.middleware";

describe("security headers", () => {
  it("adds production-safe browser hardening headers", async () => {
    const app = express()
      .use(securityHeaders())
      .get("/probe", (_request, response) => response.json({ ok: true }));

    const response = await request(app).get("/probe").expect(200);

    expect(response.header["x-content-type-options"]).toBe("nosniff");
    expect(response.header["referrer-policy"]).toBe(
      "strict-origin-when-cross-origin",
    );
    expect(response.header["permissions-policy"]).toContain("camera=()");
    expect(response.header["content-security-policy"]).toContain(
      "default-src 'self'",
    );
  });
});
