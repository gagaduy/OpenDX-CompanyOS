// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { MigrationBuilder } from "node-pg-migrate";

export function up(pgm: MigrationBuilder): void {
  pgm.sql(`
    CREATE TABLE agentic_intake_files (
      id uuid PRIMARY KEY,
      object_key text NOT NULL UNIQUE
        CHECK(object_key~'^agentic-intake/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'),
      original_filename text NOT NULL CHECK(length(btrim(original_filename)) BETWEEN 1 AND 255),
      format text NOT NULL CHECK(format IN ('csv','txt')),
      media_type text NOT NULL CHECK(
        (format='csv' AND media_type='text/csv')
        OR (format='txt' AND media_type='text/plain')
      ),
      byte_size integer NOT NULL CHECK(byte_size BETWEEN 1 AND 2097152),
      payload_digest text NOT NULL CHECK(payload_digest~'^[a-f0-9]{64}$'),
      status text NOT NULL CHECK(status IN ('uploaded','scanning','clean','previewed','approved','rejected','deleted')),
      created_by text NOT NULL CHECK(length(btrim(created_by)) BETWEEN 1 AND 255),
      version integer NOT NULL DEFAULT 1 CHECK(version>0),
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      scanned_at timestamptz,
      approved_at timestamptz,
      rejected_at timestamptz,
      deleted_at timestamptz,
      CHECK(isfinite(created_at) AND isfinite(updated_at)
        AND (scanned_at IS NULL OR isfinite(scanned_at))
        AND (approved_at IS NULL OR isfinite(approved_at))
        AND (rejected_at IS NULL OR isfinite(rejected_at))
        AND (deleted_at IS NULL OR isfinite(deleted_at))),
      CHECK(updated_at>=created_at),
      CHECK(scanned_at IS NULL OR scanned_at>=created_at),
      CHECK(approved_at IS NULL OR approved_at>=created_at),
      CHECK(rejected_at IS NULL OR rejected_at>=created_at),
      CHECK(deleted_at IS NULL OR deleted_at>=created_at),
      CHECK(status<>'clean' OR scanned_at IS NOT NULL),
      CHECK(status<>'approved' OR approved_at IS NOT NULL),
      CHECK(status<>'rejected' OR rejected_at IS NOT NULL),
      CHECK(status<>'deleted' OR deleted_at IS NOT NULL)
    );
    CREATE INDEX agentic_intake_files_status_created_idx
      ON agentic_intake_files(status,created_at,id);

    CREATE FUNCTION agentic_guard_intake_file_transition() RETURNS trigger LANGUAGE plpgsql AS $f$
    BEGIN
      IF ROW(NEW.id,NEW.object_key,NEW.original_filename,NEW.format,NEW.media_type,
        NEW.byte_size,NEW.payload_digest,NEW.created_by,NEW.created_at)
        IS DISTINCT FROM ROW(OLD.id,OLD.object_key,OLD.original_filename,OLD.format,OLD.media_type,
          OLD.byte_size,OLD.payload_digest,OLD.created_by,OLD.created_at) THEN
        RAISE EXCEPTION 'Agentic intake file metadata is immutable' USING ERRCODE='P0001';
      END IF;
      IF NOT ((OLD.status='uploaded' AND NEW.status IN ('scanning','rejected'))
        OR (OLD.status='scanning' AND NEW.status IN ('clean','rejected'))
        OR (OLD.status='clean' AND NEW.status IN ('previewed','rejected'))
        OR (OLD.status='previewed' AND NEW.status IN ('approved','rejected'))
        OR (OLD.status IN ('approved','rejected') AND NEW.status='deleted')) THEN
        RAISE EXCEPTION 'Invalid agentic intake file transition' USING ERRCODE='P0001';
      END IF;
      IF NEW.version<>OLD.version+1 OR NEW.updated_at<OLD.updated_at THEN
        RAISE EXCEPTION 'Invalid agentic intake file version' USING ERRCODE='P0001';
      END IF;
      RETURN NEW;
    END; $f$;
    CREATE TRIGGER agentic_intake_files_transition
      BEFORE UPDATE ON agentic_intake_files FOR EACH ROW
      EXECUTE FUNCTION agentic_guard_intake_file_transition();
    CREATE TRIGGER agentic_intake_files_no_delete
      BEFORE DELETE ON agentic_intake_files FOR EACH ROW
      EXECUTE FUNCTION agentic_prevent_mutation();

    CREATE TABLE agentic_file_previews (
      id uuid PRIMARY KEY,
      file_id uuid NOT NULL REFERENCES agentic_intake_files(id),
      preview_version integer NOT NULL CHECK(preview_version>0),
      parser_version text NOT NULL CHECK(parser_version~'^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$'),
      payload_digest text NOT NULL CHECK(payload_digest~'^[a-f0-9]{64}$'),
      preview_digest text NOT NULL CHECK(preview_digest~'^[a-f0-9]{64}$'),
      summary jsonb NOT NULL CHECK(jsonb_typeof(summary)='object'),
      created_at timestamptz NOT NULL DEFAULT now() CHECK(isfinite(created_at)),
      UNIQUE(file_id,preview_version)
    );
    CREATE FUNCTION agentic_validate_file_preview() RETURNS trigger LANGUAGE plpgsql AS $f$
    DECLARE source_digest text;
    DECLARE intake_status text;
    BEGIN
      SELECT payload_digest,status INTO source_digest,intake_status
        FROM agentic_intake_files WHERE id=NEW.file_id FOR SHARE;
      IF source_digest IS NULL OR source_digest<>NEW.payload_digest OR intake_status<>'clean' THEN
        RAISE EXCEPTION 'File preview requires a clean matching intake file' USING ERRCODE='23514';
      END IF;
      RETURN NEW;
    END; $f$;
    CREATE TRIGGER agentic_file_previews_validate_parent
      BEFORE INSERT ON agentic_file_previews FOR EACH ROW
      EXECUTE FUNCTION agentic_validate_file_preview();
    CREATE TRIGGER agentic_file_previews_immutable
      BEFORE UPDATE OR DELETE ON agentic_file_previews FOR EACH ROW
      EXECUTE FUNCTION agentic_prevent_mutation();

    CREATE TABLE agentic_file_approvals (
      id uuid PRIMARY KEY,
      file_id uuid NOT NULL UNIQUE REFERENCES agentic_intake_files(id),
      preview_version integer NOT NULL,
      preview_digest text NOT NULL CHECK(preview_digest~'^[a-f0-9]{64}$'),
      task_id uuid NOT NULL UNIQUE REFERENCES agentic_tasks(id),
      idempotency_key text NOT NULL UNIQUE
        CHECK(idempotency_key~'^[A-Za-z0-9][A-Za-z0-9:._/-]{0,255}$'),
      approved_by text NOT NULL CHECK(length(btrim(approved_by)) BETWEEN 1 AND 255),
      approved_at timestamptz NOT NULL DEFAULT now() CHECK(isfinite(approved_at)),
      FOREIGN KEY(file_id,preview_version) REFERENCES agentic_file_previews(file_id,preview_version)
    );
    CREATE FUNCTION agentic_validate_file_approval() RETURNS trigger LANGUAGE plpgsql AS $f$
    DECLARE expected_digest text;
    DECLARE intake_status text;
    DECLARE task_state text;
    BEGIN
      SELECT preview_digest INTO expected_digest FROM agentic_file_previews
        WHERE file_id=NEW.file_id AND preview_version=NEW.preview_version;
      SELECT status INTO intake_status FROM agentic_intake_files WHERE id=NEW.file_id FOR SHARE;
      SELECT state INTO task_state FROM agentic_tasks WHERE id=NEW.task_id FOR SHARE;
      IF expected_digest IS NULL OR expected_digest<>NEW.preview_digest
        OR intake_status<>'previewed' OR task_state<>'draft' THEN
        RAISE EXCEPTION 'File approval requires a previewed matching file and draft task' USING ERRCODE='23514';
      END IF;
      RETURN NEW;
    END; $f$;
    CREATE TRIGGER agentic_file_approvals_validate
      BEFORE INSERT ON agentic_file_approvals FOR EACH ROW
      EXECUTE FUNCTION agentic_validate_file_approval();
    CREATE TRIGGER agentic_file_approvals_immutable
      BEFORE UPDATE OR DELETE ON agentic_file_approvals FOR EACH ROW
      EXECUTE FUNCTION agentic_prevent_mutation();
  `);
}

export function down(pgm: MigrationBuilder): void {
  pgm.sql(`
    DROP TRIGGER IF EXISTS agentic_file_approvals_immutable ON agentic_file_approvals;
    DROP TRIGGER IF EXISTS agentic_file_approvals_validate ON agentic_file_approvals;
    DROP FUNCTION IF EXISTS agentic_validate_file_approval;
    DROP TABLE IF EXISTS agentic_file_approvals;
    DROP TRIGGER IF EXISTS agentic_file_previews_immutable ON agentic_file_previews;
    DROP TRIGGER IF EXISTS agentic_file_previews_validate_parent ON agentic_file_previews;
    DROP FUNCTION IF EXISTS agentic_validate_file_preview;
    DROP TABLE IF EXISTS agentic_file_previews;
    DROP TRIGGER IF EXISTS agentic_intake_files_no_delete ON agentic_intake_files;
    DROP TRIGGER IF EXISTS agentic_intake_files_transition ON agentic_intake_files;
    DROP FUNCTION IF EXISTS agentic_guard_intake_file_transition;
    DROP TABLE IF EXISTS agentic_intake_files;
  `);
}
