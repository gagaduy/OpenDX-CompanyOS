// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { randomUUID } from "node:crypto";
import nodemailer from "nodemailer";
import type { Pool } from "pg";
import type { MarketingPublisherService, PublishDueTargetsOptions } from "../interfaces/marketing-publisher.service";
import type { MarketingRepository } from "../../repositories/interfaces/marketing.repository";
import { FacebookPublisherError } from "../../ports/facebook-publisher.port";
import {
  type SocialPublicationReceipt,
  type SocialPublisherPort,
  SocialPublisherError,
} from "../../ports/social-publisher.port";
import type { SocialPublisherRegistry } from "./social-publisher-registry";
import type {
  MarketingCampaignState,
  PublicationAttempt,
  PublicationRecord,
  PublicationTarget,
  PublicationTargetStatus,
} from "../../../domain/entities/marketing-campaign";
import {
  calculatePublicationTargetDigest,
  deriveAggregatePublicationStatus,
} from "../../../domain/services/marketing-publication-policy";
import { MarketingApplicationError } from "../../../presentation/middleware/marketing-error.middleware";
import type { PublishPackageRequest } from "../interfaces/marketing-publisher.service";

export interface MarketingPublisherServiceOptions {
  readonly marketingRepository: MarketingRepository;
  readonly publisherRegistry: SocialPublisherRegistry;
  readonly assetStorageReader?: (storageKey: string) => Promise<Buffer>;
  readonly database?: Pool;
  readonly now?: () => string;
  readonly generateId?: () => string;
  readonly defaultWorkerId?: string;
  readonly leaseSeconds?: number;
}

export class MarketingPublisherServiceImpl implements MarketingPublisherService {
  private readonly marketingRepository: MarketingRepository;
  private readonly publisherRegistry: SocialPublisherRegistry;
  private readonly assetStorageReader?: (storageKey: string) => Promise<Buffer>;
  private readonly database?: Pool;
  private readonly now: () => string;
  private readonly generateId: () => string;
  private readonly defaultWorkerId: string;
  private readonly leaseSeconds: number;

  constructor(options: MarketingPublisherServiceOptions) {
    this.marketingRepository = options.marketingRepository;
    this.publisherRegistry = options.publisherRegistry;
    this.assetStorageReader = options.assetStorageReader;
    this.database = options.database;
    this.now = options.now ?? (() => new Date().toISOString());
    this.generateId = options.generateId ?? randomUUID;
    this.defaultWorkerId = options.defaultWorkerId ?? `publisher-worker-${randomUUID().slice(0, 8)}`;
    this.leaseSeconds = options.leaseSeconds ?? 30;
  }

  async publishDueTargets(options?: PublishDueTargetsOptions): Promise<readonly PublicationRecord[]> {
    const workerId = options?.workerId ?? this.defaultWorkerId;
    const limit = options?.limit ?? 10;
    const now = this.now();

    const claimedTargets = await this.marketingRepository.claimDuePublicationTargets({
      workerId,
      now,
      leaseSeconds: this.leaseSeconds,
      limit,
    });

    const records: PublicationRecord[] = [];
    for (const target of claimedTargets) {
      try {
        const record = await this.publishTarget(target.id, workerId);
        records.push(record);
      } catch (err) {
        console.error(`Failed to publish claimed target ${target.id}:`, err);
      }
    }

    return records;
  }

