// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

export type TaskExecutionProfile = "store_health_review" | "advanced_live";

export function taskExecutionProfile(mode: "store_health_review" | "advanced"): TaskExecutionProfile {
  return mode === "advanced" ? "advanced_live" : "store_health_review";
}
