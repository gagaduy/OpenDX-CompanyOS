// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { VisualAssetPreview } from "../components/visual-asset-preview";
import type { VisualAsset } from "../types";

const visual: VisualAsset = {
  id: "visual-1", campaignId: "campaign-1", versionNumber: 1,
  mediaType: "image/png", width: 1024, height: 1792, aspectRatio: "9:16",
  byteSize: 100, imageDigest: "a".repeat(64), altText: "Rendered campaign artwork",
  storageKey: "marketing/campaign-1/visual_v1.png", costMicros: 0,
  createdAt: "2026-09-08T00:00:00Z",
};

describe("VisualAssetPreview", () => {
  it("displays the rendered image and actual dimensions without cropping", () => {
    render(<VisualAssetPreview visuals={[visual]} imageUrl="blob:rendered-visual" loading={false} error={false} onRetry={vi.fn()} />);
    const img = screen.getByRole("img", { name: visual.altText! });
    expect(img).toHaveAttribute("src", "blob:rendered-visual");
    expect(img).toHaveAttribute("width", "1024");
    expect(img).toHaveAttribute("height", "1792");
    expect(screen.queryByText(/1080/)).not.toBeInTheDocument();
  });

  it("shows loading and retryable errors instead of a fabricated image", () => {
    const onRetry = vi.fn();
    const { rerender } = render(<VisualAssetPreview visuals={[visual]} loading error={false} onRetry={onRetry} />);
    expect(screen.getByRole("status")).toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    rerender(<VisualAssetPreview visuals={[visual]} loading={false} error onRetry={onRetry} />);
    expect(screen.getByRole("alert")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button"));
    expect(onRetry).toHaveBeenCalledOnce();
  });
});
