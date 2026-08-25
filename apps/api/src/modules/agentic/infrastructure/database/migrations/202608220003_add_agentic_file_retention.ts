// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0
import type { MigrationBuilder } from "node-pg-migrate";
export function up(pgm: MigrationBuilder): void { pgm.sql(`
  ALTER TABLE agentic_intake_files ADD COLUMN retention_claimed_at timestamptz, ADD COLUMN object_deleted_at timestamptz;
  CREATE INDEX agentic_intake_files_retention_claim_idx ON agentic_intake_files(status,rejected_at,approved_at,deleted_at) WHERE object_deleted_at IS NULL;
  CREATE OR REPLACE FUNCTION agentic_guard_intake_file_transition() RETURNS trigger LANGUAGE plpgsql AS $f$
  BEGIN
    IF ROW(NEW.id,NEW.object_key,NEW.original_filename,NEW.format,NEW.media_type,NEW.byte_size,NEW.payload_digest,NEW.created_by,NEW.created_at) IS DISTINCT FROM ROW(OLD.id,OLD.object_key,OLD.original_filename,OLD.format,OLD.media_type,OLD.byte_size,OLD.payload_digest,OLD.created_by,OLD.created_at) THEN RAISE EXCEPTION 'Agentic intake file metadata is immutable' USING ERRCODE='P0001'; END IF;
    IF NOT ((OLD.status='uploaded' AND NEW.status IN ('scanning','rejected')) OR (OLD.status='scanning' AND NEW.status IN ('clean','rejected')) OR (OLD.status='clean' AND NEW.status IN ('previewed','rejected')) OR (OLD.status='previewed' AND NEW.status IN ('approved','rejected')) OR (OLD.status IN ('approved','rejected') AND NEW.status='deleted') OR (OLD.status=NEW.status AND (NEW.retention_claimed_at IS DISTINCT FROM OLD.retention_claimed_at OR NEW.object_deleted_at IS DISTINCT FROM OLD.object_deleted_at))) THEN RAISE EXCEPTION 'Invalid agentic intake file transition' USING ERRCODE='P0001'; END IF;
    IF NEW.version<>OLD.version+1 OR NEW.updated_at<OLD.updated_at THEN RAISE EXCEPTION 'Invalid agentic intake file version' USING ERRCODE='P0001'; END IF; RETURN NEW;
  END; $f$;
`); }
export function down(pgm: MigrationBuilder): void { pgm.sql(`DROP INDEX IF EXISTS agentic_intake_files_retention_claim_idx; ALTER TABLE agentic_intake_files DROP COLUMN IF EXISTS object_deleted_at, DROP COLUMN IF EXISTS retention_claimed_at;`); }
