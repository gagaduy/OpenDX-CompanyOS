// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

export interface ApplicationErrorDetail {
  readonly path?: string;
  readonly message: string;
}

export class ApplicationError extends Error {
  constructor(
    readonly statusCode: number,
    readonly errorCode: string,
    message: string,
    readonly errors: readonly ApplicationErrorDetail[] = [],
  ) {
    super(message);
    this.name = "ApplicationError";
  }
}
