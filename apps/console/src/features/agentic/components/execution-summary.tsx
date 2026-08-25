// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

export function ExecutionSummary({ state, reservedMicros, settledMicros, refreshedAt }: { readonly state: string; readonly reservedMicros: number; readonly settledMicros: number; readonly refreshedAt: string }) {
  return <section className="agenticExecutionSummary"><h2>{label(state)}</h2><p>{settledMicros} µcredits settled</p><p>{reservedMicros} µcredits reserved</p><p>Refreshed <time dateTime={refreshedAt}>{new Date(refreshedAt).toLocaleString()}</time></p></section>;
}
function label(value: string): string { return value.split("_").map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`).join(" "); }
