# SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
# SPDX-License-Identifier: Apache-2.0

COMPOSE := docker compose -f infra/docker/docker-compose.yml

.PHONY: help up down logs check db-migrate db-rollback db-seed db-backup db-restore

help:
	@echo "help up down logs check db-migrate db-rollback db-seed db-backup db-restore"

up:
	$(COMPOSE) up --build -d

down:
	$(COMPOSE) down --remove-orphans

logs:
	$(COMPOSE) logs -f

check:
	$(COMPOSE) up -d postgres minio
	$(COMPOSE) run --rm minio-bootstrap
	$(COMPOSE) run --rm migrate
	$(COMPOSE) run --rm -e TEST_DATABASE_URL=postgres://opendx_local:opendx_local_password@postgres:5432/opendx_test -e MINIO_BUCKET=product-media-test api sh -ec 'pnpm lint && pnpm typecheck && pnpm test && pnpm --filter @opendx/api test:integration && pnpm --filter @opendx/console build && pnpm audit:repo'
	$(COMPOSE) --profile checks run --rm ai-check
	$(COMPOSE) config --quiet

db-migrate:
	$(COMPOSE) run --rm migrate

db-rollback:
	$(COMPOSE) run --rm api pnpm --filter @opendx/api db:rollback:all

db-seed:
	$(COMPOSE) run --rm seed

db-backup:
	@mkdir -p infra/backups
	@set -eu; backup_path="infra/backups/opendx-$$(date +%Y%m%d-%H%M%S).dump"; \
	$(COMPOSE) exec -T postgres pg_dump -U opendx_local -d opendx --format=custom > "$${backup_path}"; \
	echo "Created $${backup_path}"

db-restore:
	@set -eu; \
	test -n "$(BACKUP)" || (echo "BACKUP path is required" >&2; exit 1); \
	test -f "$(BACKUP)" || (echo "Backup not found: $(BACKUP)" >&2; exit 1); \
	$(COMPOSE) exec -T postgres pg_restore -U opendx_local -d opendx --clean --if-exists --no-owner < "$(BACKUP)"
