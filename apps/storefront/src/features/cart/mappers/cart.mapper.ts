// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { StorefrontCart } from "../types/cart.types";
export const emptyAnonymousCart = (): StorefrontCart => ({ ownerKind: "anonymous", version: 0, status: "empty", items: [], itemCount: 0, totalVnd: 0, requiresAction: false });
