// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { ErrorRequestHandler } from "express";
import { ApplicationError } from "../../../../shared/http/application-error";
import { ReportingApplicationError } from "../../application/services/reporting-application.error";

export const reportingErrorMiddleware: ErrorRequestHandler = (error, _request, _response, next) => {
  if (error instanceof ReportingApplicationError) {
    next(new ApplicationError(
      error.code === "FORBIDDEN" ? 403 : 400,
      error.code,
      error.message,
    ));
    return;
  }
  next(error);
};
