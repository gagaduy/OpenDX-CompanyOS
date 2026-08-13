// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { render, screen, within } from "@testing-library/react";
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
    expect(
      screen.getByText(
        /A dark, dense product surface for governing the company, workflows/,
      ),
    ).toBeInTheDocument();
    const panels = within(screen.getByRole("region", { name: "Mission control panels" })).getAllByRole("article");
    for (const panel of panels) {
      expect(panel).toHaveTextContent(/Live|Foundation|Alpha|Planned/);
    }
    expect(screen.getByRole("article", { name: "Digital Workforce" })).toHaveTextContent("Planned");
    expect(screen.getByRole("article", { name: "Workflow Operations" })).toHaveTextContent("Planned");
    expect(screen.getByRole("article", { name: "Approval Inbox" })).toHaveTextContent("Planned");
  });
});
