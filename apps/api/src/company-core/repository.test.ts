// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import { InMemoryCompanyOperatingCoreRepository } from "./repository";
import { createNovaCommerceSnapshot } from "./seed";

function createRepository() {
  return new InMemoryCompanyOperatingCoreRepository(
    createNovaCommerceSnapshot(),
  );
}

describe("InMemoryCompanyOperatingCoreRepository", () => {
  it("returns the configured NovaCommerce snapshot", () => {
    const snapshot = createRepository().getSnapshot();

    expect(snapshot.company.name).toBe("NovaCommerce");
    expect(snapshot.departments.map((department) => department.slug)).toEqual([
      "executive",
      "marketing",
      "sales",
      "customer-service",
      "operations",
      "finance",
      "human-resources",
      "it-compliance",
    ]);
  });

  it("stores no company identifiers", () => {
    expect(JSON.stringify(createRepository().getSnapshot())).not.toContain(
      "companyId",
    );
    expect(createRepository().getSnapshot().company).not.toHaveProperty("id");
  });

  it("returns the configured company collections", () => {
    const repository = createRepository();

    expect(repository.listDepartments()).toHaveLength(8);
    expect(repository.listTasks()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "task_qualify_acme_lead" }),
      ]),
    );
    expect(repository.listEvents()).not.toHaveLength(0);
    expect(repository.listApprovals()).not.toHaveLength(0);
  });

  it("keeps demo-flow correlation ids aligned", () => {
    const snapshot = createRepository().getSnapshot();

    expect(snapshot.events.map((event) => event.correlationId)).toContain(
      "corr_lead_to_cash",
    );
    expect(snapshot.tasks.map((task) => task.relatedEventId)).toContain(
      "event_lead_created",
    );
    expect(snapshot.approvals.map((approval) => approval.correlationId)).toContain(
      "corr_lead_to_cash",
    );
    expect(
      snapshot.auditEvents.map((auditEvent) => auditEvent.correlationId),
    ).toContain("corr_lead_to_cash");
  });
});
