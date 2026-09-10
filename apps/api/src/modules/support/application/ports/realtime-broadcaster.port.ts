// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

export interface SupportRealtimeMessageEvent {
  readonly type: "message_created";
  readonly ticketId: string;
  readonly message: {
    readonly id: string;
    readonly authorId: string;
    readonly body: string;
    readonly createdAt: string;
  };
}

export interface SupportRealtimeStatusEvent {
  readonly type: "status_changed";
  readonly ticketId: string;
  readonly status: string;
  readonly updatedAt: string;
}

export type SupportRealtimeEvent = SupportRealtimeMessageEvent | SupportRealtimeStatusEvent;

export interface RealtimeBroadcasterPort {
  subscribe(ticketId: string, listener: (event: SupportRealtimeEvent) => void): () => void;
  broadcast(ticketId: string, event: SupportRealtimeEvent): void;
}
