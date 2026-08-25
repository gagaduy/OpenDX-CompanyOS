// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { CatalogDomainError } from "../exceptions/catalog-domain.error";

export function normalizeSlug(value: string): string {
  const slug = value
    .trim()
    .toLocaleLowerCase("vi")
    .replaceAll("đ", "d")
    .normalize("NFD")
    .replace(/\p{M}+/gu, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  if (slug.length === 0) {
    throw new CatalogDomainError("Slug must contain letters or numbers");
  }

  return slug;
}
