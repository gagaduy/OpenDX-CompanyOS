// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { PageHeader } from "../../../shared/components/page-header";
import type { AgenticApi } from "../api/agentic-api";
import { TaskIntakeForm } from "../components/task-intake-form";
import { useAgenticIntake } from "../hooks/use-agentic-intake";

export function AgenticTaskIntakePage({ api }: { readonly api: AgenticApi }) { const intake = useAgenticIntake(api); return <section className="catalogWorkspace agenticWorkspace"><PageHeader eyebrow="Digital Workforce" title="New governed task" description="Start with the guided Store Health review or use advanced intake." /><TaskIntakeForm onSubmit={(input) => void intake.submit(input)} submitting={intake.submitting} message={intake.message} /></section>; }
