// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { createHash } from "node:crypto";
import type {
  PublicationExecutionMode,
  SocialPlatform,
} from "../../domain/entities/marketing-campaign";
import { assertFormatEnabled } from "../../domain/services/marketing-publication-policy";
import {
  type SocialPublicationReceipt,
  type SocialPublisherPort,
  type SocialPublishRequest,
  type SocialReconciliationRequest,
  type SocialReconciliationResult,
} from "../../application/ports/social-publisher.port";

export class FakeInstagramPublisherAdapter implements SocialPublisherPort {
  readonly platform: SocialPlatform = "instagram";
  readonly executionMode: PublicationExecutionMode = "simulation";

  constructor(private readonly now: () => string = () => new Date().toISOString()) {}

  async publish(request: SocialPublishRequest): Promise<SocialPublicationReceipt> {
    assertFormatEnabled("instagram", request.target.format);

    const verifiedAt = this.now();
    const digestMaterial = `${request.target.id}:${request.target.targetDigest}:${verifiedAt}`;
    const externalPublicationId = `sim-ig-${createHash("sha256").update(digestMaterial).digest("hex").slice(0, 16)}`;
    const providerReceiptDigest = createHash("sha256").update(`receipt:${externalPublicationId}`).digest("hex");
    const verificationEvidenceDigest = createHash("sha256").update(`evidence:${externalPublicationId}:${verifiedAt}`).digest("hex");

    return {
      platform: "instagram",
      executionMode: "simulation",
      simulated: true,
      externalPublicationId,
      pageId: request.target.accountConfigurationId,
      publicationUrl: null,
      providerReceiptDigest,
      verificationEvidenceDigest,
      verifiedAt,
      displayMessage: "Local simulation - not published to Instagram",
    };
  }

  async reconcile(request: SocialReconciliationRequest): Promise<SocialReconciliationResult> {
    assertFormatEnabled("instagram", request.target.format);

    const verifiedAt = this.now();
    const externalPublicationId = request.externalPublicationId || `sim-ig-${createHash("sha256").update(request.target.id).digest("hex").slice(0, 16)}`;
    const providerReceiptDigest = createHash("sha256").update(`reconcile-receipt:${externalPublicationId}`).digest("hex");
    const verificationEvidenceDigest = createHash("sha256").update(`reconcile-evidence:${externalPublicationId}:${verifiedAt}`).digest("hex");

    return {
      exists: true,
      receipt: {
        platform: "instagram",
        executionMode: "simulation",
        simulated: true,
        externalPublicationId,
        pageId: request.target.accountConfigurationId,
        publicationUrl: null,
        providerReceiptDigest,
        verificationEvidenceDigest,
        verifiedAt,
        displayMessage: "Local simulation - not published to Instagram",
      },
    };
  }
}
