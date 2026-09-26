// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { LucideIcon } from "lucide-react";
import { Boxes, Headphones, Megaphone, Truck } from "lucide-react";
import type { AgenticExecutionBranch } from "../types/agentic.types";

type DepartmentKey = "marketing" | "catalog" | "operations" | "support";

interface DepartmentDefinition {
  readonly key: DepartmentKey;
  readonly title: string;
  readonly subtitle: string;
  readonly icon: LucideIcon;
  readonly owners: readonly string[];
}

const departments: readonly DepartmentDefinition[] = [
  { key: "marketing", title: "Tiếp thị & Sáng tạo", subtitle: "Nội dung và tăng trưởng", icon: Megaphone, owners: ["marketing", "creative", "social"] },
  { key: "catalog", title: "Danh mục & Định giá", subtitle: "Sản phẩm và thương mại", icon: Boxes, owners: ["catalog", "merchandising", "pricing"] },
  { key: "operations", title: "Vận hành & Kho vận", subtitle: "Kho, đơn hàng và tài chính", icon: Truck, owners: ["inventory", "order", "finance", "operations", "warehouse"] },
  { key: "support", title: "CSKH & Trải nghiệm", subtitle: "CRM và hỗ trợ khách hàng", icon: Headphones, owners: ["crm", "support", "customer"] },
];

export function getDepartmentProgress(branches: readonly AgenticExecutionBranch[]) {
  const views = departments.map((department) => {
    const departmentBranches = branches.filter((branch) =>
      department.owners.includes(branch.owner.toLowerCase()),
    );
    return {
      ...department,
      branches: departmentBranches,
      completed:
        departmentBranches.length > 0 &&
        departmentBranches.every((branch) => branch.state === "completed"),
    };
  });

  return {
    views,
    participating: views.filter((department) => department.branches.length > 0).length,
    completed: views.filter((department) => department.completed).length,
  };
}

export function DependencyPanel({ branches }: { readonly branches: readonly AgenticExecutionBranch[] }) {
  const names = new Map(branches.map((branch) => [branch.id, title(branch.owner)]));
  const progress = getDepartmentProgress(branches);

  return (
    <section className="agenticTaskPanel agenticDepartmentPanel">
      <header className="agenticPanelHeader">
        <div>
          <span className="agenticDetailEyebrow">Điều phối liên phòng ban</span>
          <h2>Phối hợp 4 phòng ban</h2>
        </div>
        <span className="agenticPanelCount">{progress.completed}/4 hoàn tất</span>
      </header>
      <ol className="agenticDependencies" aria-label="Department dependencies">
        {progress.views.map((department) => {
          const Icon = department.icon;
          const state = department.completed
            ? "completed"
            : department.branches.length > 0
              ? "running"
              : "idle";
          return (
            <li key={department.key} className={`agenticDepartmentCard state-${state}`}>
              <div className="agenticDepartmentHeader">
                <span className="agenticDepartmentIcon"><Icon size={17} /></span>
                <div>
                  <strong>{department.title}</strong>
                  <small>{department.subtitle}</small>
                </div>
                <span className="agenticDepartmentState">
                  {state === "completed" ? "Hoàn tất" : state === "running" ? "Đang thực hiện" : "Chưa tham gia"}
                </span>
              </div>
              {department.branches.length === 0 ? (
                <p className="agenticDepartmentEmpty">Chưa có nhánh công việc được phân công.</p>
              ) : (
                <div className="agenticBranchList">
                  {department.branches.map((branch) => (
                    <article key={branch.id} className="agenticBranchItem">
                      <div><strong>{title(branch.owner)}</strong><span>{branchStateLabel(branch.state)}</span></div>
                      <p>{branch.dependencies.length === 0 ? "Starts independently" : branch.dependencies.map((id) => `${names.get(id) ?? id} → ${title(branch.owner)}`).join(", ")}</p>
                      <small>{branch.toolNames.join(", ")} · {branch.dataClasses.join(", ")}</small>
                    </article>
                  ))}
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
function title(value: string): string { return `${value.charAt(0).toUpperCase()}${value.slice(1)}`; }
function label(value: string): string { return value.split("_").map(title).join(" "); }
function branchStateLabel(value: string): string {
  if (value === "completed") return "Hoàn tất";
  if (["failed", "canceled"].includes(value)) return "Cần xử lý";
  return label(value);
}
