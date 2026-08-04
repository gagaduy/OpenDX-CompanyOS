// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import { createNovaCommerceSnapshot } from "../../../infrastructure/seeds/nova-commerce.seed";
import type { ICompanyOperatingCoreRepository } from "../../repositories/interfaces/company-operating-core.repository";
import { CompanyOperatingCoreMapper } from "../../mappers/company-operating-core.mapper";
import { CompanyOperatingCoreService } from "./company-operating-core.service";

class FakeRepository implements ICompanyOperatingCoreRepository {
  private readonly snapshot = createNovaCommerceSnapshot();

  async getSnapshot() {
    return this.snapshot;
  }

  async listDepartments() {
    return this.snapshot.departments;
  }

  async listTasks() {
    return this.snapshot.tasks;
  }

  async listEvents() {
    return this.snapshot.events;
  }

  async listApprovals() {
    return this.snapshot.approvals;
  }
}

function createService() {
  return new CompanyOperatingCoreService(
    new FakeRepository(),
    new CompanyOperatingCoreMapper(),
  );
}

describe("CompanyOperatingCoreService", () => {
  it("returns the mapped configured-company snapshot", async () => {
    const response = await createService().getSnapshot();

    expect(response.company.name).toBe("NovaCommerce");
    expect(response.departments).toHaveLength(8);
    expect(JSON.stringify(response)).not.toContain("companyId");
  });

  it("returns all configured-company collections", async () => {
    const service = createService();
    const collections = await Promise.all([
      service.listDepartments(),
      service.listTasks(),
      service.listEvents(),
      service.listApprovals(),
    ]);

    expect(collections.every((collection) => collection.length > 0)).toBe(true);
  });
});
