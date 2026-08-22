// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

export type ExperienceTier = "high" | "medium" | "low" | "static";

export interface DeviceSignals {
  readonly webgl: boolean;
  readonly reducedMotion: boolean;
  readonly width: number;
  readonly memoryGb?: number;
  readonly cores?: number;
}

export interface ExperienceBudget {
  readonly dpr: number;
  readonly shadows: boolean;
  readonly idleMotion: boolean;
}

const budgets: Readonly<Record<ExperienceTier, ExperienceBudget>> = {
  high: { dpr: 1.75, shadows: true, idleMotion: true },
  medium: { dpr: 1.25, shadows: false, idleMotion: true },
  low: { dpr: 1, shadows: false, idleMotion: false },
  static: { dpr: 1, shadows: false, idleMotion: false },
};

export function selectExperienceTier(signals: DeviceSignals): ExperienceTier {
  if (!signals.webgl) return "static";
  if (
    signals.reducedMotion ||
    signals.width < 768 ||
    (signals.memoryGb !== undefined && signals.memoryGb <= 4) ||
    (signals.cores !== undefined && signals.cores <= 4)
  ) {
    return "low";
  }
  if (
    signals.width < 1280 ||
    (signals.memoryGb !== undefined && signals.memoryGb < 8)
  ) {
    return "medium";
  }
  return "high";
}

export function budgetForTier(tier: ExperienceTier): ExperienceBudget {
  return budgets[tier];
}
