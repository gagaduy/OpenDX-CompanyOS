// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { StaffPrincipal } from "../../../../../shared/auth/staff-principal";
import type { CommandActivityEvent, CommandActivityFeedEvent, CreateCommandActivityInput } from "../../../domain/entities/command-activity-event";

export interface CommandActivityService {
  record(input: CreateCommandActivityInput, principal: StaffPrincipal): Promise<CommandActivityEvent>;
  listRecent(limit: number): Promise<readonly CommandActivityFeedEvent[]>;
}
