// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { NextFunction, Request, Response } from "express";
import type { StaffPrincipal } from "../../../../shared/auth/staff-principal";
import { ApplicationError } from "../../../../shared/http/application-error";
import type { AiMerchandisingService } from "../../application/services/implementations/ai-merchandising.service";

export class AiMerchandisingController {
  constructor(private readonly service: AiMerchandisingService) {}

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
      next(error);
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
      next(error);
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
      next(error);
    }
  };
}
