// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import React, { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Gift,
  Mail,
  Send,
  ShieldCheck,
  X,
} from "lucide-react";
import type {
  AiSupportProposalView,
  AiSupportTicketItemView,
} from "../../../support/types/support.types";

const EMAILS_PER_PAGE = 4;

export interface SupportEmailApprovalModalProps {
  readonly isOpen: boolean;
  readonly proposal: AiSupportProposalView | null;
  readonly isSubmitting?: boolean;
  readonly onClose: () => void;
  readonly onApproveSelected: (ticketIds: readonly string[]) => void | Promise<void>;
  readonly onApproveAll: () => void | Promise<void>;
}

export function isTicketRequiringApproval(ticket: AiSupportTicketItemView): boolean {
  if (typeof ticket.requiresApproval === "boolean") {
    return ticket.requiresApproval;
  }
  if (typeof ticket.estimatedCompensationAmount === "number") {
    return ticket.estimatedCompensationAmount > 2_000_000;
  }
  const comp = ticket.suggestedCompensation?.toLowerCase() ?? "";
  if (comp.includes("miễn phí vận chuyển") || comp.includes("freeship") || comp.includes("không áp dụng")) {
    return false;
  }
  if (comp.includes("10%") || comp.includes("15%") || comp.includes("20%")) {
    return true;
  }
  return false;
}

export function formatVnd(amount: number): string {
  return new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND" }).format(amount);
}

