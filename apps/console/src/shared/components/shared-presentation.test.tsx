// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { ComingSoonControl } from "./coming-soon-control";
import { DialogShell } from "./dialog-shell";
import { PageHeader } from "./page-header";
import { SystemState } from "./system-state";

describe("shared operational presentation", () => {
  it("renders a structured page header with actions", () => {
    render(
      <PageHeader
        eyebrow="Catalog"
        title="Products"
        description="Manage the assortment."
        breadcrumb={[{ label: "Catalog" }, { label: "Products" }]}
        actions={<button type="button">New product</button>}
      />,
    );

    expect(screen.getByRole("heading", { name: "Products" })).toBeVisible();
    expect(screen.getByRole("navigation", { name: "Breadcrumb" }))
      .toHaveTextContent("CatalogProducts");
    expect(screen.getByRole("button", { name: "New product" })).toBeEnabled();
  });

  it("keeps unsupported controls disabled and explicit", () => {
    render(<ComingSoonControl label="Export CSV" />);

    expect(screen.getByRole("button", {
      name: /Export CSV.*Coming soon/i,
    })).toBeDisabled();
  });

  it("uses alert semantics for denied states", () => {
    render(
      <SystemState
        kind="denied"
        title="Access restricted"
        action={<button type="button">Return</button>}
      />,
    );

    expect(screen.getByRole("alert")).toHaveTextContent("Access restricted");
    expect(screen.getByRole("button", { name: "Return" })).toBeEnabled();
  });

  it("closes dialogs with Escape and restores focus", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    function Harness() {
      const [open, setOpen] = useState(false);
      return <>
        <button type="button" onClick={() => setOpen(true)}>Open dialog</button>
        <DialogShell open={open} title="Create ticket" onClose={() => {
          onClose();
          setOpen(false);
        }}>
          <button type="button">Save ticket</button>
        </DialogShell>
      </>;
    }
    render(<Harness />);
    const opener = screen.getByRole("button", { name: "Open dialog" });
    await user.click(opener);
    expect(screen.getByRole("button", { name: "Save ticket" })).toHaveFocus();

    await user.keyboard("{Escape}");

    expect(onClose).toHaveBeenCalledOnce();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(opener).toHaveFocus();
  });
});
