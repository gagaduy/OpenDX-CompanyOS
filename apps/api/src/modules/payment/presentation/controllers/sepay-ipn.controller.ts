// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0
import type { RequestHandler } from "express";
import type { PaymentNotificationServiceContract } from "../../application/services/interfaces/payment-notification.service";
import { mapSePayPayloadError } from "../validators/sepay-ipn.validator";
export class SePayIpnController {
  constructor(private readonly notifications: PaymentNotificationServiceContract) {}
  handle: RequestHandler = async (request, response, next) => { try {
    const result = await this.notifications.process(request.body, String(response.locals.correlationId));
    response.status(200).json({ success: true, message: "Notification acknowledged", data: result, meta: {} });
  } catch (error) { try { mapSePayPayloadError(error); } catch (mapped) { next(mapped); } } };
}
