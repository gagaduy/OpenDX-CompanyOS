// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0
import { Router,type RequestHandler } from "express"; import type { CustomerAuthController } from "../controllers/customer-auth.controller";
export function createCustomerAuthRouter(c:CustomerAuthController,origin:RequestHandler,csrf:RequestHandler,rate:RequestHandler){const r=Router();r.post("/guest-sessions",origin,c.guest);r.post("/auth/google",origin,rate,c.google);r.get("/session",c.session);r.post("/logout",origin,csrf,c.logout);return r;}
