// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { Client } from "minio";
import { parseApiEnvironment } from "../../../../shared/config/environment";
import { createPostgresPool } from "../../../../shared/database/postgres";
import { PostgresTransactionRunner } from "../../../../shared/database/transaction";
import { bootstrapProductMediaBucket } from "../storage/bootstrap-product-media-bucket";
import { MinioProductMediaStorage } from "../storage/minio-product-media.storage";
import { seedCatalog } from "./catalog.seed";

const environment = parseApiEnvironment(process.env);
const pool = createPostgresPool(environment);
const endpoint = new URL(environment.minioEndpoint);
const minio = new Client({
  endPoint: endpoint.hostname,
  port: Number(endpoint.port || (endpoint.protocol === "https:" ? 443 : 80)),
  useSSL: endpoint.protocol === "https:",
  accessKey: environment.minioAccessKey,
  secretKey: environment.minioSecretKey,
});

try {
  await bootstrapProductMediaBucket(minio, environment.minioBucket);
  await seedCatalog(
    new PostgresTransactionRunner(pool),
    new MinioProductMediaStorage(minio, environment.minioBucket),
  );
  console.info("NovaCommerce catalog seed completed.");
} finally {
  await pool.end();
}
