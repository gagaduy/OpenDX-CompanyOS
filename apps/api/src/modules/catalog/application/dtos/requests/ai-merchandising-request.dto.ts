// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

export interface GenerateMerchandisingProposalRequestDto {
  readonly prompt: string;
  readonly targetProductId?: string;
}

export interface ApplyMerchandisingProposalRequestDto {
  readonly proposalId: string;
  readonly customTitle?: string;
  readonly customDescription?: string;
  readonly customPriceVnd?: number;
}
