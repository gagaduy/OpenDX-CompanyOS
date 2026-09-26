// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { SocialTokensSummaryView } from "../../dtos/social-token.dto";

export interface AutonomousSocialTokenMonitorService {
  start(): void;
  stop(): void;
  executeHeartbeat(): Promise<void>;
  triggerCheck(): Promise<SocialTokensSummaryView>;
}
