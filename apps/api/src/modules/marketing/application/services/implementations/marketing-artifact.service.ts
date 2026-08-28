// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { createHash, randomUUID } from "node:crypto";
import type {
  GeneratedArtifactPayload,
  MarketingArtifactService,
} from "../interfaces/marketing-artifact-generator.service";
import type { MarketingRepository } from "../../repositories/interfaces/marketing.repository";
import type {
  MarketingArtifact,
  MarketingArtifactKind,
} from "../../../domain/entities/marketing-campaign";
import { MarketingApplicationError } from "../../../presentation/middleware/marketing-error.middleware";
import { generateCampaignBriefDocx } from "../../../infrastructure/generators/campaign-brief-docx.generator";
import { generateFacebookContentDocx } from "../../../infrastructure/generators/facebook-content-docx.generator";
import { generateFacebookVisualPng } from "../../../infrastructure/generators/facebook-visual-png.generator";
import { generateFacebookPublicationLogXlsx } from "../../../infrastructure/generators/facebook-publication-log-xlsx.generator";
import { generateMarketingFinalReportPdf } from "../../../infrastructure/generators/marketing-final-report-pdf.generator";

export interface MarketingArtifactServiceOptions {
  readonly marketingRepository: MarketingRepository;
  readonly storageWriter?: (key: string, buffer: Buffer, mediaType: string) => Promise<void>;
  readonly storageReader?: (key: string) => Promise<Buffer>;
  readonly now?: () => string;
  readonly generateId?: () => string;
}

export class MarketingArtifactServiceImpl implements MarketingArtifactService {
  private readonly marketingRepository: MarketingRepository;
  private readonly storageWriter?: (key: string, buffer: Buffer, mediaType: string) => Promise<void>;
  private readonly storageReader?: (key: string) => Promise<Buffer>;
  private readonly now: () => string;
  private readonly generateId: () => string;
  private readonly bufferCache: Map<string, Buffer> = new Map();

  constructor(options: MarketingArtifactServiceOptions) {
    this.marketingRepository = options.marketingRepository;
    this.storageWriter = options.storageWriter;
    this.storageReader = options.storageReader;
    this.now = options.now ?? (() => new Date().toISOString());
    this.generateId = options.generateId ?? randomUUID;
  }

  async generateAllDeliverables(campaignId: string): Promise<readonly MarketingArtifact[]> {
    const campaign = await this.marketingRepository.findCampaignById(campaignId);
    if (!campaign) {
      throw MarketingApplicationError.campaignNotFound(campaignId);
    }

    const brief = await this.marketingRepository.findBriefByCampaignId(campaignId);
    if (!brief) {
      throw MarketingApplicationError.campaignNotFound(campaignId);
    }

    const contents = await this.marketingRepository.findContentVersionsByCampaignId(campaignId);
    const visuals = await this.marketingRepository.findVisualAssetsByCampaignId(campaignId);
    const pkg = await this.marketingRepository.findCurrentPackageByCampaignId(campaignId);
    const attempts = pkg ? await this.marketingRepository.findPublicationAttemptsByPackageId(pkg.id) : [];
    const record = pkg ? await this.marketingRepository.findPublicationRecordByPackageId(pkg.id) : null;

    const latestContent = contents[contents.length - 1] ?? null;
    const latestVisual = visuals[visuals.length - 1] ?? null;

    let visualBuffer: Buffer | undefined;
    if (latestVisual && this.storageReader) {
      try {
        visualBuffer = await this.storageReader(latestVisual.storageKey);
      } catch {
        // Ignored fallback
      }
    }

    const generators: Array<{
      kind: MarketingArtifactKind;
      gen: () => { buffer: Buffer; filename: string; mediaType: string };
    }> = [
      {
        kind: "campaign_brief_docx",
        gen: () => generateCampaignBriefDocx(brief),
      },
      {
        kind: "facebook_content_docx",
        gen: () => generateFacebookContentDocx(brief, contents),
      },
      {
        kind: "facebook_visual_png",
        gen: () => generateFacebookVisualPng(latestVisual ?? ({} as any), visualBuffer),
      },
      {
        kind: "facebook_publication_log_xlsx",
        gen: () => generateFacebookPublicationLogXlsx(campaignId, attempts, record),
      },
      {
        kind: "marketing_final_report_pdf",
        gen: () =>
          generateMarketingFinalReportPdf({
            campaign,
            brief,
            content: latestContent,
            visual: latestVisual,
            pkg,
            record,
          }),
      },
    ];

    const results: MarketingArtifact[] = [];

    for (const item of generators) {
      const generated = item.gen();
      const artifactId = this.generateId();
      const digest = createHash("sha256").update(generated.buffer).digest("hex");
      const storageKey = `marketing/${campaignId}/${generated.filename}`;

      if (this.storageWriter) {
        await this.storageWriter(storageKey, generated.buffer, generated.mediaType);
      }

      this.bufferCache.set(artifactId, generated.buffer);

      const artifact: MarketingArtifact = {
        id: artifactId,
        campaignId,
        kind: item.kind,
        filename: generated.filename,
        mediaType: generated.mediaType,
        byteSize: generated.buffer.length,
        sha256Digest: digest,
        storageKey,
        createdAt: this.now(),
      };

      await this.marketingRepository.createArtifact(artifact);
      results.push(artifact);
    }

    return results;
  }

  async getArtifactById(artifactId: string): Promise<MarketingArtifact | null> {
    return this.marketingRepository.findArtifactById(artifactId);
  }

  async getArtifactPayload(artifactId: string): Promise<GeneratedArtifactPayload | null> {
    const artifact = await this.marketingRepository.findArtifactById(artifactId);
    if (!artifact) return null;

    let buffer = this.bufferCache.get(artifactId);
    if (!buffer && this.storageReader) {
      buffer = await this.storageReader(artifact.storageKey);
    }

    if (!buffer) {
      buffer = Buffer.alloc(0);
    }

    return {
      artifact,
      buffer,
    };
  }

  async listArtifactsByCampaignId(campaignId: string): Promise<readonly MarketingArtifact[]> {
    return this.marketingRepository.findArtifactsByCampaignId(campaignId);
  }
}
