// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { StaffPrincipal } from "../../../../../shared/auth/staff-principal";
import type { RevisionChildren } from "../../repositories/interfaces/agentic.repository";
import type { ConfigurationRevision } from "../../../domain/entities/configuration-revision";

export interface CreateConfigurationDraftInput { readonly children: RevisionChildren }
export interface UpdateConfigurationDraftInput { readonly revisionId: string; readonly expectedVersion: number; readonly children: RevisionChildren }
export interface SubmitConfigurationInput { readonly revisionId: string; readonly expectedVersion: number }
export interface DecideConfigurationInput { readonly revisionId: string; readonly expectedVersion: number; readonly decision: "activate" | "reject"; readonly reason?: string }
export interface ActivateConfigurationInput { readonly revisionId: string; readonly expectedVersion: number }
export interface ConfigurationDiff {
  readonly revisionId: string;
  readonly activeRevisionId?: string;
  readonly changed: boolean;
  readonly active?: RevisionChildren;
  readonly candidate: RevisionChildren;
}

export interface ConfigurationService {
  createDraft(input: CreateConfigurationDraftInput, principal: StaffPrincipal): Promise<ConfigurationRevision>;
  updateDraft(input: UpdateConfigurationDraftInput, principal: StaffPrincipal): Promise<ConfigurationRevision>;
  activate(input: ActivateConfigurationInput, principal: StaffPrincipal): Promise<ConfigurationRevision>;
  submit(input: SubmitConfigurationInput, principal: StaffPrincipal): Promise<ConfigurationRevision>;
  decide(input: DecideConfigurationInput, principal: StaffPrincipal): Promise<ConfigurationRevision>;
  getDiff(revisionId: string, principal: StaffPrincipal): Promise<ConfigurationDiff>;
}
