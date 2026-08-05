// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type {
  ProductAttributes,
  ProductStatus,
} from "../entities/product";
import type { VariantOptions } from "../entities/product-variant";
import { CatalogDomainError } from "../exceptions/catalog-domain.error";

export function assertProductMutable(status: ProductStatus): void {
  if (status === "archived") {
    throw new CatalogDomainError("Archived products cannot be changed");
  }
}

export function assertAttributes(attributes: unknown): asserts attributes is ProductAttributes {
  if (!isRecord(attributes)) {
    throw new CatalogDomainError("Product attributes must be an object");
  }

  for (const [key, value] of Object.entries(attributes)) {
    const valid =
      key.trim().length > 0 &&
      (typeof value === "string" ||
        (typeof value === "number" && Number.isFinite(value)) ||
        typeof value === "boolean" ||
        (Array.isArray(value) && value.every((item) => typeof item === "string")));
    if (!valid) {
      throw new CatalogDomainError(`Invalid product attribute: ${key}`);
    }
  }
}

export function assertVariantOptions(options: unknown): asserts options is VariantOptions {
  if (!isRecord(options) || Object.keys(options).length === 0) {
    throw new CatalogDomainError("Variant options are required");
  }
  for (const [key, value] of Object.entries(options)) {
    if (key.trim().length === 0 || typeof value !== "string" || value.trim().length === 0) {
      throw new CatalogDomainError("Variant option names and values are required");
    }
  }
}

export function assertSinglePrimaryMedia(
  media: readonly { readonly isPrimary: boolean }[],
): void {
  if (media.filter((item) => item.isPrimary).length > 1) {
    throw new CatalogDomainError("A product can have only one primary image");
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
