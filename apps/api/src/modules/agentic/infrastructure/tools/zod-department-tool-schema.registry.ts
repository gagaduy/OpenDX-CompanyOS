// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { AgenticApplicationError } from "../../application/services/agentic-application.error";
import type {
  DepartmentToolSchemaDigests,
  DepartmentToolSchemaRegistry,
} from "../../application/services/interfaces/department-tool-schema-registry";
import type { DepartmentToolName } from "../../application/tools/department-tool-contracts";
import { findDepartmentToolDescriptor } from "../../application/tools/department-tool-catalog";
import {
  departmentToolSchemaDigest,
  getDepartmentToolInputSchema,
  getDepartmentToolOutputSchema,
} from "../../application/tools/department-tool-schemas";

const MAXIMUM_WINDOW_MS = 90 * 24 * 60 * 60 * 1_000;
const MAXIMUM_FUTURE_MS = 60 * 1_000;

export class ZodDepartmentToolSchemaRegistry implements DepartmentToolSchemaRegistry {
  constructor(private readonly now: () => string) {}

  parseInput(
    name: string,
    version: number,
    value: unknown,
  ): Readonly<Record<string, unknown>> {
    const descriptor = this.descriptor(name, version);
    try {
      const parsed = getDepartmentToolInputSchema(descriptor.name).parse(value) as Record<string, unknown>;
      this.assertWindow(parsed);
      return parsed;
    } catch (error) {
      if (error instanceof AgenticApplicationError) throw error;
      throw new AgenticApplicationError("TOOL_INPUT_INVALID", "Tool input is invalid");
    }
  }

  parseOutput(name: string, version: number, value: unknown): unknown {
    const descriptor = this.descriptor(name, version);
    try {
      return getDepartmentToolOutputSchema(descriptor.name).parse(value);
    } catch {
      throw new AgenticApplicationError("TOOL_OUTPUT_INVALID", "Tool output is invalid");
    }
  }

  schemaDigests(name: DepartmentToolName, version: 1): DepartmentToolSchemaDigests {
    this.descriptor(name, version);
    return {
      inputSchemaDigest: departmentToolSchemaDigest(getDepartmentToolInputSchema(name)),
      outputSchemaDigest: departmentToolSchemaDigest(getDepartmentToolOutputSchema(name)),
    };
  }

  private descriptor(name: string, version: number) {
    const descriptor = findDepartmentToolDescriptor(name, version);
    if (descriptor === undefined) {
      throw new AgenticApplicationError("TOOL_NOT_FOUND", "Tool version is unavailable");
    }
    return descriptor;
  }

  private assertWindow(input: Readonly<Record<string, unknown>>): void {
    if (typeof input.start !== "string" || typeof input.end !== "string") return;
    const start = Date.parse(input.start);
    const end = Date.parse(input.end);
    const now = Date.parse(this.now());
    if (
      !Number.isFinite(start) || !Number.isFinite(end) || !Number.isFinite(now)
      || end <= start || end - start > MAXIMUM_WINDOW_MS || end > now + MAXIMUM_FUTURE_MS
    ) {
      throw new AgenticApplicationError("TOOL_INPUT_INVALID", "Tool window is invalid");
    }
  }
}
