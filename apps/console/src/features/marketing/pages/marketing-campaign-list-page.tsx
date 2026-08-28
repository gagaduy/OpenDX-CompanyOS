// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { MarketingApi } from "../api/marketing-api";
import type { MarketingCampaign } from "../types";

export function MarketingCampaignListPage({
  api,
}: {
  readonly api: MarketingApi;
}) {
  const [campaigns, setCampaigns] = useState<readonly MarketingCampaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const fetchList = async () => {
      try {
        setLoading(true);
        const data = await api.listCampaigns();
        if (active) {
          setCampaigns(data.items);
          setError(null);
        }
      } catch (err: any) {
        if (active) setError(err.message || "Failed to load marketing campaigns");
      } finally {
        if (active) setLoading(false);
      }
    };
    fetchList();
    return () => {
      active = false;
    };
  }, [api]);

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            Marketing & Creative Publication
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Governed Facebook Page campaigns, digital employees, and artifact deliverables.
          </p>
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300 border border-red-200 dark:border-red-800 text-sm">
          {error}
        </div>
      )}

      {loading ? (
        <div className="p-12 text-center text-sm text-gray-500">
          Loading marketing campaigns...
        </div>
      ) : campaigns.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 dark:border-gray-700 p-12 text-center">
          <p className="text-base font-medium text-gray-700 dark:text-gray-300">
            No marketing campaigns found.
          </p>
          <p className="text-xs text-gray-500 mt-1">
            Campaigns initiated via AI CEO or direct staff intake will appear here.
          </p>
        </div>
      ) : (
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 overflow-hidden shadow-sm">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50 dark:bg-gray-800/60 text-xs font-semibold text-gray-500 border-b border-gray-200 dark:border-gray-800 uppercase tracking-wider">
              <tr>
                <th className="px-6 py-3.5">Campaign ID</th>
                <th className="px-6 py-3.5">Status</th>
                <th className="px-6 py-3.5">Assignment</th>
                <th className="px-6 py-3.5">Created By</th>
                <th className="px-6 py-3.5">Created At</th>
                <th className="px-6 py-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {campaigns.map((camp) => (
                <tr key={camp.id} className="hover:bg-gray-50/50 dark:hover:bg-gray-800/30 transition">
                  <td className="px-6 py-4 font-mono text-xs text-gray-900 dark:text-gray-100">
                    <Link
                      to={`/marketing/campaigns/${camp.id}`}
                      className="text-blue-600 dark:text-blue-400 hover:underline font-semibold"
                    >
                      {camp.id.slice(0, 8)}...
                    </Link>
                  </td>
                  <td className="px-6 py-4">
                    <span className="px-2.5 py-1 text-xs font-semibold rounded-full bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 border border-blue-200 dark:border-blue-800 uppercase">
                      {camp.state.replace(/_/g, " ")}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-xs text-gray-600 dark:text-gray-400">
                    {camp.assignmentMode}
                  </td>
                  <td className="px-6 py-4 text-xs text-gray-600 dark:text-gray-400">
                    {camp.createdBy}
                  </td>
                  <td className="px-6 py-4 text-xs text-gray-500">
                    {new Date(camp.createdAt).toLocaleString()}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <Link
                      to={`/marketing/campaigns/${camp.id}`}
                      className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-700 transition"
                    >
                      View Control Room →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
