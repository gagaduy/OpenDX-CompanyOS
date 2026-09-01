// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { PublicationRecord, PublicationTarget } from "../../../domain/entities/marketing-campaign";

export interface PublishPackageRequest {
  readonly campaignId: string;
  readonly packageId: string;
  readonly pageId?: string;
  readonly pageAccessToken?: string;
}

export interface PublishDueTargetsOptions {
  readonly workerId?: string;
  readonly limit?: number;
}

export interface MarketingPublisherService {
  publishTarget(targetId: string, workerId?: string): Promise<PublicationRecord>;
  publishDueTargets(options?: PublishDueTargetsOptions): Promise<readonly PublicationRecord[]>;
  publishApprovedPackage(request: PublishPackageRequest): Promise<PublicationRecord>;
}
