// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { AgenticTimelineEvent } from "../types/agentic.types";

export interface TaskTimelineProps { readonly events: readonly AgenticTimelineEvent[]; readonly selectedEventId?: string; onSelect(eventId: string): void }

export function TaskTimeline({ events, selectedEventId, onSelect }: TaskTimelineProps) {
  return <section className="agenticTaskPanel agenticTimelinePanel">
    <header className="agenticPanelHeader">
      <div><span className="agenticDetailEyebrow">Nhật ký có thể kiểm chứng</span><h2>Dòng thời gian thực thi</h2></div>
      <span className="agenticPanelCount">{events.length} sự kiện</span>
    </header>
    <ol className="agenticTimeline" aria-label="Execution timeline">
      {events.map((event, index) => <li key={event.id}>
        <span className="agenticTimelineMarker" aria-hidden="true">{index + 1}</span>
        <button type="button" aria-pressed={selectedEventId === event.id} onClick={() => onSelect(event.id)}>
          <span className="agenticTimelineCopy"><strong>{label(event.kind)}</strong><small>{event.reasonCode ?? "Sự kiện đã được ghi nhận và lưu vết"}</small></span>
          <span className="agenticTimelineMeta"><span>{label(event.state)}</span><time dateTime={event.occurredAt}>{new Date(event.occurredAt).toLocaleString()}</time></span>
        </button>
      </li>)}
    </ol>
  </section>;
}

function label(value: string): string { return value.split("_").map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`).join(" "); }
