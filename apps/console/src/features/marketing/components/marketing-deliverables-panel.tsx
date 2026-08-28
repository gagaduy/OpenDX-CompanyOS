// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { MarketingArtifact } from "../types";

export function MarketingDeliverablesPanel({
  artifacts,
  getDownloadUrl,
}: {
  readonly artifacts: readonly MarketingArtifact[];
  readonly getDownloadUrl: (artifactId: string) => string;
}) {
  const getIconForKind = (kind: string) => {
    if (kind.includes("docx")) return "📝";
    if (kind.includes("png")) return "🖼️";
    if (kind.includes("xlsx")) return "📊";
    if (kind.includes("pdf")) return "📄";
    return "📦";
  };

  const getLabelForKind = (kind: string) => {
    switch (kind) {
      case "campaign_brief_docx":
        return "1. Campaign Brief (DOCX)";
      case "facebook_content_docx":
        return "2. Facebook Content Iterations (DOCX)";
      case "facebook_visual_png":
        return "3. 1:1 Creative Visual Asset (PNG)";
      case "facebook_publication_log_xlsx":
        return "4. Publication & Attempt Log (XLSX)";
      case "marketing_final_report_pdf":
        return "5. Final Marketing Summary Report (PDF)";
      default:
        return kind;
    }
  };

  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-6 shadow-sm">
      <div className="flex items-center justify-between border-b border-gray-100 dark:border-gray-800 pb-3 mb-4">
        <h3 className="text-base font-semibold text-gray-900 dark:text-white flex items-center gap-2">
          <span>📦</span> Required Marketing Deliverables ({artifacts.length}/5)
        </h3>
        <span className="text-xs text-gray-500">
          MinIO & Database Backed Truth
        </span>
      </div>

      {artifacts.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-300 dark:border-gray-700 p-6 text-center text-sm text-gray-500">
          No deliverables generated yet. Click "Generate Deliverables" above to assemble all 5 compliant artifacts.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {artifacts.map((art) => (
            <div
              key={art.id}
              className="rounded-lg border border-gray-200 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-800/30 p-3.5 flex items-center justify-between gap-3 hover:border-blue-500/40 transition"
            >
              <div className="flex items-center gap-3 overflow-hidden">
                <span className="text-2xl">{getIconForKind(art.kind)}</span>
                <div className="overflow-hidden">
                  <h4 className="text-xs font-bold text-gray-900 dark:text-white truncate">
                    {getLabelForKind(art.kind)}
                  </h4>
                  <p className="text-[11px] text-gray-500 truncate font-mono mt-0.5">
                    {art.filename} • {(art.byteSize / 1024).toFixed(1)} KB
                  </p>
                  <code className="text-[10px] text-gray-400 dark:text-gray-500 font-mono block truncate">
                    SHA: {art.sha256Digest.slice(0, 20)}...
                  </code>
                </div>
              </div>

              <a
                href={getDownloadUrl(art.id)}
                download={art.filename}
                target="_blank"
                rel="noreferrer"
                className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 border border-blue-200 dark:border-blue-800 hover:bg-blue-100 transition shrink-0"
              >
                Download
              </a>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
