// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { RequestHandler } from "express";
import { successResponse } from "../../../../shared/http/api-response";
import { ApplicationError } from "../../../../shared/http/application-error";
import type { CartResolutionServiceContract } from "../../application/services/interfaces/cart-resolution.service";
import type { CartServiceContract } from "../../application/services/interfaces/cart.service";
import type { CheckoutReadyCartReader } from "../../application/services/interfaces/checkout-ready-cart-reader";
import { cartSessionState, preferredCartOwner } from "../middleware/cart-session.middleware";
import { addCartItemSchema, cartItemIdSchema, cartResolutionSchema, parseCart, updateCartItemSchema } from "../validators/cart.validator";

export class CartController {
  constructor(
    private readonly carts: CartServiceContract,
    private readonly resolutions: CartResolutionServiceContract,
    private readonly checkout: CheckoutReadyCartReader,
  ) {}

  get: RequestHandler = async (_req, res, next) => { try { res.json(successResponse("Cart retrieved", await this.carts.get(preferredCartOwner(res)))); } catch (error) { next(error); } };
  add: RequestHandler = async (req, res, next) => { try { const body = parseCart(addCartItemSchema, req.body); res.status(201).json(successResponse("Cart item added", await this.carts.addItem(preferredCartOwner(res)!, body.variantId, body.quantity))); } catch (error) { next(error); } };
  update: RequestHandler = async (req, res, next) => { try { const body = parseCart(updateCartItemSchema, req.body); const itemId = parseCart(cartItemIdSchema, req.params.cartItemId); res.json(successResponse("Cart item updated", await this.carts.updateItem(preferredCartOwner(res)!, itemId, body.quantity))); } catch (error) { next(error); } };
  remove: RequestHandler = async (req, res, next) => { try { const itemId = parseCart(cartItemIdSchema, req.params.cartItemId); res.json(successResponse("Cart item removed", await this.carts.removeItem(preferredCartOwner(res)!, itemId))); } catch (error) { next(error); } };
  inspectResolution: RequestHandler = async (_req, res, next) => { try { const state = cartSessionState(res); const customer = state.customer!; res.json(successResponse("Cart resolution inspected", await this.resolutions.inspect(customer.customerId, customer.expiresAt, state.guest?.guestSessionId, state.guest?.expiresAt))); } catch (error) { next(error); } };
  resolve: RequestHandler = async (req, res, next) => { try { const state = cartSessionState(res); const customer = state.customer!; const guest = state.guest; if (guest === undefined) throw new ApplicationError(409, "CART_RESOLUTION_CONFLICT", "Guest session is required for cart resolution"); const body = parseCart(cartResolutionSchema, req.body); res.json(successResponse("Cart resolution completed", await this.resolutions.resolve({ customerId: customer.customerId, customerExpiresAt: customer.expiresAt, guestSessionId: guest.guestSessionId, guestExpiresAt: guest.expiresAt, ...body }))); } catch (error) { next(error); } };
  checkoutReadiness: RequestHandler = async (_req, res, next) => { try { const customer = cartSessionState(res).customer!; res.json(successResponse("Cart is ready for checkout", await this.checkout.getCheckoutReady(customer.customerId, customer.expiresAt))); } catch (error) { next(error); } };
}
