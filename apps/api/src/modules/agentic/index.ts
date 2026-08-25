// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

export { createAgenticModule, type AgenticModuleDependencies } from "./agentic.module";
export type { WorkflowGateway } from "./application/workflows/interfaces/workflow-gateway";
export type { WorkflowRunService } from "./application/services/interfaces/workflow-run.service";
export type {
  ModelRunService,
  ModelRunReservationReceipt,
  ModelRunStateReceipt,
} from "./application/services/interfaces/model-run.service";
export type {
  DepartmentToolAdapter,
  DepartmentToolAdapterRegistry,
  DepartmentToolExecutionContext,
} from "./application/services/interfaces/department-tool-adapter";
export type {
  DepartmentToolSchemaDigests,
  DepartmentToolSchemaRegistry,
} from "./application/services/interfaces/department-tool-schema-registry";
export {
  ToolSharingService,
  type ExecutiveToolSummary,
} from "./application/services/implementations/tool-sharing.service";
export {
  DEPARTMENT_TOOL_CATALOG,
  findDepartmentToolDescriptor,
} from "./application/tools/department-tool-catalog";
export type {
  DepartmentAgentKind,
  DepartmentToolDescriptor,
  DepartmentToolFreshness,
  DepartmentToolInvocationRequest,
  DepartmentToolName,
  DepartmentToolResult,
  DepartmentToolScope,
  DepartmentToolWindow,
  ToolClassification,
  ToolShareability,
} from "./application/tools/department-tool-contracts";
export { ZodDepartmentToolSchemaRegistry } from "./infrastructure/tools/zod-department-tool-schema.registry";
export { createFixedDepartmentToolAdapterRegistry } from "./infrastructure/tools/fixed-department-tool-adapter.registry";
export type { AgentKind, AgentProfile } from "./domain/entities/agent-profile";
export type { WorkflowRun, WorkflowRunState } from "./domain/entities/workflow-run";
