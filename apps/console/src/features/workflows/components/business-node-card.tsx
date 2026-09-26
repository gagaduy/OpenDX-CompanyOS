// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { CheckCircle2, Clock, AlertTriangle, PlayCircle, Bot, Mail, ShieldAlert, Sparkles } from "lucide-react";
import type { BusinessWorkflowNode } from "../types";

interface BusinessNodeCardProps {
  readonly node: BusinessWorkflowNode;
  readonly isSelected: boolean;
  readonly onSelect: (node: BusinessWorkflowNode) => void;
  readonly onApprove?: () => void;
  readonly onReject?: () => void;
}

export function BusinessNodeCard({
  node,
  isSelected,
  onSelect,
  onApprove,
  onReject,
}: BusinessNodeCardProps) {
  const getNodeIcon = () => {
    switch (node.type) {
      case "event":
        return <Mail size={14} aria-hidden="true" />;
      case "ai_analysis":
        return <Bot size={14} aria-hidden="true" />;
      case "approval_gate":
        return <ShieldAlert size={14} aria-hidden="true" />;
      case "action":
        return <Sparkles size={14} aria-hidden="true" />;
    }
  };

  const getStatusDisplay = () => {
    switch (node.status) {
      case "completed":
        return (
          <span className="cardStatusPill" data-status="completed">
            <CheckCircle2 size={12} aria-hidden="true" /> Đã Xong
          </span>
        );
      case "waiting_approval":
        return (
          <span className="cardStatusPill" data-status="waiting_approval">
            <AlertTriangle size={12} aria-hidden="true" /> Chờ Sếp Duyệt
          </span>
        );
      case "running":
        return (
          <span className="cardStatusPill" data-status="running">
            <PlayCircle size={12} aria-hidden="true" /> Đang Xử Lý
          </span>
        );
      case "idle":
        return (
          <span className="cardStatusPill" data-status="idle">
            <Clock size={12} aria-hidden="true" /> Chờ Đến Lượt
          </span>
        );
      case "rejected":
        return (
          <span className="cardStatusPill" data-status="rejected">
            <AlertTriangle size={12} aria-hidden="true" /> Đã Từ Chối
          </span>
        );
    }
  };

  return (
    <article
      className="businessCard"
      data-type={node.type}
      data-selected={isSelected}
      onClick={() => onSelect(node)}
      tabIndex={0}
      role="button"
      aria-label={`${node.title} - ${node.badge}`}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect(node);
        }
      }}
    >
      <header className="cardHeader">
        <span className="cardStepBadge" data-type={node.type}>
          {getNodeIcon()}
          Bước {node.stepNumber}: {node.badge}
        </span>
        {getStatusDisplay()}
      </header>

      <h3 className="cardTitle">{node.title}</h3>
      <div className="cardActor">{node.actor}</div>
      <p className="cardSummary">{node.summary}</p>

      <ul className="cardHighlightsList" aria-label="Điểm nhấn nghiệp vụ">
        {node.keyHighlights.map((highlight) => (
          <li key={highlight} className="cardHighlightItem" data-type={node.type}>
            <span>{highlight}</span>
          </li>
        ))}
      </ul>

      {node.type === "approval_gate" && node.status === "waiting_approval" && (
        <div className="cardActionsArea" onClick={(e) => e.stopPropagation()}>
          <button
            type="button"
            className="cardActionPrimary"
            onClick={onApprove}
            aria-label="Đồng ý duyệt phương án"
          >
            <CheckCircle2 size={14} aria-hidden="true" />
            Đồng Ý Duyệt Phương Án
          </button>
          <button
            type="button"
            className="cardActionDanger"
            onClick={onReject}
            aria-label="Từ chối phương án"
          >
            Từ Chối & Yêu Cầu Sửa
          </button>
        </div>
      )}
    </article>
  );
}
