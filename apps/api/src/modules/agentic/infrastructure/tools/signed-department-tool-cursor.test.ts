// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it, vi } from "vitest";
import { SignedDepartmentToolCursorAdapter } from "./signed-department-tool-cursor";

const context = {
  invocationId: "11111111-1111-4111-8111-111111111111",
  taskId: "22222222-2222-4222-8222-222222222222",
  agentKind: "catalog" as const,
  toolName: "catalog.publication_readiness" as const,
  toolVersion: 1 as const,
  attempt: 1,
  correlationId: "correlation",
  causationId: "causation",
};

describe("SignedDepartmentToolCursorAdapter", () => {
  it("round-trips an inner cursor only for the bound task, tool, and parameters", async () => {
    const execute = vi.fn(async (_context, parameters: Readonly<Record<string, unknown>>) =>
      parameters.cursor === undefined ? { nextCursor: "owner-keyset" } : { received: parameters.cursor });
    const adapter = new SignedDepartmentToolCursorAdapter(
      { execute }, "cursor-secret", () => "2026-08-16T05:00:00.000Z",
    );
    const first = await adapter.execute(context, { limit: 20 }) as { readonly nextCursor: string };
    expect(first.nextCursor).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
    await expect(adapter.execute(context, { limit: 20, cursor: first.nextCursor }))
      .resolves.toEqual({ received: "owner-keyset" });
    for (const [changedContext, parameters] of [
      [{ ...context, taskId: "33333333-3333-4333-8333-333333333333" }, { limit: 20, cursor: first.nextCursor }],
      [{ ...context, toolName: "catalog.product_completeness" as const }, { limit: 20, cursor: first.nextCursor }],
      [context, { limit: 10, cursor: first.nextCursor }],
    ] as const) {
      await expect(adapter.execute(changedContext, parameters))
        .rejects.toMatchObject({ code: "TOOL_INPUT_INVALID" });
    }
  });

  it("rejects tampered and expired cursors", async () => {
    let current = "2026-08-16T05:00:00.000Z";
    const adapter = new SignedDepartmentToolCursorAdapter(
      { execute: vi.fn(async () => ({ nextCursor: "owner-keyset" })) },
      "cursor-secret",
      () => current,
    );
    const first = await adapter.execute(context, {}) as { readonly nextCursor: string };
    await expect(adapter.execute(context, { cursor: `${first.nextCursor}x` }))
      .rejects.toMatchObject({ code: "TOOL_INPUT_INVALID" });
    current = "2026-08-16T05:05:00.000Z";
    await expect(adapter.execute(context, { cursor: first.nextCursor }))
      .rejects.toMatchObject({ code: "TOOL_INPUT_INVALID" });
  });
});
