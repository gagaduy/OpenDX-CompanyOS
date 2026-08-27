// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import type { DatabaseSession, TransactionRunner } from "../../../../../shared/database/transaction";
import type { StorefrontHeroChapterInput } from "../../../domain/entities/storefront-hero-presentation";
import type { StorefrontHeroRepository } from "../../repositories/interfaces/storefront-hero.repository";
import type { StorefrontHeroMediaStorage } from "../../storage/storefront-hero-media.storage";
import { StorefrontHeroImportService } from "./storefront-hero-import.service";

const session = {} as DatabaseSession;
const generatedId = "00000000-0000-4000-8000-000000000101";
const maximumBytes = 50 * 1024 * 1024;

function chapters(): StorefrontHeroChapterInput[] {
  return [
    { categorySlug: "laptops", sortOrder: 0, startMs: 0, endMs: 12_000, label: "Laptop" },
    { categorySlug: "phones", sortOrder: 1, startMs: 12_000, endMs: 24_000, label: "Phone" },
  ];
}

function fixture(options: {
  readonly exists?: boolean;
  readonly activationError?: Error;
  readonly durationMs?: number;
  readonly persistedId?: string;
  readonly referenced?: boolean;
  readonly referenceProofError?: Error;
} = {}) {
  const events: string[] = [];
  const repository: StorefrontHeroRepository = {
    acquireImportLock: vi.fn(async () => {
      events.push("lock");
    }),
    activate: vi.fn(async () => {
      events.push("activate");
      if (options.activationError !== undefined) throw options.activationError;
      return options.persistedId ?? generatedId;
    }),
    disable: vi.fn(async () => true),
    isObjectReferenced: vi.fn(async () => {
      events.push("reference-proof");
      if (options.referenceProofError !== undefined) throw options.referenceProofError;
      return options.referenced ?? false;
    }),
  };
  const storage: StorefrontHeroMediaStorage = {
    upload: vi.fn(async () => {
      events.push("upload");
    }),
    open: vi.fn(async () => emptyStream()),
    exists: vi.fn(async () => options.exists ?? false),
    delete: vi.fn(async () => undefined),
  };
  const transactions: TransactionRunner = {
    run: async (work) => {
      events.push("transaction");
      return work(session);
    },
    runReadOnly: (work) => work(session),
  };
  const inspectDuration = vi.fn(() => options.durationMs ?? 24_000);

  return {
    service: new StorefrontHeroImportService({
      repository,
      storage,
      transactions,
      generateId: () => generatedId,
      inspectDuration,
      maximumBytes,
    }),
    repository,
    storage,
    inspectDuration,
    events,
  };
}

async function* emptyStream(): AsyncIterable<Uint8Array> {}

