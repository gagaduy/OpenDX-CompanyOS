/**
 * SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
 * SPDX-License-Identifier: Apache-2.0
 */

export type DepartmentType = "marketing" | "merchandising" | "operations" | "support";

export type TaskStatus = "queued" | "running" | "completed" | "failed" | "cancelled";

export interface WaitingResourceInfo {
  agentId: string;
  agentName: string;
  heldByDepartment: DepartmentType;
  taskPromptSnippet: string;
}

export interface DepartmentTask {
  id: string;
  department: DepartmentType;
  prompt: string;
  requiredAgents: string[];
  status: TaskStatus;
  waitingForResource?: WaitingResourceInfo;
  queuedAt: number;
  startedAt?: number;
  completedAt?: number;
  error?: string;
}

export interface ResourceLock {
  agentId: string;
  lockedByTaskId: string;
  lockedByDepartment: DepartmentType;
  lockedAt: number;
  taskPromptSnippet: string;
}

export type DepartmentQueueMap = Record<DepartmentType, DepartmentTask[]>;

export interface DigitalEmployeeInfo {
  id: string;
  name: string;
  department: DepartmentType;
  isCrossDepartmentCollab: boolean;
}

export const DIGITAL_EMPLOYEES: Record<string, DigitalEmployeeInfo> = {
  marketing_copywriter: {
    id: "marketing_copywriter",
    name: "Cây bút Sáng tạo",
    department: "marketing",
    isCrossDepartmentCollab: false,
  },
  marketing_visual: {
    id: "marketing_visual",
    name: "Thiết kế Đồ họa",
    department: "marketing",
    isCrossDepartmentCollab: true,
  },
  marketing_publisher: {
    id: "marketing_publisher",
    name: "Điều phối Đăng bài",
    department: "marketing",
    isCrossDepartmentCollab: false,
  },
  catalog_copywriter: {
    id: "catalog_copywriter",
    name: "Cây bút Sản phẩm",
    department: "merchandising",
    isCrossDepartmentCollab: false,
  },
  pricing_strategist: {
    id: "pricing_strategist",
    name: "Chuyên gia Định giá",
    department: "merchandising",
    isCrossDepartmentCollab: true,
  },
  inventory_specialist: {
    id: "inventory_specialist",
    name: "Kỹ sư Tồn kho",
    department: "operations",
    isCrossDepartmentCollab: true,
  },
  order_coordinator: {
    id: "order_coordinator",
    name: "Điều phối Đơn hàng",
    department: "operations",
    isCrossDepartmentCollab: false,
  },
  support_steward: {
    id: "support_steward",
    name: "Quản gia CSKH",
    department: "support",
    isCrossDepartmentCollab: false,
  },
  crm_specialist: {
    id: "crm_specialist",
    name: "Chuyên viên CRM",
    department: "support",
    isCrossDepartmentCollab: false,
  },
};

export const TASK_AGENT_DEPENDENCIES: Record<string, { primaryDept: DepartmentType; requiredAgents: string[] }> = {
  marketing_default: {
    primaryDept: "marketing",
    requiredAgents: ["marketing_copywriter", "marketing_visual", "marketing_publisher"],
  },
  merchandising_campaign: {
    primaryDept: "merchandising",
    requiredAgents: ["catalog_copywriter", "pricing_strategist", "marketing_visual"],
  },
  merchandising_quick: {
    primaryDept: "merchandising",
    requiredAgents: ["catalog_copywriter", "pricing_strategist"],
  },
  operations_restock: {
    primaryDept: "operations",
    requiredAgents: ["inventory_specialist", "order_coordinator"],
  },
  operations_clearance: {
    primaryDept: "operations",
    requiredAgents: ["inventory_specialist", "pricing_strategist", "marketing_visual"],
  },
  support_default: {
    primaryDept: "support",
    requiredAgents: ["support_steward", "crm_specialist"],
  },
};
