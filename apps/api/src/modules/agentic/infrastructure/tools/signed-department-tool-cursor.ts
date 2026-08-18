// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { AgenticApplicationError } from "../../application/services/agentic-application.error";
import type {
  DepartmentToolAdapter,
  DepartmentToolExecutionContext,
} from "../../application/services/interfaces/department-tool-adapter";

interface CursorPayload {
  readonly version: 1;
  readonly toolName: string;
  readonly toolVersion: number;
  readonly taskId: string;
  readonly parametersDigest: string;
  readonly innerCursor: string;
  readonly expiresAt: number;
}

export class SignedDepartmentToolCursorAdapter implements DepartmentToolAdapter {
  constructor(
    private readonly adapter: DepartmentToolAdapter,
    private readonly secret: string,
    private readonly now: () => string,
  ) {}

  async execute(
    context: DepartmentToolExecutionContext,
    parameters: Readonly<Record<string, unknown>>,
  ): Promise<unknown> {
    const normalizedParameters = withoutCursor(parameters);
    const innerCursor = typeof parameters.cursor === "string"
      ? this.decode(parameters.cursor, context, normalizedParameters)
      : undefined;
    const result = await this.adapter.execute(
      context,
      innerCursor === undefined
        ? normalizedParameters
        : { ...normalizedParameters, cursor: innerCursor },
    );
    if (result === null || typeof result !== "object" || Array.isArray(result)) return result;
    const output = result as Readonly<Record<string, unknown>>;
    if (typeof output.nextCursor !== "string") return result;
    return {
      ...output,
      nextCursor: this.encode(output.nextCursor, context, normalizedParameters),
    };
  }

  private encode(
    innerCursor: string,
    context: DepartmentToolExecutionContext,
    parameters: Readonly<Record<string, unknown>>,
  ): string {
    const payload: CursorPayload = {
      version: 1,
      toolName: context.toolName,
      toolVersion: context.toolVersion,
      taskId: context.taskId,
      parametersDigest: digest(parameters),
      innerCursor,
      expiresAt: Date.parse(this.now()) + 5 * 60_000,
    };
    const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
    return `${encoded}.${this.sign(encoded)}`;
  }

  private decode(
    cursor: string,
    context: DepartmentToolExecutionContext,
    parameters: Readonly<Record<string, unknown>>,
  ): string {
    try {
      const [encoded, signature, extra] = cursor.split(".");
      if (encoded === undefined || signature === undefined || extra !== undefined) invalidCursor();
      const expected = Buffer.from(this.sign(encoded), "base64url");
      const received = Buffer.from(signature, "base64url");
      if (expected.length !== received.length || !timingSafeEqual(expected, received)) invalidCursor();
      const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as CursorPayload;
      if (
        payload.version !== 1
        || payload.toolName !== context.toolName
        || payload.toolVersion !== context.toolVersion
        || payload.taskId !== context.taskId
        || payload.parametersDigest !== digest(parameters)
        || typeof payload.innerCursor !== "string"
        || !Number.isSafeInteger(payload.expiresAt)
        || Date.parse(this.now()) >= payload.expiresAt
      ) invalidCursor();
      return payload.innerCursor;
    } catch (error) {
      if (error instanceof AgenticApplicationError) throw error;
      return invalidCursor();
    }
  }

  private sign(encoded: string): string {
    return createHmac("sha256", this.secret)
      .update("opendx.department-tool-cursor.v1\0")
      .update(encoded)
      .digest("base64url");
  }
}

function withoutCursor(
  parameters: Readonly<Record<string, unknown>>,
): Readonly<Record<string, unknown>> {
  const { cursor: _cursor, ...normalized } = parameters;
  return normalized;
}

function digest(value: unknown): string {
  return createHash("sha256").update(stableJson(value)).digest("hex");
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function invalidCursor(): never {
  throw new AgenticApplicationError("TOOL_INPUT_INVALID", "Department tool cursor is invalid or expired");
}
