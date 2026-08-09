// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

export interface CustomerOperationsSummary {
  readonly id: string;
  readonly email: string;
  readonly fullName?: string;
  readonly phoneNumber?: string;
  readonly status: "active" | "disabled";
  readonly createdAt: string;
}

export interface CustomerOperationsDetail extends CustomerOperationsSummary {
  readonly addresses: readonly {
    readonly id: string;
    readonly recipientName: string;
    readonly phoneNumber: string;
    readonly addressLine: string;
    readonly ward: string;
    readonly provinceOrCity: string;
    readonly postalCode?: string;
    readonly isDefault: boolean;
  }[];
}

export interface CustomerOperationsReader {
  search(query: {
    readonly search?: string;
    readonly page: number;
    readonly pageSize: number;
  }): Promise<{
    readonly items: readonly CustomerOperationsSummary[];
    readonly totalItems: number;
  }>;
  get(customerId: string): Promise<CustomerOperationsDetail | undefined>;
  getMany(customerIds: readonly string[]): Promise<readonly CustomerOperationsSummary[]>;
  getSupportContext(customerId: string): Promise<Pick<
    CustomerOperationsSummary,
    "id" | "email" | "fullName" | "phoneNumber"
  > | undefined>;
}
