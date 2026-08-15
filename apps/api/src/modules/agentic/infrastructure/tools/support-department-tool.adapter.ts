// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { SupportHealthReader, SupportHealthWindow, SupportOrderReferenceReader, SupportSlaRiskInput } from "../../../support";
import type { DepartmentToolAdapter, DepartmentToolExecutionContext } from "../../application/services/interfaces/department-tool-adapter";
import { departmentToolResult, unavailable } from "./department-tool-result.factory";

export class SupportDepartmentToolAdapter implements DepartmentToolAdapter {
  constructor(
    private readonly reader: SupportHealthReader,
    private readonly orderReferences: SupportOrderReferenceReader,
    private readonly now: () => string,
  ) {}
  async execute(context: DepartmentToolExecutionContext, parameters: Readonly<Record<string, unknown>>) {
    if (context.agentKind !== "support") return unavailable();
    const name = context.toolName;
    if (name === "support.sla_risk") {
      const result = await this.reader.slaRisk(parameters as unknown as SupportSlaRiskInput);
      return departmentToolResult(name, context, parameters, this.now, result.summary, result);
    }
    if (name === "support.classification_summary") return departmentToolResult(name, context, parameters, this.now,
      await this.reader.classificationSummary(parameters as unknown as SupportHealthWindow));
    if (name === "support.related_order_context") return departmentToolResult(name, context, parameters, this.now,
      await this.orderReferences.findRelatedOrder(String(parameters.ticketId)));
    return unavailable();
  }
}
