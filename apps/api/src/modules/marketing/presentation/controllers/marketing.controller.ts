// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { Request, Response, NextFunction } from "express";
import type { MarketingCampaignService } from "../../application/services/interfaces/marketing-campaign.service";
import type { MarketingPublisherService } from "../../application/services/interfaces/marketing-publisher.service";
import type { MarketingArtifactService } from "../../application/services/interfaces/marketing-artifact-generator.service";
import {
  createMarketingCampaignSchema,
  listMarketingCampaignsSchema,
  cancelMarketingCampaignSchema,
  approveMarketingCampaignSchema,
  requestRevisionMarketingCampaignSchema,
  qualityFeedbackMarketingCampaignSchema,
} from "../validators/marketing.validator";
import { ApplicationError } from "../../../../shared/http/application-error";
import type { StaffPrincipal } from "../../../../shared/auth/staff-principal";
import { MarketingApplicationError } from "../middleware/marketing-error.middleware";
import { FacebookPublisherError } from "../../application/ports/facebook-publisher.port";

function getParam(val: unknown): string {
  if (Array.isArray(val)) return String(val[0] ?? "");
  return typeof val === "string" ? val : "";
}

export class MarketingController {
  constructor(
    private readonly service: MarketingCampaignService,
    private readonly artifactService?: MarketingArtifactService,
    private readonly publisherService?: MarketingPublisherService,
  ) {}

  createCampaign = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const principal = res.locals.staffPrincipal as StaffPrincipal | undefined;
      if (!principal) {
        throw new ApplicationError(401, "UNAUTHORIZED", "Authentication required");
      }

      const idempotencyKey = req.headers["idempotency-key"] as string | undefined;
      if (!idempotencyKey) {
        throw new ApplicationError(400, "MISSING_IDEMPOTENCY_KEY", "Idempotency-Key header is required");
      }

      const parsedBody = createMarketingCampaignSchema.parse(req.body);

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
      const campaignId = getParam(req.params.campaignId);
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

      const campaignId = getParam(req.params.campaignId);
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

      const campaignId = getParam(req.params.campaignId);
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

  approveCampaign = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const principal = res.locals.staffPrincipal as StaffPrincipal | undefined;
      if (!principal) {
        throw new ApplicationError(401, "UNAUTHORIZED", "Authentication required");
      }

      const campaignId = getParam(req.params.campaignId);
      if (!campaignId) {
        throw new ApplicationError(400, "INVALID_CAMPAIGN_ID", "Campaign ID is required.");
      }

      const parsed = approveMarketingCampaignSchema.parse(req.body);
      const result = await this.service.approveCampaign(principal.subject, campaignId, parsed);

