// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

afterEach(() => cleanup());

if (typeof window !== "undefined") {
  class ResizeObserver {
    callback: ResizeObserverCallback;
    constructor(callback: ResizeObserverCallback) {
      this.callback = callback;
    }
    observe(target: Element) {
      const entry: ResizeObserverEntry = {
        target,
        contentRect: {
          width: 1200,
          height: 800,
          top: 0,
          left: 0,
          bottom: 800,
          right: 1200,
          x: 0,
          y: 0,
          toJSON: () => {},
        },
        borderBoxSize: [{ inlineSize: 1200, blockSize: 800 }],
        contentBoxSize: [{ inlineSize: 1200, blockSize: 800 }],
        devicePixelContentBoxSize: [{ inlineSize: 1200, blockSize: 800 }],
      };
      setTimeout(() => {
        this.callback([entry], this);
      }, 0);
    }
    unobserve() {}
    disconnect() {}
  }

  class DOMMatrixReadOnly {
    m22: number;
    constructor(transform: string) {
      const scale = transform?.match(/scale\(([1-9.])\)/)?.[1];
      this.m22 = scale !== undefined ? +scale : 1;
    }
  }

  window.ResizeObserver = ResizeObserver as unknown as typeof window.ResizeObserver;
  global.ResizeObserver = ResizeObserver as unknown as typeof ResizeObserver;
  (window as unknown as { DOMMatrixReadOnly: unknown }).DOMMatrixReadOnly = DOMMatrixReadOnly;
  (global as unknown as { DOMMatrixReadOnly: unknown }).DOMMatrixReadOnly = DOMMatrixReadOnly;

  Object.defineProperties(HTMLElement.prototype, {
    offsetHeight: { get() { return parseFloat(this.style.height) || 500; } },
    offsetWidth: { get() { return parseFloat(this.style.width) || 1000; } },
  });

  if (typeof SVGElement !== "undefined") {
    (SVGElement.prototype as unknown as { getBBox: () => { x: number; y: number; width: number; height: number } }).getBBox = () => ({
      x: 0,
      y: 0,
      width: 0,
      height: 0,
    });
  }
}
