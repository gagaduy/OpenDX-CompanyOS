// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { RequestHandler } from "express";
import type { CheckoutServiceContract } from "../../application/services/interfaces/checkout.service";
import { successResponse } from "../../../../shared/http/api-response";
import { customerState } from "../../../customer";
import { checkoutIdSchema, createCheckoutSchema, parseCheckout, parseIdempotencyKey } from "../validators/checkout.validator";

export class CheckoutController {
  constructor(private readonly service: CheckoutServiceContract) {}
  create: RequestHandler = async (req, res, next) => { try {
    const customer = customerState(res);
    const body = parseCheckout(createCheckoutSchema, req.body);
    const data = await this.service.create({ ...body, idempotencyKey: parseIdempotencyKey(req.header("idempotency-key")) }, { customerId: customer.customerId, customerExpiresAt: customer.expiresAt, correlationId: String(res.locals.correlationId) });
    res.status(201).json(successResponse("Checkout created", data));
  } catch (error) { next(error); } };
  get: RequestHandler = async (req, res, next) => { try {
    const customer = customerState(res);
    const id = parseCheckout(checkoutIdSchema, req.params.checkoutId);
    res.json(successResponse("Checkout retrieved", await this.service.get(id, { customerId: customer.customerId, customerExpiresAt: customer.expiresAt, correlationId: String(res.locals.correlationId) })));
  } catch (error) { next(error); } };
  initiate: RequestHandler = async (req, res, next) => { try {
    const customer = customerState(res);
    const id = parseCheckout(checkoutIdSchema, req.params.checkoutId);
    res.json(successResponse("Payment initiation created", await this.service.initiatePayment(id, { customerId: customer.customerId, customerExpiresAt: customer.expiresAt, correlationId: String(res.locals.correlationId) })));
  } catch (error) { next(error); } };
}
