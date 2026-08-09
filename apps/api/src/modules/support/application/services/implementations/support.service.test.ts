// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import { SupportService } from "./support.service";

describe("SupportService", () => {
  it("does not allow a CRM operator to browse the support queue", async () => {
    const service = new SupportService({} as never, {} as never, {} as never, {} as never, () => "id", () => "2026-08-10T00:00:00.000Z");
    await expect(service.list({ page: 1, pageSize: 20 }, { actorId: "crm", roles: ["crm_operator"], correlationId: "c" })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
