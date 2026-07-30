// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

export type CompanyId = `company_${string}`;

export function makeCompanyScopedId(
  companyId: string,
  resourceId: string,
): string {
  return `${companyId}:${resourceId}`;
}
