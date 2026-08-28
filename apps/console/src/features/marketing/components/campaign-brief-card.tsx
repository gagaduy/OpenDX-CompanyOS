// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { CampaignBrief } from "../types";

export function CampaignBriefCard({ brief }: { readonly brief: CampaignBrief | null }) {
  if (!brief) {
    return (
      <div className="rounded-xl border border-dashed border-gray-300 dark:border-gray-700 p-6 text-center text-sm text-gray-500">
        No campaign brief attached.
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-6 shadow-sm">
      <div className="flex items-center justify-between border-b border-gray-100 dark:border-gray-800 pb-4 mb-4">
        <div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            {brief.campaignName}
          </h3>
          <p className="text-xs text-gray-500">
            Subject: <span className="font-medium text-gray-700 dark:text-gray-300">{brief.subjectKind} ({brief.subjectReference})</span>
          </p>
        </div>
        <span className="px-2.5 py-1 text-xs font-medium rounded-full bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
          Target: {brief.facebookPageConfigurationId}
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
        <div>
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider block">Objective</span>
          <p className="mt-1 text-gray-800 dark:text-gray-200">{brief.objective}</p>
        </div>

        <div>
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider block">Mandatory Message</span>
          <p className="mt-1 text-gray-800 dark:text-gray-200 font-medium">{brief.mandatoryMessage}</p>
        </div>

        <div>
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider block">Target Audience & Tone</span>
          <p className="mt-1 text-gray-800 dark:text-gray-200">
            {brief.audience ?? "General"} • {brief.tone ?? "Professional"} ({brief.language.toUpperCase()})
          </p>
        </div>

        <div>
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider block">Call to Action</span>
          <p className="mt-1 text-blue-600 dark:text-blue-400 font-semibold">{brief.callToAction}</p>
        </div>
      </div>

      {brief.prohibitedClaims.length > 0 && (
        <div className="mt-4 pt-3 border-t border-gray-100 dark:border-gray-800">
          <span className="text-xs font-semibold text-red-600 dark:text-red-400 uppercase tracking-wider block mb-1">
            Prohibited Claims (Strictly Guarded)
          </span>
          <div className="flex flex-wrap gap-2">
            {brief.prohibitedClaims.map((claim, idx) => (
              <span
                key={idx}
                className="px-2 py-0.5 text-xs rounded bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300 border border-red-200 dark:border-red-800"
              >
                🚫 {claim}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
