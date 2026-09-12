// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import React from "react";
import { ArrowRight, Users2 } from "lucide-react";
import { DepartmentCard } from "./department-card";
import type { WorkforceGridProps } from "./types";

export const WorkforceGrid: React.FC<WorkforceGridProps> = ({
  departments,
  onViewDagGraph,
  children,
  containerRef,
}) => {
  return (
    <div className="flex flex-col gap-3">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-bold text-white flex items-center gap-2">
            <Users2 size={16} className="text-[#5e6ad2]" />
            <span>Phân công & Điều phối nhân sự AI theo phòng ban</span>
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            AI CEO đã phân tích và phân bổ công việc. Các phòng ban đang phối hợp thực thi.
          </p>
        </div>

        <button
          type="button"
          onClick={onViewDagGraph}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#5e6ad2] hover:text-white bg-[#5e6ad2]/10 hover:bg-[#5e6ad2]/20 border border-[#5e6ad2]/30 px-3 py-1.5 rounded-lg transition-all"
        >
          <span>Xem sơ đồ quy trình</span>
          <ArrowRight size={13} />
        </button>
      </div>

      {/* 2x2 Grid Container */}
      <div ref={containerRef} className="relative grid grid-cols-1 md:grid-cols-2 gap-4">
        {children}
        {departments.map((dept) => (
          <DepartmentCard key={dept.department} {...dept} />
        ))}
      </div>
    </div>
  );
};
