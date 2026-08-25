// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

export interface ComingSoonControlProps {
  readonly label: string;
  readonly presentation?: "button" | "panel";
}

export function ComingSoonControl({
  label,
  presentation = "button",
}: ComingSoonControlProps) {
  if (presentation === "panel") {
    return (
      <section className="comingSoon comingSoonPanel" aria-disabled="true">
        <strong>{label}</strong>
        <span>Coming soon</span>
      </section>
    );
  }

  return (
    <button
      className="comingSoon comingSoonButton"
      type="button"
      disabled
      aria-label={`${label} — Coming soon`}
    >
      <span>{label}</span>
      <small>Coming soon</small>
    </button>
  );
}
