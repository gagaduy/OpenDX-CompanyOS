// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { useState } from "react";
import type { MarketingCampaign } from "../types";

export function CampaignApprovalActionBar({
  campaign,
  onApprove,
  onRequestRevision,
  onGenerateDeliverables,
  onOpenPreview,
  loading = false,
}: {
  readonly campaign: MarketingCampaign;
  readonly onApprove: () => Promise<void>;
  readonly onRequestRevision: (feedback: string) => Promise<void>;
  readonly onGenerateDeliverables: () => Promise<void>;
  readonly onOpenPreview: () => void;
  readonly loading?: boolean;
}) {
  const [revisionModalOpen, setRevisionModalOpen] = useState(false);
  const [revisionFeedback, setRevisionFeedback] = useState("");

  const handleRevisionSubmit = async () => {
    if (!revisionFeedback.trim()) return;
    await onRequestRevision(revisionFeedback);
    setRevisionModalOpen(false);
    setRevisionFeedback("");
  };

  const isAwaitingApproval =
    campaign.state === "campaign_review" ||
    campaign.state === "awaiting_human_approval" ||
    campaign.state === "scheduled";

  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 shadow-sm flex flex-wrap items-center justify-between gap-4">
      <div className="flex items-center gap-3">
        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
          Campaign State:
        </span>
        <span className="px-3 py-1 text-xs font-bold rounded-full bg-blue-50 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 border border-blue-200 dark:border-blue-800 uppercase tracking-wider">
          {campaign.state.replace(/_/g, " ")}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-2.5">
        <button
          type="button"
          onClick={onOpenPreview}
          className="px-3.5 py-2 text-xs font-semibold rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-700 transition"
        >
          📱 Preview Facebook Post
        </button>

        <button
          type="button"
          disabled={loading}
          onClick={onGenerateDeliverables}
          className="px-3.5 py-2 text-xs font-semibold rounded-lg bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 transition disabled:opacity-50"
        >
          📦 Generate Deliverables
        </button>

        {isAwaitingApproval && (
          <>
            <button
              type="button"
              disabled={loading}
              onClick={() => setRevisionModalOpen(true)}
              className="px-3.5 py-2 text-xs font-semibold rounded-lg bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800 hover:bg-amber-100 dark:hover:bg-amber-900/60 transition disabled:opacity-50"
            >
              🔄 Request Revision
            </button>

            <button
              type="button"
              disabled={loading}
              onClick={onApprove}
              className="px-4 py-2 text-xs font-bold rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white shadow-sm transition disabled:opacity-50 flex items-center gap-1.5"
            >
              ✓ Approve & Publish to Facebook
            </button>
          </>
        )}
      </div>

      {/* Revision Modal */}
      {revisionModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-gray-900 rounded-xl max-w-md w-full p-6 shadow-xl border border-gray-200 dark:border-gray-800">
            <h3 className="text-base font-bold text-gray-900 dark:text-white mb-2">
              Request Creative Revision
            </h3>
            <p className="text-xs text-gray-500 mb-4">
              Provide feedback for the Digital Employees. This will invalidate current package approval and trigger re-drafting.
            </p>
            <textarea
              rows={4}
              value={revisionFeedback}
              onChange={(e) => setRevisionFeedback(e.target.value)}
              placeholder="e.g. Tone should be more energetic, emphasize the 50% discount mandatory message."
              className="w-full text-xs rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 p-3 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 mb-4"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setRevisionModalOpen(false)}
                className="px-3.5 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleRevisionSubmit}
                disabled={!revisionFeedback.trim() || loading}
                className="px-4 py-1.5 text-xs font-bold bg-amber-600 hover:bg-amber-500 text-white rounded disabled:opacity-50"
              >
                Submit Revision Request
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
