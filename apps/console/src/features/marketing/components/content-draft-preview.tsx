// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { ContentVersion } from "../types";

export function ContentDraftPreview({
  contents,
}: {
  readonly contents: readonly ContentVersion[];
}) {
  if (contents.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-gray-300 dark:border-gray-700 p-6 text-center text-sm text-gray-500">
        No content drafts generated yet.
      </div>
    );
  }

  const latest = contents[contents.length - 1]!;

  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-6 shadow-sm">
      <div className="flex items-center justify-between border-b border-gray-100 dark:border-gray-800 pb-3 mb-4">
        <div className="flex items-center gap-2">
          <h3 className="text-base font-semibold text-gray-900 dark:text-white">
            Facebook Post Copy
          </h3>
          <span className="px-2 py-0.5 text-xs font-semibold rounded bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
            v{latest.versionNumber}
          </span>
        </div>
        <span className="text-xs text-gray-500">
          Total iterations: {contents.length}
        </span>
      </div>

      {latest.headline && (
        <div className="mb-3">
          <span className="text-xs font-semibold text-gray-500 uppercase block mb-1">Headline</span>
          <h4 className="text-sm font-bold text-gray-900 dark:text-white">{latest.headline}</h4>
        </div>
      )}

      <div className="mb-4">
        <span className="text-xs font-semibold text-gray-500 uppercase block mb-1">Body Text</span>
        <div className="rounded-lg bg-gray-50 dark:bg-gray-800/50 p-4 text-sm text-gray-800 dark:text-gray-200 whitespace-pre-wrap font-sans border border-gray-100 dark:border-gray-800">
          {latest.primaryText ?? latest.body}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs mb-3">
        <div>
          <span className="font-semibold text-gray-500 block">Call to Action</span>
          <span className="font-medium text-blue-600 dark:text-blue-400">{latest.callToAction}</span>
        </div>
        <div>
          <span className="font-semibold text-gray-500 block">Content Digest</span>
          <code className="text-[11px] text-gray-600 dark:text-gray-400 truncate block font-mono">
            {latest.contentDigest.slice(0, 16)}...
          </code>
        </div>
      </div>

      {latest.hashtags.length > 0 && (
        <div className="flex flex-wrap gap-1.5 pt-2 border-t border-gray-100 dark:border-gray-800">
          {latest.hashtags.map((tag, i) => (
            <span key={i} className="text-xs text-blue-600 dark:text-blue-400 font-medium">
              {tag.startsWith("#") ? tag : `#${tag}`}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
