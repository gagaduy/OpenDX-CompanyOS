// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { VisualAsset } from "../types";

export function VisualAssetPreview({
  visuals,
}: {
  readonly visuals: readonly VisualAsset[];
}) {
  if (visuals.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-gray-300 dark:border-gray-700 p-6 text-center text-sm text-gray-500">
        No visual assets created yet.
      </div>
    );
  }

  const latest = visuals[visuals.length - 1]!;

  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-6 shadow-sm">
      <div className="flex items-center justify-between border-b border-gray-100 dark:border-gray-800 pb-3 mb-4">
        <div className="flex items-center gap-2">
          <h3 className="text-base font-semibold text-gray-900 dark:text-white">
            1:1 Visual Asset
          </h3>
          <span className="px-2 py-0.5 text-xs font-semibold rounded bg-purple-50 text-purple-700 dark:bg-purple-950/40 dark:text-purple-300 border border-purple-200 dark:border-purple-800">
            {latest.aspectRatio} Square ({latest.width}x{latest.height})
          </span>
        </div>
        <span className="text-xs text-gray-500 font-mono">
          {(latest.byteSize / 1024).toFixed(1)} KB
        </span>
      </div>

      <div className="flex flex-col sm:flex-row gap-4 items-start">
        <div className="w-48 h-48 rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700 bg-gradient-to-br from-indigo-500/10 to-purple-500/20 flex flex-col items-center justify-center p-4 text-center shrink-0">
          <span className="text-3xl mb-1">🖼️</span>
          <span className="text-xs font-semibold text-gray-800 dark:text-gray-200">
            {latest.aspectRatio} PNG Graphic
          </span>
          <span className="text-[10px] text-gray-500 mt-1 truncate max-w-[150px]">
            {latest.storageKey}
          </span>
        </div>

        <div className="flex-1 text-xs space-y-2">
          {latest.promptSummary && (
            <div>
              <span className="font-semibold text-gray-500 uppercase block mb-0.5">Creative Prompt Direction</span>
              <p className="text-gray-800 dark:text-gray-200 bg-gray-50 dark:bg-gray-800/50 p-2.5 rounded border border-gray-100 dark:border-gray-800">
                {latest.promptSummary}
              </p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-2 pt-1">
            <div>
              <span className="font-semibold text-gray-500 block">Format & Media</span>
              <span className="text-gray-800 dark:text-gray-200">{latest.mediaType}</span>
            </div>
            <div>
              <span className="font-semibold text-gray-500 block">Image SHA-256</span>
              <code className="text-[11px] text-gray-600 dark:text-gray-400 font-mono truncate block">
                {latest.imageDigest.slice(0, 16)}...
              </code>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
