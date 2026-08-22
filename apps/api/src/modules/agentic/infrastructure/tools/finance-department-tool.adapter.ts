// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { PaymentHealthReader, PaymentHealthWindow } from "../../../payment";
import type { DepartmentToolAdapter, DepartmentToolExecutionContext } from "../../application/services/interfaces/department-tool-adapter";
import { departmentToolResult, unavailable } from "./department-tool-result.factory";

export class FinanceDepartmentToolAdapter implements DepartmentToolAdapter {
  constructor(private readonly reader: PaymentHealthReader, private readonly now: () => string) {}
  async execute(context: DepartmentToolExecutionContext, parameters: Readonly<Record<string, unknown>>) {
    if (context.agentKind !== "finance") return unavailable();
    const name = context.toolName;
    if (name === "finance.pending_payments") {
      return departmentToolResult(name, context, parameters, this.now,
        await this.reader.pendingPayments(parameters as unknown as PaymentHealthWindow));
    }
    if (name === "finance.reconciliation_discrepancies") {
      const result = await this.reader.reconciliationDiscrepancies(parameters as unknown as PaymentHealthWindow);
      return departmentToolResult(name, context, parameters, this.now, result.summary, result);
    }
    if (name === "finance.provider_evidence_status") {
      return departmentToolResult(name, context, parameters, this.now,
        await this.reader.providerEvidenceStatus(parameters as unknown as PaymentHealthWindow));
    }
    return unavailable();
  }
}
