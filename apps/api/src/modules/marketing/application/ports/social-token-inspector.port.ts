// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

export interface SocialTokenInspectionResult {
  readonly isValid: boolean;
  readonly accountId: string;
  readonly accountName: string;
  readonly expiresAt?: string | null;
  readonly dataAccessExpiresAt?: string | null;
  readonly scopes: readonly string[];
  readonly isLongLived: boolean;
  readonly error?: string | null;
}

export interface SocialTokenInspectorPort {
  inspectToken(
    platform: "facebook" | "instagram",
    token: string,
    accountId: string,
  ): Promise<SocialTokenInspectionResult>;
}
