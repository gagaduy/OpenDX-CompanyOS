// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

export class CatalogDomainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CatalogDomainError";
  }
}
