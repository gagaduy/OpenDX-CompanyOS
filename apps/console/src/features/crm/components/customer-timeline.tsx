// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { formatVnd } from "../../../shared/format/currency";
import type { Customer360View } from "../types/crm.types";

type TimelineEntry = {
  readonly at: string;
  readonly kind: "order" | "note" | "followup";
  readonly primary: string;
  readonly meta?: string;
};

export function CustomerTimeline({ view }: { readonly view: Customer360View }) {
  const entries: TimelineEntry[] = [
    ...view.orders.map((order) => ({
      at: order.paidAt ?? order.createdAt,
      kind: "order" as const,
      primary: order.publicNumber,
      meta: `${order.status} · ${formatVnd(order.totalVnd)}`,
    })),
    ...view.notes.map((note) => ({
      at: note.createdAt,
      kind: "note" as const,
      primary: note.body,
      meta: note.correctsNoteId ? `Corrects ${note.correctsNoteId}` : undefined,
    })),
    ...view.followups.map((followup) => ({
      at: followup.dueAt,
      kind: "followup" as const,
      primary: `Follow-up: ${followup.description}`,
      meta: followup.status,
    })),
  ].sort((left, right) => left.at.localeCompare(right.at));

  return (
    <section className="detailCard">
      <h2>Timeline</h2>
      <ol className="timelineList">
        {entries.map((entry, index) => (
          <li key={`${entry.kind}-${entry.at}-${index}`}>
            <time>{new Date(entry.at).toLocaleString("vi-VN")}</time>
            <span>{entry.primary}</span>
            {entry.meta ? <span className="subtleText">{entry.meta}</span> : null}
          </li>
        ))}
      </ol>
    </section>
  );
}
