// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import {
  CheckCircle2,
  Clock,
  AlertTriangle,
  PlayCircle,
  Bot,
  Mail,
  ShieldCheck,
  Sparkles,
  ShoppingBag,
  Package,
} from "lucide-react";
import type { BusinessWorkflowNode } from "../types";

export type BusinessNodeData = {
  node: BusinessWorkflowNode;
  onSelect: (node: BusinessWorkflowNode) => void;
  onApprove?: () => void;
  onReject?: () => void;
  isUnconnected?: boolean;
};

export type BusinessCustomNode = Node<BusinessNodeData, "businessNode">;

// Authentic Instagram Camera Gradient Icon
function InstagramLogo({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <defs>
        <radialGradient id="ig-grad-node" cx="20%" cy="110%" r="130%" fx="20%" fy="110%">
          <stop offset="0%" stopColor="#ffd600" />
          <stop offset="25%" stopColor="#ff0100" />
          <stop offset="50%" stopColor="#d800b9" />
          <stop offset="100%" stopColor="#7000ff" />
        </radialGradient>
      </defs>
      <rect x="2" y="2" width="20" height="20" rx="5.5" fill="url(#ig-grad-node)" />
      <rect x="6.2" y="6.2" width="11.6" height="11.6" rx="3.2" stroke="#ffffff" strokeWidth="1.8" fill="none" />
      <circle cx="12" cy="12" r="3" stroke="#ffffff" strokeWidth="1.8" fill="none" />
      <circle cx="15.5" cy="8.5" r="0.9" fill="#ffffff" />
    </svg>
  );
}

// Authentic n8n Condition / Split Branching Arrows Icon
function N8nSplitBranchIcon({ size = 30 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="#4f46e5"
      strokeWidth="2.3"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M4 12h5l4-5.5h7" />
      <path d="M9 12l4 5.5h7" />
      <polyline points="17 4.5 20 6.5 17 8.5" />
      <polyline points="17 15.5 20 17.5 17 19.5" />
    </svg>
  );
}

