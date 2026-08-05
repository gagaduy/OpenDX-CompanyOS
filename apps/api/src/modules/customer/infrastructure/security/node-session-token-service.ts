// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0
import { createHash, randomBytes } from "node:crypto";
import type { SessionTokenService } from "../../application/security/session-token-service";
export class NodeSessionTokenService implements SessionTokenService {
  generate() {
    const raw = randomBytes(32).toString("base64url");
    return { raw, hash: this.hash(raw) };
  }
  hash(raw: string) {
    return createHash("sha256").update(raw).digest("hex");
  }
}
