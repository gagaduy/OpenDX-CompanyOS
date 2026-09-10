// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { MigrationBuilder } from "node-pg-migrate";

export function up(pgm: MigrationBuilder): void {
  pgm.sql(`
    CREATE TABLE storefront_hero_presentations (
      id UUID PRIMARY KEY,
      code TEXT NOT NULL UNIQUE CHECK (btrim(code) <> ''),
      object_key TEXT NOT NULL UNIQUE
        CHECK (object_key ~ '^storefront/hero/[a-f0-9]{64}\\.mp4$'),
      content_type TEXT NOT NULL CHECK (content_type = 'video/mp4'),
      byte_size BIGINT NOT NULL CHECK (byte_size > 0),
      duration_ms INTEGER NOT NULL CHECK (duration_ms > 0),
      content_digest TEXT NOT NULL UNIQUE
        CHECK (content_digest ~ '^[a-f0-9]{64}$'),
      enabled BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE UNIQUE INDEX storefront_hero_one_enabled_idx
      ON storefront_hero_presentations(enabled)
      WHERE enabled = TRUE;

    CREATE TABLE storefront_hero_chapters (
      presentation_id UUID NOT NULL
        REFERENCES storefront_hero_presentations(id) ON DELETE CASCADE,
      category_id UUID NOT NULL
        REFERENCES categories(id) ON DELETE RESTRICT,
      sort_order INTEGER NOT NULL CHECK (sort_order >= 0),
      start_ms INTEGER NOT NULL CHECK (start_ms >= 0),
      end_ms INTEGER NOT NULL CHECK (end_ms > start_ms),
      label TEXT NOT NULL CHECK (btrim(label) <> ''),
      PRIMARY KEY (presentation_id, category_id),
      UNIQUE (presentation_id, sort_order)
    );

    CREATE FUNCTION storefront_hero_chapter_guard()
    RETURNS TRIGGER
    LANGUAGE plpgsql
    AS $function$
    DECLARE
      presentation_duration_ms INTEGER;
      overlaps_existing_chapter BOOLEAN;
    BEGIN
      SELECT duration_ms
      INTO presentation_duration_ms
      FROM storefront_hero_presentations
      WHERE id = NEW.presentation_id;

      IF NEW.end_ms > presentation_duration_ms THEN
        RAISE EXCEPTION 'Storefront hero chapter ends beyond presentation duration';
      END IF;

      IF TG_OP = 'INSERT' THEN
        SELECT EXISTS (
          SELECT 1
          FROM storefront_hero_chapters
          WHERE presentation_id = NEW.presentation_id
            AND int4range(start_ms, end_ms, '[)')
              && int4range(NEW.start_ms, NEW.end_ms, '[)')
        ) INTO overlaps_existing_chapter;
      ELSE
        SELECT EXISTS (
          SELECT 1
          FROM storefront_hero_chapters
          WHERE presentation_id = NEW.presentation_id
            AND (presentation_id, category_id)
              IS DISTINCT FROM (OLD.presentation_id, OLD.category_id)
            AND int4range(start_ms, end_ms, '[)')
              && int4range(NEW.start_ms, NEW.end_ms, '[)')
        ) INTO overlaps_existing_chapter;
      END IF;

      IF overlaps_existing_chapter THEN
        RAISE EXCEPTION 'Storefront hero chapters must not overlap';
      END IF;

      RETURN NEW;
    END;
    $function$;

    CREATE TRIGGER storefront_hero_chapter_guard_trigger
    BEFORE INSERT OR UPDATE ON storefront_hero_chapters
    FOR EACH ROW
    EXECUTE FUNCTION storefront_hero_chapter_guard();
  `);
}

export function down(pgm: MigrationBuilder): void {
  pgm.sql(`
    DROP TRIGGER IF EXISTS storefront_hero_chapter_guard_trigger
      ON storefront_hero_chapters;
    DROP FUNCTION IF EXISTS storefront_hero_chapter_guard();
    DROP TABLE IF EXISTS storefront_hero_chapters;
    DROP TABLE IF EXISTS storefront_hero_presentations;
  `);
}
