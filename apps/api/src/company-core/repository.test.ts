// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import { InMemoryCompanyOperatingCoreRepository } from "./repository";
import { NOVACOMMERCE_COMPANY_ID, createCompanyCoreSeed } from "./seed";

describe("InMemoryCompanyOperatingCoreRepository", () => {
  it("returns the NovaCommerce operating core snapshot", () => {
    const repository = new InMemoryCompanyOperatingCoreRepository(
      createCompanyCoreSeed(),
    );

    const snapshot = repository.findSnapshotByCompanyId(NOVACOMMERCE_COMPANY_ID);

    expect(snapshot?.company.name).toBe("NovaCommerce");
    expect(snapshot?.departments.map((department) => department.slug)).toEqual([
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

  it("returns undefined for an unknown company", () => {
    const repository = new InMemoryCompanyOperatingCoreRepository(
      createCompanyCoreSeed(),
    );

    expect(repository.findSnapshotByCompanyId("company_missing")).toBeUndefined();
  });

  it("does not return cross-company records from scoped collection methods", () => {
    const repository = new InMemoryCompanyOperatingCoreRepository(
      createCompanyCoreSeed(),
    );

    expect(repository.findTasksByCompanyId(NOVACOMMERCE_COMPANY_ID)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ companyId: NOVACOMMERCE_COMPANY_ID }),
      ]),
    );
    expect(
      repository
        .findTasksByCompanyId(NOVACOMMERCE_COMPANY_ID)
        .every((task) => task.companyId === NOVACOMMERCE_COMPANY_ID),
    ).toBe(true);
    expect(repository.findTasksByCompanyId(NOVACOMMERCE_COMPANY_ID)).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "task_compass_private" }),
      ]),
    );
  });

  it("keeps task, event, approval, and audit correlation ids aligned for demo flows", () => {
    const repository = new InMemoryCompanyOperatingCoreRepository(
      createCompanyCoreSeed(),
    );
    const snapshot = repository.findSnapshotByCompanyId(NOVACOMMERCE_COMPANY_ID);

    expect(snapshot?.events.map((event) => event.correlationId)).toContain(
      "corr_lead_to_cash",
    );
    expect(snapshot?.tasks.map((task) => task.relatedEventId)).toContain(
      "event_lead_created",
    );
    expect(snapshot?.approvals.map((approval) => approval.correlationId)).toContain(
      "corr_lead_to_cash",
    );
    expect(
      snapshot?.auditEvents.map((auditEvent) => auditEvent.correlationId),
    ).toContain("corr_lead_to_cash");
  });
});
