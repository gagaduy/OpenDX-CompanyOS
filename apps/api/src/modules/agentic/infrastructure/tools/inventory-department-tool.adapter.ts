// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { InventoryHealthReader, InventoryHealthWindow, InventorySlowStockInput, InventoryStockRiskInput } from "../../../inventory";
import type { DepartmentToolAdapter, DepartmentToolExecutionContext } from "../../application/services/interfaces/department-tool-adapter";
import { departmentToolResult, unavailable } from "./department-tool-result.factory";

export class InventoryDepartmentToolAdapter implements DepartmentToolAdapter {
  constructor(private readonly reader: InventoryHealthReader, private readonly now: () => string) {}
  async execute(context: DepartmentToolExecutionContext, parameters: Readonly<Record<string, unknown>>) {
    if (context.agentKind !== "inventory") return unavailable();
    const name = context.toolName;
    let result;
    if (name === "inventory.stock_risk") result = await this.reader.stockRisk(parameters as unknown as InventoryStockRiskInput);
    else if (name === "inventory.slow_stock") result = await this.reader.slowStock(parameters as unknown as InventorySlowStockInput);
    else if (name === "inventory.reservation_anomalies") result = await this.reader.reservationAnomalies(parameters as unknown as InventoryHealthWindow);
    else return unavailable();
    return departmentToolResult(name, context, parameters, this.now, result.summary, result);
  }
}
