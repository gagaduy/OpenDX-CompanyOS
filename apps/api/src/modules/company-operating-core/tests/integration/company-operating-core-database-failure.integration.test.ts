// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApiApp } from "../../../../app";
import type { ICompanyOperatingCoreRepository } from "../../application/repositories/interfaces/company-operating-core.repository";
import { DatabaseUnavailableError } from "../../../../shared/database/database-unavailable.error";

describe("Company Operating Core database failure", () => {
  it("fails closed without exposing or falling back to memory seed data", async () => {
    const unavailable = async (): Promise<never> => {
      throw new DatabaseUnavailableError();
    };
    const repository: ICompanyOperatingCoreRepository = {
      getSnapshot: unavailable,
      listDepartments: unavailable,
      listTasks: unavailable,
      listEvents: unavailable,
      listApprovals: unavailable,
    };
    const app = createApiApp({ companyOperatingCoreRepository: repository });

    const response = await request(app)
      .get("/v1/operating-core")
      .set("x-correlation-id", "corr_database_down")
      .expect(503);

    expect(response.body).toEqual({
      success: false,
      message: "A required dependency is unavailable",
      errorCode: "DEPENDENCY_UNAVAILABLE",
      errors: [],
    });
    expect(response.headers["x-correlation-id"]).toBe("corr_database_down");
    expect(JSON.stringify(response.body)).not.toContain("NovaCommerce");
  });
});
