// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0
export interface VerifiedGoogleIdentity { readonly provider: "google"; readonly subject: string; readonly email: string; readonly emailVerified: true; readonly verifiedAt: string }
export interface GoogleIdentityVerifier { verify(credential: string): Promise<VerifiedGoogleIdentity> }
