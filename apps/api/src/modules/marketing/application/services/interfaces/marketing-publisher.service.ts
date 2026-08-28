// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { PublicationRecord } from "../../../domain/entities/marketing-campaign";

export interface PublishPackageRequest {
  readonly campaignId: string;
  readonly packageId: string;
  readonly pageId: string;
  readonly pageAccessToken: string;
}

export interface MarketingPublisherService {
  publishApprovedPackage(request: PublishPackageRequest): Promise<PublicationRecord>;
}