  async publishTarget(targetId: string, workerId?: string): Promise<PublicationRecord> {
    const target = await this.marketingRepository.findPublicationTargetById(targetId);
    if (!target) {
      throw new MarketingApplicationError(
        404,
        "PUBLICATION_TARGET_NOT_FOUND",
        `Publication target '${targetId}' was not found.`,
      );
    }

    const pkg = await this.marketingRepository.findPublicationPackageById(target.packageId);
    if (!pkg) {
      throw MarketingApplicationError.packageNotFound(target.packageId);
    }

    const campaign = await this.marketingRepository.findCampaignById(pkg.campaignId);
    if (!campaign) {
      throw MarketingApplicationError.campaignNotFound(pkg.campaignId);
    }

    // 1. Idempotency Check: if target already has a publication record, return it
    const existingRecord = await this.marketingRepository.findPublicationRecordByTargetId(target.id);
    if (existingRecord) {
      if (workerId) {
        await this.marketingRepository.releasePublicationTargetLease(target.id, workerId);
      }
      return existingRecord;
    }

    // 2. Storage Check
    if (!this.assetStorageReader) {
      throw MarketingApplicationError.assetStorageUnavailable();
    }

    // 3. Digest Validation
    const computedTargetDigest = calculatePublicationTargetDigest({
      platform: target.platform,
      format: target.format,
      accountConfigurationId: target.accountConfigurationId,
      mediaAssetIds: target.mediaAssetIds,
      caption: target.caption,
      scheduledFor: target.scheduledFor,
      executionMode: target.executionMode,
    });

    if (computedTargetDigest !== target.targetDigest) {
      throw new MarketingApplicationError(
        409,
        "TARGET_DIGEST_MISMATCH",
        `Publication target '${target.id}' digest mismatch. Expected ${target.targetDigest}, got ${computedTargetDigest}.`,
      );
    }

    // 4. Resolve publisher adapter from registry
    const publisher = this.publisherRegistry.resolve(target.platform, target.executionMode);
    if (!publisher) {
      throw new MarketingApplicationError(
        500,
        "PUBLISHER_ADAPTER_NOT_FOUND",
        `No publisher adapter registered for platform '${target.platform}' in mode '${target.executionMode}'.`,
      );
    }

    // 5. Load Visual Assets
    const mediaItems: Array<{ id: string; bytes: Buffer; mimeType: "image/png"; fileName: string }> = [];
    for (const assetId of target.mediaAssetIds) {
      const asset = await this.marketingRepository.findVisualAssetById(assetId);
      if (!asset) {
        throw new MarketingApplicationError(
          404,
          "VISUAL_ASSET_NOT_FOUND",
          `Visual asset '${assetId}' required by target '${target.id}' was not found.`,
        );
      }
      const bytes = await this.assetStorageReader(asset.storageKey);
      mediaItems.push({
        id: asset.id,
        bytes,
        mimeType: asset.mediaType,
        fileName: `${asset.id}.png`,
      });
    }

    // 6. Record Publication Attempt (started)
    const attemptId = this.generateId();
    const attempt: PublicationAttempt = {
      id: attemptId,
      packageId: target.packageId,
      targetId: target.id,
      attemptKey: `target:${target.id}:${attemptId}`,
      platform: target.platform,
      pageConfigurationId: target.accountConfigurationId,
      executionMode: target.executionMode,
      status: "started",
      errorCode: null,
      errorClass: null,
      responseDigest: null,
      startedAt: this.now(),
      finishedAt: null,
    };
    await this.marketingRepository.createPublicationAttempt(attempt);
    await this.marketingRepository.updatePublicationTargetStatus({
      targetId: target.id,
      status: "publishing",
    });

    // 7. Execute publication via adapter
    let receipt: SocialPublicationReceipt;
    try {
      receipt = await publisher.publish({
        target,
        caption: target.caption,
        media: mediaItems,
      });
    } catch (error: any) {
      const errorCode =
        error instanceof SocialPublisherError || error instanceof FacebookPublisherError
          ? error.code
          : error.name || "PUBLICATION_FAILED";
      const outcomeKnown = error instanceof SocialPublisherError
        ? error.outcomeKnown
        : true;
      const errorClass =
        !outcomeKnown
          ? "unknown"
          : (error instanceof SocialPublisherError || error instanceof FacebookPublisherError) && error.retryable
          ? "retryable"
          : "fatal";
      const targetFailedStatus: PublicationTargetStatus =
        !outcomeKnown
          ? "publication_unknown"
          : errorCode === "FACEBOOK_PERMISSION_DENIED" || errorCode === "FACEBOOK_POLICY_VIOLATION"
          ? "platform_rejected"
          : "failed";

      await this.marketingRepository.updatePublicationAttempt(
        attemptId,
        outcomeKnown ? "failed" : "unknown",
        this.now(),
        errorCode,
        errorClass,
        null,
        error instanceof SocialPublisherError ? error.providerReference ?? null : null,
      );

      await this.marketingRepository.updatePublicationTargetStatus({
        targetId: target.id,
        status: targetFailedStatus,
      });
      if (workerId) {
        await this.marketingRepository.releasePublicationTargetLease(target.id, workerId);
      }

      await this.synchronizeCampaignState(campaign.id);
      throw error;
    }

    // 8. On Success:
    await this.marketingRepository.updatePublicationAttempt(
      attemptId,
      "succeeded",
      this.now(),
      null,
      null,
      receipt.providerReceiptDigest,
    );

    const record: PublicationRecord = {
      id: this.generateId(),
      packageId: target.packageId,
      targetId: target.id,
      platform: receipt.platform,
      pageId: receipt.pageId || target.accountConfigurationId,
      externalPostId: receipt.externalPublicationId,
      postUrl: receipt.publicationUrl ?? null,
      executionMode: receipt.executionMode,
      simulated: receipt.simulated,
      displayMessage: receipt.displayMessage,
      packageDigest: pkg.packageDigest,
      contentDigest: target.contentDigest,
      imageDigest: target.mediaDigest,
      targetDigest: target.targetDigest,
      providerReceiptDigest: receipt.providerReceiptDigest,
      verificationEvidenceDigest: receipt.verificationEvidenceDigest ?? null,
      verifiedAt: receipt.verifiedAt,
      createdAt: this.now(),
    };

    await this.marketingRepository.createPublicationRecord(record);
    await this.marketingRepository.updatePublicationTargetStatus({
      targetId: target.id,
      status: "verified",
    });

    if (workerId) {
      await this.marketingRepository.releasePublicationTargetLease(target.id, workerId);
    }

    // 9. Synchronize overall campaign status
    await this.synchronizeCampaignState(campaign.id);

    return record;
  }

