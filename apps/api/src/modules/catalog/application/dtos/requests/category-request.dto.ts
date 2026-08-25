// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

export interface CreateCategoryRequestDto {
  readonly parentId?: string;
  readonly name: string;
  readonly slug?: string;
  readonly description?: string;
  readonly sortOrder?: number;
}

export interface UpdateCategoryRequestDto {
  readonly parentId?: string | null;
  readonly name?: string;
  readonly slug?: string;
  readonly description?: string | null;
  readonly sortOrder?: number;
  readonly version: number;
}
