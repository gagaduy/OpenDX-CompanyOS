// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

export interface CustomerCartLoginResolution {
  readonly status: "not_required" | "required" | "resolved";
}

export interface CustomerCartLoginResolver {
  inspect(
    customerId: string,
    customerExpiresAt: string,
    guestSessionId?: string,
    guestExpiresAt?: string,
    autoResolve?: boolean,
  ): Promise<CustomerCartLoginResolution>;
}