export function BusinessNode({ data, selected }: NodeProps<BusinessCustomNode>) {
  const { node, onSelect, onApprove, onReject, isUnconnected } = data;

  const getNodeIcon = () => {
    // Specific icon matching for marketing & social publishing
    if (node.id === "mkt-4-publish" || node.title.includes("Facebook & Instagram")) {
      return <InstagramLogo size={34} />;
    }

    if (node.id === "mkt-1-event" || node.title.includes("Sản Phẩm Mới")) {
      return <ShoppingBag size={28} className="n8nIconSvg eventIcon" aria-hidden="true" />;
    }

    if (node.department === "inventory" && node.type === "event") {
      return <Package size={28} className="n8nIconSvg eventIcon" aria-hidden="true" />;
    }

    switch (node.type) {
      case "event":
        return <Mail size={28} className="n8nIconSvg eventIcon" aria-hidden="true" />;
      case "ai_analysis":
        return <Bot size={28} className="n8nIconSvg aiIcon" aria-hidden="true" />;
      case "decision_router":
        return <N8nSplitBranchIcon size={30} />;
      case "approval_gate":
        return <ShieldCheck size={28} className="n8nIconSvg approvalIcon" aria-hidden="true" />;
      case "action":
        return <Sparkles size={28} className="n8nIconSvg actionIcon" aria-hidden="true" />;
    }
  };

  const getStatusIndicator = () => {
    switch (node.status) {
      case "completed":
        return (
          <span className="n8nStatusBadge completed" title="Đã hoàn tất">
            <CheckCircle2 size={12} aria-hidden="true" />
            <span>Xong</span>
          </span>
        );
      case "waiting_approval":
        return (
          <span className="n8nStatusBadge waiting" title="Đang chờ Sếp duyệt">
            <span className="pulsingDot" aria-hidden="true" />
            <span>Chờ duyệt</span>
          </span>
        );
      case "running":
        return (
          <span className="n8nStatusBadge running" title="Đang xử lý">
            <PlayCircle size={12} aria-hidden="true" />
            <span>Đang chạy</span>
          </span>
        );
      case "idle":
        return (
          <span className="n8nStatusBadge idle" title="Chờ lượt">
            <Clock size={11} aria-hidden="true" />
            <span>Chờ</span>
          </span>
        );
      case "rejected":
        return (
          <span className="n8nStatusBadge rejected" title="Đã từ chối">
            <AlertTriangle size={11} aria-hidden="true" />
            <span>Từ chối</span>
          </span>
        );
    }
  };

  const stepDisplay = node.stepLabel ? `BƯỚC ${node.stepLabel}` : `BƯỚC ${node.stepNumber}`;

  return (
    <div
      className={`n8nNodeCard ${node.type} ${selected ? "selected" : ""} ${isUnconnected ? "unconnected" : ""}`}
      onClick={() => onSelect(node)}
      tabIndex={0}
      role="button"
      aria-label={`${node.title} - ${stepDisplay}`}
    >
      {/* n8n Action Box Container (Upper Square Card) */}
      <div className={`n8nNodeBox ${node.type} ${selected ? "selected" : ""} ${isUnconnected ? "unconnectedBox" : ""}`}>
        {/* Input Handle (Left) - for all except step 1 */}
        {node.stepNumber > 1 && (
          <Handle
            type="target"
            position={Position.Left}
            className={`n8nHandle inputHandle ${isUnconnected ? "unconnectedHandle" : ""}`}
            isConnectable={true}
            title={
              isUnconnected
                ? "Cổng nhận tín hiệu (Chưa kết nối) - Hãy kéo dây từ cổng tròn bên phải của khối trước vào đây"
                : "Cổng nhận tín hiệu"
            }
          />
        )}

        {/* Unconnected Warning Indicator */}
        {isUnconnected && (
          <div
            className="n8nUnconnectedBadge"
            title="Khối này chưa có dây nối đầu vào. Hãy kéo dây từ khối trước vào đây để kết nối luồng."
          >
            Chưa nối dây 🔌
          </div>
        )}

        {/* Trigger indicator badge (n8n signature lightning bolt) */}
        {node.type === "event" && (
          <div className="n8nTriggerIndicator" title="Sự kiện kích hoạt quy trình">
            ⚡
          </div>
        )}

        {/* Centered Large Icon */}
        <div className={`n8nBoxIconWrapper ${node.type}`}>
          {getNodeIcon()}
        </div>

        {/* Execution Status Badge on Box Corner */}
        {getStatusIndicator()}

        {/* Output Handles */}
        {node.type === "decision_router" ? (
          <>
            {/* Top handle: Auto branch */}
            <Handle
              id="auto"
              type="source"
              position={Position.Right}
              className="n8nHandle outputHandle handleAuto"
              style={{ top: "30%" }}
              isConnectable={true}
            />
            <span className="n8nHandleLabel autoLabel" style={{ top: "30%" }}>
              {node.branches?.[0]?.label ?? "Tự động"}
            </span>

            {/* Bottom handle: Approval branch */}
            <Handle
              id="approval"
              type="source"
              position={Position.Right}
              className="n8nHandle outputHandle handleApproval"
              style={{ top: "70%" }}
              isConnectable={true}
            />
            <span className="n8nHandleLabel approvalLabel" style={{ top: "70%" }}>
              {node.branches?.[1]?.label ?? "Cần Sếp duyệt"}
            </span>
          </>
        ) : (
          /* Output Handle - enabled for all nodes including approval_gate and action */
          <Handle
            type="source"
            position={Position.Right}
            className="n8nHandle outputHandle"
            isConnectable={true}
            title="Cổng phát tín hiệu - Hãy kéo dây từ đây đến khối tiếp theo để kết nối luồng"
          />
        )}
      </div>

      {/* n8n Text Container (Positioned Directly Under the Box) */}
      <div className="n8nNodeLabelContainer">
        <span className={`n8nCategoryTag ${node.type}`}>
          {stepDisplay} • {node.badge}
        </span>

        <h4 className="n8nNodeTitle" title={node.title}>
          {node.title}
        </h4>


        {/* Quick Approve Action directly below label if waiting */}
        {node.type === "approval_gate" && node.status === "waiting_approval" && (
          <div className="n8nCardQuickAction" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              className="n8nApproveBtn"
              onClick={onApprove}
              aria-label="Đồng ý duyệt phương án"
            >
              <CheckCircle2 size={12} aria-hidden="true" />
              Đồng Ý Duyệt
            </button>
            <button
              type="button"
              className="n8nRejectBtn"
              onClick={onReject}
              aria-label="Từ chối phương án"
            >
              Từ Chối
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

