// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { ZodType } from "zod";
import { mapInventoryItem, mapMovement } from "../mappers/inventory.mapper";
import {
  inventoryErrorEnvelopeSchema,
  inventoryItemEnvelopeSchema,
  inventoryListEnvelopeSchema,
  movementListEnvelopeSchema,
} from "../schemas/inventory-api.schema";
import type { InventoryItemView, InventoryMovementView, InventoryPageView, InventoryQuery } from "../types/inventory.types";

export type InventoryErrorCode = "UNAUTHORIZED" | "FORBIDDEN" | "CONFLICT" | "STALE_VERSION" | "VALIDATION_ERROR" | "INVENTORY_ITEM_NOT_FOUND" | "INVALID_STOCK_ADJUSTMENT" | "INVALID_RESPONSE" | "UNAVAILABLE";

export class InventoryApiError extends Error {
  constructor(readonly code: InventoryErrorCode, message: string) { super(message); this.name = "InventoryApiError"; }
}

export interface InventoryApi {
  listItems(query: InventoryQuery, signal?: AbortSignal): Promise<InventoryPageView<InventoryItemView>>;
  getItem(id: string, signal?: AbortSignal): Promise<InventoryItemView>;
  receive(input: { readonly variantId: string; readonly quantity: number; readonly idempotencyKey: string }): Promise<InventoryItemView>;
  adjust(id: string, input: { readonly delta: number; readonly reasonCode: string; readonly reasonNote?: string; readonly version: number }): Promise<InventoryItemView>;
  listMovements(id: string, page: number, pageSize: number, signal?: AbortSignal): Promise<InventoryPageView<InventoryMovementView>>;
}

export function createInventoryApi(baseUrl: string, accessToken: string): InventoryApi {
  const request = async (path: string, init?: RequestInit): Promise<unknown> => {
    let response: Response;
    try {
      response = await fetch(`${baseUrl}${path}`, {
        ...init,
        headers: { "content-type": "application/json", authorization: `Bearer ${accessToken}`, "x-correlation-id": crypto.randomUUID(), ...init?.headers },
      });
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") throw error;
      throw new InventoryApiError("UNAVAILABLE", "Inventory service is unavailable.");
    }
    const body: unknown = await response.json().catch(() => undefined);
    if (!response.ok) {
      const parsed = inventoryErrorEnvelopeSchema.safeParse(body);
      const code = parsed.success ? normalizeCode(parsed.data.errorCode) : normalizeStatus(response.status);
      throw new InventoryApiError(code, publicMessage(code));
    }
    return body;
  };
  const write = (body: unknown): RequestInit => ({ method: "POST", body: JSON.stringify(body) });
  return {
    async listItems(query, signal) {
      const params = new URLSearchParams({ page: String(query.page), pageSize: String(query.pageSize) });
      if (query.query) params.set("query", query.query);
      if (query.categoryId) params.set("categoryId", query.categoryId);
      if (query.stockStatus) params.set("stockStatus", query.stockStatus);
      const envelope = parse(inventoryListEnvelopeSchema, await request(`/v1/admin/inventory/items?${params}`, { signal }));
      return { items: envelope.data.map((item) => mapInventoryItem(item, baseUrl)), ...envelope.meta };
    },
    async getItem(id, signal) {
      return mapInventoryItem(parse(inventoryItemEnvelopeSchema, await request(`/v1/admin/inventory/items/${id}`, { signal })).data, baseUrl);
    },
    async receive(input) {
      return mapInventoryItem(parse(inventoryItemEnvelopeSchema, await request("/v1/admin/inventory/receipts", write(input))).data, baseUrl);
    },
    async adjust(id, input) {
      return mapInventoryItem(parse(inventoryItemEnvelopeSchema, await request(`/v1/admin/inventory/items/${id}/adjust`, write(input))).data, baseUrl);
    },
    async listMovements(id, page, pageSize, signal) {
      const envelope = parse(movementListEnvelopeSchema, await request(`/v1/admin/inventory/items/${id}/movements?page=${page}&pageSize=${pageSize}`, { signal }));
      return { items: envelope.data.map(mapMovement), ...envelope.meta };
    },
  };
}

function parse<T>(schema: ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new InventoryApiError("INVALID_RESPONSE", "The inventory service returned an invalid response.");
  return parsed.data;
}
function normalizeCode(code: string): InventoryErrorCode {
  return ["UNAUTHORIZED", "FORBIDDEN", "CONFLICT", "STALE_VERSION", "VALIDATION_ERROR", "INVENTORY_ITEM_NOT_FOUND", "INVALID_STOCK_ADJUSTMENT"].includes(code) ? code as InventoryErrorCode : "UNAVAILABLE";
}
function normalizeStatus(status: number): InventoryErrorCode {
  return status === 401 ? "UNAUTHORIZED" : status === 403 ? "FORBIDDEN" : status === 409 ? "CONFLICT" : "UNAVAILABLE";
}
function publicMessage(code: InventoryErrorCode): string {
  if (code === "FORBIDDEN") return "Permission denied.";
  if (code === "UNAUTHORIZED") return "Your session has expired.";
  if (code === "STALE_VERSION") return "Refresh required before saving again.";
  if (code === "INVALID_STOCK_ADJUSTMENT") return "The adjustment would create an invalid stock balance.";
  return "The inventory request could not be completed.";
}
