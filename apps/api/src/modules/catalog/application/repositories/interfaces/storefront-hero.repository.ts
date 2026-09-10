// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { DatabaseSession } from "../../../../../shared/database/transaction";
import type { StorefrontHeroChapterInput } from "../../../domain/entities/storefront-hero-presentation";

export interface StorefrontHeroActivation {
  readonly id: string;
  readonly code: string;
  readonly objectKey: string;
  readonly contentDigest: string;
  readonly contentType: "video/mp4";
  readonly byteSize: number;
  readonly durationMs: number;
  readonly chapters: readonly StorefrontHeroChapterInput[];
}

export interface StorefrontHeroRepository {
  acquireImportLock(session: DatabaseSession): Promise<void>;
  activate(session: DatabaseSession, input: StorefrontHeroActivation): Promise<string>;
  disable(session: DatabaseSession, code: string): Promise<boolean>;
  isObjectReferenced(session: DatabaseSession, objectKey: string): Promise<boolean>;
}
