// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.integration.test.ts"],
    globalSetup: ["src/shared/testing/assert-integration-environment.ts"],
    setupFiles: ["src/integration-test-setup.ts"],
    fileParallelism: false,
    sequence: { concurrent: false, hooks: "stack" },
  },
});
