// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { WorkloadPrincipal } from "../../../../../shared/auth/workload-principal";
import type { OrchestrationPlanAppendInput } from "../../repositories/interfaces/agentic.repository";

export interface OrchestrationService {
  acceptPlan(plan: OrchestrationPlanAppendInput, principal: WorkloadPrincipal): Promise<void>;
}
