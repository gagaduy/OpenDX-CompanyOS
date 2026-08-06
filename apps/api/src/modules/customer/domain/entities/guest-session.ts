// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

export interface GuestSession {
  readonly id: string;
  readonly tokenHash: string;
  readonly expiresAt: string;
  readonly lastSeenAt: string;
  readonly revokedAt?: string;
  readonly createdAt: string;
}
