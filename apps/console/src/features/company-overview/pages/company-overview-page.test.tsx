// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CompanyOverviewPage } from "./company-overview-page";

describe("CompanyOverviewPage", () => {
  it("presents the operating overview and governance guardrails", () => {
    render(<CompanyOverviewPage />);

    expect(
      screen.getByRole("heading", { name: "Company operating console" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("region", { name: "Mission control panels" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Human-governed")).toBeInTheDocument();
    expect(
      screen.getByText("Audit and provenance by default"),
    ).toBeInTheDocument();
  });
});
