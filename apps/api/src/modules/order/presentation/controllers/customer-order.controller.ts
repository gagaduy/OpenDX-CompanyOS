// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { RequestHandler } from "express";
import { customerState } from "../../../customer/presentation/middleware/customer-session.middleware";
import { successResponse } from "../../../../shared/http/api-response";
import type { OrderServiceContract } from "../../application/services/interfaces/order.service";
import { parseOrderId, parseOrderList } from "../validators/order.validator";

export class CustomerOrderController {
  constructor(private readonly service: OrderServiceContract) {}
  readonly list: RequestHandler = async (request, response, next) => {
    try { response.json(successResponse("Orders retrieved", await this.service.listForCustomer(customerState(response).customerId, parseOrderList(request.query)))); }
    catch (error) { next(error); }
  };
  readonly get: RequestHandler = async (request, response, next) => {
    try { response.json(successResponse("Order retrieved", await this.service.getForCustomer(customerState(response).customerId, parseOrderId(request.params.orderId)))); }
    catch (error) { next(error); }
  };
}
