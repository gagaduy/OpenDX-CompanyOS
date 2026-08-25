// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { CreatePromotionRequest, PromotionCommandContext, PromotionDto, UpdatePromotionRequest } from "../../dtos/promotion.dto";

export interface PromotionServiceContract {
  list(): Promise<readonly PromotionDto[]>;
  create(request: CreatePromotionRequest, context: PromotionCommandContext): Promise<PromotionDto>;
  update(id: string, request: UpdatePromotionRequest, context: PromotionCommandContext): Promise<PromotionDto>;
}
