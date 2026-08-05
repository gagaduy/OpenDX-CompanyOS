// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

export type StaffRole = "administrator" | "catalog_manager";

export interface StaffPrincipal {
  readonly subject: string;
  readonly displayName: string;
  readonly email?: string;
  readonly roles: readonly StaffRole[];
}
