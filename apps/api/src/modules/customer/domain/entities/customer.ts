// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

export type CustomerStatus = "active" | "disabled";

export interface Customer {
  readonly id: string;
  readonly email: string;
  readonly emailVerifiedAt: string;
  readonly fullName?: string;
  readonly phoneNumber?: string;
  readonly status: CustomerStatus;
  readonly version: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}
