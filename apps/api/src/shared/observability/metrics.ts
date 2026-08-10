// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

export interface HttpMetricSample {
  readonly method: string;
  readonly route: string;
  readonly statusCode: number;
  readonly durationMs: number;
}

export interface MetricsRegistry {
  recordHttpRequest(sample: HttpMetricSample): void;
  render(): string;
}

export function createMetricsRegistry(): MetricsRegistry {
  const requestTotals = new Map<string, number>();
  const durationCounts = new Map<string, number>();
  const durationSums = new Map<string, number>();

  return {
    recordHttpRequest(sample) {
      const method = sanitizeLabel(sample.method);
      const route = sanitizeLabel(sample.route);
      const status = sanitizeLabel(String(sample.statusCode));
      increment(requestTotals, labels({ method, route, status }));
      increment(durationCounts, labels({ method, route }));
      increment(durationSums, labels({ method, route }), sample.durationMs);
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
      ];
      return `${lines.join("\n")}\n`;
    },
  };
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
