// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { ApplicationError } from "../../../../shared/http/application-error";

export class MarketingApplicationError extends ApplicationError {
  constructor(
    statusCode: number,
    code: string,
    message: string,
  ) {
    super(statusCode, code, message);
    this.name = "MarketingApplicationError";
  }

  static outOfScope(message = "Task is out of Marketing department scope"): MarketingApplicationError {
    return new MarketingApplicationError(400, "OUT_OF_DEPARTMENT_SCOPE", message);
  }

  static crossDepartmentCoordinationRequired(
    message = "Cross-department coordination is required for this request",
  ): MarketingApplicationError {
    return new MarketingApplicationError(
      400,
      "CROSS_DEPARTMENT_COORDINATION_REQUIRED",
      message,
    );
  }

  static waitingForInput(message = "Missing required brief fields"): MarketingApplicationError {
    return new MarketingApplicationError(400, "WAITING_FOR_INPUT", message);
  }

  static campaignNotFound(id: string): MarketingApplicationError {
    return new MarketingApplicationError(404, "CAMPAIGN_NOT_FOUND", `Marketing campaign ${id} not found.`);
  }

  static idempotencyConflict(key: string): MarketingApplicationError {
    return new MarketingApplicationError(
      409,
      "IDEMPOTENCY_KEY_CONFLICT",
      `Idempotency key '${key}' was already used with different parameters.`,
    );
  }

  static invalidStateTransition(message: string): MarketingApplicationError {
    return new MarketingApplicationError(409, "INVALID_STATE_TRANSITION", message);
  }
}
