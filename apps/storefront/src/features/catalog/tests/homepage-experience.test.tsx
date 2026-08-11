// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useRef } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ExperienceSceneNavigation } from "../components/homepage-experience/experience-scene-navigation";
import { useHomepageScroll } from "../hooks/use-homepage-scroll";
import { HOMEPAGE_SCENE_IDS } from "../types/homepage-experience.types";

describe("homepage scroll experience", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("coalesces scroll progress and marks the active scene", () => {
    let scheduledFrame: FrameRequestCallback | undefined;
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      scheduledFrame = callback;
      return 1;
    });
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => undefined);
    Object.defineProperty(window, "innerHeight", {
      configurable: true,
      value: 1_000,
    });
    Object.defineProperty(window, "scrollY", {
      configurable: true,
      value: 4_000,
    });

    render(<ScrollHarness reducedMotion={false} />);
    const journey = screen.getByTestId("journey");
    Object.defineProperty(journey, "scrollHeight", {
      configurable: true,
      value: 7_000,
    });
    vi.spyOn(journey, "getBoundingClientRect").mockReturnValue(
      rectangle({ top: -4_000, height: 7_000 }),
    );

    fireEvent.scroll(window);
    act(() => scheduledFrame?.(0));

    expect(screen.getByTestId("active-scene")).toHaveTextContent("gaming");
    expect(screen.getByRole("button", { name: "Gaming" })).toHaveAttribute(
      "aria-current",
      "location",
    );
  });

  it("scrolls to a selected scene and disables smooth motion when requested", async () => {
    vi.spyOn(window, "requestAnimationFrame").mockImplementation(() => 1);
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => undefined);
    const scrollIntoView = vi.fn();
    Object.defineProperty(window.HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value: scrollIntoView,
    });

    const { rerender } = render(<ScrollHarness reducedMotion={false} />);
    await userEvent.click(screen.getByRole("button", { name: "Gaming" }));
    expect(scrollIntoView).toHaveBeenLastCalledWith({
      behavior: "smooth",
      block: "start",
    });

    rerender(<ScrollHarness reducedMotion />);
    await userEvent.click(screen.getByRole("button", { name: "Điện thoại" }));
    expect(scrollIntoView).toHaveBeenLastCalledWith({
      behavior: "auto",
      block: "start",
    });
  });
});

function ScrollHarness({ reducedMotion }: { readonly reducedMotion: boolean }) {
  const journeyRef = useRef<HTMLDivElement>(null);
  const director = useHomepageScroll(journeyRef, { reducedMotion });
  return (
    <div>
      <ExperienceSceneNavigation
        activeScene={director.activeScene}
        onSelect={director.selectScene}
      />
      <output data-testid="active-scene">{director.activeScene}</output>
      <div ref={journeyRef} data-testid="journey">
        {HOMEPAGE_SCENE_IDS.map((scene) => (
          <section id={`homepage-${scene}`} key={scene} />
        ))}
      </div>
    </div>
  );
}

function rectangle({
  top,
  height,
}: {
  readonly top: number;
  readonly height: number;
}): DOMRect {
  return {
    x: 0,
    y: top,
    top,
    right: 1_000,
    bottom: top + height,
    left: 0,
    width: 1_000,
    height,
    toJSON: () => ({}),
  };
}
