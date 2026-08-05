// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

export interface UploadProductMediaRequestDto {
  readonly bytes: Uint8Array;
  readonly suppliedContentType: string;
  readonly altText: string;
  readonly sortOrder: number;
  readonly isPrimary: boolean;
}

export interface UpdateProductMediaRequestDto {
  readonly altText?: string;
  readonly sortOrder?: number;
  readonly isPrimary?: boolean;
}
