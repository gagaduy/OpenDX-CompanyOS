// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { CSSProperties } from "react";
import { render } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";

const commandCenterCss = readFileSync(
  "src/features/agentic/styles/command-center-redesign.css",
  "utf8",
);
const legacyCommandCenterCss = readFileSync(
  "src/features/agentic/styles/agentic-command-center.css",
  "utf8",
);

describe("Agentic Command Center theme", () => {
  afterEach(() => {
    document.head.querySelector("style[data-command-center-test]")?.remove();
  });

  it("uses light canvas and panel surfaces under the light console theme", () => {
    const style = document.createElement("style");
    style.dataset.commandCenterTest = "true";
    style.textContent = `
      .consoleLayout[data-theme="light"] {
        --canvas: #f5f6f8;
        --surface-1: #ffffff;
        --surface-2: #f0f2f5;
        --surface-3: #e8ebf0;
        --hairline: #d8dde6;
        --ink: #111827;
        --ink-muted: #374151;
        --ink-subtle: #667085;
      }
      ${commandCenterCss}
    `;
    document.head.appendChild(style);

    const { container } = render(
      <div className="consoleLayout" data-theme="light">
        <section
          className="commandCenterWorkspace"
          style={{
            "--canvas": "#f5f6f8",
            "--surface-1": "#ffffff",
            "--surface-2": "#f0f2f5",
            "--surface-3": "#e8ebf0",
            "--hairline": "#d8dde6",
            "--ink": "#111827",
            "--ink-muted": "#374151",
            "--ink-subtle": "#667085",
          } as CSSProperties}
        >
          <article className="ccCeoCard">AI CEO</article>
          <article className="ccLiveFeedCard">Timeline</article>
          <article className="ccDiagnosticsModal">Diagnostics</article>
          <article className="sdModalContainer">Deliverable</article>
        </section>
      </div>,
    );

    const workspace = container.querySelector(".commandCenterWorkspace")!;
    expect(getComputedStyle(workspace).colorScheme).toBe("light");

    const rules = Array.from(style.sheet?.cssRules ?? []).filter(
      (rule): rule is CSSStyleRule => rule instanceof CSSStyleRule,
    );
    const workspaceRule = rules
      .filter((rule) => rule.selectorText === '.consoleLayout[data-theme="light"] .commandCenterWorkspace')
      .at(-1);
    const panelRule = rules
      .filter((rule) => rule.selectorText.includes('.consoleLayout[data-theme="light"] .ccCeoCard'))
      .at(-1);

    expect(workspaceRule?.style.getPropertyValue("background")).toBe("var(--canvas)");
    expect(panelRule?.style.getPropertyValue("background")).toBe("var(--surface-1)");
    expect(panelRule?.selectorText).toContain(
      '.consoleLayout[data-theme="light"] .ccDiagnosticsModal',
    );
    expect(panelRule?.selectorText).toContain(
      '.consoleLayout[data-theme="light"] .sdModalContainer',
    );
  });

  it("scales Command Center typography by twenty percent", () => {
    const style = document.createElement("style");
    style.dataset.commandCenterTest = "true";
    style.textContent = `${legacyCommandCenterCss}\n${commandCenterCss}`;
    document.head.appendChild(style);

    const rules = Array.from(style.sheet?.cssRules ?? []).filter(
      (rule): rule is CSSStyleRule => rule instanceof CSSStyleRule,
    );
    const workspaceRule = rules
      .filter((rule) => rule.selectorText === ".commandCenterWorkspace")
      .at(-1);
    const titleRule = rules.filter((rule) => rule.selectorText === ".ccTitle").at(-1);
    const compactLabelRule = rules
      .filter((rule) => rule.selectorText === ".ccTimelineTimeDate")
      .at(-1);
    const campaignTitleRule = rules.find(
      (rule) => rule.selectorText === ".ccActiveCampaignTitle",
    );

    expect(workspaceRule?.style.getPropertyValue("--cc-font-scale")).toBe("1.2");
    expect(titleRule?.style.fontSize).toBe("calc(1.65rem * var(--cc-font-scale))");
    expect(compactLabelRule?.style.fontSize).toContain("var(--cc-font-scale)");
    expect(campaignTitleRule?.style.fontSize).toContain("var(--cc-font-scale)");
  });
});
