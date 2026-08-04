// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import { createNovaCommerceSnapshot } from "../../../../company-core/seed";
import { CompanyOperatingCoreMapper } from "./company-operating-core.mapper";

describe("CompanyOperatingCoreMapper", () => {
  it("returns a defensive response copy", () => {
    const source = createNovaCommerceSnapshot();
    const response = new CompanyOperatingCoreMapper().toResponse(source);

    source.company.name = "Mutated company";
    source.events[0]!.actor.id = "mutated_actor";
    source.departments.length = 0;

    expect(response.company.name).toBe("NovaCommerce");
    expect(response.events[0]!.actor.id).not.toBe("mutated_actor");
    expect(response.departments).toHaveLength(8);
  });
});
