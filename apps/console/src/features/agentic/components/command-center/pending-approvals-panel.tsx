// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import React from "react";
import {
  FileText,
  Eye,
  Edit3,
  Check,
  ArrowRight,
  ShieldAlert,
} from "lucide-react";
import type { PendingApprovalsProps } from "./types";

export const PendingApprovalsPanel: React.FC<PendingApprovalsProps> = ({
  approvals,
  onViewAll,
}) => {
  return (
    <div className="bg-[#0a0b10] border border-white/[0.08] rounded-xl p-4 flex flex-col shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between pb-3 border-b border-white/[0.06] mb-3">
        <div className="flex items-center gap-2">
          <h3 className="text-xs font-bold text-white flex items-center gap-1.5">
            <span>Phê duyệt</span>
          </h3>
          <span className="inline-flex items-center justify-center px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-amber-500/15 text-amber-300 border border-amber-500/30">
            {approvals.length}
          </span>
        </div>

        <button
          type="button"
          onClick={onViewAll}
          className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-400 hover:text-white transition-colors"
        >
          <span>Xem tất cả</span>
          <ArrowRight size={11} />
        </button>
      </div>

      {/* Approvals list */}
      <div className="space-y-3">
        {approvals.length === 0 ? (
          <div className="py-6 text-center text-xs text-slate-500">
            Không có đề xuất nào đang chờ phê duyệt
          </div>
        ) : (
          approvals.map((app) => (
            <div
              key={app.id}
              className="bg-[#11131a] border border-white/[0.06] rounded-lg p-3 hover:border-white/15 transition-all"
            >
              <div className="flex items-start gap-2.5">
                <div className="w-7 h-7 rounded-lg bg-[#5e6ad2]/15 border border-[#5e6ad2]/30 flex items-center justify-center text-[#5e6ad2] shrink-0 mt-0.5">
                  <FileText size={14} />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-1">
                    <h4 className="text-xs font-semibold text-slate-100 truncate">
                      {app.title}
                    </h4>
                    <span className="text-[10px] text-emerald-400 bg-emerald-500/10 px-1.5 py-0.2 rounded font-medium shrink-0">
                      Mới
                    </span>
                  </div>

                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Từ: {app.authorName} • <span className="font-mono">{app.timestamp}</span>
                  </p>

                  {app.riskLevel === "high" && (
                    <div className="inline-flex items-center gap-1 text-[10px] text-rose-400 font-medium mt-1">
                      <ShieldAlert size={11} />
                      <span>Hành động rủi ro cao: Yêu cầu xác nhận con người</span>
                    </div>
                  )}

                  {/* 3 Human-in-the-Loop Action buttons */}
                  <div className="mt-2.5 pt-2 border-t border-white/[0.04] flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={app.onPreview}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-medium bg-white/[0.04] hover:bg-white/[0.08] text-slate-300 transition-colors"
                    >
                      <Eye size={11} />
                      <span>Xem trước</span>
                    </button>

                    <button
                      type="button"
                      onClick={app.onRequestRevision}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-medium bg-white/[0.04] hover:bg-white/[0.08] text-slate-300 transition-colors"
                    >
                      <Edit3 size={11} />
                      <span>Yêu cầu chỉnh sửa</span>
                    </button>

                    <button
                      type="button"
                      onClick={app.onApprove}
                      className="inline-flex items-center gap-1 px-3 py-1 rounded text-[11px] font-semibold bg-[#5e6ad2] hover:bg-[#4d59c0] text-white shadow-sm transition-all ml-auto focus:ring-1 focus:ring-[#5e6ad2]/50"
                    >
                      <Check size={12} />
                      <span>Phê duyệt</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
