// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type {
  WorkflowBlueprintDto,
  SaveWorkflowDraftDto,
  PublishWorkflowDto,
} from "../../dtos/workflow-blueprint.dto";

export interface WorkflowBlueprintRepository {
  listBlueprints(): Promise<readonly WorkflowBlueprintDto[]>;
  findById(id: string): Promise<WorkflowBlueprintDto | null>;
  findByCode(code: string): Promise<WorkflowBlueprintDto | null>;
  saveDraft(id: string, draft: SaveWorkflowDraftDto): Promise<WorkflowBlueprintDto>;
  publish(id: string, publish: PublishWorkflowDto): Promise<WorkflowBlueprintDto>;
}
