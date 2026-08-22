// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

export type SupportAttachmentScanResult =
  | { readonly status: "clean" }
  | { readonly status: "infected"; readonly signature: string };

export interface SupportAttachmentScanner {
  scan(content: NodeJS.ReadableStream): Promise<SupportAttachmentScanResult>;
}
