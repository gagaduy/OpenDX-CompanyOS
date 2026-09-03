// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { Router } from "express";
import rateLimit from "express-rate-limit";
import type { MarketingPublicMediaService } from "../../application/services/interfaces/marketing-public-media.service";
import { MarketingPublicMediaController } from "../controllers/marketing-public-media.controller";

export interface CreateMarketingPublicMediaRouterOptions {
  readonly service: MarketingPublicMediaService;
  readonly rateLimit: number;
  readonly rateWindowMs: number;
}

export function createMarketingPublicMediaRouter(
  options: CreateMarketingPublicMediaRouterOptions,
): Router {
  const router = Router();
  const controller = new MarketingPublicMediaController(options.service);
  const limiter = rateLimit({
    windowMs: options.rateWindowMs,
    limit: options.rateLimit,
    standardHeaders: "draft-8",
    legacyHeaders: false,
  });

  router.head("/:assetId", limiter, controller.head);
  router.get("/:assetId", limiter, controller.get);
  return router;
}
