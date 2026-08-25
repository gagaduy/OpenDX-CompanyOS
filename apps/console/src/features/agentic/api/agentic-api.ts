// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { ZodType } from "zod";
import { agenticErrorEnvelopeSchema, agenticOverviewEnvelopeSchema, agenticTaskDetailEnvelopeSchema, agenticTaskPageEnvelopeSchema } from "../schemas/agentic-task-api.schema";
import type { AgenticTaskDetail, AgenticTaskFilter, AgenticTaskIntake, AgenticTaskOverview, AgenticTaskPage } from "../types/agentic.types";
import { mapAgenticOverview, mapAgenticTaskDetail, mapAgenticTaskPage } from "../mappers/agentic.mapper";

export type AgenticApiErrorCode = "UNAUTHORIZED" | "FORBIDDEN" | "NOT_FOUND" | "STALE_VERSION" | "IDEMPOTENCY_CONFLICT" | "VALIDATION_ERROR" | "UNAVAILABLE" | "INVALID_RESPONSE";
export class AgenticApiError extends Error { constructor(readonly code: AgenticApiErrorCode, message: string) { super(message); this.name = "AgenticApiError"; } }
export interface AgenticApi { overview(signal?: AbortSignal): Promise<AgenticTaskOverview>; listTasks(filter: AgenticTaskFilter, signal?: AbortSignal): Promise<AgenticTaskPage>; createTask(input: AgenticTaskIntake, idempotencyKey: string): Promise<AgenticTaskDetail> }

export function createAgenticApi(baseUrl: string, accessToken: string): AgenticApi {
  const request = createRequest(baseUrl, accessToken);
  return {
    async overview(signal) { return mapAgenticOverview(parse(agenticOverviewEnvelopeSchema, await request("/v1/admin/agentic/tasks/overview", { signal })).data); },
    async listTasks(filter, signal) { const params = new URLSearchParams({ page: String(filter.page), pageSize: String(filter.pageSize) }); for (const key of ["state", "createdBy", "createdFrom", "createdTo"] as const) if (filter[key]) params.set(key, filter[key]!); return mapAgenticTaskPage(parse(agenticTaskPageEnvelopeSchema, await request(`/v1/admin/agentic/tasks?${params}`, { signal })).data); },
    async createTask(input, idempotencyKey) { return mapAgenticTaskDetail(parse(agenticTaskDetailEnvelopeSchema, await request("/v1/admin/agentic/tasks/intake", { method: "POST", headers: { "idempotency-key": idempotencyKey }, body: JSON.stringify(input) })).data); },
  };
}
function createRequest(baseUrl: string, accessToken: string) { return async (path: string, init?: RequestInit): Promise<unknown> => { let response: Response; try { response = await fetch(`${baseUrl}${path}`, { ...init, headers: { "content-type": "application/json", authorization: `Bearer ${accessToken}`, "x-correlation-id": crypto.randomUUID(), ...init?.headers } }); } catch (error) { if (error instanceof DOMException && error.name === "AbortError") throw error; throw new AgenticApiError("UNAVAILABLE", "Digital Workforce is unavailable."); } const body: unknown = await response.json().catch(() => undefined); if (!response.ok) { const parsed = agenticErrorEnvelopeSchema.safeParse(body); const code = normalizeCode(parsed.success ? parsed.data.errorCode : "UNAVAILABLE", response.status); throw new AgenticApiError(code, parsed.success ? parsed.data.message : "The request could not be completed."); } return body; }; }
function parse<T>(schema: ZodType<T>, value: unknown): T { const parsed = schema.safeParse(value); if (!parsed.success) throw new AgenticApiError("INVALID_RESPONSE", "Digital Workforce returned an invalid response."); return parsed.data; }
function normalizeCode(code: string, status: number): AgenticApiErrorCode { if (["UNAUTHORIZED", "FORBIDDEN", "NOT_FOUND", "STALE_VERSION", "IDEMPOTENCY_CONFLICT", "VALIDATION_ERROR"].includes(code)) return code as AgenticApiErrorCode; return status === 401 ? "UNAUTHORIZED" : status === 403 ? "FORBIDDEN" : "UNAVAILABLE"; }
