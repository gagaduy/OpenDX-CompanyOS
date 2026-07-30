// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import { opendxColors } from "./index";

describe("opendxColors", () => {
  it("keeps the approved dark canvas and accent", () => {
    expect(opendxColors.canvas).toBe("#010102");
    expect(opendxColors.primary).toBe("#5e6ad2");
  });
});
