// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

export class DatabaseUnavailableError extends Error {
  constructor(options?: ErrorOptions) {
    super("Database dependency is unavailable", options);
    this.name = "DatabaseUnavailableError";
  }
}