export const SupportEmailApprovalModal: React.FC<SupportEmailApprovalModalProps> = ({
  isOpen,
  proposal,
  isSubmitting = false,
  onClose,
  onApproveSelected,
  onApproveAll,
}) => {
  const [selectedTicketIds, setSelectedTicketIds] = useState<ReadonlySet<string>>(new Set());
  const [page, setPage] = useState(1);

  const { autoApprovedTickets, manualReviewTickets } = useMemo(() => {
    if (!proposal) return { autoApprovedTickets: [], manualReviewTickets: [] };
    const auto: AiSupportTicketItemView[] = [];
    const manual: AiSupportTicketItemView[] = [];
    for (const ticket of proposal.tickets) {
      if (isTicketRequiringApproval(ticket)) {
        manual.push(ticket);
      } else {
        auto.push(ticket);
      }
    }
    return { autoApprovedTickets: auto, manualReviewTickets: manual };
  }, [proposal?.tickets]);

  useEffect(() => {
    if (!proposal) return;
    setSelectedTicketIds(
      new Set(
        proposal.status === "applied" ? [] : proposal.tickets.map((ticket) => ticket.ticketId),
      ),
    );
    setPage(1);
  }, [proposal?.id, proposal?.tickets, proposal?.status]);

  const pageCount = Math.max(1, Math.ceil((proposal?.tickets.length ?? 0) / EMAILS_PER_PAGE));
  const pageTickets = useMemo(
    () => proposal?.tickets.slice((page - 1) * EMAILS_PER_PAGE, page * EMAILS_PER_PAGE) ?? [],
    [page, proposal?.tickets],
  );
  const selectedCount = selectedTicketIds.size;
  const isApplied = proposal?.status === "applied";
  const allPageSelected =
    pageTickets.length > 0 && pageTickets.every((ticket) => selectedTicketIds.has(ticket.ticketId));

  if (!isOpen || !proposal) return null;

  const toggleTicket = (ticketId: string) => {
    setSelectedTicketIds((current) => {
      const next = new Set(current);
      if (next.has(ticketId)) next.delete(ticketId);
      else next.add(ticketId);
      return next;
    });
  };

  const toggleCurrentPage = () => {
    setSelectedTicketIds((current) => {
      const next = new Set(current);
      for (const ticket of pageTickets) {
        if (allPageSelected) next.delete(ticket.ticketId);
        else next.add(ticket.ticketId);
      }
      return next;
    });
  };

  return (
    <div
      className="supportEmailModalOverlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="supportEmailModalTitle"
    >
      <div className="supportEmailModal">
        <header className="supportEmailModalHeader">
          <div className="supportEmailModalHeading">
            <span className="supportEmailModalIcon"><Mail size={20} /></span>
            <div>
              <div className="supportEmailModalTitleRow">
                <h2 id="supportEmailModalTitle">Duyệt nội dung email CSKH</h2>
                <span className={`supportEmailPendingBadge ${isApplied ? "is-applied" : ""}`}>
                  {isApplied ? "Đã gửi" : "Chờ phê duyệt"}
                </span>
              </div>
              <p>Chính sách WF-CSKH-RECOVERY: Ngưỡng tự động duyệt 2.000.000 ₫ (Nhánh 4A ≤ 2M, Nhánh 4B &gt; 2M)</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="supportEmailCloseBtn" aria-label="Đóng">
            <X size={18} />
          </button>
        </header>

        <section className="supportEmailSummary" aria-label="Tóm tắt đề xuất CSKH">
          <div>
            <Mail size={15} />
            <span><strong>{proposal.tickets.length}</strong> email đề xuất</span>
          </div>
          <div className="supportEmailStatAuto">
            <CheckCircle2 size={15} />
            <span><strong>{autoApprovedTickets.length}</strong> ca tự động duyệt (Nhánh 4A ≤ 2M)</span>
          </div>
          <div className="supportEmailStatManual">
            <AlertTriangle size={15} />
            <span><strong>{manualReviewTickets.length}</strong> ca cần Sếp duyệt (Nhánh 4B &gt; 2M)</span>
          </div>
          <div>
            <ShieldCheck size={15} />
            <span>{proposal.churnRiskAssessment}</span>
          </div>
        </section>

        <div className="supportEmailToolbar">
          <div>
            <strong>
              {isApplied
                ? `Danh sách email đã gửi (${proposal.tickets.length})`
                : manualReviewTickets.length > 0 && autoApprovedTickets.length > 0
                  ? `Danh sách email đề xuất (${selectedCount}/${proposal.tickets.length} đã chọn: ${manualReviewTickets.length} ca cần duyệt, ${autoApprovedTickets.length} ca tự động duyệt)`
                  : `Danh sách email đề xuất (${selectedCount}/${proposal.tickets.length} đã chọn)`}
            </strong>
            {!isApplied && pageTickets.length > 0 && (
              <button type="button" onClick={toggleCurrentPage} className="supportEmailSelectPageBtn">
                {allPageSelected ? "Bỏ chọn trang này" : "Chọn trang này"}
              </button>
            )}
          </div>
          <div className="supportEmailPagination" aria-label="Phân trang email">
            <span>Trang {page} / {pageCount}</span>
            <button type="button" aria-label="Trang trước" disabled={page === 1} onClick={() => setPage((value) => value - 1)}>
              <ChevronLeft size={15} />
            </button>
            <button type="button" aria-label="Trang sau" disabled={page === pageCount} onClick={() => setPage((value) => value + 1)}>
              <ChevronRight size={15} />
            </button>
          </div>
        </div>

        <div className="supportEmailList">
          {pageTickets.length === 0 ? (
            <div className="supportEmailEmpty">
              <Mail size={26} />
              <strong>Không có email nào đang chờ gửi</strong>
              <span>AI chưa tạo nội dung phản hồi cho ticket trong đề xuất này.</span>
            </div>
          ) : pageTickets.map((ticket) => (
            <EmailApprovalRow
              key={ticket.ticketId}
              ticket={ticket}
              selected={selectedTicketIds.has(ticket.ticketId)}
              readOnly={isApplied}
              requiresApproval={isTicketRequiringApproval(ticket)}
              onToggle={() => toggleTicket(ticket.ticketId)}
            />
          ))}
        </div>

        <footer className="supportEmailModalFooter">
          <div className="supportEmailFooterStatus">
            <ShieldCheck size={15} />
            <span>
              {isApplied
                ? `${proposal.tickets.length} email đã được phê duyệt và gửi.`
                : manualReviewTickets.length > 0
                  ? `${manualReviewTickets.length} ca vượt hạn mức cần bạn phê duyệt (> 2M). ${autoApprovedTickets.length} ca đã được AI tự động duyệt (≤ 2M).`
                  : `Tất cả ${autoApprovedTickets.length} ca đều đã được AI tự động duyệt theo chính sách.`}
            </span>
          </div>
          <div className="supportEmailFooterActions">
            <button type="button" onClick={onClose} className="supportEmailCancelBtn" disabled={isSubmitting}>
              Đóng
            </button>
            {!isApplied && (
              <>
                <button
                  type="button"
                  className="supportEmailSelectedBtn"
                  disabled={isSubmitting || selectedCount === 0}
                  onClick={() => void onApproveSelected(Array.from(selectedTicketIds))}
                >
                  <Check size={15} />
                  Phê duyệt &amp; gửi đã chọn ({selectedCount})
                </button>
                <button
                  type="button"
                  className="supportEmailApproveAllBtn"
                  disabled={isSubmitting || proposal.tickets.length === 0}
                  onClick={() => void onApproveAll()}
                >
                  <Send size={15} />
                  {isSubmitting ? "Đang gửi email..." : "Phê duyệt & gửi tất cả còn lại"}
                </button>
              </>
            )}
          </div>
        </footer>
      </div>
    </div>
  );
};