  async publishApprovedPackage(request: PublishPackageRequest): Promise<PublicationRecord> {
    const { campaignId, packageId } = request;

    const campaign = await this.marketingRepository.findCampaignById(campaignId);
    if (!campaign) {
      throw MarketingApplicationError.campaignNotFound(campaignId);
    }

    const pkg = await this.marketingRepository.findPublicationPackageById(packageId);
    if (!pkg || pkg.campaignId !== campaignId) {
      throw MarketingApplicationError.packageNotFound(packageId);
    }

    let targets = await this.marketingRepository.findPublicationTargetsByPackageId(packageId);
    if (targets.length === 0) {
      // If legacy package has no targets yet, backfill/create a target for this package
      const targetId = this.generateId();
      const legacyTarget: PublicationTarget = {
        id: targetId,
        packageId: pkg.id,
        platform: "facebook",
        format: "feed_image",
        accountConfigurationId: request.pageId || pkg.facebookPageConfigurationId || "facebook-default",
        contentVersionId: pkg.contentVersionId,
        mediaAssetIds: pkg.visualAssetId ? [pkg.visualAssetId] : [],
        caption: "Legacy package publication",
        scheduledFor: pkg.scheduledFor,
        required: true,
        executionMode: "live",
        contentDigest: pkg.contentDigest,
        mediaDigest: pkg.imageDigest || pkg.contentDigest,
        targetDigest: calculatePublicationTargetDigest({
          platform: "facebook",
          format: "feed_image",
          accountConfigurationId: request.pageId || pkg.facebookPageConfigurationId || "facebook-default",
          mediaAssetIds: pkg.visualAssetId ? [pkg.visualAssetId] : [],
          caption: "Legacy package publication",
          scheduledFor: pkg.scheduledFor,
          executionMode: "live",
        }),
        status: "approved",
        createdAt: this.now(),
        updatedAt: this.now(),
      };
      await this.marketingRepository.createPublicationTargets([legacyTarget]);
      targets = [legacyTarget];
    }

    // If ALL targets are already verified, return existing record
    if (targets.length > 0 && targets.every((t) => t.status === "verified")) {
      const existingPackageRecord = await this.marketingRepository.findPublicationRecordByPackageId(packageId);
      if (existingPackageRecord) {
        return existingPackageRecord;
      }
    }

    const records: PublicationRecord[] = [];
    let firstError: unknown;
    for (const target of targets) {
      try {
        const record = await this.publishTarget(target.id, this.defaultWorkerId);
        records.push(record);
      } catch (err) {
        if (!firstError) {
          firstError = err;
        }
      }
    }

    // Always synchronize campaign state after targets have been published
    await this.synchronizeCampaignState(campaign.id);

    if (records.length === 0 && firstError) {
      throw firstError;
    }

    const firstRecord = records[0] ?? (await this.marketingRepository.findPublicationRecordByPackageId(packageId));
    if (!firstRecord) {
      if (firstError) throw firstError;
      throw new Error(`Failed to publish package '${packageId}'.`);
    }

    return firstRecord;
  }

