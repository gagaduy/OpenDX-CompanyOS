// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { Pool, PoolClient } from "pg";
import type {
  SocialAccountEntity,
  SocialTokenStatus,
} from "../../../domain/entities/social-account";
import type {
  SocialAccountRepository,
  UpdateAccessTokenInput,
  UpdateSocialHealthInput,
} from "../../../domain/repositories/social-account.repository";

interface SocialAccountRow {
  readonly id: string;
  readonly platform: string;
  readonly account_id: string;
  readonly account_name: string;
  readonly access_token: string;
  readonly token_type: string;
  readonly token_status: string;
  readonly token_expires_at: Date | string | null;
  readonly data_access_expires_at: Date | string | null;
  readonly scopes: unknown;
  readonly is_long_lived: boolean;
  readonly last_checked_at: Date | string | null;
  readonly last_error: string | null;
  readonly metadata: unknown;
  readonly created_at: Date | string;
  readonly updated_at: Date | string;
}

export class PostgresqlSocialAccountRepository implements SocialAccountRepository {
  constructor(private readonly pool: Pool | PoolClient) {}

  async findByPlatformAndId(
    platform: "facebook" | "instagram",
    accountId: string,
  ): Promise<SocialAccountEntity | null> {
    const result = await this.pool.query<SocialAccountRow>(
      `
      SELECT *
      FROM marketing_social_accounts
      WHERE platform = $1 AND account_id = $2
      LIMIT 1
      `,
      [platform, accountId],
    );

    if (result.rows.length === 0) {
      return null;
    }

    return this.mapRowToEntity(result.rows[0]);
  }

  async listAccounts(): Promise<readonly SocialAccountEntity[]> {
    const result = await this.pool.query<SocialAccountRow>(
      `
      SELECT *
      FROM marketing_social_accounts
      ORDER BY platform ASC, account_name ASC
      `,
    );

    return result.rows.map((row) => this.mapRowToEntity(row));
  }

  async upsertAccount(entity: SocialAccountEntity): Promise<SocialAccountEntity> {
    const scopesJson = JSON.stringify(entity.scopes);
    const metadataJson = JSON.stringify(entity.metadata);

    const result = await this.pool.query<SocialAccountRow>(
      `
      INSERT INTO marketing_social_accounts (
        id, platform, account_id, account_name, access_token,
        token_type, token_status, token_expires_at, data_access_expires_at,
        scopes, is_long_lived, last_checked_at, last_error, metadata,
        created_at, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5,
        $6, $7, $8, $9,
        $10::jsonb, $11, $12, $13, $14::jsonb,
        $15, $16
      )
      ON CONFLICT (platform, account_id) DO UPDATE SET
        account_name = EXCLUDED.account_name,
        access_token = EXCLUDED.access_token,
        token_type = EXCLUDED.token_type,
        token_status = EXCLUDED.token_status,
        token_expires_at = EXCLUDED.token_expires_at,
        data_access_expires_at = EXCLUDED.data_access_expires_at,
        scopes = EXCLUDED.scopes,
        is_long_lived = EXCLUDED.is_long_lived,
        last_checked_at = EXCLUDED.last_checked_at,
        last_error = EXCLUDED.last_error,
        metadata = EXCLUDED.metadata,
        updated_at = EXCLUDED.updated_at
      RETURNING *
      `,
      [
        entity.id,
        entity.platform,
        entity.accountId,
        entity.accountName,
        entity.accessToken,
        entity.tokenType,
        entity.tokenStatus,
        entity.tokenExpiresAt ? new Date(entity.tokenExpiresAt) : null,
        entity.dataAccessExpiresAt ? new Date(entity.dataAccessExpiresAt) : null,
        scopesJson,
        entity.isLongLived,
        entity.lastCheckedAt ? new Date(entity.lastCheckedAt) : null,
        entity.lastError ?? null,
        metadataJson,
        new Date(entity.createdAt),
        new Date(entity.updatedAt),
      ],
    );

    return this.mapRowToEntity(result.rows[0]);
  }

