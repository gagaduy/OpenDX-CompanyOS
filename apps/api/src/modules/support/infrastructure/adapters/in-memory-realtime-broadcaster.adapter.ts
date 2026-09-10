// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { EventEmitter } from "node:events";
import type {
  RealtimeBroadcasterPort,
  SupportRealtimeEvent,
} from "../../application/ports/realtime-broadcaster.port";

export class InMemoryRealtimeBroadcasterAdapter implements RealtimeBroadcasterPort {
  private readonly emitter = new EventEmitter();

  constructor() {
    this.emitter.setMaxListeners(500);
  }

  public subscribe(
    ticketId: string,
    listener: (event: SupportRealtimeEvent) => void,
  ): () => void {
    const channel = `ticket:${ticketId}`;
    this.emitter.on(channel, listener);
    return () => {
      this.emitter.off(channel, listener);
    };
  }

  public broadcast(ticketId: string, event: SupportRealtimeEvent): void {
    const channel = `ticket:${ticketId}`;
    this.emitter.emit(channel, event);
  }
}
