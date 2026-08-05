// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

export class CustomerDomainError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = "CustomerDomainError";
  }
}
