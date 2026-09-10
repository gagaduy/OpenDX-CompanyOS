// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it, vi } from "vitest";
import { InMemoryRealtimeBroadcasterAdapter } from "./in-memory-realtime-broadcaster.adapter";
import type { SupportRealtimeEvent } from "../../application/ports/realtime-broadcaster.port";

describe("InMemoryRealtimeBroadcasterAdapter", () => {
  it("broadcasts events to subscribers of a specific ticket", () => {
    const broadcaster = new InMemoryRealtimeBroadcasterAdapter();
    const listener = vi.fn();

    const unsubscribe = broadcaster.subscribe("ticket-1", listener);

    const event: SupportRealtimeEvent = {
      type: "message_created",
      ticketId: "ticket-1",
      message: {
        id: "msg-1",
        authorId: "customer",
        body: "Hello realtime",
        createdAt: "2026-09-03T14:00:00Z",
      },
    };

    broadcaster.broadcast("ticket-1", event);

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith(event);

    unsubscribe();
  });

  it("does not deliver events to subscribers of other tickets", () => {
    const broadcaster = new InMemoryRealtimeBroadcasterAdapter();
    const listenerA = vi.fn();
    const listenerB = vi.fn();

    const unsubA = broadcaster.subscribe("ticket-A", listenerA);
    const unsubB = broadcaster.subscribe("ticket-B", listenerB);

    broadcaster.broadcast("ticket-A", {
      type: "status_changed",
      ticketId: "ticket-A",
      status: "in_progress",
      updatedAt: "2026-09-03T14:05:00Z",
    });

    expect(listenerA).toHaveBeenCalledTimes(1);
    expect(listenerB).not.toHaveBeenCalled();

    unsubA();
    unsubB();
  });

  it("stops delivering events after unsubscribe", () => {
    const broadcaster = new InMemoryRealtimeBroadcasterAdapter();
    const listener = vi.fn();

    const unsubscribe = broadcaster.subscribe("ticket-1", listener);

    broadcaster.broadcast("ticket-1", {
      type: "status_changed",
      ticketId: "ticket-1",
      status: "resolved",
      updatedAt: "2026-09-03T14:10:00Z",
    });
    expect(listener).toHaveBeenCalledTimes(1);

    unsubscribe();

    broadcaster.broadcast("ticket-1", {
      type: "status_changed",
      ticketId: "ticket-1",
      status: "closed",
      updatedAt: "2026-09-03T14:15:00Z",
    });
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
