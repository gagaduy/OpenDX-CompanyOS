// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

export interface CrmNote {
  readonly id: string;
  readonly customerId: string;
  readonly authorId: string;
  readonly body: string;
  readonly correctsNoteId?: string;
  readonly createdAt: string;
}
