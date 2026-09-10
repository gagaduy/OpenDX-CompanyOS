// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { SupportTicketDetailView } from "../types/support.types";

export function TicketTimeline({
  detail,
}: {
  readonly detail: SupportTicketDetailView;
}) {
  const entries = [
    ...detail.events.map((e) => ({
      at: e.occurredAt,
      primary: `${e.fromStatus} → ${e.toStatus}`,
      meta: `${e.source} · ${e.actorId}`,
      isMessage: false,
    })),
    ...detail.messages.map((m) => ({
      at: m.createdAt,
      primary: m.body,
      meta: m.authorId,
      isMessage: true,
    })),
  ].sort((a, b) => a.at.localeCompare(b.at));

  return (
    <section className="detailCard" aria-label="Ticket timeline">
      <h2>Timeline</h2>
      <ol className="timelineList">
        {entries.map((entry, index) => (
          <li key={`${entry.at}-${index}`}>
            <time className="technicalText">
              {new Date(entry.at).toLocaleString("vi-VN")}
            </time>
            <div>
              {renderTimelineContent(entry.primary, entry.isMessage)}
            </div>
            <span className="subtleText technicalText">{entry.meta}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}

function renderTimelineContent(content: string, isMessage: boolean) {
  if (!isMessage) return <span>{content}</span>;

  const imgRegex = /!\[([^\]]*)\]\(([^)]+)\)/g;
  const match = imgRegex.exec(content);
  if (!match) return <span style={{ whiteSpace: "pre-wrap" }}>{content}</span>;

  const alt = match[1] || "Hình ảnh";
  const url = match[2];
  const fullUrl = url.startsWith("http") ? url : `http://localhost:4000${url}`;
  const textWithoutImg = content.replace(imgRegex, "").trim();

  return (
    <div>
      {textWithoutImg && (
        <span style={{ whiteSpace: "pre-wrap", display: "block", marginBottom: "8px" }}>
          {textWithoutImg}
        </span>
      )}
      <a
        href={fullUrl}
        target="_blank"
        rel="noopener noreferrer"
        title="Bấm để xem ảnh gốc"
        style={{ display: "inline-block" }}
      >
        <img
          src={fullUrl}
          alt={alt}
          style={{
            maxWidth: "180px",
            maxHeight: "130px",
            objectFit: "contain",
            borderRadius: "8px",
            border: "1px solid var(--hairline, #e2e8f0)",
            background: "#ffffff",
            padding: "4px",
            boxShadow: "0 2px 6px rgba(0,0,0,0.06)",
          }}
        />
      </a>
    </div>
  );
}
