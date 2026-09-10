// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { createHash } from "node:crypto";
import type { TransactionRunner } from "../../../../../shared/database/transaction";
import type { StorefrontHeroImportInput } from "../../../domain/entities/storefront-hero-presentation";
import { validateStorefrontHeroChapters } from "../../../domain/services/storefront-hero-rules";
import type { StorefrontHeroRepository } from "../../repositories/interfaces/storefront-hero.repository";
import type { StorefrontHeroMediaStorage } from "../../storage/storefront-hero-media.storage";
import type {
  StorefrontHeroImportResult,
  StorefrontHeroImportServiceContract,
} from "../interfaces/storefront-hero-import.service";

interface StorefrontHeroImportDependencies {
  readonly repository: StorefrontHeroRepository;
  readonly storage: StorefrontHeroMediaStorage;
  readonly transactions: TransactionRunner;
  readonly generateId: () => string;
  readonly inspectDuration: (bytes: Uint8Array) => number;
  readonly maximumBytes: number;
}

export class StorefrontHeroImportService implements StorefrontHeroImportServiceContract {
  constructor(private readonly dependencies: StorefrontHeroImportDependencies) {}

  async import(input: StorefrontHeroImportInput): Promise<StorefrontHeroImportResult> {
    if (input.bytes.byteLength > this.dependencies.maximumBytes) {
      throw new Error(
        `Storefront hero video exceeds the ${this.dependencies.maximumBytes} byte limit`,
      );
    }

    const durationMs = this.dependencies.inspectDuration(input.bytes);
    validateStorefrontHeroChapters(durationMs, input.chapters);

    const contentDigest = createHash("sha256").update(input.bytes).digest("hex");
    const objectKey = `storefront/hero/${contentDigest}.mp4`;
    const activation = {
      id: this.dependencies.generateId(),
      code: input.code,
      objectKey,
      contentDigest,
      contentType: "video/mp4" as const,
      byteSize: input.bytes.byteLength,
      durationMs,
      chapters: input.chapters,
    };

    const persistedId = await this.dependencies.transactions.run(async (session) => {
      await this.dependencies.repository.acquireImportLock(session);
      const existed = await this.dependencies.storage.exists(objectKey);
      if (!existed) {
        await this.dependencies.storage.upload({
          objectKey,
          bytes: input.bytes,
          contentType: "video/mp4",
        });
      }

      try {
        return await this.dependencies.repository.activate(session, activation);
      } catch (error) {
        if (!existed) await this.cleanupUnreferencedObject(session, objectKey);
        throw error;
      }
    });

    return {
      id: persistedId,
      code: activation.code,
      objectKey: activation.objectKey,
      contentDigest: activation.contentDigest,
      contentType: activation.contentType,
      byteSize: activation.byteSize,
      durationMs: activation.durationMs,
      chapterCount: activation.chapters.length,
    };
  }

  async disable(code: string): Promise<boolean> {
    return this.dependencies.transactions.run((session) =>
      this.dependencies.repository.disable(session, code),
    );
  }

  private async cleanupUnreferencedObject(
    session: Parameters<StorefrontHeroRepository["isObjectReferenced"]>[0],
    objectKey: string,
  ): Promise<void> {
    try {
      if (await this.dependencies.repository.isObjectReferenced(session, objectKey)) return;
    } catch {
      return;
    }

    try {
      await this.dependencies.storage.delete(objectKey);
    } catch {
      // Cleanup is compensating work; retaining an orphan is safer than masking activation failure.
    }
  }
}
