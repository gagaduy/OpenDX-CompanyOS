// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { MarketingArtifact } from "../../../domain/entities/marketing-campaign";

export interface GeneratedArtifactPayload {
  readonly artifact: MarketingArtifact;
  readonly buffer: Buffer;
}

export interface MarketingArtifactService {
  generateAllDeliverables(campaignId: string): Promise<readonly MarketingArtifact[]>;
  getArtifactById(artifactId: string): Promise<MarketingArtifact | null>;
  getArtifactPayload(artifactId: string): Promise<GeneratedArtifactPayload | null>;
  listArtifactsByCampaignId(campaignId: string): Promise<readonly MarketingArtifact[]>;
}