  async updateHealthStatus(
    platform: "facebook" | "instagram",
    accountId: string,
    input: UpdateSocialHealthInput,
  ): Promise<void> {
    const scopesJson = input.scopes ? JSON.stringify(input.scopes) : null;

    await this.pool.query(
      `
      UPDATE marketing_social_accounts
      SET
        token_status = $3,
        token_expires_at = CASE WHEN $4::text IS NOT NULL THEN $4::timestamptz ELSE token_expires_at END,
        data_access_expires_at = CASE WHEN $5::text IS NOT NULL THEN $5::timestamptz ELSE data_access_expires_at END,
        scopes = CASE WHEN $6::jsonb IS NOT NULL THEN $6::jsonb ELSE scopes END,
        is_long_lived = CASE WHEN $7::boolean IS NOT NULL THEN $7::boolean ELSE is_long_lived END,
        last_checked_at = $8::timestamptz,
        last_error = $9,
        updated_at = now()
      WHERE platform = $1 AND account_id = $2
      `,
      [
        platform,
        accountId,
        input.tokenStatus,
        input.tokenExpiresAt ?? null,
        input.dataAccessExpiresAt ?? null,
        scopesJson,
        input.isLongLived ?? null,
        input.lastCheckedAt,
        input.lastError ?? null,
      ],
    );
  }

  async updateAccessToken(
    platform: "facebook" | "instagram",
    accountId: string,
    input: UpdateAccessTokenInput,
  ): Promise<void> {
    await this.pool.query(
      `
      UPDATE marketing_social_accounts
      SET
        access_token = $3,
        token_status = $4,
        token_expires_at = $5::timestamptz,
        data_access_expires_at = $6::timestamptz,
        is_long_lived = $7,
        last_checked_at = $8::timestamptz,
        last_error = $9,
        updated_at = now()
      WHERE platform = $1 AND account_id = $2
      `,
      [
        platform,
        accountId,
        input.accessToken,
        input.tokenStatus,
        input.tokenExpiresAt ?? null,
        input.dataAccessExpiresAt ?? null,
        input.isLongLived,
        input.lastCheckedAt,
        input.lastError ?? null,
      ],
    );
  }

  private mapRowToEntity(row: SocialAccountRow): SocialAccountEntity {
    let scopes: readonly string[] = [];
    if (Array.isArray(row.scopes)) {
      scopes = row.scopes.map(String);
    } else if (typeof row.scopes === "string") {
      try {
        const parsed = JSON.parse(row.scopes);
        if (Array.isArray(parsed)) {
          scopes = parsed.map(String);
        }
      } catch {
        scopes = [];
      }
    }

    let metadata: Record<string, unknown> = {};
    if (typeof row.metadata === "object" && row.metadata !== null) {
      metadata = row.metadata as Record<string, unknown>;
    } else if (typeof row.metadata === "string") {
      try {
        metadata = JSON.parse(row.metadata);
      } catch {
        metadata = {};
      }
    }

    return {
      id: row.id,
      platform: row.platform as "facebook" | "instagram",
      accountId: row.account_id,
      accountName: row.account_name,
      accessToken: row.access_token,
      tokenType: row.token_type,
      tokenStatus: row.token_status as SocialTokenStatus,
      tokenExpiresAt: row.token_expires_at ? new Date(row.token_expires_at).toISOString() : null,
      dataAccessExpiresAt: row.data_access_expires_at
        ? new Date(row.data_access_expires_at).toISOString()
        : null,
      scopes,
      isLongLived: Boolean(row.is_long_lived),
      lastCheckedAt: row.last_checked_at ? new Date(row.last_checked_at).toISOString() : null,
      lastError: row.last_error,
      metadata,
      createdAt: new Date(row.created_at).toISOString(),
      updatedAt: new Date(row.updated_at).toISOString(),
    };
  }
}
