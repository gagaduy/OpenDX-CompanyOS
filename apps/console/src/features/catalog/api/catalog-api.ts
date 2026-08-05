// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import {
  categoriesEnvelopeSchema, categoryEnvelopeSchema, errorEnvelopeSchema,
  productEnvelopeSchema, productListEnvelopeSchema,
} from "../schemas/catalog-api.schema";
import type { ZodType } from "zod";
import { mapCategory, mapProduct, mapProductPage } from "../mappers/catalog.mapper";
import type { Category, CategoryInput, Product, ProductInput, ProductPage, ProductQuery, ProductUpdate } from "../types/catalog.types";

export type CatalogErrorCode = "UNAUTHORIZED" | "FORBIDDEN" | "CONFLICT" | "STALE_VERSION" | "VALIDATION_ERROR" | "NOT_FOUND" | "INVALID_RESPONSE" | "UNAVAILABLE";

export class CatalogApiError extends Error {
  constructor(readonly code: CatalogErrorCode, message: string) { super(message); this.name = "CatalogApiError"; }
}

export interface CatalogApi {
  listProducts(query: ProductQuery): Promise<ProductPage>;
  getProduct(id: string): Promise<Product>;
  createProduct(input: ProductInput): Promise<Product>;
  updateProduct(id: string, input: ProductUpdate): Promise<Product>;
  archiveProduct(id: string, version: number): Promise<void>;
  listCategories(): Promise<readonly Category[]>;
  createCategory(input: CategoryInput): Promise<Category>;
  updateCategory(id: string, input: Partial<CategoryInput> & { readonly version: number }): Promise<Category>;
  archiveCategory(id: string, version: number): Promise<void>;
}

export function createCatalogApi(baseUrl: string, accessToken: string): CatalogApi {
  const request = async (path: string, init?: RequestInit): Promise<unknown> => {
    let response: Response;
    try {
      response = await fetch(`${baseUrl}${path}`, {
        ...init,
        headers: { "content-type": "application/json", authorization: `Bearer ${accessToken}`, "x-correlation-id": crypto.randomUUID(), ...init?.headers },
      });
    } catch { throw new CatalogApiError("UNAVAILABLE", "Catalog service is unavailable."); }
    const body: unknown = await response.json().catch(() => undefined);
    if (!response.ok) {
      const parsed = errorEnvelopeSchema.safeParse(body);
      const code = parsed.success ? normalizeCode(parsed.data.errorCode) : normalizeStatus(response.status);
      throw new CatalogApiError(code, publicMessage(code));
    }
    return body;
  };
  const write = (method: string, body: unknown): RequestInit => ({ method, body: JSON.stringify(body) });
  return {
    async listProducts(query) {
      const params = new URLSearchParams({ page: String(query.page), pageSize: String(query.pageSize) });
      if (query.query) params.set("query", query.query);
      if (query.categoryId) params.set("categoryId", query.categoryId);
      if (query.status) params.set("status", query.status);
      return mapProductPage(parse(productListEnvelopeSchema, await request(`/v1/admin/catalog/products?${params}`)));
    },
    async getProduct(id) { return mapProduct(parse(productEnvelopeSchema, await request(`/v1/admin/catalog/products/${id}`)).data); },
    async createProduct(input) { return mapProduct(parse(productEnvelopeSchema, await request("/v1/admin/catalog/products", write("POST", input))).data); },
    async updateProduct(id, input) { return mapProduct(parse(productEnvelopeSchema, await request(`/v1/admin/catalog/products/${id}`, write("PATCH", input))).data); },
    async archiveProduct(id, version) { parse(productEnvelopeSchema, await request(`/v1/admin/catalog/products/${id}/archive`, write("POST", { version }))); },
    async listCategories() { return parse(categoriesEnvelopeSchema, await request("/v1/admin/catalog/categories")).data.map(mapCategory); },
    async createCategory(input) { return mapCategory(parse(categoryEnvelopeSchema, await request("/v1/admin/catalog/categories", write("POST", input))).data); },
    async updateCategory(id, input) { return mapCategory(parse(categoryEnvelopeSchema, await request(`/v1/admin/catalog/categories/${id}`, write("PATCH", input))).data); },
    async archiveCategory(id, version) { parse(categoryEnvelopeSchema, await request(`/v1/admin/catalog/categories/${id}/archive`, write("POST", { version }))); },
  };
}

function parse<T>(schema: ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new CatalogApiError("INVALID_RESPONSE", "The catalog returned an invalid response.");
  return parsed.data;
}

function normalizeCode(code: string): CatalogErrorCode {
  return ["UNAUTHORIZED", "FORBIDDEN", "CONFLICT", "STALE_VERSION", "VALIDATION_ERROR", "NOT_FOUND"].includes(code) ? code as CatalogErrorCode : "UNAVAILABLE";
}
function normalizeStatus(status: number): CatalogErrorCode { return status === 401 ? "UNAUTHORIZED" : status === 403 ? "FORBIDDEN" : status === 409 ? "CONFLICT" : "UNAVAILABLE"; }
function publicMessage(code: CatalogErrorCode): string {
  if (code === "FORBIDDEN") return "Permission denied.";
  if (code === "UNAUTHORIZED") return "Your session has expired.";
  if (code === "STALE_VERSION") return "Refresh required before saving again.";
  if (code === "CONFLICT") return "This slug already exists.";
  return "The catalog request could not be completed.";
}