interface EmailApprovalRowProps {
  readonly ticket: AiSupportTicketItemView;
  readonly selected: boolean;
  readonly readOnly: boolean;
  readonly requiresApproval: boolean;
  readonly onToggle: () => void;
}

const EmailApprovalRow: React.FC<EmailApprovalRowProps> = ({
  ticket,
  selected,
  readOnly,
  requiresApproval,
  onToggle,
}) => {
  const isAuto = !requiresApproval;
  const compAmount = ticket.estimatedCompensationAmount;

  return (
    <article
      className={`supportEmailRow ${selected ? "is-selected" : ""} ${
        isAuto ? "is-auto-approved" : "is-requires-approval"
      }`}
    >
      <label className="supportEmailCheckboxWrap">
        <input
          type="checkbox"
          checked={selected}
          disabled={readOnly}
          onChange={onToggle}
          aria-label={`Chọn email gửi tới ${ticket.customerName}`}
        />
      </label>
      <div className="supportEmailRecipient">
        <span className="supportEmailAvatar">{initials(ticket.customerName)}</span>
        <div>
          <strong>{ticket.customerName}</strong>
          <span>{ticket.customerEmail}</span>
        </div>
      </div>
      <div className="supportEmailContent">
        <div className="supportEmailSubjectRow">
          <strong>{ticket.subject}</strong>
          {isAuto ? (
            <span className="supportEmailPolicyBadge auto">
              <CheckCircle2 size={12} /> Tự động duyệt (Nhánh 4A ≤ 2M)
            </span>
          ) : (
            <span className="supportEmailPolicyBadge review">
              <AlertTriangle size={12} /> Cần Sếp duyệt (Nhánh 4B &gt; 2M)
            </span>
          )}
          <span className={`supportEmailPriority priority-${ticket.priority}`}>
            {priorityLabel(ticket.priority)}
          </span>
          <span className={`supportEmailRisk risk-${ticket.churnRisk}`}>
            Rời bỏ: {riskLabel(ticket.churnRisk)}
          </span>
        </div>
        <p>{ticket.proposedResponse}</p>
        {ticket.suggestedCompensation && (
          <div className={`supportEmailVoucher ${isAuto ? "voucher-auto" : "voucher-review"}`}>
            <Gift size={13} />
            <span>{ticket.suggestedCompensation}</span>
            {compAmount !== undefined && (
              <strong className="supportEmailAmountTag">
                ~{formatVnd(compAmount)} {isAuto ? "(≤ 2M: Đủ chuẩn duyệt)" : "(&gt; 2M: Vượt hạn mức)"}
              </strong>
            )}
          </div>
        )}
      </div>
    </article>
  );
};

function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(-2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("") || "KH";
}

function priorityLabel(priority: AiSupportTicketItemView["priority"]): string {
  return { urgent: "Khẩn cấp", high: "Cao", normal: "Bình thường", low: "Thấp" }[priority];
}

function riskLabel(risk: AiSupportTicketItemView["churnRisk"]): string {
  return { high: "Cao", medium: "Vừa", low: "Thấp" }[risk];
}
