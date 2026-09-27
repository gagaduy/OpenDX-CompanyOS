// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { CalendarClock, FileText, History, ShoppingBag } from "lucide-react";
import { formatVnd } from "../../../shared/format/currency";
import type { Customer360View } from "../types/crm.types";
import "../../customers/styles/customers.css";

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
    <section className="detailCard customer360SectionCard" aria-label="Customer timeline">
      <div className="customer360SectionHeader">
        <h2 className="customer360SectionTitle">
          <History size={18} style={{ color: "#38bdf8" }} aria-hidden="true" />
          <span>Timeline</span>
        </h2>
        <span style={{ fontSize: "0.78rem", color: "var(--ink-subtle, #8a8f98)" }}>
          {entries.length} sự kiện
        </span>
      </div>

      {entries.length === 0 ? (
        <p style={{ fontSize: "0.85rem", color: "var(--ink-subtle, #8a8f98)", margin: 0, fontStyle: "italic" }}>
          Chưa có sự kiện tương tác nào.
        </p>
      ) : (
        <ol className="timelineList customerTimelineList">
          {entries.map((entry, index) => {
            const isOrder = entry.kind === "order";
            const isNote = entry.kind === "note";
            const isFollowup = entry.kind === "followup";

            return (
              <li
                key={`${entry.kind}-${entry.at}-${index}`}
                className="customerTimelineItem"
              >
                <div
                  className={`customerTimelineDot ${entry.kind}`}
                  title={entry.kind.toUpperCase()}
                  aria-hidden="true"
                >
                  {isOrder ? (
                    <ShoppingBag size={14} />
                  ) : isNote ? (
                    <FileText size={14} />
                  ) : (
                    <CalendarClock size={14} />
                  )}
                </div>

                <div className="customerTimelineContent">
                  <time className="customerTimelineTime">
                    {new Date(entry.at).toLocaleString("vi-VN", {
                      year: "numeric",
                      month: "2-digit",
                      day: "2-digit",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </time>
                  <span className="customerTimelinePrimary">{entry.primary}</span>
                  {entry.meta ? (
                    <span className="subtleText customerTimelineMeta">{entry.meta}</span>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
