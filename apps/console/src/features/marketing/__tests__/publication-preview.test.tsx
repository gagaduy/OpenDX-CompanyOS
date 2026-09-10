// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FacebookPostPreviewModal } from "../components/facebook-post-preview-modal";

describe("Publication image preview", () => {
  it("uses the generated image on Facebook, Instagram feed and story, including updates", () => {
    const props = { isOpen: true, onClose() {}, brief: null, content: null, visual: null, imageUrl: "blob:generated-v1" };
    const { rerender } = render(<FacebookPostPreviewModal {...props} />);
    expect(screen.getByRole("img")).toHaveAttribute("src", props.imageUrl);
    fireEvent.click(screen.getByRole("button", { name: /Instagram Feed/ }));
    expect(screen.getByRole("img")).toHaveAttribute("src", props.imageUrl);
    fireEvent.click(screen.getByRole("button", { name: /Instagram Story/ }));
    expect(screen.getByRole("img")).toHaveAttribute("src", props.imageUrl);
    rerender(<FacebookPostPreviewModal {...props} imageUrl="blob:generated-v2" />);
    expect(screen.getByRole("img")).toHaveAttribute("src", "blob:generated-v2");
    rerender(<FacebookPostPreviewModal {...props} imageUrl={undefined} imageLoading />);
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toBeInTheDocument();
    rerender(<FacebookPostPreviewModal {...props} imageUrl={undefined} imageError />);
    expect(screen.getByRole("alert")).toBeInTheDocument();
  });
});
