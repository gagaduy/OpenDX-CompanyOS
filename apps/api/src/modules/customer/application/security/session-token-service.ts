// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0
export interface SessionToken {
  readonly raw: string;
  readonly hash: string;
}
export interface SessionTokenService {
  generate(): SessionToken;
  hash(raw: string): string;
}
