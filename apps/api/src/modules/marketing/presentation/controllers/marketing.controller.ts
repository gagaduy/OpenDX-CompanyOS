// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { Request, Response, NextFunction } from "express";
import type { IMarketingCampaignService } from "../../application/services/interfaces/marketing-campaign.service";
import {
  cancelMarketingCampaignSchema,
  createMarketingCampaignSchema,
  listMarketingCampaignsSchema,
} from "../validators/marketing.validator";
import type { StaffPrincipal } from "../../../../shared/auth/staff-principal";
import { ApplicationError } from "../../../../shared/http/application-error";

export class MarketingController {
  constructor(private readonly service: IMarketingCampaignService) {}

  createCampaign = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const principal = res.locals.staffPrincipal as StaffPrincipal | undefined;
      if (!principal) {
        throw new ApplicationError(401, "UNAUTHORIZED", "Authentication required");
      }

      const idempotencyKeyHeader = req.header("Idempotency-Key") ?? req.header("idempotency-key");
      const parsedBody = createMarketingCampaignSchema.parse(req.body);
      const idempotencyKey = idempotencyKeyHeader ?? parsedBody.idempotencyKey;

      if (!idempotencyKey) {
        throw new ApplicationError(400, "MISSING_IDEMPOTENCY_KEY", "Idempotency-Key header is required.");
      }

      const result = await this.service.createCampaign(principal.subject, {
        ...parsedBody,
        idempotencyKey,
      });

      res.status(201).json(result);
    } catch (error) {
      next(error);
    }
  };

  getCampaign = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const campaignId = req.params.campaignId;
      if (!campaignId) {
        throw new ApplicationError(400, "INVALID_CAMPAIGN_ID", "Campaign ID is required.");
      }

      const result = await this.service.getCampaign(campaignId);
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  };

  listCampaigns = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const query = listMarketingCampaignsSchema.parse(req.query);
      const result = await this.service.listCampaigns(query);
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  };

  markReady = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const principal = res.locals.staffPrincipal as StaffPrincipal | undefined;
      if (!principal) {
        throw new ApplicationError(401, "UNAUTHORIZED", "Authentication required");
      }

      const campaignId = req.params.campaignId;
      if (!campaignId) {
        throw new ApplicationError(400, "INVALID_CAMPAIGN_ID", "Campaign ID is required.");
      }

      const result = await this.service.markReady(principal.subject, campaignId);
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  };

  cancelCampaign = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const principal = res.locals.staffPrincipal as StaffPrincipal | undefined;
      if (!principal) {
        throw new ApplicationError(401, "UNAUTHORIZED", "Authentication required");
      }

      const campaignId = req.params.campaignId;
      if (!campaignId) {
        throw new ApplicationError(400, "INVALID_CAMPAIGN_ID", "Campaign ID is required.");
      }

      const parsed = cancelMarketingCampaignSchema.parse(req.body);
      const result = await this.service.cancelCampaign(principal.subject, campaignId, parsed.reason);
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  };
}
