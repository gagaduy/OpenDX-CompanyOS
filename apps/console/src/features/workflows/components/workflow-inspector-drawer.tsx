// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { useState, useEffect, useRef } from "react";
import {
  X,
  ShieldCheck,
  Mail,
  Bot,
  ShieldAlert,
  Sparkles,
  CheckCircle2,
  GitBranch,
  Sliders,
  Save,
  Trash2,
} from "lucide-react";
import type { BusinessWorkflowNode } from "../types";

export interface CompanyStaffRole {
  readonly id: string;
  readonly label: string;
  readonly department: string;
  readonly email: string;
  readonly note: string;
}

export const COMPANY_STAFF_ROLES: readonly CompanyStaffRole[] = [
  {
    id: "marketing_lead",
    label: "Trưởng phòng Marketing (Dương Văn Duy)",
    department: "Phòng Marketing & Truyền thông",
    email: "duongvanduy799@gmail.com",
    note: "Tài khoản thực tế sẵn sàng nhận email",
  },
  {
    id: "ceo",
    label: "Giám đốc Điều hành (CEO / Administrator)",
    department: "Ban Giám Đốc",
    email: "admin@novacommerce.example",
    note: "Toàn quyền điều hành & duyệt ngoại lệ",
  },
  {
    id: "support_lead",
    label: "Trưởng phòng CSKH (Customer Support Lead)",
    department: "Phòng Chăm sóc Khách hàng",
    email: "support@novacommerce.example",
    note: "Phụ trách bồi thường & giải quyết khiếu nại",
  },
  {
    id: "operations_lead",
    label: "Quản lý Vận hành & Kho Vận",
    department: "Phòng Kho Vận & Chuỗi Cung Ứng",
    email: "operations@novacommerce.example",
    note: "Quản lý tồn kho & lệnh đặt hàng PO",
  },
  {
    id: "finance_lead",
    label: "Giám đốc Tài chính (CFO / Finance)",
    department: "Phòng Tài chính & Kế toán",
    email: "finance@novacommerce.example",
    note: "Kiểm soát ngân sách & chi phí",
  },
] as const;

interface WorkflowInspectorDrawerProps {
  readonly node: BusinessWorkflowNode | null;
  readonly onClose: () => void;
  readonly onApprove?: () => void;
  readonly onReject?: () => void;
  readonly onUpdateNode?: (updatedNode: BusinessWorkflowNode) => void;
  readonly onDeleteNode?: (nodeId: string) => void;
}

