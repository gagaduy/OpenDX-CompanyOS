// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { NextFunction, Request, Response } from "express";
import type { StaffPrincipal } from "../../../../shared/auth/staff-principal";
import { ApplicationError } from "../../../../shared/http/application-error";
import { CatalogApplicationError } from "../../application/services/catalog-application.error";
import type { AiMerchandisingService } from "../../application/services/implementations/ai-merchandising.service";
import type { ProductMediaStorage } from "../../application/storage/product-media.storage";

function toHttpError(error: unknown): unknown {
  if (!(error instanceof CatalogApplicationError)) return error;
  const status = error.code === "NOT_FOUND" ? 404 : error.code === "CONFLICT" ? 409 : 400;
  return new ApplicationError(status, error.code, error.message);
}

export class AiMerchandisingController {
  constructor(
    private readonly service: AiMerchandisingService,
    private readonly mediaStorage?: ProductMediaStorage,
  ) {}

  generateProposal = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const principal = res.locals.staffPrincipal as StaffPrincipal | undefined;
      if (!principal) {
        throw new ApplicationError(401, "UNAUTHORIZED", "Cần đăng nhập nhân sự để thực hiện tác vụ này.");
      }

      const { prompt, targetProductId } = req.body ?? {};
      if (!prompt || typeof prompt !== "string") {
        throw new ApplicationError(400, "INVALID_INPUT", "Nội dung yêu cầu prompt là bắt buộc.");
      }

      const proposal = await this.service.generateProposal({
        prompt,
        targetProductId: typeof targetProductId === "string" ? targetProductId : undefined,
      });

