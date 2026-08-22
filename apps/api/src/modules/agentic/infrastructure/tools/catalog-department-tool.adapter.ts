// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { CatalogHealthReader, CatalogPublicationReadinessInput } from "../../../catalog";
import type { DepartmentToolAdapter, DepartmentToolExecutionContext } from "../../application/services/interfaces/department-tool-adapter";
import { departmentToolResult, unavailable } from "./department-tool-result.factory";

export class CatalogDepartmentToolAdapter implements DepartmentToolAdapter {
  constructor(private readonly reader: CatalogHealthReader, private readonly now: () => string) {}
  async execute(context: DepartmentToolExecutionContext, parameters: Readonly<Record<string, unknown>>) {
    if (context.agentKind !== "catalog") return unavailable();
    const name = context.toolName;
    if (name === "catalog.product_completeness") {
      return departmentToolResult(name, context, parameters, this.now,
        await this.reader.productCompleteness(this.now()));
    }
    if (name === "catalog.publication_readiness") {
      const result = await this.reader.publicationReadiness(parameters as unknown as CatalogPublicationReadinessInput);
      return departmentToolResult(name, context, parameters, this.now, result.summary, result);
    }
    if (name === "catalog.merchandising_summary") {
      return departmentToolResult(name, context, parameters, this.now,
        await this.reader.merchandisingSummary(this.now()));
    }
    return unavailable();
  }
}
