// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

export function MetricSparkline({ values }: { readonly values: readonly number[] }) {
  const points = chartPoints(values, 120, 36, 3);
  return <svg className="metricSparkline" viewBox="0 0 120 36" aria-hidden="true">
    <polyline points={points} fill="none" vectorEffect="non-scaling-stroke" />
  </svg>;
}

function chartPoints(values: readonly number[], width: number, height: number, padding: number): string {
  if (values.length === 0) return "";
  const maximum = Math.max(...values);
  const minimum = Math.min(...values);
  const span = maximum - minimum;
  return values.map((value, index) => {
    const x = values.length === 1 ? width / 2 : padding + index * (width - padding * 2) / (values.length - 1);
    const y = span === 0 ? height / 2 : padding + (maximum - value) * (height - padding * 2) / span;
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  }).join(" ");
}
