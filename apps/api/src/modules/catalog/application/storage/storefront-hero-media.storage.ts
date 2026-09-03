// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

export interface StorefrontHeroMediaStorage {
  upload(input: {
    readonly objectKey: string;
    readonly bytes: Uint8Array;
    readonly contentType: "video/mp4";
  }): Promise<void>;
  open(
    objectKey: string,
    range?: { readonly offset: number; readonly length: number },
  ): Promise<AsyncIterable<Uint8Array>>;
  exists(objectKey: string): Promise<boolean>;
  delete(objectKey: string): Promise<void>;
}
