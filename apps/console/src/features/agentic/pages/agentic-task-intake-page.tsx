// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { PageHeader } from "../../../shared/components/page-header";
import type { AgenticApi } from "../api/agentic-api";
import { TaskIntakeForm } from "../components/task-intake-form";
import { useAgenticIntake } from "../hooks/use-agentic-intake";
import type { StaffRole } from "../../authentication/api/oidc-manager";
import { FileIntakePanel } from "../components/file-intake-panel";

export function AgenticTaskIntakePage({ api, roles = ["agentic_operator"] }: { readonly api: AgenticApi; readonly roles?: readonly StaffRole[] }) { const intake = useAgenticIntake(api); const direct = roles.some((role) => role === "administrator" || role === "agentic_operator"); const files = roles.some((role) => role === "administrator" || role === "agentic_governance_admin"); return <section className="catalogWorkspace agenticWorkspace"><PageHeader eyebrow="Digital Workforce" title="New governed task" description="Start with the guided Store Health review or use approved private file intake." />{direct && <TaskIntakeForm onSubmit={(input) => void intake.submit(input)} submitting={intake.submitting} message={intake.message} />}{files && <FileIntakePanel api={api} />}</section>; }
