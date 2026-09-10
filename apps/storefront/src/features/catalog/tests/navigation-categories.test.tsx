// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useNavigationCategories } from "../hooks/use-navigation-categories";

describe("navigation categories", () => {
  it("loads live Catalog categories for the Storefront shell", async () => {
    const categories = [
      { id: "phones-id", name: "Điện thoại", slug: "phones", sortOrder: 0 },
    ];
    const api = { categories: vi.fn(async () => categories) };

    render(<NavigationCategoryProbe api={api} />);

    expect(screen.getByRole("status")).toHaveTextContent("Đang tải");
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent("Điện thoại"),
    );
    expect(api.categories).toHaveBeenCalledOnce();
  });
});

function NavigationCategoryProbe({
  api,
}: {
  readonly api: Parameters<typeof useNavigationCategories>[0];
}) {
  const state = useNavigationCategories(api);
  return <output role="status">{state.loading ? "Đang tải" : state.categories.map((category) => category.name).join(", ")}</output>;
}
