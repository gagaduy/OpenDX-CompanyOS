// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import { createNovaCommerceSnapshot } from "../../../tests/fixtures/nova-commerce.fixture";
import { InMemoryCompanyOperatingCoreRepository } from "./in-memory-company-operating-core.repository";

function createRepository() {
  return new InMemoryCompanyOperatingCoreRepository(
    createNovaCommerceSnapshot(),
  );
}

describe("InMemoryCompanyOperatingCoreRepository", () => {
  it("returns the configured company and collections", async () => {
    const repository = createRepository();
    const [snapshot, departments, tasks, events, approvals] = await Promise.all([
      repository.getSnapshot(),
      repository.listDepartments(),
      repository.listTasks(),
      repository.listEvents(),
      repository.listApprovals(),
    ]);

    expect(snapshot.company.name).toBe("NovaCommerce");
    expect(departments).toHaveLength(8);
    expect(tasks).not.toHaveLength(0);
    expect(events).not.toHaveLength(0);
    expect(approvals).not.toHaveLength(0);
  });

  it("preserves demo-flow correlation IDs", async () => {
    const snapshot = await createRepository().getSnapshot();

    expect(snapshot.events.map((event) => event.correlationId)).toContain(
      "corr_lead_to_cash",
    );
    expect(snapshot.approvals.map((approval) => approval.correlationId)).toContain(
      "corr_lead_to_cash",
    );
  });

  it("protects internal state from returned-value mutations", async () => {
    const repository = createRepository();
    const first = await repository.getSnapshot();
    first.company.name = "Mutated company";
    first.tasks[0]!.title = "Mutated task";

    const second = await repository.getSnapshot();
    expect(second.company.name).toBe("NovaCommerce");
    expect(second.tasks[0]!.title).not.toBe("Mutated task");
  });
});
