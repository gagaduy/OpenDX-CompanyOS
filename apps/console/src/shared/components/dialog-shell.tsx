// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { useEffect, useId, useRef, type ReactNode } from "react";

export interface DialogShellProps {
  readonly open: boolean;
  readonly title: string;
  readonly mode?: "modal" | "drawer";
  readonly onClose: () => void;
  readonly children: ReactNode;
}

const focusableSelector = [
  "button:not([disabled])",
  "a[href]",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

export function DialogShell({
  children,
  mode = "modal",
  onClose,
  open,
  title,
}: DialogShellProps) {
  const titleId = useId();
  const surfaceRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    previousFocusRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    surfaceRef.current?.querySelector<HTMLElement>(focusableSelector)?.focus();
  }, [open]);

  if (!open) return null;

  const close = () => {
    onClose();
    previousFocusRef.current?.focus();
  };

  return (
    <div
      className="dialogBackdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) close();
      }}
    >
      <div
        ref={surfaceRef}
        className={mode === "drawer" ? "drawerSurface" : "dialogSurface"}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onKeyDown={(event) => {
          if (event.key === "Escape") close();
        }}
      >
        <h2 id={titleId}>{title}</h2>
        {children}
      </div>
    </div>
  );
}