  private async synchronizeCampaignState(campaignId: string): Promise<void> {
    const campaign = await this.marketingRepository.findCampaignById(campaignId);
    if (!campaign) return;

    const packages = await this.marketingRepository.findPublicationPackagesByCampaignId(campaignId);
    const currentPackage = packages[packages.length - 1];
    if (!currentPackage) return;

    const targets = await this.marketingRepository.findPublicationTargetsByPackageId(currentPackage.id);
    if (targets.length === 0) return;

    const aggregate = deriveAggregatePublicationStatus(targets);

    let nextState: MarketingCampaignState = campaign.state;
    if (aggregate === "verified") {
      nextState = "completed";
    } else if (aggregate === "publication_unknown") {
      nextState = "publication_unknown";
    } else if (aggregate === "partial_failure") {
      nextState = "partial_failure";
    } else if (aggregate === "failed") {
      nextState = "failed";
    } else if (aggregate === "publishing") {
      nextState = "publishing";
    }

    if (nextState !== campaign.state) {
      await this.marketingRepository.updateCampaignState(campaign.id, campaign.version, nextState);
      if (nextState === "completed" || nextState === "partial_failure") {
        await this.dispatchWorkflowCompletionNotification(campaign.id, targets);
      }
    }
  }

  private async dispatchWorkflowCompletionNotification(
    campaignId: string,
    _targets: readonly PublicationTarget[],
  ): Promise<void> {
    try {
      let recipientEmail = "duongvanduy799@gmail.com";
      let recipientRole = "Trưởng phòng Marketing";

      // 1. Inspect WF-MKT-LAUNCH blueprint for notification node and recipient parameters
      if (this.database) {
        try {
          const res = await this.database.query(
            `SELECT nodes, edges FROM workflow_blueprints WHERE code = 'WF-MKT-LAUNCH' AND status = 'published' LIMIT 1`,
          );
          if (res.rows.length > 0) {
            const nodes = res.rows[0].nodes || [];
            const notifyNode = nodes.find((n: any) =>
              n.title?.toLowerCase().includes("thông báo") ||
              n.actor?.toLowerCase().includes("email") ||
              n.details?.parameters?.some((p: any) => p.value?.includes("@")),
            );
            if (notifyNode) {
              const emailParam = notifyNode.details?.parameters?.find(
                (p: any) => p.label?.toLowerCase().includes("email") || p.value?.includes("@"),
              );
              if (emailParam?.value) {
                recipientEmail = emailParam.value.trim();
              }
              const roleParam = notifyNode.details?.parameters?.find(
                (p: any) => p.label?.toLowerCase().includes("chức vụ"),
              );
              if (roleParam?.value) {
                recipientRole = roleParam.value.trim();
              }
            }
          }
        } catch (dbErr) {
          console.warn("[MarketingPublisherService] Could not inspect workflow_blueprints:", dbErr);
        }
      }

      if (!recipientEmail || !recipientEmail.includes("@")) {
        return;
      }

      if (process.env.NODE_ENV === "test" || process.env.VITEST) {
        return;
      }

      // 2. Fetch campaign details and verified publication records
      const brief = await this.marketingRepository.findBriefByCampaignId(campaignId);
      const campaign = await this.marketingRepository.findCampaignById(campaignId);
      const packages = await this.marketingRepository.findPublicationPackagesByCampaignId(campaignId);
      const latestPkg = packages[packages.length - 1];
      const records = latestPkg
        ? await this.marketingRepository.findPublicationRecordByPackageId(latestPkg.id)
        : null;

      const productName = brief?.subjectReference || campaign?.campaignName || "Sản phẩm công nghệ mới";
      const campaignName = brief?.campaignName || campaign?.campaignName || "Chiến dịch Marketing Đa Kênh";
      const postUrl = records?.postUrl || "https://facebook.com/1321445584378490";
      const postId = records?.externalPostId || "N/A";

      // 3. Dispatch notification email via live SMTP
      const smtpUser = process.env.SUPPORT_SMTP_USER || "nguyenphuongdmx2450@gmail.com";
      const smtpPass = (process.env.SUPPORT_SMTP_PASS || "jarqsjtoegstwkft").replace(/\s+/g, "");
      const smtpHost = process.env.SUPPORT_SMTP_HOST || "smtp.gmail.com";
      const smtpPort = Number(process.env.SUPPORT_SMTP_PORT) || 587;
      const smtpFrom = process.env.SUPPORT_EMAIL_FROM || `NovaCommerce Operations <${smtpUser}>`;

      const transporter = nodemailer.createTransport({
        host: smtpHost,
        port: smtpPort,
        secure: process.env.SUPPORT_SMTP_SECURE === "true",
        auth: {
          user: smtpUser,
          pass: smtpPass,
        },
      });

      const fbTarget = _targets.find((t) => t.platform === "facebook");
      const igTarget = _targets.find((t) => t.platform === "instagram");
      const hasFb = fbTarget?.status === "verified";
      const hasIg = igTarget?.status === "verified";
      const channelText = [
        hasFb ? "📘 Facebook Fanpage: ĐÃ ĐĂNG THÀNH CÔNG" : "📘 Facebook: Chưa xuất bản",
        hasIg ? "📸 Instagram Business: ĐÃ ĐĂNG THÀNH CÔNG" : "📸 Instagram: Chờ Public Media URL",
      ].join("<br/>");

      const subject = hasFb && hasIg
        ? `[Thông Báo Nội Bộ] Chiến dịch Marketing "${campaignName}" đã xuất bản thành công đa kênh`
        : hasFb
        ? `[Thông Báo Nội Bộ] Chiến dịch Marketing "${campaignName}" đã xuất bản lên Facebook Fanpage`
        : `[Thông Báo Nội Bộ] Báo cáo xuất bản chiến dịch Marketing "${campaignName}"`;

      const html = `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #1e293b; max-width: 620px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.05);">
          <div style="background: linear-gradient(135deg, #4f46e5, #6366f1); padding: 28px 24px; color: white;">
            <div style="font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 1px; opacity: 0.9; margin-bottom: 6px;">Quy Trình Doanh Nghiệp • WF-MKT-LAUNCH v1.3</div>
            <h2 style="margin: 0; font-size: 22px; font-weight: 700;">🎉 Báo Cáo Xuất Bản Chiến Dịch Thành Công</h2>
          </div>
          <div style="padding: 28px 24px; background: #ffffff;">
            <p style="font-size: 15px; margin-top: 0;">Kính gửi <strong>${recipientRole} (${recipientEmail})</strong>,</p>
            <p style="font-size: 15px; color: #334155;">
              Hệ thống Điều Hành Doanh Nghiệp Tự Động <strong>OpenDX CompanyOS</strong> xin trân trọng thông báo:
            </p>
            <p style="font-size: 15px; color: #334155;">
              Quy trình <strong>WF-MKT-LAUNCH</strong> đã hoàn tất thành công <strong>Bước 4 (Tự động đăng bài Meta)</strong> và vừa kích hoạt <strong>Bước 5 (Gửi email thông báo nội bộ)</strong> cho chiến dịch ra mắt:
            </p>

            <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 20px; margin: 24px 0;">
              <h4 style="margin: 0 0 14px; font-size: 15px; color: #0f172a; border-bottom: 1px solid #e2e8f0; padding-bottom: 8px;">📋 Chi tiết chiến dịch & kết quả xuất bản:</h4>
              <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
                <tr>
                  <td style="padding: 6px 0; color: #64748b; width: 140px;">Sản phẩm:</td>
                  <td style="padding: 6px 0; font-weight: 600; color: #0f172a;">${productName}</td>
                </tr>
                <tr>
                  <td style="padding: 6px 0; color: #64748b;">Tên chiến dịch:</td>
                  <td style="padding: 6px 0; color: #0f172a;">${campaignName}</td>
                </tr>
                <tr>
                  <td style="padding: 6px 0; color: #64748b;">Mã chiến dịch:</td>
                  <td style="padding: 6px 0; color: #4f46e5; font-family: monospace;">#${campaignId.slice(0, 8)}</td>
                </tr>
                <tr>
                  <td style="padding: 6px 0; color: #64748b; vertical-align: top;">Kênh phát hành:</td>
                  <td style="padding: 6px 0; color: #0f172a;">${channelText}</td>
                </tr>
                <tr>
                  <td style="padding: 6px 0; color: #64748b;">Meta Post ID:</td>
                  <td style="padding: 6px 0; font-family: monospace; color: #0f172a;">${postId}</td>
                </tr>
                <tr>
                  <td style="padding: 6px 0; color: #64748b;">Thời điểm xuất bản:</td>
                  <td style="padding: 6px 0; color: #0f172a;">${new Date().toLocaleString("vi-VN")}</td>
                </tr>
              </table>
              ${postUrl && postUrl !== "Chưa xuất bản" ? `
              <div style="margin-top: 18px; text-align: center;">
                <a href="${postUrl}" target="_blank" style="display: inline-block; background: #4f46e5; color: #ffffff; text-decoration: none; padding: 10px 22px; border-radius: 6px; font-weight: 600; font-size: 14px; box-shadow: 0 2px 6px rgba(79, 70, 229, 0.3);">
                  Xem bài đăng trực tiếp trên mạng xã hội &rarr;
                </a>
              </div>` : ""}
            </div>

            <p style="font-size: 14px; color: #64748b; margin-bottom: 0;">
              Thư này được gửi tự động bởi tiến trình điều phối nhân sự số (AI Workforce) của OpenDX CompanyOS theo phê duyệt chiến lược của AI CEO.
            </p>
          </div>
          <div style="background: #f1f5f9; padding: 14px 24px; text-align: center; font-size: 12px; color: #94a3b8; border-top: 1px solid #e2e8f0;">
            © 2026 OpenDX CompanyOS • NovaCommerce Enterprise Platform
          </div>
        </div>
      `;

      await transporter.sendMail({
        from: smtpFrom,
        to: recipientEmail,
        subject,
        html,
        text: `[Thông Báo Nội Bộ] Chiến dịch Marketing "${campaignName}" đã xuất bản thành công.\nSản phẩm: ${productName}\nLink: ${postUrl}\nThời gian: ${new Date().toLocaleString("vi-VN")}`,
      });

      console.log(`[MarketingPublisherService] Notification email sent successfully to ${recipientEmail} for campaign ${campaignId}`);
    } catch (notifyErr) {
      console.warn("[MarketingPublisherService] Failed to send workflow notification email:", notifyErr);
    }
  }
}
