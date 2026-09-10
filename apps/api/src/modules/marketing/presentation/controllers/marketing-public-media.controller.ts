// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { NextFunction, Request, Response } from "express";
import type { MarketingPublicMediaPayload, MarketingPublicMediaService } from "../../application/services/interfaces/marketing-public-media.service";
import { MarketingPublicMediaAccessError } from "../../application/services/interfaces/marketing-public-media.service";
import {
  getValidatedMarketingPublicMediaClaim,
  marketingMediaNotFound,
} from "../middleware/marketing-public-media-claim.middleware";

export class MarketingPublicMediaController {
  constructor(private readonly service: MarketingPublicMediaService) {}

  get = async (_request: Request, response: Response, next: NextFunction): Promise<void> => {
    await this.respond(response, next, true);
  };

  head = async (_request: Request, response: Response, next: NextFunction): Promise<void> => {
    await this.respond(response, next, false);
  };

  private async respond(
    response: Response,
    next: NextFunction,
    includeBody: boolean,
  ): Promise<void> {
    try {
      const input = getValidatedMarketingPublicMediaClaim(response);
      const payload = await this.service.read(input);
      this.setHeaders(response, payload);
      if (includeBody) {
        response.status(200);
        response.write(payload.bytes);
        response.end();
      } else {
        response.status(200).end();
      }
    } catch (error) {
      if (error instanceof MarketingPublicMediaAccessError) {
        next(marketingMediaNotFound());
        return;
      }
      next(error);
    }
  }

  private setHeaders(response: Response, payload: MarketingPublicMediaPayload): void {
    response.setHeader("Content-Type", payload.mediaType);
    response.setHeader("Content-Length", String(payload.bytes.byteLength));
    response.setHeader("ETag", `"${payload.outputDigest}"`);
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.setHeader("Cache-Control", "private, no-store");
  }
}
