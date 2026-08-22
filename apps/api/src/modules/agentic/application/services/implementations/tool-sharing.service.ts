// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { DepartmentToolResult } from "../../tools/department-tool-contracts";
import { AgenticApplicationError } from "../agentic-application.error";

export type ExecutiveToolSummary<TSummary> = Readonly<
  Pick<
    DepartmentToolResult<TSummary>,
    | "source"
    | "sourceVersion"
    | "retrievedAt"
    | "window"
    | "freshness"
    | "classification"
    | "provenanceId"
    | "summary"
  >
>;

export class ToolSharingService {
  toExecutiveSummary<TSummary, TEvidence>(
    result: DepartmentToolResult<TSummary, TEvidence>,
  ): ExecutiveToolSummary<TSummary> {
    if (result.shareability !== "executive_summary") {
      throw new AgenticApplicationError(
        "TOOL_SHARING_DENIED",
        "Tool result is restricted to its owning department",
      );
    }

    return {
      source: result.source,
      sourceVersion: result.sourceVersion,
      retrievedAt: result.retrievedAt,
      window: result.window,
      freshness: result.freshness,
      classification: result.classification,
      provenanceId: result.provenanceId,
      summary: result.summary,
    };
  }
}
