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
import {
  parseStorefrontHeroImportArguments,
} from "./storefront-hero-import.config";
import {
  loadStorefrontHeroImportFiles,
  MAXIMUM_HERO_VIDEO_BYTES,
} from "./storefront-hero-import.files";

const environment = parseApiEnvironment(process.env);
const paths = parseStorefrontHeroImportArguments(process.argv.slice(2));
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
  maximumBytes: MAXIMUM_HERO_VIDEO_BYTES,
});

try {
  const { bytes, config } = await loadStorefrontHeroImportFiles(paths);
  const result = await service.import({ ...config, bytes });
  console.info(
    `code=${result.code} digest=${result.contentDigest.slice(0, 12)} bytes=${result.byteSize} durationMs=${result.durationMs} chapters=${result.chapterCount}`,
  );
} finally {
  await pool.end();
}
