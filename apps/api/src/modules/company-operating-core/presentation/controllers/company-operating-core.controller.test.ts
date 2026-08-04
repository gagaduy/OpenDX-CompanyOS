// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import express, { type RequestHandler } from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import type { ICompanyOperatingCoreService } from "../../application/services/interfaces/company-operating-core.service";
import { createNovaCommerceSnapshot } from "../../tests/fixtures/nova-commerce.fixture";
import { CompanyOperatingCoreController } from "./company-operating-core.controller";

class FakeService implements ICompanyOperatingCoreService {
  readonly calls: string[] = [];
  private readonly snapshot = createNovaCommerceSnapshot();

  async getSnapshot() {
    this.calls.push("getSnapshot");
    return this.snapshot;
  }

  async listDepartments() {
    this.calls.push("listDepartments");
    return this.snapshot.departments;
  }

  async listTasks() {
    this.calls.push("listTasks");
    return this.snapshot.tasks;
  }

  async listEvents() {
    this.calls.push("listEvents");
    return this.snapshot.events;
  }

  async listApprovals() {
    this.calls.push("listApprovals");
    return this.snapshot.approvals;
  }
}

async function invoke(handler: RequestHandler) {
  const app = express();
  app.get("/resource", handler);
  return request(app).get("/resource").expect(200);
}

describe("CompanyOperatingCoreController", () => {
  it("delegates snapshot retrieval without company parameters", async () => {
    const service = new FakeService();
    const controller = new CompanyOperatingCoreController(service);
    const response = await invoke(controller.getSnapshot);

    expect(service.calls).toEqual(["getSnapshot"]);
    expect(response.body.company.name).toBe("NovaCommerce");
  });

  it.each([
    ["listDepartments", "listDepartments"],
    ["listTasks", "listTasks"],
    ["listEvents", "listEvents"],
    ["listApprovals", "listApprovals"],
  ] as const)("%s returns the existing collection wrapper", async (method, call) => {
    const service = new FakeService();
    const controller = new CompanyOperatingCoreController(service);
    const response = await invoke(controller[method]);

    expect(service.calls).toEqual([call]);
    expect(Object.keys(response.body)).toEqual(["data"]);
    expect(response.body.data.length).toBeGreaterThan(0);
  });
});
