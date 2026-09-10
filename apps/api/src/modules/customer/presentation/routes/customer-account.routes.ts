// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0
import { Router, type RequestHandler } from "express";
import type { CustomerAccountController } from "../controllers/customer-account.controller";
export function createCustomerAccountRouter(
  c: CustomerAccountController,
  auth: RequestHandler,
  origin: RequestHandler,
  csrf: RequestHandler,
) {
  const r = Router();
  r.use("/account", auth);
  r.get("/account", c.get);
  r.patch("/account", origin, csrf, c.update);
  r.get("/account/addresses", c.listAddresses);
  r.post("/account/addresses", origin, csrf, c.createAddress);
  r.patch("/account/addresses/:addressId", origin, csrf, c.updateAddress);
  r.delete("/account/addresses/:addressId", origin, csrf, c.deleteAddress);
  r.post(
    "/account/addresses/:addressId/default",
    origin,
    csrf,
    c.defaultAddress,
  );
  r.get("/account/wishlist", c.listWishlist);
  r.put(
    "/account/wishlist/items/:productId",
    origin,
    csrf,
    c.addWishlistItem,
  );
  r.delete(
    "/account/wishlist/items/:productId",
    origin,
    csrf,
    c.removeWishlistItem,
  );
  return r;
}
