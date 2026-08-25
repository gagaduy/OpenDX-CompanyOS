// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0
import { rateLimit } from "express-rate-limit";
export function createAuthenticationRateLimit(limit: number) {
  return rateLimit({
    windowMs: 15 * 60 * 1000,
    limit,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: {
      success: false,
      message: "Too many authentication attempts",
      errorCode: "RATE_LIMITED",
      errors: [],
    },
  });
}
