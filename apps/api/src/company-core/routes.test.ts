// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApiApp } from "../app";

describe("Company Operating Core API", () => {
  const app = createApiApp();

  it("returns the NovaCommerce operating-core snapshot", async () => {
    const response = await request(app).get("/v1/operating-core").expect(200);

    expect(response.body.company.name).toBe("NovaCommerce");
    expect(response.body.company).not.toHaveProperty("id");
    expect(response.body.departments).toHaveLength(8);
    expect(response.body.tasks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "task_qualify_acme_lead",
          relatedEventId: "event_lead_created",
        }),
      ]),
    );
    expect(JSON.stringify(response.body)).not.toContain("companyId");
  });

  it("returns department, task, event, and approval collections", async () => {
    const [departments, tasks, events, approvals] = await Promise.all([
      request(app).get("/v1/departments").expect(200),
      request(app).get("/v1/tasks").expect(200),
      request(app).get("/v1/events").expect(200),
      request(app).get("/v1/approvals").expect(200),
    ]);

    expect(departments.body.data).toEqual(
      expect.arrayContaining([expect.objectContaining({ slug: "sales" })]),
    );
    expect(tasks.body.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ status: "waiting_approval" }),
      ]),
    );
    expect(events.body.data).toEqual(
      expect.arrayContaining([expect.objectContaining({ type: "lead.created" })]),
    );
    expect(approvals.body.data).toEqual(
      expect.arrayContaining([expect.objectContaining({ status: "pending" })]),
    );
    for (const response of [departments, tasks, events, approvals]) {
      expect(Object.keys(response.body)).toEqual(["data"]);
      expect(JSON.stringify(response.body)).not.toContain("companyId");
    }
  });
});
