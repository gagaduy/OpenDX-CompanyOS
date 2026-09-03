// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { createHash } from "node:crypto";
import type { RequestHandler, Response } from "express";
import { ZodError } from "zod";
import { ApplicationError } from "../../../../shared/http/application-error";
import type {
  MarketingPublicMediaService,
  ReadMarketingPublicMediaInput,
} from "../../application/services/interfaces/marketing-public-media.service";
import { MarketingPublicMediaAccessError } from "../../application/services/interfaces/marketing-public-media.service";
import { parseMarketingPublicMediaRequest } from "../validators/marketing-public-media.validator";

const CLAIM_LOCAL = "marketingPublicMediaClaim";

export function marketingMediaNotFound(): ApplicationError {
  return new ApplicationError(
    404,
    "MARKETING_MEDIA_NOT_FOUND",
    "Marketing media is unavailable",
  );
}

export function validateMarketingPublicMediaClaim(
  service: MarketingPublicMediaService,
): RequestHandler {
  return (request, response, next) => {
    try {
      const claim = parseMarketingPublicMediaRequest({
        params: request.params,
        query: request.query,
      });
      service.assertValidClaim(claim);
      response.locals[CLAIM_LOCAL] = claim;
      next();
    } catch (error) {
      if (error instanceof ZodError || error instanceof MarketingPublicMediaAccessError) {
        next(marketingMediaNotFound());
        return;
      }
      next(error);
    }
  };
}

export function getValidatedMarketingPublicMediaClaim(
  response: Response,
): ReadMarketingPublicMediaInput {
  const claim = response.locals[CLAIM_LOCAL] as ReadMarketingPublicMediaInput | undefined;
  if (claim === undefined) {
    throw new Error("Validated Marketing public media claim is missing");
  }
  return claim;
}

export function hashValidatedMarketingPublicMediaClaim(response: Response): string {
  const claim = getValidatedMarketingPublicMediaClaim(response);
  return createHash("sha256")
    .update([
      "v1",
      claim.assetId,
      claim.sourceDigest,
      claim.policy,
      claim.outputDigest,
      String(claim.expires),
      claim.signature,
    ].join("\n"))
    .digest("hex");
}
