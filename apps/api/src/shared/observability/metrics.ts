// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

export interface HttpMetricSample {
  readonly method: string;
  readonly route: string;
  readonly statusCode: number;
  readonly durationMs: number;
}

export interface AgenticToolMetricSample {
  readonly tool: string;
  readonly version: number;
  readonly department: string;
  readonly outcome: string;
  readonly errorCode: string;
  readonly durationMs: number;
  readonly rows: number;
  readonly resultBytes: number;
}

export interface AgenticToolIdentity {
  readonly tool: string;
  readonly version: number;
  readonly department: string;
}

export interface MetricsRegistry {
  recordHttpRequest(sample: HttpMetricSample): void;
  adjustAgenticToolActive(identity: AgenticToolIdentity, delta: 1 | -1): void;
  recordAgenticToolInvocation(sample: AgenticToolMetricSample): void;
  render(): string;
}

export function createMetricsRegistry(): MetricsRegistry {
  const requestTotals = new Map<string, number>();
  const durationCounts = new Map<string, number>();
  const durationSums = new Map<string, number>();
  const toolActive = new Map<string, number>();
  const toolTotals = new Map<string, number>();
  const toolDurationCounts = new Map<string, number>();
  const toolDurationSums = new Map<string, number>();
  const toolRowSums = new Map<string, number>();
  const toolResultByteSums = new Map<string, number>();

  return {
    recordHttpRequest(sample) {
      const method = sanitizeLabel(sample.method);
      const route = sanitizeLabel(sample.route);
      const status = sanitizeLabel(String(sample.statusCode));
      increment(requestTotals, labels({ method, route, status }));
      increment(durationCounts, labels({ method, route }));
      increment(durationSums, labels({ method, route }), sample.durationMs);
    },
    adjustAgenticToolActive(identity, delta) {
      const key = toolIdentityLabels(identity);
      toolActive.set(key, Math.max(0, (toolActive.get(key) ?? 0) + delta));
    },
    recordAgenticToolInvocation(sample) {
      const identity = toolIdentityLabels(sample);
      const outcome = normalizeToolOutcome(sample.outcome);
      const error = normalizeToolError(sample.errorCode);
      const result = `${identity},${labels({ outcome, error })}`;
      increment(toolTotals, result);
      increment(toolDurationCounts, identity);
      increment(toolDurationSums, identity, sample.durationMs);
      increment(toolRowSums, identity, sample.rows);
      increment(toolResultByteSums, identity, sample.resultBytes);
    },
    render() {
      const lines = [
        "# TYPE opendx_http_requests_total counter",
        ...renderMetric("opendx_http_requests_total", requestTotals),
        "# TYPE opendx_http_request_duration_ms_count counter",
        ...renderMetric(
          "opendx_http_request_duration_ms_count",
          durationCounts,
        ),
        "# TYPE opendx_http_request_duration_ms_sum counter",
        ...renderMetric("opendx_http_request_duration_ms_sum", durationSums),
        "# TYPE opendx_agentic_tool_active gauge",
        ...renderMetric("opendx_agentic_tool_active", toolActive),
        "# TYPE opendx_agentic_tool_invocations_total counter",
        ...renderMetric("opendx_agentic_tool_invocations_total", toolTotals),
        "# TYPE opendx_agentic_tool_duration_ms_count counter",
        ...renderMetric("opendx_agentic_tool_duration_ms_count", toolDurationCounts),
        "# TYPE opendx_agentic_tool_duration_ms_sum counter",
        ...renderMetric("opendx_agentic_tool_duration_ms_sum", toolDurationSums),
        "# TYPE opendx_agentic_tool_rows_sum counter",
        ...renderMetric("opendx_agentic_tool_rows_sum", toolRowSums),
        "# TYPE opendx_agentic_tool_result_bytes_sum counter",
        ...renderMetric("opendx_agentic_tool_result_bytes_sum", toolResultByteSums),
      ];
      return `${lines.join("\n")}\n`;
    },
  };
}

function toolIdentityLabels(identity: AgenticToolIdentity): string {
  return labels({
    tool: normalizeTool(identity.tool),
    version: identity.version === 1 ? "1" : "other",
    department: normalizeDepartment(identity.department),
  });
}

const toolOutcomes = new Set([
  "completed", "duplicate_replay", "denied", "in_progress",
  "conflict", "retryable_failure", "terminal_failure",
]);

function normalizeToolOutcome(value: string): string {
  return toolOutcomes.has(value) ? value : "terminal_failure";
}

const toolErrors = new Set([
  "NONE", "INTERNAL_ERROR", "AGENT_NOT_ACTIVE", "TASK_AGENT_MISMATCH",
  "CONFIGURATION_INVALID", "POLICY_DENIED", "APPROVAL_REQUIRED", "BUDGET_EXCEEDED",
  "TOOL_INPUT_INVALID", "TOOL_NOT_FOUND", "TOOL_GRANT_MISSING", "TOOL_SCOPE_DENIED",
  "TOOL_GRANT_EXHAUSTED", "TOOL_INVOCATION_IN_PROGRESS", "TOOL_RESULT_STALE",
  "TOOL_RESULT_TOO_LARGE", "TOOL_QUERY_TIMEOUT", "TOOL_SOURCE_UNAVAILABLE",
  "TOOL_OUTPUT_INVALID", "TOOL_UNAVAILABLE",
]);

function normalizeToolError(value: string): string {
  return toolErrors.has(value) ? value : "OTHER";
}

const departmentTools = new Set([
  "catalog.product_completeness", "catalog.publication_readiness",
  "catalog.merchandising_summary", "inventory.stock_risk", "inventory.slow_stock",
  "inventory.reservation_anomalies", "order.stalled_summary",
  "order.invalid_state_evidence", "order.expiry_risk", "finance.pending_payments",
  "finance.reconciliation_discrepancies", "finance.provider_evidence_status",
  "crm.segment_summary", "crm.followup_opportunities", "support.sla_risk",
  "support.classification_summary", "support.related_order_context",
]);

const departments = new Set([
  "catalog", "inventory", "order", "finance", "crm", "support",
]);

function normalizeTool(value: string): string {
  return departmentTools.has(value) ? sanitizeLabel(value) : "other";
}

function normalizeDepartment(value: string): string {
  return departments.has(value) ? sanitizeLabel(value) : "other";
}

function increment(
  store: Map<string, number>,
  key: string,
  amount = 1,
): void {
  store.set(key, (store.get(key) ?? 0) + amount);
}

function labels(values: Record<string, string>): string {
  return Object.entries(values)
    .map(([key, value]) => `${key}="${value}"`)
    .join(",");
}

function renderMetric(name: string, values: Map<string, number>): string[] {
  return [...values.entries()].map(([metricLabels, value]) =>
    `${name}{${metricLabels}} ${Number.isInteger(value) ? value : value.toFixed(3)}`,
  );
}

function sanitizeLabel(value: string): string {
  return value.replaceAll("\\", "\\\\").replaceAll('"', '\\"');
}
