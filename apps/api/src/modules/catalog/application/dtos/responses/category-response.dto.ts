// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { CategoryStatus } from "../../../domain/entities/category";

export interface CategoryResponseDto {
  readonly id: string;
  readonly parentId?: string;
  readonly name: string;
  readonly slug: string;
  readonly description?: string;
  readonly sortOrder: number;
  readonly status: CategoryStatus;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly version: number;
}
