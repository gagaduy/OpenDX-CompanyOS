// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { CartDto } from "../../dtos/cart.dto";

export type CartResolutionAction = "keep_guest" | "keep_saved" | "merge";

export interface CartResolutionState {
  readonly status: "not_required" | "required" | "resolved";
  readonly guestCart?: CartDto;
  readonly savedCart?: CartDto;
  readonly resultingCart?: CartDto;
}

export interface CartResolutionServiceContract {
  inspect(
    customerId: string,
    customerExpiresAt: string,
    guestSessionId?: string,
    guestExpiresAt?: string,
    autoResolve?: boolean,
  ): Promise<CartResolutionState>;
  resolve(input: {
    readonly customerId: string;
    readonly customerExpiresAt: string;
    readonly guestSessionId: string;
    readonly guestExpiresAt: string;
    readonly action: CartResolutionAction;
    readonly idempotencyKey: string;
  }): Promise<CartResolutionState>;
}
