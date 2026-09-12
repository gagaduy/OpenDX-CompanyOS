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
    <div className="ccWorkforceSection">
      {/* Header */}
      <div className="ccWorkforceHeader">
        <div>
          <h2 className="ccWorkforceTitle">
            <Users2 size={16} />
            <span>Phân công & Điều phối nhân sự AI theo phòng ban</span>
          </h2>
          <p className="ccWorkforceSubtitle">
            AI CEO đã phân tích và phân bổ công việc. Các phòng ban đang phối hợp thực thi.
          </p>
        </div>

        <button
          type="button"
          onClick={onViewDagGraph}
          className="ccViewDiagramBtn"
        >
          <span>Xem sơ đồ quy trình</span>
          <ArrowRight size={13} />
        </button>
      </div>

      {/* 2x2 Grid Container */}
      <div ref={containerRef} className="ccDeptGrid" style={{ position: "relative" }}>
        {children}
        {departments.map((dept) => (
          <DepartmentCard key={dept.department} {...dept} />
        ))}
      </div>
    </div>
  );
};
