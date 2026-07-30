// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

export type EnvSource = Record<string, string | undefined>;

export function readStringEnv(
  env: EnvSource,
  key: string,
  fallback = "",
): string {
  return env[key] ?? fallback;
}
