// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { RequestHandler } from "express";

export function securityHeaders(): RequestHandler {
  return (_request, response, next) => {
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    response.setHeader(
      "Permissions-Policy",
      "camera=(), microphone=(), geolocation=()",
    );
    response.setHeader(
      "Content-Security-Policy",
      "default-src 'self'; frame-ancestors 'none'; base-uri 'self'",
    );
    next();
  };
}
