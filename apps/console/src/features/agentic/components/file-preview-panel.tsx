// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { Link } from "react-router-dom";
import type { AgenticFilePreview } from "../types/agentic.types";

interface FilePreviewPanelProps {
  readonly preview: AgenticFilePreview;
  readonly approving: boolean;
  readonly taskId?: string;
  readonly onApprove: () => void;
}

export function FilePreviewPanel({ preview, approving, taskId, onApprove }: FilePreviewPanelProps) {
  return <section className="agenticPreviewPanel" aria-label="File preview">
    <header><div><h2>{preview.rowCount} rows ready for review</h2><p>{preview.invalidRows} invalid rows · {preview.columnCount} columns</p></div></header>
    <dl className="metricList">
      <div><dt>Preview digest</dt><dd>{preview.previewDigest}</dd></div>
      <div><dt>File version</dt><dd>{preview.fileVersion}</dd></div>
      <div><dt>Coordinator</dt><dd>AI CEO coordinator</dd></div>
      <div><dt>Eligible Departments</dt><dd>{preview.governance.eligibleDepartments.join(", ")}</dd></div>
      <div><dt>Allowed tools</dt><dd>{showList(preview.governance.allowedTools)}</dd></div>
      <div><dt>Data classes</dt><dd>{showList(preview.governance.dataClasses)}</dd></div>
      <div><dt>Risk signals</dt><dd>{showList(preview.governance.riskSignals)}</dd></div>
    </dl>
    <div><h3>Proposed sources</h3><ul>{preview.sourceReferences.map(({ fileId, line, column }) =>
      <li key={`${fileId}:${line}:${column ?? 0}`}>Line {line}{column === undefined ? "" : `, column ${column}`}</li>)}</ul></div>
    <div><h3>Bounded sample</h3><pre>{preview.samples.join("\n")}</pre></div>
    <p>Department dependencies are planned after task start.</p>
    <button className="primaryButton" type="button" disabled={approving || taskId !== undefined} onClick={onApprove}>{approving ? "Approving…" : "Approve preview"}</button>
    {taskId && <Link to={`/agentic/tasks/${taskId}`}>Open created task</Link>}
  </section>;
}

function showList(values: readonly string[]): string { return values.length === 0 ? "None" : values.join(", "); }
