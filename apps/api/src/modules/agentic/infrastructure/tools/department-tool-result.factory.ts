// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { AgenticApplicationError } from "../../application/services/agentic-application.error";
import type { DepartmentToolExecutionContext } from "../../application/services/interfaces/department-tool-adapter";
import { findDepartmentToolDescriptor } from "../../application/tools/department-tool-catalog";
import type { DepartmentToolName, DepartmentToolWindow } from "../../application/tools/department-tool-contracts";

export function departmentToolResult(
  name: DepartmentToolName,
  context: DepartmentToolExecutionContext,
  parameters: Readonly<Record<string, unknown>>,
  now: () => string,
  summary: unknown,
  options?: { readonly evidence?: readonly unknown[]; readonly nextCursor?: string },
) {
  const descriptor = findDepartmentToolDescriptor(name, 1);
  if (descriptor === undefined) {
    throw new AgenticApplicationError("TOOL_UNAVAILABLE", "Department tool is unavailable");
  }
  const retrievedAt = now();
  return {
    source: `${descriptor.agentKind}.health`,
    sourceVersion: 1 as const,
    retrievedAt,
    window: window(parameters),
    freshness: { asOf: retrievedAt, maxAgeSeconds: 60 as const, status: "fresh" as const },
    classification: descriptor.classification,
    shareability: descriptor.shareability,
    provenanceId: context.invocationId,
    summary,
    ...(options?.evidence === undefined ? {} : { evidence: options.evidence }),
    ...(options?.nextCursor === undefined ? {} : { nextCursor: options.nextCursor }),
  };
}

export function unavailable(): never {
  throw new AgenticApplicationError("TOOL_UNAVAILABLE", "Department tool is unavailable");
}

function window(parameters: Readonly<Record<string, unknown>>): DepartmentToolWindow | null {
  return typeof parameters.start === "string"
    && typeof parameters.end === "string"
    && parameters.timezone === "Asia/Ho_Chi_Minh"
    ? { start: parameters.start, end: parameters.end, timezone: parameters.timezone }
    : null;
}