      if (parsed.decision === "approve" && this.publisherService) {
        try {
          const detail = await this.service.getCampaign(campaignId);
          if (detail.currentPackage && detail.brief) {
            const configuredPageId = detail.brief.facebookPageConfigurationId;
            const envPageId = process.env.FACEBOOK_PAGE_ID?.trim();
            const pageId = (/^\d+$/.test(configuredPageId) ? configuredPageId : envPageId) || envPageId || configuredPageId || "1321445584378490";
            const pageAccessToken = parsed.facebookPageAccessToken || process.env.FACEBOOK_PAGE_ACCESS_TOKEN || "default-token";
            await this.publisherService.publishApprovedPackage({
              campaignId,
              packageId: detail.currentPackage.id,
              pageId,
              pageAccessToken,
            });
          }
        } catch {
          // Handled fail-closed inside service
        }
      }

      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  };

  retryPublication = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const principal = res.locals.staffPrincipal as StaffPrincipal | undefined;
      if (!principal) {
        throw new ApplicationError(401, "UNAUTHORIZED", "Authentication required");
      }

      const campaignId = getParam(req.params.campaignId);
      if (!campaignId) {
        throw new ApplicationError(400, "INVALID_CAMPAIGN_ID", "Campaign ID is required.");
      }
      if (!this.publisherService) {
        throw MarketingApplicationError.facebookCredentialsUnavailable();
      }

      const detail = await this.service.getCampaign(campaignId);
      const pkg = detail.currentPackage;
      if (detail.campaign.state !== "failed" || !pkg || pkg.status !== "approved" || detail.publicationRecord) {
        throw MarketingApplicationError.publicationRetryNotAllowed();
      }

      const pageAccessToken = process.env.FACEBOOK_PAGE_ACCESS_TOKEN?.trim();
      if (!pageAccessToken) {
        throw MarketingApplicationError.facebookCredentialsUnavailable();
      }

      let result;
      const configuredPageId = pkg.facebookPageConfigurationId;
      const envPageId = process.env.FACEBOOK_PAGE_ID?.trim();
      const pageId = (/^\d+$/.test(configuredPageId) ? configuredPageId : envPageId) || envPageId || configuredPageId || "1321445584378490";
      try {
        result = await this.publisherService.publishApprovedPackage({
          campaignId,
          packageId: pkg.id,
          pageId,
          pageAccessToken,
        });
      } catch (error) {
        if (error instanceof FacebookPublisherError) {
          throw new MarketingApplicationError(502, error.code, error.message);
        }
        throw error;
      }
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  };

  requestRevision = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const principal = res.locals.staffPrincipal as StaffPrincipal | undefined;
      if (!principal) {
        throw new ApplicationError(401, "UNAUTHORIZED", "Authentication required");
      }

      const campaignId = getParam(req.params.campaignId);
      if (!campaignId) {
        throw new ApplicationError(400, "INVALID_CAMPAIGN_ID", "Campaign ID is required.");
      }

      const parsed = requestRevisionMarketingCampaignSchema.parse(req.body);
      const result = await this.service.requestRevision(principal.subject, campaignId, parsed);
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  };

  qualityFeedback = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const principal = res.locals.staffPrincipal as StaffPrincipal | undefined;
      if (!principal) {
        throw new ApplicationError(401, "UNAUTHORIZED", "Authentication required");
      }

      const campaignId = getParam(req.params.campaignId);
      if (!campaignId) {
        throw new ApplicationError(400, "INVALID_CAMPAIGN_ID", "Campaign ID is required.");
      }

      const parsed = qualityFeedbackMarketingCampaignSchema.parse(req.body);
      const result = await this.service.qualityFeedback(principal.subject, campaignId, parsed);
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  };

  generateDeliverables = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const campaignId = getParam(req.params.campaignId);
      if (!campaignId) {
        throw new ApplicationError(400, "INVALID_CAMPAIGN_ID", "Campaign ID is required.");
      }
      if (!this.artifactService) {
        throw new ApplicationError(500, "ARTIFACT_SERVICE_UNAVAILABLE", "Artifact service is unavailable");
      }

      const deliverables = await this.artifactService.generateAllDeliverables(campaignId);
      res.status(200).json({ items: deliverables, total: deliverables.length });
    } catch (error) {
      next(error);
    }
  };

  listArtifacts = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const campaignId = getParam(req.params.campaignId);
      if (!campaignId) {
        throw new ApplicationError(400, "INVALID_CAMPAIGN_ID", "Campaign ID is required.");
      }
      if (!this.artifactService) {
        throw new ApplicationError(500, "ARTIFACT_SERVICE_UNAVAILABLE", "Artifact service is unavailable");
      }

      const items = await this.artifactService.listArtifactsByCampaignId(campaignId);
      res.status(200).json({ items, total: items.length });
    } catch (error) {
      next(error);
    }
  };

  downloadArtifact = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const artifactId = getParam(req.params.artifactId);
      if (!artifactId) {
        throw new ApplicationError(400, "INVALID_ARTIFACT_ID", "Artifact ID is required.");
      }
      if (!this.artifactService) {
        throw new ApplicationError(500, "ARTIFACT_SERVICE_UNAVAILABLE", "Artifact service is unavailable");
      }

      const payload = await this.artifactService.getArtifactPayload(artifactId);
      if (!payload) {
        throw new ApplicationError(404, "ARTIFACT_NOT_FOUND", `Artifact ${artifactId} not found.`);
      }

      res.setHeader("Content-Type", payload.artifact.mediaType);
      res.setHeader("Content-Disposition", `attachment; filename="${payload.artifact.filename}"`);
      res.setHeader("Content-Length", payload.buffer.length);
      res.status(200).send(payload.buffer);
    } catch (error) {
      next(error);
    }
  };
}
