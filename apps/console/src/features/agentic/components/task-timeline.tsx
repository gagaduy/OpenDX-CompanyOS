// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { AgenticTimelineEvent } from "../types/agentic.types";

export interface TaskTimelineProps { readonly events: readonly AgenticTimelineEvent[]; readonly selectedEventId?: string; onSelect(eventId: string): void }

export function TaskTimeline({ events, selectedEventId, onSelect }: TaskTimelineProps) {
  return <section><h2>Execution timeline</h2><ol className="agenticTimeline" aria-label="Execution timeline">
    {events.map((event) => <li key={event.id}><button type="button" aria-pressed={selectedEventId === event.id} onClick={() => onSelect(event.id)}><strong>{label(event.kind)}</strong><span>{label(event.state)}</span><time dateTime={event.occurredAt}>{new Date(event.occurredAt).toLocaleString()}</time>{event.reasonCode && <span>{event.reasonCode}</span>}</button></li>)}
  </ol></section>;
}

function label(value: string): string { return value.split("_").map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`).join(" "); }
