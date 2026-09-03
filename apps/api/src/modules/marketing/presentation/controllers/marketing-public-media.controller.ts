// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { ApplicationError } from "../../../../shared/http/application-error";
import type { MarketingPublicMediaPayload, MarketingPublicMediaService } from "../../application/services/interfaces/marketing-public-media.service";
import { MarketingPublicMediaAccessError } from "../../application/services/interfaces/marketing-public-media.service";
import { parseMarketingPublicMediaRequest } from "../validators/marketing-public-media.validator";

function mediaNotFound(): ApplicationError {
  return new ApplicationError(
    404,
    "MARKETING_MEDIA_NOT_FOUND",
    "Marketing media is unavailable",
  );
}

export class MarketingPublicMediaController {
  constructor(private readonly service: MarketingPublicMediaService) {}

  get = async (request: Request, response: Response, next: NextFunction): Promise<void> => {
    await this.respond(request, response, next, true);
  };

  head = async (request: Request, response: Response, next: NextFunction): Promise<void> => {
    await this.respond(request, response, next, false);
  };

  private async respond(
    request: Request,
    response: Response,
    next: NextFunction,
    includeBody: boolean,
  ): Promise<void> {
    try {
      const input = parseMarketingPublicMediaRequest({
        params: request.params,
        query: request.query,
      });
      const payload = await this.service.read(input);
      this.setHeaders(response, payload);
      if (includeBody) {
        response.status(200).send(payload.bytes);
      } else {
        response.status(200).end();
      }
    } catch (error) {
      if (error instanceof ZodError || error instanceof MarketingPublicMediaAccessError) {
        next(mediaNotFound());
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
