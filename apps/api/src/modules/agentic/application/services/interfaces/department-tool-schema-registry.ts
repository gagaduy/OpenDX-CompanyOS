// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { DepartmentToolName } from "../../tools/department-tool-contracts";

export interface DepartmentToolSchemaDigests {
  readonly inputSchemaDigest: string;
  readonly outputSchemaDigest: string;
}

export interface DepartmentToolSchemaRegistry {
  parseInput(name: string, version: number, value: unknown): Readonly<Record<string, unknown>>;
  parseOutput(name: string, version: number, value: unknown): unknown;
  schemaDigests(name: DepartmentToolName, version: 1): DepartmentToolSchemaDigests;
}
