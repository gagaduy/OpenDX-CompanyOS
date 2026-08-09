// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

export type StaffRole =
  | "administrator"
  | "catalog_manager"
  | "inventory_manager"
  | "operations_manager"
  | "finance_operator"
  | "crm_operator"
  | "support_operator"
  | "executive_viewer";

export interface StaffPrincipal {
  readonly subject: string;
  readonly displayName: string;
  readonly email?: string;
  readonly roles: readonly StaffRole[];
}
