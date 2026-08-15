// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { OrderExpiryRiskInput, OrderHealthReader, OrderHealthWindow, OrderStalledInput } from "../../../order";
import type { DepartmentToolAdapter, DepartmentToolExecutionContext } from "../../application/services/interfaces/department-tool-adapter";
import { departmentToolResult, unavailable } from "./department-tool-result.factory";

export class OrderDepartmentToolAdapter implements DepartmentToolAdapter {
  constructor(private readonly reader: OrderHealthReader, private readonly now: () => string) {}
  async execute(context: DepartmentToolExecutionContext, parameters: Readonly<Record<string, unknown>>) {
    if (context.agentKind !== "order") return unavailable();
    const name = context.toolName;
    let result;
    if (name === "order.stalled_summary") result = await this.reader.stalledSummary(parameters as unknown as OrderStalledInput);
    else if (name === "order.invalid_state_evidence") result = await this.reader.invalidStateEvidence(parameters as unknown as OrderHealthWindow);
    else if (name === "order.expiry_risk") result = await this.reader.expiryRisk(parameters as unknown as OrderExpiryRiskInput);
    else return unavailable();
    return departmentToolResult(name, context, parameters, this.now, result.summary, result);
  }
}
