// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { SupportTicketDetailView } from "../types/support.types";

export function TicketTimeline({detail}:{readonly detail:SupportTicketDetailView}){ const entries=[...detail.events.map(e=>({at:e.occurredAt,primary:`${e.fromStatus} → ${e.toStatus}`,meta:`${e.source} · ${e.actorId}`})),...detail.messages.map(m=>({at:m.createdAt,primary:m.body,meta:m.authorId}))].sort((a,b)=>a.at.localeCompare(b.at)); return <section className="detailCard" aria-label="Ticket timeline"><h2>Timeline</h2><ol className="timelineList">{entries.map((entry,index)=><li key={`${entry.at}-${index}`}><time className="technicalText">{new Date(entry.at).toLocaleString("vi-VN")}</time><span>{entry.primary}</span><span className="subtleText technicalText">{entry.meta}</span></li>)}</ol></section>; }
