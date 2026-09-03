// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type {
  PublicationExecutionMode,
  PublicationTarget,
  SocialPlatform,
} from "../../domain/entities/marketing-campaign";

export interface SocialPublishMediaItem {
  readonly id: string;
  readonly bytes: Buffer;
  readonly mimeType: "image/png";
  readonly fileName: string;
}

export interface SocialPublishRequest {
  readonly target: PublicationTarget;
  readonly caption: string;
  readonly media: readonly SocialPublishMediaItem[];
}

export interface SocialPublicationReceipt {
  readonly platform: SocialPlatform;
  readonly executionMode: PublicationExecutionMode;
  readonly simulated: boolean;
  readonly externalPublicationId: string;
  readonly pageId?: string;
  readonly publicationUrl?: string | null;
  readonly providerReceiptDigest: string;
  readonly verificationEvidenceDigest?: string | null;
  readonly verifiedAt: string;
  readonly displayMessage: string;
}

export interface SocialReconciliationRequest {
  readonly target: PublicationTarget;
  readonly externalPublicationId?: string;
}

export interface SocialReconciliationResult {
  readonly exists: boolean;
  readonly receipt?: SocialPublicationReceipt;
}

export class SocialPublisherError extends Error {
  public readonly code: string;
  public readonly classification?: string;
  public readonly retryable: boolean;
  public readonly outcomeKnown: boolean;
  public readonly httpStatus?: number;
  public readonly providerReference?: string;

  constructor(
    code: string,
    message: string,
    options?: {
      classification?: string;
      retryable?: boolean;
      outcomeKnown?: boolean;
      httpStatus?: number;
      providerReference?: string;
      cause?: unknown;
    },
  ) {
    super(message);
    this.name = "SocialPublisherError";
    this.code = code;
    this.classification = options?.classification;
    this.retryable = options?.retryable ?? false;
    this.outcomeKnown = options?.outcomeKnown ?? true;
    this.httpStatus = options?.httpStatus;
    this.providerReference = options?.providerReference;
    if (options?.cause) {
      this.cause = options.cause;
    }
  }
}

export interface SocialPublisherPort {
  readonly platform: SocialPlatform;
  readonly executionMode: PublicationExecutionMode;
  publish(request: SocialPublishRequest): Promise<SocialPublicationReceipt>;
  reconcile(request: SocialReconciliationRequest): Promise<SocialReconciliationResult>;
}
