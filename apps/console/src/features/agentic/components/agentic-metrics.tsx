// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { AgenticTaskOverview } from "../types/agentic.types";
export function AgenticMetrics({ overview }: { readonly overview: AgenticTaskOverview }) { return <dl className="agenticMetrics"><div><dt>Running</dt><dd>{overview.counts.running}</dd></div><div><dt>Waiting approvals</dt><dd>{overview.pendingApprovals}</dd></div><div><dt>Failed</dt><dd>{overview.counts.failed}</dd></div><div><dt>Completed</dt><dd>{overview.counts.completed}</dd></div></dl>; }
