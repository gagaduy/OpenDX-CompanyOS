// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

export function assertIntegrationEnvironment(
  source: Record<string, string | undefined>,
): void {
  const databaseUrl = source.TEST_DATABASE_URL;
  if (databaseUrl === undefined) return;

  const databaseName = new URL(databaseUrl).pathname
    .split("/")
    .filter(Boolean)
    .at(-1);
  if (databaseName === undefined || !/[-_]test$/.test(databaseName)) {
    throw new Error(
      "TEST_DATABASE_URL must target a database ending in -test or _test",
    );
  }

  const bucket = source.MINIO_BUCKET;
  if (bucket !== undefined && !/-test$/.test(bucket)) {
    throw new Error(
      "MINIO_BUCKET must end in -test when integration tests are enabled",
    );
  }
}

export default function setup(): void {
  assertIntegrationEnvironment(process.env);
}
