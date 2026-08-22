// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import test from "node:test";
import { validateAgenticPhaseE } from "./agentic-phase-e-exit-check.mjs";
test("requires private bounded file lifecycle and all rejection cases", () => {
  assert.doesNotThrow(() => validateAgenticPhaseE({ api: "They are private staff APIs: neither file bytes, storage keys, public URLs, nor browser credentials appear in any response. /:fileId/approve", service: "FILE_CONTENT_INVALID FILE_SCAN_FAILED", storage: "agentic-intake/", parser: "maxRows", routes: "upload.single(\"file\")" }));
  assert.throws(() => validateAgenticPhaseE({ api: "", service: "", storage: "", parser: "", routes: "" }), /private/i);
});
