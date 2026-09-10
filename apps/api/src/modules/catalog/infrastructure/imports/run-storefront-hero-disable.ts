// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { randomUUID } from "node:crypto";
import { Client } from "minio";
import { StorefrontHeroImportService } from "../../application/services/implementations/storefront-hero-import.service";
import { parseApiEnvironment } from "../../../../shared/config/environment";
import { createPostgresPool } from "../../../../shared/database/postgres";
import { PostgresTransactionRunner } from "../../../../shared/database/transaction";
import { readMp4DurationMs } from "../media/mp4-duration";
import { PostgresqlStorefrontHeroRepository } from "../repositories/implementations/postgresql-storefront-hero.repository";
import { MinioStorefrontHeroMediaStorage } from "../storage/minio-storefront-hero-media.storage";
import { parseStorefrontHeroDisableArguments } from "./storefront-hero-import.config";

const environment = parseApiEnvironment(process.env);
const code = parseStorefrontHeroDisableArguments(process.argv.slice(2));
const pool = createPostgresPool(environment);
const endpoint = new URL(environment.minioEndpoint);
const minio = new Client({
  endPoint: endpoint.hostname,
  port: Number(endpoint.port || (endpoint.protocol === "https:" ? 443 : 80)),
  useSSL: endpoint.protocol === "https:",
  accessKey: environment.minioAccessKey,
  secretKey: environment.minioSecretKey,
});
const service = new StorefrontHeroImportService({
  repository: new PostgresqlStorefrontHeroRepository(),
  storage: new MinioStorefrontHeroMediaStorage(minio, environment.minioBucket),
  transactions: new PostgresTransactionRunner(pool),
  generateId: randomUUID,
  inspectDuration: readMp4DurationMs,
  maximumBytes: 50 * 1024 * 1024,
});

try {
  const disabled = await service.disable(code);
  console.info(`code=${code} status=${disabled ? "disabled" : "already-disabled"}`);
} finally {
  await pool.end();
}
