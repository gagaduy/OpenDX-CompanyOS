// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import type { MarketingApi } from "../api/marketing-api";
import type { MarketingCampaignDetail } from "../types";
import { CampaignBriefCard } from "../components/campaign-brief-card";
import { ContentDraftPreview } from "../components/content-draft-preview";
import { VisualAssetPreview } from "../components/visual-asset-preview";
import { FacebookPostPreviewModal } from "../components/facebook-post-preview-modal";
import { CampaignApprovalActionBar } from "../components/campaign-approval-action-bar";
import { MarketingDeliverablesPanel } from "../components/marketing-deliverables-panel";

export function MarketingCampaignDetailPage({
  api,
}: {
  readonly api: MarketingApi;
}) {
  const { campaignId } = useParams();
  const [detail, setDetail] = useState<MarketingCampaignDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);

  const loadData = async () => {
    if (!campaignId) return;
    try {
      setLoading(true);
      const data = await api.getCampaign(campaignId);
      setDetail(data);
      setError(null);
    } catch (err: any) {
      setError(err.message || "Failed to load marketing campaign detail");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [campaignId]);

  const handleApprove = async () => {
    if (!campaignId) return;
    try {
      setActionLoading(true);
      await api.approveCampaign(campaignId, { decision: "approve" });
      await loadData();
    } catch (err: any) {
      setError(err.message || "Approval failed");
    } finally {
      setActionLoading(false);
    }
  };

  const handleRequestRevision = async (feedback: string) => {
    if (!campaignId) return;
    try {
      setActionLoading(true);
      await api.requestRevision(campaignId, { feedback });
      await loadData();
    } catch (err: any) {
      setError(err.message || "Revision request failed");
    } finally {
      setActionLoading(false);
    }
  };

  const handleGenerateDeliverables = async () => {
    if (!campaignId) return;
    try {
      setActionLoading(true);
      await api.generateDeliverables(campaignId);
      await loadData();
    } catch (err: any) {
      setError(err.message || "Deliverable generation failed");
    } finally {
      setActionLoading(false);
    }
  };

  if (loading && !detail) {
    return (
      <div className="p-12 text-center text-sm text-gray-500">
        Loading campaign control room...
      </div>
    );
  }

  if (!detail) {
    return (
      <div className="p-8 max-w-7xl mx-auto space-y-4">
        <div className="p-6 rounded-xl bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300 border border-red-200 dark:border-red-800 text-sm">
          {error || "Marketing campaign not found"}
        </div>
        <Link to="/marketing/campaigns" className="text-blue-600 hover:underline text-sm font-semibold">
          ← Back to Marketing Campaigns
        </Link>
      </div>
    );
  }

  const { campaign, brief, contentVersions, visualAssets, artifacts, publicationRecord } = detail;
  const latestContent = contentVersions[contentVersions.length - 1] ?? null;
  const latestVisual = visualAssets[visualAssets.length - 1] ?? null;

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">
      {/* Top Breadcrumb & Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs text-gray-500 mb-1">
            <Link to="/marketing/campaigns" className="hover:underline">
              Marketing
            </Link>
            <span>/</span>
            <span className="font-mono">{campaign.id.slice(0, 8)}</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            {brief?.campaignName ?? "Marketing Campaign"}
          </h1>
        </div>

        {publicationRecord && (
          <a
            href={publicationRecord.postUrl}
            target="_blank"
            rel="noreferrer"
            className="px-4 py-2 text-xs font-bold rounded-lg bg-blue-600 hover:bg-blue-500 text-white shadow-sm transition flex items-center gap-1.5 shrink-0"
          >
            <span>🌐</span> View Live Facebook Post ↗
          </a>
        )}
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300 border border-red-200 dark:border-red-800 text-sm">
          {error}
        </div>
      )}

      {/* Action Bar */}
      <CampaignApprovalActionBar
        campaign={campaign}
        onApprove={handleApprove}
        onRequestRevision={handleRequestRevision}
        onGenerateDeliverables={handleGenerateDeliverables}
        onOpenPreview={() => setPreviewOpen(true)}
        loading={actionLoading}
      />

      {/* Brief Card */}
      <CampaignBriefCard brief={brief} />

      {/* Creative Split: Content Draft & Visual Asset */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ContentDraftPreview contents={contentVersions} />
        <VisualAssetPreview visuals={visualAssets} />
      </div>

      {/* Deliverables Panel */}
      <MarketingDeliverablesPanel
        artifacts={artifacts}
        getDownloadUrl={api.getArtifactDownloadUrl}
      />

      {/* Live Facebook Post Preview Modal */}
      <FacebookPostPreviewModal
        isOpen={previewOpen}
        onClose={() => setPreviewOpen(false)}
        brief={brief}
        content={latestContent}
        visual={latestVisual}
      />
    </div>
  );
}
