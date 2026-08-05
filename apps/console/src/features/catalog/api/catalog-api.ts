// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import {
  auditEnvelopeSchema, categoriesEnvelopeSchema, categoryEnvelopeSchema, errorEnvelopeSchema,
  mediaEnvelopeSchema, priceEnvelopeSchema, productEnvelopeSchema, productListEnvelopeSchema,
  variantEnvelopeSchema,
  publicationReadinessEnvelopeSchema,
} from "../schemas/catalog-api.schema";
import type { ZodType } from "zod";
import { mapCategory, mapProduct, mapProductPage } from "../mappers/catalog.mapper";
import type { CatalogAuditEntry, Category, CategoryInput, Product, ProductInput, ProductMedia, ProductPage, ProductPrice, ProductQuery, ProductUpdate, ProductVariant, PublicationReadiness } from "../types/catalog.types";

export type CatalogErrorCode = "UNAUTHORIZED" | "FORBIDDEN" | "CONFLICT" | "STALE_VERSION" | "VALIDATION_ERROR" | "NOT_FOUND" | "PRODUCT_NOT_READY_FOR_PUBLICATION" | "PRODUCT_NOT_PUBLISHED" | "INVALID_RESPONSE" | "UNAVAILABLE";

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
  createVariant(productId: string, input: { readonly sku: string; readonly title: string; readonly optionValues: Readonly<Record<string, string>> }): Promise<ProductVariant>;
  updateVariant(productId: string, variantId: string, input: { readonly sku?: string; readonly title?: string; readonly optionValues?: Readonly<Record<string, string>>; readonly version: number }): Promise<ProductVariant>;
  archiveVariant(productId: string, variantId: string, version: number): Promise<ProductVariant>;
  replacePrice(productId: string, variantId: string, amountMinor: number): Promise<ProductPrice>;
  uploadMedia(productId: string, input: { readonly file: File; readonly altText: string; readonly sortOrder: number; readonly isPrimary: boolean }, onProgress: (percentage: number) => void): Promise<ProductMedia>;
  updateMedia(productId: string, mediaId: string, input: { readonly altText?: string; readonly sortOrder?: number; readonly isPrimary?: boolean }): Promise<ProductMedia>;
  deleteMedia(productId: string, mediaId: string): Promise<void>;
  loadMediaPreview(productId: string, mediaId: string): Promise<string>;
  getProductAudit(productId: string): Promise<readonly CatalogAuditEntry[]>;
  checkPublicationReadiness(productId: string): Promise<PublicationReadiness>;
  publishProduct(productId: string, version: number): Promise<Product>;
  unpublishProduct(productId: string, version: number): Promise<Product>;
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
    const body: unknown = response.status === 204 ? undefined : await response.json().catch(() => undefined);
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
    async createVariant(productId, input) { return parse(variantEnvelopeSchema, await request(`/v1/admin/catalog/products/${productId}/variants`, write("POST", input))).data; },
    async updateVariant(productId, variantId, input) { return parse(variantEnvelopeSchema, await request(`/v1/admin/catalog/products/${productId}/variants/${variantId}`, write("PATCH", input))).data; },
    async archiveVariant(productId, variantId, version) { return parse(variantEnvelopeSchema, await request(`/v1/admin/catalog/products/${productId}/variants/${variantId}/archive`, write("POST", { version }))).data; },
    async replacePrice(productId, variantId, amountMinor) { return parse(priceEnvelopeSchema, await request(`/v1/admin/catalog/products/${productId}/variants/${variantId}/price`, write("PUT", { amountMinor, currency: "VND" }))).data; },
    async uploadMedia(productId, input, onProgress) { return uploadMedia(baseUrl, accessToken, productId, input, onProgress); },
    async updateMedia(productId, mediaId, input) { return parse(mediaEnvelopeSchema, await request(`/v1/admin/catalog/products/${productId}/media/${mediaId}`, write("PATCH", input))).data; },
    async deleteMedia(productId, mediaId) { await request(`/v1/admin/catalog/products/${productId}/media/${mediaId}`, { method: "DELETE" }); },
    async loadMediaPreview(productId, mediaId) {
      const response = await fetch(`${baseUrl}/v1/admin/catalog/products/${productId}/media/${mediaId}/content`, { headers: { authorization: `Bearer ${accessToken}`, "x-correlation-id": crypto.randomUUID() } });
      if (!response.ok) throw new CatalogApiError(normalizeStatus(response.status), "Unable to load media preview.");
      return URL.createObjectURL(await response.blob());
    },
    async getProductAudit(productId) { return parse(auditEnvelopeSchema, await request(`/v1/admin/catalog/products/${productId}/audit`)).data; },
    async checkPublicationReadiness(productId) { return parse(publicationReadinessEnvelopeSchema, await request(`/v1/admin/catalog/products/${productId}/publication-readiness`)).data; },
    async publishProduct(productId, version) { return mapProduct(parse(productEnvelopeSchema, await request(`/v1/admin/catalog/products/${productId}/publish`, write("POST", { version }))).data); },
    async unpublishProduct(productId, version) { return mapProduct(parse(productEnvelopeSchema, await request(`/v1/admin/catalog/products/${productId}/unpublish`, write("POST", { version }))).data); },
  };
}

