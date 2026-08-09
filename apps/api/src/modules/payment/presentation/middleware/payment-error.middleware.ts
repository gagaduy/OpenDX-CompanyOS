// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0
import type { ErrorRequestHandler } from "express";
import { ApplicationError } from "../../../../shared/http/application-error";
import { PaymentApplicationError } from "../../application/services/payment-application.error";

export const paymentErrorMiddleware: ErrorRequestHandler = (
  error,
  _request,
  _response,
  next,
) => {
  if (error instanceof PaymentApplicationError) {
    next(
      new ApplicationError(
        error.code === "FORBIDDEN" ? 403 : 404,
        error.code,
        error.message,
      ),
    );
    return;
  }
  next(error);
};
