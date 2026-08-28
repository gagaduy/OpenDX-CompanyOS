// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

export interface FacebookPublishInput {
  readonly pageId: string;
  readonly pageAccessToken: string;
  readonly message: string;
  readonly imageBuffer: Buffer;
  readonly imageFileName?: string;
  readonly mimeType?: "image/png" | "image/jpeg";
}

export interface FacebookPublishResult {
  readonly postId: string;
  readonly postUrl: string;
  readonly publishedAt: string;
  readonly rawResponseDigest: string;
}

export interface FacebookPageVerificationResult {
  readonly pageId: string;
  readonly name: string;
  readonly canPost: boolean;
}

export interface FacebookPublisherPort {
  publishImagePost(input: FacebookPublishInput): Promise<FacebookPublishResult>;
  verifyPageAccess(pageId: string, pageAccessToken: string): Promise<FacebookPageVerificationResult>;
}

export class FacebookPublisherError extends Error {
  public readonly code: string;
  public readonly httpStatus?: number;
  public readonly retryable: boolean;

  constructor(
    code: string,
    message: string,
    options?: { httpStatus?: number; retryable?: boolean; cause?: unknown },
  ) {
    super(message);
    this.name = "FacebookPublisherError";
    this.code = code;
    this.httpStatus = options?.httpStatus;
    this.retryable = options?.retryable ?? false;
    if (options?.cause) {
      this.cause = options.cause;
    }
  }
}
