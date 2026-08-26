// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { useEffect, useRef } from "react";
import type { AgenticAuditEvent } from "../types/agentic.types";
export function AuditDetail({ event }: { readonly event: AgenticAuditEvent }) {
  const heading = useRef<HTMLHeadingElement>(null); useEffect(() => heading.current?.focus(), [event.id]);
  const metadata = [["Correlation", event.correlationId], ["Causation", event.causationId], ["Parameters digest", event.parametersDigest], ["Result digest", event.resultDigest], ["Error code", event.errorCode], ["Policy version", event.policyVersion], ["Model version", event.modelVersion], ["Tool version", event.toolVersion], ["Attempt", event.attempt], ["Duration ms", event.durationMs]] as const;
  return <section className="agenticAuditDetail"><h2 ref={heading} tabIndex={-1}>Audit metadata</h2><dl className="metricList"><div><dt>Actor</dt><dd>{event.actorType} · {event.actorId}</dd></div><div><dt>Resource</dt><dd>{event.resourceType} · {event.resourceId}</dd></div><div><dt>Outcome</dt><dd>{event.outcome}</dd></div>{metadata.filter(([, value]) => value !== undefined).map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl></section>;
}
