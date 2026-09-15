// apps/api/src/modules/support/application/services/implementations/email-campaign.service.ts
// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { randomUUID } from "node:crypto";
import { ApplicationError } from "../../../../../shared/http/application-error";
import type {
  CampaignPromotionDetails,
  CampaignProposalStatus,
  CampaignRecipientItem,
  CustomerSegmentType,
  EmailCampaignType,
  FeaturedProductItem,
  SupportEmailCampaignProposal,
} from "../../../domain/entities/email-campaign.entity";
import { validateEmailCampaignProposal } from "../../../domain/entities/email-campaign.entity";
import type {
  ApplyEmailCampaignResult,
  CreateEmailCampaignProposalInput,
} from "../../dtos/email-campaign.dto";
import type { CatalogQueryPort } from "../../ports/catalog-query.port";
import type { PromotionQueryPort } from "../../ports/promotion-query.port";
import type { CustomerSegmentationService } from "./customer-segmentation.service";
import type { SupportEmailComposer } from "./support-email-composer";
import type { EmailCampaignProposalRepository } from "../../repositories/interfaces/email-campaign-proposal.repository";
import type { EmailDispatcherPort } from "../../ports/email-dispatcher.port";
import { generateSupportEmailCampaignDocx } from "../../../infrastructure/generators/support-email-campaign-docx.generator";

export class EmailCampaignService {
  constructor(
    private readonly catalogQueryPort: CatalogQueryPort,
    private readonly promotionQueryPort: PromotionQueryPort,
    private readonly customerSegmentationService: CustomerSegmentationService,
    private readonly supportEmailComposer: SupportEmailComposer,
    private readonly proposalRepository: EmailCampaignProposalRepository,
    private readonly emailDispatcher?: EmailDispatcherPort,
    private readonly generateId: () => string = randomUUID,
    private readonly now: () => string = () => new Date().toISOString(),
  ) {}

