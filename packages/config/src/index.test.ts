// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import { readStringEnv } from "./index";

describe("readStringEnv", () => {
  it("returns the configured value", () => {
    expect(readStringEnv({ OPENDX_ENV: "development" }, "OPENDX_ENV")).toBe(
      "development",
    );
  });

  it("returns the fallback for a missing value", () => {
    expect(readStringEnv({}, "OPENDX_ENV", "test")).toBe("test");
  });
});
