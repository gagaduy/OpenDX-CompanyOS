// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { CalendarClock, CheckCircle, Clock, Loader2, UserCheck } from "lucide-react";
import type { FollowupView } from "../types/crm.types";
import "../../customers/styles/customers.css";

export function FollowupPanel({
  followups,
  onClaim,
  pending,
}: {
  readonly followups: readonly FollowupView[];
  readonly onClaim: (followup: FollowupView) => void;
  readonly pending?: string;
}) {
  return (
    <section className="detailCard customer360SectionCard" aria-label="Follow-ups">
      <div className="customer360SectionHeader">
        <h2 className="customer360SectionTitle">
          <CalendarClock size={18} style={{ color: "#f59e0b" }} aria-hidden="true" />
          <span>Follow-ups</span>
        </h2>
        <span style={{ fontSize: "0.78rem", color: "var(--ink-subtle, #8a8f98)" }}>
          {followups.length} nhiệm vụ
        </span>
      </div>

      {followups.length === 0 ? (
        <p style={{ fontSize: "0.85rem", color: "var(--ink-subtle, #8a8f98)", margin: 0, fontStyle: "italic" }}>
          No follow-ups.
        </p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          {followups.map((followup) => {
            const isOpen = followup.status === "open";
            const isClaiming = pending === followup.id;

            return (
              <article
                key={followup.id}
                className={`activityItem customerFollowupItem ${followup.status}`}
              >
                <div className="customerFollowupHeader">
                  <h3 className="customerFollowupDesc">{followup.description}</h3>
                  <span
                    className={`customerOrderStatusChip ${isOpen ? "pending_payment" : "completed"}`}
                  >
                    {isOpen ? "Đang chờ (Open)" : "Đã xong (Completed)"}
                  </span>
                </div>

                <p className="customerFollowupMeta">
                  <Clock size={12} style={{ opacity: 0.7 }} aria-hidden="true" />
                  <span>
                    Due {new Date(followup.dueAt).toLocaleString("vi-VN")} · version {followup.version}
                  </span>
                </p>

                {isOpen && !followup.assigneeId ? (
                  <button
                    className="primaryButton customerClaimBtn"
                    type="button"
                    disabled={isClaiming}
                    onClick={() => onClaim(followup)}
                  >
                    {isClaiming ? (
                      <>
                        <Loader2 size={13} className="animate-spin" aria-hidden="true" />
                        <span>Claiming…</span>
                      </>
                    ) : (
                      <>
                        <UserCheck size={13} aria-hidden="true" />
                        <span>Claim follow-up</span>
                      </>
                    )}
                  </button>
                ) : followup.assigneeId ? (
                  <span style={{ fontSize: "0.75rem", color: "var(--ink-subtle, #8a8f98)", display: "flex", alignItems: "center", gap: "0.3rem" }}>
                    <CheckCircle size={12} style={{ color: "#34d399" }} aria-hidden="true" />
                    <span>Đã phân công nhân viên xử lý</span>
                  </span>
                ) : null}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
