// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { Router } from "express";
import rateLimit from "express-rate-limit";
import type { MarketingPublicMediaService } from "../../application/services/interfaces/marketing-public-media.service";
import { MarketingPublicMediaController } from "../controllers/marketing-public-media.controller";
import {
  hashValidatedMarketingPublicMediaClaim,
  validateMarketingPublicMediaClaim,
} from "../middleware/marketing-public-media-claim.middleware";

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
  const validateClaim = validateMarketingPublicMediaClaim(options.service);
  const limiter = rateLimit({
    windowMs: options.rateWindowMs,
    limit: options.rateLimit,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    keyGenerator: (_request, response) =>
      hashValidatedMarketingPublicMediaClaim(response),
  });

  router.head("/:assetId", validateClaim, limiter, controller.head);
  router.get("/:assetId", validateClaim, limiter, controller.get);
  return router;
}
