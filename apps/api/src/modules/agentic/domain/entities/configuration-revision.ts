// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

export type ConfigurationRevisionState =
  | "draft"
  | "pending_approval"
  | "active"
  | "rejected"
  | "superseded";

export interface ConfigurationRevision {
  readonly id: string;
  readonly state: ConfigurationRevisionState;
  readonly createdBy: string;
  readonly payloadDigest: string;
  readonly decidedBy?: string;
  readonly decisionReason?: string;
  readonly activationAuditId?: string;
  readonly version: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}
