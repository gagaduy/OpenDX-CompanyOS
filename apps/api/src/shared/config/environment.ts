// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { z } from "zod";

const positiveInteger = z
  .string()
  .regex(/^\d+$/)
  .transform(Number)
  .pipe(z.number().int().positive());

const apiEnvironmentSchema = z.object({
  OPENDX_ENV: z.enum(["development", "test", "production"]),
  API_PORT: positiveInteger.pipe(z.number().max(65_535)),
  DATABASE_URL: z.url().refine((value) => value.startsWith("postgres"), {
    message: "must be a PostgreSQL URL",
  }),
  CONSOLE_ORIGIN: z.url(),
  KEYCLOAK_ISSUER: z.url(),
  KEYCLOAK_AUDIENCE: z.string().trim().min(1),
  MINIO_ENDPOINT: z.url(),
  MINIO_ACCESS_KEY: z.string().trim().min(1),
  MINIO_SECRET_KEY: z.string().min(1),
  MINIO_BUCKET: z.string().trim().min(1),
  MEDIA_MAX_BYTES: positiveInteger,
});

export interface ApiEnvironment {
  readonly environment: "development" | "test" | "production";
  readonly apiPort: number;
  readonly databaseUrl: string;
  readonly consoleOrigin: string;
  readonly keycloakIssuer: string;
  readonly keycloakAudience: string;
  readonly minioEndpoint: string;
  readonly minioAccessKey: string;
  readonly minioSecretKey: string;
  readonly minioBucket: string;
  readonly mediaMaxBytes: number;
}

export function parseApiEnvironment(
  source: Record<string, string | undefined>,
): ApiEnvironment {
  const value = apiEnvironmentSchema.parse(source);

  return {
    environment: value.OPENDX_ENV,
    apiPort: value.API_PORT,
    databaseUrl: value.DATABASE_URL,
    consoleOrigin: value.CONSOLE_ORIGIN,
    keycloakIssuer: value.KEYCLOAK_ISSUER,
    keycloakAudience: value.KEYCLOAK_AUDIENCE,
    minioEndpoint: value.MINIO_ENDPOINT,
    minioAccessKey: value.MINIO_ACCESS_KEY,
    minioSecretKey: value.MINIO_SECRET_KEY,
    minioBucket: value.MINIO_BUCKET,
    mediaMaxBytes: value.MEDIA_MAX_BYTES,
  };
}
