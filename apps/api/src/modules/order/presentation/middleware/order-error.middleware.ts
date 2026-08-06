// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { ErrorRequestHandler } from "express";
import { ApplicationError } from "../../../../shared/http/application-error";
import { OrderApplicationError } from "../../application/services/order-application.error";
import { OrderDomainError } from "../../domain/exceptions/order-domain.error";

export const orderErrorMiddleware: ErrorRequestHandler = (error, _request, _response, next) => {
  if (error instanceof OrderDomainError) return next(new ApplicationError(409, error.code, error.message));
  if (!(error instanceof OrderApplicationError)) return next(error);
  const status = error.code === "ORDER_NOT_FOUND" ? 404 : error.code === "FORBIDDEN" ? 403 : 409;
  next(new ApplicationError(status, error.code, error.message));
};
