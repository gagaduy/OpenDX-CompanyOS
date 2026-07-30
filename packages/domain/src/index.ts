// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

export const SERVICE_NAMES = {
  api: "opendx-api",
  aiRuntime: "opendx-ai-runtime",
} as const;

export type CompanyId = `company_${string}`;

export function makeCompanyScopedId(
  companyId: string,
  resourceId: string,
): string {
  return `${companyId}:${resourceId}`;
}
