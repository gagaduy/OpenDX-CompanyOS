// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it, vi } from "vitest";
import { SupportEscalationWorker } from "./support-escalation.worker";

describe("SupportEscalationWorker", () => {
  it("uses the deterministic effective breach instant for its automatic event key", async () => {
    const ticket = {
      id: "f1000000-0000-4000-8000-000000000001", customerId: "customer", subject: "Help", description: "Need help",
      priority: "urgent" as const, status: "in_progress" as const, version: 1, createdById: "creator",
      slaPausedSeconds: 0, slaStoppedSeconds: 0, createdAt: "2026-08-10T00:00:00.000Z", updatedAt: "2026-08-10T00:00:00.000Z",
    };
    const repository = {
      claimBreached: vi.fn(async () => [{ ticket, breachAt: "2026-08-10T02:00:00.000Z" }]),
      findEventByKey: vi.fn(async () => undefined), update: vi.fn(async () => true),
      appendEvent: vi.fn(async () => true), appendAudit: vi.fn(async () => undefined),
    };
    const worker = new SupportEscalationWorker({ run: async <T>(work: (session: never) => Promise<T>) => work({ query: vi.fn() } as never), runReadOnly: vi.fn() } as never, repository as never, () => "event-id", () => "2026-08-10T04:00:00.000Z");

    await worker.tick();

    expect(repository.findEventByKey).toHaveBeenCalledWith(expect.anything(), ticket.id, "sla-escalation:" + ticket.id + ":2026-08-10T02:00:00.000Z");
  });
});
