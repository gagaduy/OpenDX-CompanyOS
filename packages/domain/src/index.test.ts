// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import { SERVICE_NAMES, makeCompanyScopedId } from "./index";

describe("domain contracts", () => {
  it("exposes stable service names", () => {
    expect(SERVICE_NAMES.api).toBe("opendx-api");
    expect(SERVICE_NAMES.aiRuntime).toBe("opendx-ai-runtime");
  });

  it("creates company-scoped identifiers", () => {
    expect(makeCompanyScopedId("company_123", "department_456")).toBe(
      "company_123:department_456",
    );
  });
});
