// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0
import type { GoogleIdentityVerifier } from "../../application/identity/google-identity-verifier";
export class UnavailableGoogleIdentityVerifier implements GoogleIdentityVerifier { async verify():Promise<never>{throw new Error("Google identity is not configured");} }
