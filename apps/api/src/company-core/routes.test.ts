// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApiApp } from "../app";
import { NOVACOMMERCE_COMPANY_ID } from "./seed";

describe("Company Operating Core API", () => {
  const app = createApiApp();

  it("returns an aggregate operating-core snapshot for NovaCommerce", async () => {
    const response = await request(app)
      .get(`/v1/companies/${NOVACOMMERCE_COMPANY_ID}/operating-core`)
      .expect(200);

    expect(response.body.company.name).toBe("NovaCommerce");
    expect(response.body.departments).toHaveLength(8);
    expect(response.body.tasks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "task_qualify_acme_lead",
          relatedEventId: "event_lead_created",
        }),
      ]),
    );
    expect(response.body.auditEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          outcome: "approval_required",
          correlationId: "corr_lead_to_cash",
        }),
      ]),
    );
  });

  it("returns deterministic not found errors for unknown companies", async () => {
    const response = await request(app)
      .get("/v1/companies/company_missing/operating-core")
      .expect(404);

    expect(response.body).toEqual({
      error: {
        code: "company_not_found",
        message: "Company was not found",
      },
    });
  });

  it("returns department, task, event, and approval collections", async () => {
    const [departments, tasks, events, approvals] = await Promise.all([
      request(app)
        .get(`/v1/companies/${NOVACOMMERCE_COMPANY_ID}/departments`)
        .expect(200),
      request(app)
        .get(`/v1/companies/${NOVACOMMERCE_COMPANY_ID}/tasks`)
        .expect(200),
      request(app)
        .get(`/v1/companies/${NOVACOMMERCE_COMPANY_ID}/events`)
        .expect(200),
      request(app)
        .get(`/v1/companies/${NOVACOMMERCE_COMPANY_ID}/approvals`)
        .expect(200),
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
  });

  it("does not expose cross-company records from company-scoped endpoints", async () => {
    const response = await request(app)
      .get(`/v1/companies/${NOVACOMMERCE_COMPANY_ID}/tasks`)
      .expect(200);

    expect(
      response.body.data.every(
        (task: { companyId: string }) => task.companyId === NOVACOMMERCE_COMPANY_ID,
      ),
    ).toBe(true);
    expect(response.body.data).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "task_compass_private" }),
      ]),
    );
  });
});
