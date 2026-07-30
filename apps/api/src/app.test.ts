// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApiApp } from "./app";

describe("api health", () => {
  it("returns deterministic health JSON", async () => {
    const response = await request(createApiApp()).get("/health");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      status: "ok",
      service: "opendx-api",
    });
  });
});
