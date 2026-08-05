// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0
import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose"; import type { GoogleIdentityVerifier, VerifiedGoogleIdentity } from "../../application/identity/google-identity-verifier";
export class GoogleJoseIdentityVerifier implements GoogleIdentityVerifier {
  private readonly keySet: JWTVerifyGetKey;
  constructor(private readonly audience: string, keySet: JWTVerifyGetKey = createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs"))) { this.keySet = keySet; }
  async verify(credential: string): Promise<VerifiedGoogleIdentity> { const { payload } = await jwtVerify(credential, this.keySet, { issuer: ["https://accounts.google.com", "accounts.google.com"], audience: this.audience }); if (typeof payload.sub !== "string" || typeof payload.email !== "string" || payload.email_verified !== true) throw new Error("Google identity is not verified"); return { provider: "google", subject: payload.sub, email: payload.email.toLowerCase(), emailVerified: true, verifiedAt: new Date().toISOString() }; }
}