export function WorkflowInspectorDrawer({
  node,
  onClose,
  onApprove,
  onReject,
  onUpdateNode,
  onDeleteNode,
}: WorkflowInspectorDrawerProps) {
  const [activeTab, setActiveTab] = useState<"overview" | "config">("overview");
  const [editThreshold, setEditThreshold] = useState<string>("");
  const [editTone, setEditTone] = useState<string>("Đồng cảm & Thấu đáo");
  const [recipientMode, setRecipientMode] = useState<"role" | "custom">("role");
  const [selectedRole, setSelectedRole] = useState<string>("marketing_lead");
  const [customEmail, setCustomEmail] = useState<string>("duongvanduy799@gmail.com");
  const [emailSubject, setEmailSubject] = useState<string>("[Thông Báo Nội Bộ] Nhiệm vụ quy trình đã hoàn tất thành công");
  const [emailPriority, setEmailPriority] = useState<string>("Quan trọng");
  const [savedSuccess, setSavedSuccess] = useState<boolean>(false);
  const previousNodeIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (node) {
      if (previousNodeIdRef.current !== node.id) {
        previousNodeIdRef.current = node.id;
        const thresholdParam = node.details.parameters.find(
          (p) => p.label.includes("Hạn mức") || p.label.includes("trần")
        );
        setEditThreshold(thresholdParam?.value ?? "200.000 đ");

        // Internal email notification parameters
        const modeParam = node.details.parameters.find((p) => p.label.includes("Chế độ"));
        setRecipientMode(modeParam?.value?.includes("cụ thể") ? "custom" : "role");

        const roleParam = node.details.parameters.find((p) => p.label.includes("Chức vụ"));
        const matchedRole = COMPANY_STAFF_ROLES.find(
          (r) => r.label.includes(roleParam?.value ?? "") || r.id === roleParam?.value
        );
        setSelectedRole(matchedRole?.id ?? "marketing_lead");

        const emailParam = node.details.parameters.find((p) => p.label.includes("Email"));
        setCustomEmail(emailParam?.value ?? "duongvanduy799@gmail.com");

        const subjectParam = node.details.parameters.find((p) => p.label.includes("Tiêu đề"));
        setEmailSubject(subjectParam?.value ?? "[Thông Báo Nội Bộ] Nhiệm vụ quy trình đã hoàn tất thành công");

        const priorityParam = node.details.parameters.find((p) => p.label.includes("ưu tiên"));
        setEmailPriority(priorityParam?.value ?? "Quan trọng");

        setSavedSuccess(false);
        setActiveTab("overview");
      }
    } else {
      previousNodeIdRef.current = null;
    }
  }, [node]);

  if (!node) return null;

  const getNodeIcon = () => {
    switch (node.type) {
      case "event":
        return <Mail size={22} className="drawerIconSvg eventIcon" aria-hidden="true" />;
      case "ai_analysis":
        return <Bot size={22} className="drawerIconSvg aiIcon" aria-hidden="true" />;
      case "decision_router":
        return <GitBranch size={22} className="drawerIconSvg routerIcon" aria-hidden="true" />;
      case "approval_gate":
        return <ShieldAlert size={22} className="drawerIconSvg approvalIcon" aria-hidden="true" />;
      case "action":
        return <Sparkles size={22} className="drawerIconSvg actionIcon" aria-hidden="true" />;
    }
  };

  const isInternalEmailNode = Boolean(
    node.id.includes("email") ||
      node.title.toLowerCase().includes("email") ||
      node.badge.toLowerCase().includes("thông báo") ||
      node.details.parameters.some((p) => p.label.includes("Email") || p.label.includes("người nhận"))
  );

  const handleSaveConfig = (e: React.FormEvent) => {
    e.preventDefault();
    if (!onUpdateNode) return;

    let updatedParams = node.details.parameters;
    let targetHighlights = node.keyHighlights;
    let targetSummary = node.summary;

    if (isInternalEmailNode) {
      const activeRole =
        COMPANY_STAFF_ROLES.find((r) => r.id === selectedRole) ?? COMPANY_STAFF_ROLES[0];
      const activeEmail = recipientMode === "role" ? activeRole.email : customEmail;
      const recipientName =
        recipientMode === "role" ? activeRole.label : `Hộp thư: ${customEmail}`;

      updatedParams = [
        {
          label: "Chế độ người nhận",
          value: recipientMode === "role" ? "Theo chức vụ trong công ty" : "Địa chỉ Gmail cụ thể",
        },
        {
          label: "Chức vụ người nhận",
          value: recipientMode === "role" ? activeRole.label : "Không áp dụng (Gmail chỉ định)",
        },
        {
          label: "Email nhận thông báo",
          value: activeEmail,
        },
        {
          label: "Tiêu đề email",
          value: emailSubject,
        },
        {
          label: "Mức độ ưu tiên",
          value: emailPriority,
        },
      ];

      targetHighlights = [
        `Gửi tới: ${recipientName} (${activeEmail})`,
        `Tiêu đề: ${emailSubject}`,
        `Ưu tiên: ${emailPriority}`,
      ];

      targetSummary = `Tự động phát email thông báo nội bộ tới ${recipientName} (${activeEmail}) ngay khi nhận được tín hiệu hoàn tất từ bước trước.`;
    } else {
      updatedParams = node.details.parameters.map((p) => {
        if (p.label.includes("Hạn mức") || p.label.includes("trần")) {
          return { ...p, value: editThreshold };
        }
        return p;
      });
    }

    const updatedBranches = node.branches?.map((b) => {
      if (b.variant === "auto") {
        return {
          ...b,
          label: `Tự động ≤ ${editThreshold}`,
          conditionText: `Bồi thường ≤ ${editThreshold} & Khách thông thường`,
        };
      }
      if (b.variant === "approval") {
        return {
          ...b,
          label: `Cần Sếp duyệt > ${editThreshold}`,
          conditionText: `Bồi thường > ${editThreshold} hoặc Khách VIP`,
        };
      }
      return b;
    });

    const updatedNode: BusinessWorkflowNode = {
      ...node,
      branches: updatedBranches,
      details: {
        ...node.details,
        parameters: updatedParams,
      },
      keyHighlights: isInternalEmailNode
        ? targetHighlights
        : node.type === "decision_router"
          ? [
              `Luật 1: Bồi thường ≤ ${editThreshold} ➔ Tự động xử lý ngay`,
              `Luật 2: Bồi thường > ${editThreshold} hoặc VIP ➔ Chờ Sếp duyệt`,
            ]
          : node.keyHighlights,
      summary: isInternalEmailNode ? targetSummary : node.summary,
    };

    onUpdateNode(updatedNode);
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 2000);
  };

  const stepDisplay = node.stepLabel ? `BƯỚC ${node.stepLabel}` : `BƯỚC ${node.stepNumber}`;

  return (
    <>
      <div className="inspectorOverlay" onClick={onClose} aria-hidden="true" />
      <aside className="inspectorDrawer" role="dialog" aria-modal="true" aria-label="Chi tiết thẻ nghiệp vụ">
        <header className="inspectorHeader">
          <div className="inspectorHeaderLeft">
            <div className={`drawerIconBox ${node.type}`}>
              {getNodeIcon()}
            </div>
            <div className="inspectorTitleRow">
              <span className="drawerStepTag">{stepDisplay} • {node.badge}</span>
              <h2 className="inspectorTitle">{node.title}</h2>
              <span className="inspectorSubtitle">{node.actor}</span>
            </div>
          </div>
          <button
            type="button"
            className="inspectorCloseButton"
            onClick={onClose}
            aria-label="Đóng bảng chi tiết"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </header>

        {/* Tab switcher: Overview vs Configuration */}
        <div className="drawerTabs" role="tablist">
          <button
            type="button"
            className={`drawerTab ${activeTab === "overview" ? "active" : ""}`}
            onClick={() => setActiveTab("overview")}
            role="tab"
          >
            Tổng Quan Nghiệp Vụ
          </button>
          <button
            type="button"
            className={`drawerTab ${activeTab === "config" ? "active" : ""}`}
            onClick={() => setActiveTab("config")}
            role="tab"
          >
            <Sliders size={13} aria-hidden="true" /> Cấu Hình Tham Số & Luật
          </button>
        </div>

        <div className="inspectorContent">
          {activeTab === "overview" ? (
            <>
              {/* Section 1: Summary */}
              <section className="inspectorSection">
                <h4 className="inspectorSectionHeading">Bản Tin Nghiệp Vụ</h4>
                <div className="inspectorDescriptionCard">
                  <p className="inspectorDescriptionText">{node.summary || node.details.description}</p>
                </div>
              </section>

              {/* Section 2: Decision Routing Rules (If Decision Router) */}
              {node.type === "decision_router" && node.branches && (
                <section className="inspectorSection">
                  <h4 className="inspectorSectionHeading">Luật Phân Luồng</h4>
                  <div className="drawerBranchCards">
                    {node.branches.map((branch) => (
                      <div key={branch.id} className={`drawerBranchCard ${branch.variant}`}>
                        <div className="drawerBranchHeader">
                          <span className="drawerBranchBadge">
                            {branch.variant === "auto" ? "TỰ ĐỘNG" : "CẦN DUYỆT"}
                          </span>
                          <strong className="drawerBranchLabel">{branch.label}</strong>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* Section 3: Parameters Table */}
              <section className="inspectorSection">
                <h4 className="inspectorSectionHeading">Dữ Liệu & Tham Số Chi Tiết</h4>
                <div className="inspectorTableContainer">
                  <table className="inspectorParamsTable">
                    <tbody>
                      {node.details.parameters.map((param) => (
                        <tr key={param.label}>
                          <td className="paramLabel">{param.label}</td>
                          <td className="paramValue">{param.value}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>

              {/* Section 4: Approval Action (If Approval Gate) */}
              {node.type === "approval_gate" && node.status === "waiting_approval" && (
                <section className="inspectorSection">
                  <h4 className="inspectorSectionHeading">Cổng Phê Duyệt An Toàn</h4>
                  <div className="drawerActionButtons">
                    <button
                      type="button"
                      className="drawerBtnApprove"
                      onClick={() => {
                        onApprove?.();
                        onClose();
                      }}
                      aria-label="Đồng ý duyệt phương án"
                    >
                      <CheckCircle2 size={14} aria-hidden="true" />
                      Đồng Ý Duyệt Phương Án
                    </button>
                    <button
                      type="button"
                      className="drawerBtnReject"
                      onClick={() => {
                        onReject?.();
                        onClose();
                      }}
                      aria-label="Từ chối phương án"
                    >
                      Từ Chối
                    </button>
                  </div>
                </section>
              )}

              {/* Section 5: Audit & Evidence */}
              {node.details.evidence && (
                <section className="inspectorSection">
                  <h4 className="inspectorSectionHeading">Bằng Chứng An Toàn & Kiểm Toán</h4>
                  <div className="inspectorEvidenceNote">
                    <ShieldCheck size={14} className="evidenceIcon" aria-hidden="true" />
                    <span>{node.details.evidence}</span>
                  </div>
                </section>
              )}
            </>
          ) : (
            /* Tab: Configuration & Rule Customization */
            <form className="drawerConfigForm" onSubmit={handleSaveConfig}>
              <div className="configFormGroup">
                <label className="configLabel">Khối nghiệp vụ chuẩn hóa</label>
                <div className="configLockedCard">
                  <div className="configLockedTop">
                    <span className="configLockedTitle">{node.title}</span>
                    <span className="configLockedBadge">🔒 Khối Chuẩn Hóa</span>
                  </div>
                  <div className="configLockedActor">{node.actor}</div>
                </div>
              </div>

              {node.type === "decision_router" && (
                <div className="configFormGroup">
                  <label htmlFor="cfg-threshold" className="configLabel">
                    Hạn mức bồi thường tự duyệt tối đa (Trần tự động)
                  </label>
                  <input
                    id="cfg-threshold"
                    type="text"
                    className="configInput"
                    value={editThreshold}
                    onChange={(e) => setEditThreshold(e.target.value)}
                    placeholder="Ví dụ: 200.000 đ hoặc 500.000 đ"
                    required
                  />
                </div>
              )}

              {node.type === "ai_analysis" && (
                <div className="configFormGroup">
                  <label htmlFor="cfg-tone" className="configLabel">Văn phong phản hồi của AI</label>
                  <select
                    id="cfg-tone"
                    className="configSelect"
                    value={editTone}
                    onChange={(e) => setEditTone(e.target.value)}
                  >
                    <option value="Đồng cảm & Thấu đáo">Đồng cảm & Thấu đáo (CSKH)</option>
                    <option value="Trang trọng & Chuẩn mực">Trang trọng & Chuẩn mực</option>
                    <option value="Năng động & Hấp dẫn">Năng động & Hấp dẫn (MKT)</option>
                    <option value="Ngắn gọn & Dứt khoát">Ngắn gọn & Dứt khoát (Kho vận)</option>
                  </select>
                </div>
              )}

              {isInternalEmailNode && (
                <>
                  <div className="configFormGroup">
                    <label className="configLabel">Chế độ người nhận thông báo</label>
                    <div className="configRadioCards">
                      <label className={`configRadioCard ${recipientMode === "role" ? "active" : ""}`}>
                        <input
                          type="radio"
                          name="recipientMode"
                          value="role"
                          checked={recipientMode === "role"}
                          onChange={() => setRecipientMode("role")}
                        />
                        <div className="configRadioCardBody">
                          <strong>Theo chức vụ trong công ty</strong>
                          <span>Hệ thống tự tra cứu email của chức vụ</span>
                        </div>
                      </label>
                      <label className={`configRadioCard ${recipientMode === "custom" ? "active" : ""}`}>
                        <input
                          type="radio"
                          name="recipientMode"
                          value="custom"
                          checked={recipientMode === "custom"}
                          onChange={() => setRecipientMode("custom")}
                        />
                        <div className="configRadioCardBody">
                          <strong>Địa chỉ Gmail cụ thể</strong>
                          <span>Nhập trực tiếp email để kiểm tra</span>
                        </div>
                      </label>
                    </div>
                  </div>

                  {recipientMode === "role" ? (
                    <div className="configFormGroup">
                      <label htmlFor="cfg-role" className="configLabel">
                        Chọn chức vụ nhận thông báo
                      </label>
                      <select
                        id="cfg-role"
                        className="configSelect"
                        value={selectedRole}
                        onChange={(e) => setSelectedRole(e.target.value)}
                      >
                        {COMPANY_STAFF_ROLES.map((r) => (
                          <option key={r.id} value={r.id}>
                            {r.label} — [{r.email}]
                          </option>
                        ))}
                      </select>
                      {(() => {
                        const current =
                          COMPANY_STAFF_ROLES.find((r) => r.id === selectedRole) ?? COMPANY_STAFF_ROLES[0];
                        return (
                          <div className="configEmailBadge">
                            <Mail size={13} aria-hidden="true" />
                            <span>
                              Sẽ gửi tới: <strong>{current.email}</strong> ({current.note})
                            </span>
                          </div>
                        );
                      })()}
                    </div>
                  ) : (
                    <div className="configFormGroup">
                      <label htmlFor="cfg-custom-email" className="configLabel">
                        Địa chỉ Gmail nhận thông báo
                      </label>
                      <input
                        id="cfg-custom-email"
                        type="email"
                        className="configInput"
                        value={customEmail}
                        onChange={(e) => setCustomEmail(e.target.value)}
                        placeholder="duongvanduy799@gmail.com"
                        required
                      />
                      <p className="configHelperText">
                        Hệ thống sẽ gửi email thông báo thật qua máy chủ SMTP tới hộp thư này.
                      </p>
                    </div>
                  )}

                  <div className="configFormGroup">
                    <label htmlFor="cfg-subject" className="configLabel">
                      Tiêu đề email thông báo
                    </label>
                    <input
                      id="cfg-subject"
                      type="text"
                      className="configInput"
                      value={emailSubject}
                      onChange={(e) => setEmailSubject(e.target.value)}
                      placeholder="[Thông Báo]..."
                      required
                    />
                  </div>

                  <div className="configFormGroup">
                    <label htmlFor="cfg-priority" className="configLabel">
                      Mức độ ưu tiên
                    </label>
                    <select
                      id="cfg-priority"
                      className="configSelect"
                      value={emailPriority}
                      onChange={(e) => setEmailPriority(e.target.value)}
                    >
                      <option value="Bình thường">Bình thường (Normal)</option>
                      <option value="Quan trọng">Quan trọng (High)</option>
                      <option value="Khẩn cấp">Khẩn cấp (Urgent)</option>
                    </select>
                  </div>
                </>
              )}

              <div className="configActionRow">
                <button type="submit" className="configSaveBtn">
                  <Save size={14} aria-hidden="true" />
                  {savedSuccess ? "Đã Lưu Thành Công!" : "Lưu Vào Bản Nháp"}
                </button>

                {onDeleteNode && (
                  <button
                    type="button"
                    className="configDeleteBtn"
                    onClick={() => {
                      onDeleteNode(node.id);
                      onClose();
                    }}
                    title="Xóa khối này khỏi bàn vẽ"
                  >
                    <Trash2 size={14} aria-hidden="true" /> Xóa Khối
                  </button>
                )}
              </div>
            </form>
          )}
        </div>
      </aside>
    </>
  );
}
