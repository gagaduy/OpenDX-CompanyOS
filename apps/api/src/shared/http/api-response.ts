// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

export interface ApiSuccess<T> {
  readonly success: true;
  readonly message: string;
  readonly data: T;
  readonly meta?: Readonly<Record<string, unknown>>;
}

export function successResponse<T>(
  message: string,
  data: T,
  meta?: Readonly<Record<string, unknown>>,
): ApiSuccess<T> {
  return { success: true, message, data, ...(meta === undefined ? {} : { meta }) };
}