function uploadMedia(baseUrl: string, accessToken: string, productId: string, input: { readonly file: File; readonly altText: string; readonly sortOrder: number; readonly isPrimary: boolean }, onProgress: (percentage: number) => void): Promise<ProductMedia> {
  return new Promise((resolve, reject) => {
    const form = new FormData(); form.set("file", input.file); form.set("altText", input.altText); form.set("sortOrder", String(input.sortOrder)); form.set("isPrimary", String(input.isPrimary));
    const xhr = new XMLHttpRequest(); xhr.open("POST", `${baseUrl}/v1/admin/catalog/products/${productId}/media`); xhr.setRequestHeader("authorization", `Bearer ${accessToken}`); xhr.setRequestHeader("x-correlation-id", crypto.randomUUID());
    xhr.upload.onprogress = (event) => { if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100)); };
    xhr.onerror = () => reject(new CatalogApiError("UNAVAILABLE", "Media upload failed."));
    xhr.onload = () => {
      let body: unknown; try { body = JSON.parse(xhr.responseText); } catch { reject(new CatalogApiError("INVALID_RESPONSE", "Invalid media response.")); return; }
      if (xhr.status < 200 || xhr.status >= 300) { const parsed = errorEnvelopeSchema.safeParse(body); const code = parsed.success ? normalizeCode(parsed.data.errorCode) : normalizeStatus(xhr.status); reject(new CatalogApiError(code, publicMessage(code))); return; }
      try { resolve(parse(mediaEnvelopeSchema, body).data); } catch (error) { reject(error); }
    };
    xhr.send(form);
  });
}

function parse<T>(schema: ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new CatalogApiError("INVALID_RESPONSE", "The catalog returned an invalid response.");
  return parsed.data;
}

function normalizeCode(code: string): CatalogErrorCode {
  return ["UNAUTHORIZED", "FORBIDDEN", "CONFLICT", "STALE_VERSION", "VALIDATION_ERROR", "NOT_FOUND", "PRODUCT_NOT_READY_FOR_PUBLICATION", "PRODUCT_NOT_PUBLISHED"].includes(code) ? code as CatalogErrorCode : "UNAVAILABLE";
}
function normalizeStatus(status: number): CatalogErrorCode { return status === 401 ? "UNAUTHORIZED" : status === 403 ? "FORBIDDEN" : status === 409 ? "CONFLICT" : "UNAVAILABLE"; }
function publicMessage(code: CatalogErrorCode): string {
  if (code === "FORBIDDEN") return "Permission denied.";
  if (code === "UNAUTHORIZED") return "Your session has expired.";
  if (code === "STALE_VERSION") return "Refresh required before saving again.";
  if (code === "CONFLICT") return "This slug already exists.";
  if (code === "PRODUCT_NOT_READY_FOR_PUBLICATION") return "Complete every publication requirement before publishing.";
  return "The catalog request could not be completed.";
}
