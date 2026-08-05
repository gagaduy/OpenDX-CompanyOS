// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { NodeSessionTokenService } from "./node-session-token-service";
describe("NodeSessionTokenService", () => {
  it("generates unique 256-bit opaque values and stable one-way hashes", () => {
    const service = new NodeSessionTokenService(),
      a = service.generate(),
      b = service.generate();
    expect(a.raw).not.toBe(b.raw);
    expect(Buffer.from(a.raw, "base64url")).toHaveLength(32);
    expect(a.hash).toMatch(/^[a-f0-9]{64}$/);
    expect(service.hash(a.raw)).toBe(a.hash);
    expect(a.raw).not.toContain(a.hash);
  });
});