      res.status(200).json(proposal);
    } catch (error) {
      next(toHttpError(error));
    }
  };

  getProposal = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const proposalId = String(req.params.proposalId);
      const proposal = await this.service.getProposal(proposalId);
      if (!proposal) {
        throw new ApplicationError(404, "NOT_FOUND", "Không tìm thấy bản đề xuất này.");
      }
      res.status(200).json(proposal);
    } catch (error) {
      next(toHttpError(error));
    }
  };

  applyProposal = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const principal = res.locals.staffPrincipal as StaffPrincipal | undefined;
      if (!principal) {
        throw new ApplicationError(401, "UNAUTHORIZED", "Cần đăng nhập nhân sự để thực hiện tác vụ này.");
      }

      const { proposalId, customTitle, customDescription, customPriceVnd } = req.body ?? {};
      if (!proposalId || typeof proposalId !== "string") {
        throw new ApplicationError(400, "INVALID_INPUT", "Mã đề xuất proposalId là bắt buộc.");
      }

      const correlationId = String(req.headers["x-correlation-id"] || "ai-merchandising-apply");
      const result = await this.service.applyProposal(
        {
          proposalId,
          customTitle: typeof customTitle === "string" ? customTitle : undefined,
          customDescription: typeof customDescription === "string" ? customDescription : undefined,
          customPriceVnd: typeof customPriceVnd === "number" ? customPriceVnd : undefined,
        },
        {
          actorId: principal.subject,
          correlationId,
        },
      );

      res.status(200).json(result);
    } catch (error) {
      next(toHttpError(error));
    }
  };

  // ---------------------------------------------------------------------------
  // CAMPAIGN ENGINE CONTROLLER METHODS
  // ---------------------------------------------------------------------------

  generateCampaignProposal = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const principal = res.locals.staffPrincipal as StaffPrincipal | undefined;
      if (!principal) {
        throw new ApplicationError(401, "UNAUTHORIZED", "Cần đăng nhập nhân sự để thực hiện tác vụ này.");
      }

      const { prompt, durationDays, discountPercent, themeKey } = req.body ?? {};
      if (!prompt || typeof prompt !== "string") {
        throw new ApplicationError(400, "INVALID_INPUT", "Nội dung yêu cầu prompt là bắt buộc.");
      }

      const proposal = await this.service.generateCampaignProposal(
        {
          prompt,
          durationDays: typeof durationDays === "number" ? durationDays : undefined,
          discountPercent: typeof discountPercent === "number" ? discountPercent : undefined,
          themeKey: typeof themeKey === "string" ? themeKey : undefined,
        },
        { actorId: principal.subject },
      );

      res.status(200).json(proposal);
    } catch (error) {
      next(toHttpError(error));
    }
  };

  activateCampaign = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const principal = res.locals.staffPrincipal as StaffPrincipal | undefined;
      if (!principal) {
        throw new ApplicationError(401, "UNAUTHORIZED", "Cần đăng nhập nhân sự để thực hiện tác vụ này.");
      }

      const campaignId = String(req.params.campaignId);
      const { endDate, excludedItemIds } = req.body ?? {};
      const correlationId = String(req.headers["x-correlation-id"] || `campaign-activate-${Date.now()}`);

      const result = await this.service.activateCampaign(
        campaignId,
        {
          actorId: principal.subject,
          correlationId,
        },
        {
          endDate: typeof endDate === "string" ? endDate : undefined,
          excludedItemIds: Array.isArray(excludedItemIds) ? excludedItemIds : undefined,
        },
      );

      res.status(200).json(result);
    } catch (error) {
      next(toHttpError(error));
    }
  };

  revertCampaign = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const principal = res.locals.staffPrincipal as StaffPrincipal | undefined;
      if (!principal) {
        throw new ApplicationError(401, "UNAUTHORIZED", "Cần đăng nhập nhân sự để thực hiện tác vụ này.");
      }

      const campaignId = String(req.params.campaignId);
      const correlationId = String(req.headers["x-correlation-id"] || `campaign-revert-${Date.now()}`);

      const result = await this.service.revertCampaign(campaignId, {
        actorId: principal.subject,
        correlationId,
      });

      res.status(200).json(result);
    } catch (error) {
      next(toHttpError(error));
    }
  };

  getActiveCampaign = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const active = await this.service.getActiveCampaign();
      res.status(200).json(active);
    } catch (error) {
      next(toHttpError(error));
    }
  };

  getMediaContent = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const rawKey = req.query.key;
      if (!rawKey || typeof rawKey !== "string") {
        throw new ApplicationError(400, "INVALID_INPUT", "Tham số storage key là bắt buộc.");
      }
      const key = decodeURIComponent(rawKey).trim();
      if (key.includes("..") || key.startsWith("/") || key.includes("\\")) {
        throw new ApplicationError(400, "INVALID_INPUT", "Định dạng storage key không hợp lệ.");
      }
      const isAllowedPrefix =
        key.startsWith("products/") ||
        key.startsWith("campaigns/") ||
        key.startsWith("seed/") ||
        key.startsWith("marketing/");
      const isAllowedExt = /\.(webp|png|jpg|jpeg|avif)$/i.test(key);
      if (!isAllowedPrefix || !isAllowedExt) {
        throw new ApplicationError(400, "INVALID_INPUT", "Storage key không được phép truy cập.");
      }

      if (!this.mediaStorage) {
        throw new ApplicationError(503, "STORAGE_UNAVAILABLE", "Hệ thống lưu trữ hình ảnh chưa được cấu hình.");
      }

      let bytes: Uint8Array;
      try {
        bytes = await this.mediaStorage.get(key);
      } catch {
        throw new ApplicationError(404, "NOT_FOUND", "Hình ảnh không tồn tại trên hệ thống lưu trữ.");
      }
      const ext = key.split(".").pop()?.toLowerCase() ?? "webp";
      const mimeTypes: Record<string, string> = {
        webp: "image/webp",
        png: "image/png",
        jpg: "image/jpeg",
        jpeg: "image/jpeg",
        avif: "image/avif",
      };
      res.setHeader("Content-Type", mimeTypes[ext] ?? "image/webp");
      res.setHeader("Cache-Control", "public, max-age=86400, stale-while-revalidate=3600");
      res.status(200).send(Buffer.from(bytes));
    } catch (error) {
      next(toHttpError(error));
    }
  };
}
