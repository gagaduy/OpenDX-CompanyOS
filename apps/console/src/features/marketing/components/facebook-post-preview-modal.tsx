// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { CampaignBrief, ContentVersion, VisualAsset } from "../types";

export function FacebookPostPreviewModal({
  isOpen,
  onClose,
  brief,
  content,
  visual,
}: {
  readonly isOpen: boolean;
  readonly onClose: () => void;
  readonly brief: CampaignBrief | null;
  readonly content: ContentVersion | null;
  readonly visual: VisualAsset | null;
}) {
  if (!isOpen) return null;

  const bodyText = content?.primaryText ?? content?.body ?? "No post copy available.";
  const headline = content?.headline;
  const hashtags = content?.hashtags ?? [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-white dark:bg-gray-900 rounded-2xl max-w-lg w-full shadow-2xl border border-gray-200 dark:border-gray-800 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-800">
          <div className="flex items-center gap-2">
            <span className="text-xl">📱</span>
            <h3 className="text-base font-semibold text-gray-900 dark:text-white">
              Facebook Page Live Feed Mockup
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-lg font-bold p-1"
          >
            ✕
          </button>
        </div>

        {/* Facebook Post Mockup Body */}
        <div className="p-6 overflow-y-auto bg-gray-100 dark:bg-gray-950 flex justify-center">
          <div className="w-full max-w-md bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-gray-200 dark:border-gray-800">
            {/* FB Header */}
            <div className="p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center text-white font-bold text-sm">
                ODX
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="text-sm font-bold text-gray-900 dark:text-white">
                    {brief?.facebookPageConfigurationId ?? "OpenDX Official"}
                  </span>
                  <span className="text-blue-500 text-xs">✓</span>
                </div>
                <div className="flex items-center gap-1 text-[11px] text-gray-500">
                  <span>Just now</span>
                  <span>•</span>
                  <span>🌐</span>
                </div>
              </div>
            </div>

            {/* Post Content */}
            <div className="px-4 pb-3 text-sm text-gray-800 dark:text-gray-100 whitespace-pre-wrap font-sans">
              {headline && <div className="font-bold mb-1.5">{headline}</div>}
              <p>{bodyText}</p>
              {hashtags.length > 0 && (
                <div className="mt-2 text-blue-600 dark:text-blue-400 font-medium">
                  {hashtags.map((h) => (h.startsWith("#") ? h : `#${h}`)).join(" ")}
                </div>
              )}
            </div>

            {/* 1:1 Image Preview */}
            <div className="w-full aspect-square bg-gradient-to-br from-indigo-900/10 via-purple-900/20 to-blue-900/10 border-y border-gray-100 dark:border-gray-800 flex flex-col items-center justify-center p-6 text-center">
              <span className="text-4xl mb-2">📸</span>
              <span className="text-sm font-semibold text-gray-800 dark:text-gray-200">
                {visual?.altText ?? brief?.campaignName ?? "Marketing Visual"}
              </span>
              <span className="text-xs text-gray-500 mt-1">
                1:1 Square Visual ({visual?.width ?? 1080} x {visual?.height ?? 1080})
              </span>
            </div>

            {/* FB Engagement Bar */}
            <div className="px-4 py-2 flex items-center justify-between text-xs text-gray-500 border-b border-gray-100 dark:border-gray-800">
              <span className="flex items-center gap-1">👍 ❤️ 128</span>
              <span>18 comments • 6 shares</span>
            </div>

            {/* FB Action Bar */}
            <div className="px-4 py-1.5 grid grid-cols-3 text-center text-xs font-semibold text-gray-600 dark:text-gray-400">
              <button type="button" className="py-1.5 hover:bg-gray-50 dark:hover:bg-gray-800 rounded">👍 Like</button>
              <button type="button" className="py-1.5 hover:bg-gray-50 dark:hover:bg-gray-800 rounded">💬 Comment</button>
              <button type="button" className="py-1.5 hover:bg-gray-50 dark:hover:bg-gray-800 rounded">↗️ Share</button>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3 bg-gray-50 dark:bg-gray-800/50 border-t border-gray-100 dark:border-gray-800 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium rounded-lg bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 hover:bg-gray-300 dark:hover:bg-gray-600"
          >
            Close Preview
          </button>
        </div>
      </div>
    </div>
  );
}