describe("StorefrontHeroImportService", () => {
  it("inspects MP4 duration and activates the digest-addressed object after upload", async () => {
    const bytes = Buffer.from("deterministic-mp4");
    const digest = createHash("sha256").update(bytes).digest("hex");
    const input = { code: "nova-signal", bytes, chapters: chapters() };
    const { service, repository, storage, inspectDuration, events } = fixture();

    await expect(service.import(input)).resolves.toEqual({
      id: generatedId,
      code: input.code,
      objectKey: `storefront/hero/${digest}.mp4`,
      contentDigest: digest,
      contentType: "video/mp4",
      byteSize: bytes.byteLength,
      durationMs: 24_000,
      chapterCount: input.chapters.length,
    });

    expect(inspectDuration).toHaveBeenCalledWith(bytes);
    expect(storage.upload).toHaveBeenCalledWith({
      objectKey: `storefront/hero/${digest}.mp4`,
      bytes,
      contentType: "video/mp4",
    });
    expect(repository.activate).toHaveBeenCalledWith(session, {
      id: generatedId,
      code: input.code,
      objectKey: `storefront/hero/${digest}.mp4`,
      contentDigest: digest,
      contentType: "video/mp4",
      byteSize: bytes.byteLength,
      durationMs: 24_000,
      chapters: input.chapters,
    });
    expect(events).toEqual(["transaction", "lock", "upload", "activate"]);
  });

  it("rejects files above 50 MiB before inspection, storage, or persistence", async () => {
    const bytes = new Uint8Array(maximumBytes + 1);
    const { service, repository, storage, inspectDuration } = fixture();

    await expect(
      service.import({ code: "nova-signal", bytes, chapters: chapters() }),
    ).rejects.toThrow("Storefront hero video exceeds the 52428800 byte limit");

    expect(inspectDuration).not.toHaveBeenCalled();
    expect(storage.exists).not.toHaveBeenCalled();
    expect(storage.upload).not.toHaveBeenCalled();
    expect(repository.activate).not.toHaveBeenCalled();
  });

  it("validates inspected chapter timing before touching storage", async () => {
    const { service, repository, storage } = fixture();
    const invalid = chapters();
    invalid[1] = { ...invalid[1]!, startMs: 12_001 };

    await expect(
      service.import({ code: "nova-signal", bytes: Buffer.from("mp4"), chapters: invalid }),
    ).rejects.toThrow("Hero chapters must not contain gaps");

    expect(storage.exists).not.toHaveBeenCalled();
    expect(storage.upload).not.toHaveBeenCalled();
    expect(repository.activate).not.toHaveBeenCalled();
  });

  it("returns the original persisted id when replaying an identical digest", async () => {
    const originalId = "00000000-0000-4000-8000-000000000099";
    const { service, repository, storage } = fixture({ exists: true, persistedId: originalId });
    const input = { code: "nova-signal", bytes: Buffer.from("mp4"), chapters: chapters() };

    await expect(service.import(input)).resolves.toMatchObject({ id: originalId });

    expect(storage.upload).not.toHaveBeenCalled();
    expect(repository.activate).toHaveBeenCalledOnce();
    expect(storage.delete).not.toHaveBeenCalled();
  });

  it("reports an unknown category activation failure and removes a newly uploaded object", async () => {
    const failure = new Error("Unknown or inactive hero categories: phones");
    const { service, repository, storage } = fixture({ activationError: failure });

    await expect(
      service.import({ code: "nova-signal", bytes: Buffer.from("mp4"), chapters: chapters() }),
    ).rejects.toBe(failure);

    const digest = createHash("sha256").update("mp4").digest("hex");
    expect(storage.exists).toHaveBeenCalledBefore(vi.mocked(storage.upload));
    expect(storage.upload).toHaveBeenCalledBefore(vi.mocked(repository.activate));
    expect(repository.isObjectReferenced).toHaveBeenCalledWith(session, `storefront/hero/${digest}.mp4`);
    expect(storage.delete).toHaveBeenCalledWith(`storefront/hero/${digest}.mp4`);
  });

  it("keeps a newly uploaded object when another persisted presentation references it", async () => {
    const failure = new Error("activation failed");
    const { service, repository, storage } = fixture({ activationError: failure, referenced: true });

    await expect(
      service.import({ code: "nova-signal", bytes: Buffer.from("mp4"), chapters: chapters() }),
    ).rejects.toBe(failure);

    expect(repository.isObjectReferenced).toHaveBeenCalledOnce();
    expect(storage.delete).not.toHaveBeenCalled();
  });

  it("fails safe without deletion when the reference proof cannot complete", async () => {
    const failure = new Error("activation failed");
    const { service, repository, storage } = fixture({
      activationError: failure,
      referenceProofError: new Error("database unavailable"),
    });

    await expect(
      service.import({ code: "nova-signal", bytes: Buffer.from("mp4"), chapters: chapters() }),
    ).rejects.toBe(failure);

    expect(repository.isObjectReferenced).toHaveBeenCalledOnce();
    expect(storage.delete).not.toHaveBeenCalled();
  });

  it("does not delete a pre-existing active object when activation replay fails", async () => {
    const failure = new Error("activation failed");
    const { service, storage } = fixture({ exists: true, activationError: failure });

    await expect(
      service.import({ code: "nova-signal", bytes: Buffer.from("mp4"), chapters: chapters() }),
    ).rejects.toBe(failure);

    expect(storage.delete).not.toHaveBeenCalled();
  });

  it("disables a presentation transactionally and returns whether it changed", async () => {
    const { service, repository, events } = fixture();

    await expect(service.disable("nova-signal")).resolves.toBe(true);

    expect(repository.disable).toHaveBeenCalledWith(session, "nova-signal");
    expect(events).toEqual(["transaction"]);
  });
});