  async createProposal(
    input: CreateEmailCampaignProposalInput,
  ): Promise<SupportEmailCampaignProposal> {
    const proposalId = this.generateId();
    const type: EmailCampaignType = input.type || "new_product_announcement";
    const segment: CustomerSegmentType =
      input.targetSegment ||
      (type === "customer_care_vip"
        ? "vip_customers"
        : type === "new_product_announcement"
          ? "recent_buyers"
          : "vip_customers");

    let featuredProducts: FeaturedProductItem[] = [];
    let promotionDetails: CampaignPromotionDetails | undefined;
    let title = "";
    let emailSubject = input.customSubject || "";

    if (type === "new_product_announcement") {
      title = "Thông báo Sản phẩm Mới Đến Khách Hàng";
      if (!emailSubject) {
        emailSubject = "Khám phá các sản phẩm công nghệ mới nhất tại NovaCommerce";
      }

      if (input.productIds && input.productIds.length > 0) {
        const prods = await this.catalogQueryPort.getProductsByIds(input.productIds);
        featuredProducts = prods.map((p) => ({
          productId: p.id,
          name: p.name,
          sku: p.sku,
          regularPriceVnd: p.regularPriceVnd,
          salePriceVnd: p.salePriceVnd,
          imageUrl: p.imageUrl,
          categoryName: p.categoryName,
          storefrontUrl: `https://novacommerce.vn/products/${p.id}`,
        }));
      }

      if (featuredProducts.length === 0) {
        const recents = await this.catalogQueryPort.getRecentProducts(6);
        featuredProducts = recents.map((p) => ({
          productId: p.id,
          name: p.name,
          sku: p.sku,
          regularPriceVnd: p.regularPriceVnd,
          salePriceVnd: p.salePriceVnd,
          imageUrl: p.imageUrl,
          categoryName: p.categoryName,
          storefrontUrl: `https://novacommerce.vn/products/${p.id}`,
        }));
      }
    } else if (type === "promotion_announcement") {
      let promo;
      if (input.promotionId) {
        promo = await this.promotionQueryPort.getPromotionById(input.promotionId);
      }
      if (!promo) {
        const active = await this.promotionQueryPort.getActivePromotions();
        if (active.length > 0) {
          promo = active[0];
        } else {
          const upcoming = await this.promotionQueryPort.getUpcomingPromotions();
          if (upcoming.length > 0) {
            promo = upcoming[0];
          }
        }
      }

      if (promo) {
        promotionDetails = {
          campaignId: promo.id,
          campaignName: promo.name,
          discountPercent: promo.discountPercent,
          voucherCode: promo.code,
          startTime: promo.startsAt,
          endTime: promo.endsAt,
          description: promo.description,
        };
      }

      title = `Ưu Đãi Đặc Biệt: ${promotionDetails?.campaignName || "Chương trình khuyến mãi"}`;
      if (!emailSubject) {
        emailSubject = `[Ưu Đãi Đặc Biệt] Nhận ngay voucher giảm giá tại NovaCommerce`;
      }

      const recents = await this.catalogQueryPort.getRecentProducts(4);
      featuredProducts = recents.map((p) => ({
        productId: p.id,
        name: p.name,
        sku: p.sku,
        regularPriceVnd: p.regularPriceVnd,
        salePriceVnd: promotionDetails?.discountPercent
          ? Math.round(p.regularPriceVnd * (1 - promotionDetails.discountPercent / 100))
          : p.salePriceVnd,
        imageUrl: p.imageUrl,
        categoryName: p.categoryName,
        storefrontUrl: `https://novacommerce.vn/products/${p.id}`,
      }));
    } else if (type === "customer_care_vip") {
      title = "Tri Ân Khách Hàng Thân Thiết & VIP";
      if (!emailSubject) {
        emailSubject = "[NovaCommerce] Món quà tri ân đặc quyền dành riêng cho bạn";
      }

      const recents = await this.catalogQueryPort.getRecentProducts(3);
      featuredProducts = recents.map((p) => ({
        productId: p.id,
        name: p.name,
        sku: p.sku,
        regularPriceVnd: p.regularPriceVnd,
        salePriceVnd: p.salePriceVnd,
        imageUrl: p.imageUrl,
        categoryName: p.categoryName,
        storefrontUrl: `https://novacommerce.vn/products/${p.id}`,
      }));
    }

    // Segment customers
    const recipients =
      await this.customerSegmentationService.getRecipientsForSegment(segment);

    if (recipients.length === 0) {
      throw new ApplicationError(
        400,
        "NO_CUSTOMERS_IN_SEGMENT",
        `Không tìm thấy khách hàng nào trong phân khúc: ${segment}`,
      );
    }

    // Compose preview HTML
    const previewRecipientName = recipients[0]?.fullName || "Quý khách";
    const htmlContent = this.supportEmailComposer.composeEmail({
      type,
      recipientName: previewRecipientName,
      emailSubject,
      featuredProducts,
      promotionDetails,
    });

    const docxFilename = `ke_hoach_email_${proposalId.slice(0, 8)}.docx`;
    const createdAt = this.now();

    const proposal: SupportEmailCampaignProposal = {
      id: proposalId,
      type,
      title,
      emailSubject,
      targetSegment: segment,
      recipients,
      totalRecipients: recipients.length,
      selectedCount: recipients.length,
      featuredProducts,
      promotionDetails,
      htmlContent,
      docxFilename,
      status: "pending_approval",
      createdAt,
      updatedAt: createdAt,
    };

    validateEmailCampaignProposal(proposal);
    await this.proposalRepository.save(proposal);

    return proposal;
  }

  async getProposal(id: string): Promise<SupportEmailCampaignProposal> {
    const proposal = await this.proposalRepository.findById(id);
    if (!proposal) {
      throw new ApplicationError(
        404,
        "PROPOSAL_NOT_FOUND",
        `Không tìm thấy đề xuất chiến dịch email: ${id}`,
      );
    }
    return proposal;
  }

  async listProposals(filter?: {
    status?: CampaignProposalStatus;
    limit?: number;
  }): Promise<readonly SupportEmailCampaignProposal[]> {
    return this.proposalRepository.list(filter);
  }

