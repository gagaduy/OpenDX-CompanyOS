// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { CrmHealthReader, CrmHealthWindow } from "../../../crm";
import type { DepartmentToolAdapter, DepartmentToolExecutionContext } from "../../application/services/interfaces/department-tool-adapter";
import { departmentToolResult, unavailable } from "./department-tool-result.factory";

export class CrmDepartmentToolAdapter implements DepartmentToolAdapter {
  constructor(private readonly reader: CrmHealthReader, private readonly now: () => string) {}
  async execute(context: DepartmentToolExecutionContext, parameters: Readonly<Record<string, unknown>>) {
    if (context.agentKind !== "crm") return unavailable();
    const name = context.toolName;
    if (name === "crm.segment_summary") return departmentToolResult(name, context, parameters, this.now,
      await this.reader.segmentSummary(parameters as unknown as CrmHealthWindow));
    if (name === "crm.followup_opportunities") return departmentToolResult(name, context, parameters, this.now,
      await this.reader.followupOpportunities(parameters as unknown as CrmHealthWindow));
    return unavailable();
  }
}