  async applyProposal(
    id: string,
    actorId: string,
    selectedRecipientIds?: string[],
  ): Promise<ApplyEmailCampaignResult> {
    const proposal = await this.getProposal(id);

    if (proposal.status === "sent") {
      throw new ApplicationError(
        409,
        "PROPOSAL_ALREADY_SENT",
        "Chiến dịch email này đã được gửi trước đó.",
      );
    }

    if (!actorId || actorId.trim().length === 0) {
      throw new ApplicationError(
        400,
        "VALIDATION_ERROR",
        "Cần thông tin nhân viên duyệt chiến dịch.",
      );
    }

    const updatedRecipients = proposal.recipients.map((r) => ({
      ...r,
      isSelected: selectedRecipientIds
        ? selectedRecipientIds.includes(r.customerId)
        : r.isSelected,
    }));

    const toSend = updatedRecipients.filter((r) => r.isSelected);
    if (toSend.length === 0) {
      throw new ApplicationError(
        400,
        "NO_RECIPIENTS_SELECTED",
        "Cần chọn ít nhất 1 người nhận để gửi chiến dịch email.",
      );
    }

    let successful = 0;
    let failed = 0;

    for (let i = 0; i < updatedRecipients.length; i++) {
      const rec = updatedRecipients[i];
      if (!rec.isSelected) continue;

      try {
        if (this.emailDispatcher) {
          const personalizedHtml = this.supportEmailComposer.composeEmail({
            type: proposal.type,
            recipientName: rec.fullName,
            emailSubject: proposal.emailSubject,
            featuredProducts: proposal.featuredProducts,
            promotionDetails: proposal.promotionDetails,
          });

          if (this.emailDispatcher.sendCampaignEmail) {
            await this.emailDispatcher.sendCampaignEmail({
              to: rec.email,
              toName: rec.fullName,
              subject: proposal.emailSubject,
              htmlBody: personalizedHtml,
              campaignId: proposal.id,
            });
          } else {
            await this.emailDispatcher.sendSupportResolutionEmail({
              to: rec.email,
              toName: rec.fullName,
              subject: proposal.emailSubject,
              textBody: proposal.emailSubject,
              htmlBody: personalizedHtml,
              ticketId: proposal.id,
              voucherCode: proposal.promotionDetails?.voucherCode,
            });
          }
        }

        updatedRecipients[i] = {
          ...rec,
          sentStatus: "sent",
        };
        successful++;
      } catch (err: any) {
        updatedRecipients[i] = {
          ...rec,
          sentStatus: "failed",
          errorMessage: err?.message || String(err),
        };
        failed++;
      }
    }

    const dispatchedAt = this.now();
    const finalStatus: CampaignProposalStatus =
      failed === 0 ? "sent" : successful > 0 ? "partially_sent" : "approved";

    const updatedProposal: SupportEmailCampaignProposal = {
      ...proposal,
      recipients: updatedRecipients,
      selectedCount: toSend.length,
      status: finalStatus,
      updatedAt: dispatchedAt,
      sentAt: dispatchedAt,
      executionSummary: {
        successfulDispatches: successful,
        failedDispatches: failed,
        dispatchedAt,
      },
    };

    await this.proposalRepository.save(updatedProposal);

    return {
      proposalId: proposal.id,
      status: finalStatus === "partially_sent" ? "partially_sent" : "sent",
      totalDispatched: toSend.length,
      successfulDispatches: successful,
      failedDispatches: failed,
      dispatchedAt,
    };
  }

  async cancelProposal(
    id: string,
    actorId: string,
  ): Promise<SupportEmailCampaignProposal> {
    const proposal = await this.getProposal(id);

    if (proposal.status === "sent") {
      throw new ApplicationError(
        409,
        "PROPOSAL_ALREADY_SENT",
        "Không thể huỷ chiến dịch email đã được gửi.",
      );
    }

    if (!actorId || actorId.trim().length === 0) {
      throw new ApplicationError(
        400,
        "VALIDATION_ERROR",
        "Cần thông tin nhân viên huỷ đề xuất.",
      );
    }

    const updatedProposal: SupportEmailCampaignProposal = {
      ...proposal,
      status: "rejected",
      updatedAt: this.now(),
    };

    await this.proposalRepository.save(updatedProposal);
    return updatedProposal;
  }

  async getDocxDeliverable(id: string): Promise<{
    buffer: Buffer;
    filename: string;
    mediaType: string;
  }> {
    const proposal = await this.getProposal(id);
    return generateSupportEmailCampaignDocx(proposal);
  }
}
