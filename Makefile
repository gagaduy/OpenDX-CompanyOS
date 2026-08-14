# SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
# SPDX-License-Identifier: Apache-2.0

COMPOSE_ENV := $(if $(wildcard .env),--env-file .env,)
COMPOSE := docker compose $(COMPOSE_ENV) -f infra/docker/docker-compose.yml
export BACKUP

.PHONY: help up down logs check check-crm-support-dashboard check-agentic-workflow temporal-cli db-migrate db-rollback db-seed db-backup db-restore

help:
	@echo "help up down logs check check-crm-support-dashboard check-agentic-workflow temporal-cli db-migrate db-rollback db-seed db-backup db-restore"

up:
	$(COMPOSE) up --build -d --wait

down:
	$(COMPOSE) down --remove-orphans

logs:
	$(COMPOSE) logs -f

check:
	$(COMPOSE) up -d postgres minio
	$(COMPOSE) run --rm minio-bootstrap
	$(COMPOSE) run --rm migrate
	$(COMPOSE) run --rm -e TEST_DATABASE_URL=postgres://opendx_local:opendx_local_password@postgres:5432/opendx_test -e MINIO_BUCKET=product-media-test api sh -ec 'pnpm lint && pnpm typecheck && pnpm test && pnpm --filter @opendx/api test:integration && pnpm --filter @opendx/console build && pnpm --filter @opendx/storefront build && pnpm audit:repo'
	$(COMPOSE) --profile checks run --rm ai-check
	$(COMPOSE) config --quiet

check-crm-support-dashboard:
	$(COMPOSE) up -d postgres minio clamav
	$(COMPOSE) run --rm minio-bootstrap
	$(COMPOSE) build api
	CRM_SUPPORT_DASHBOARD_EVIDENCE_DIR=/tmp/opendx-crm-support-dashboard-exit \
	TEST_DATABASE_URL=postgres://opendx_local:opendx_local_password@postgres:5432/opendx_test \
	MINIO_BUCKET=product-media-test \
	MINIO_SUPPORT_BUCKET=support-attachments-test \
	RUN_REPORTING_SCALE=1 \
	$(COMPOSE) run --rm -e TEST_DATABASE_URL -e MINIO_BUCKET -e MINIO_SUPPORT_BUCKET -e CRM_SUPPORT_DASHBOARD_EVIDENCE_DIR -e RUN_REPORTING_SCALE api pnpm run check:crm-support-dashboard

check-agentic-workflow:
	pnpm check:agentic-workflow

temporal-cli:
	$(COMPOSE) run --rm --no-deps temporal-cli $(ARGS)

db-migrate:
	$(COMPOSE) run --rm migrate

db-rollback:
	$(COMPOSE) run --rm api pnpm --filter @opendx/api db:rollback:all

db-seed:
	$(COMPOSE) run --rm seed

db-backup:
	@mkdir -p infra/backups
	@set -eu; \
	stamp="$$(date -u +%Y%m%d-%H%M%S)"; \
	sql_path="infra/backups/opendx-$${stamp}.sql"; \
	dump_path="infra/backups/opendx-$${stamp}.dump"; \
	sql_tmp="$${sql_path}.tmp.$$$$"; \
	dump_tmp="$${dump_path}.tmp.$$$$"; \
	cleanup() { rm -f -- "$${sql_tmp}" "$${dump_tmp}"; }; \
	trap cleanup EXIT HUP INT TERM; \
	test ! -e "$${sql_path}" && test ! -e "$${dump_path}" || { echo "Backup already exists for $${stamp}" >&2; exit 1; }; \
	$(COMPOSE) exec -T postgres pg_dump -U opendx_local -d opendx --format=plain --clean --if-exists --no-owner --no-privileges > "$${sql_tmp}"; \
	test -s "$${sql_tmp}" || { echo "SQL backup is empty" >&2; exit 1; }; \
	$(COMPOSE) exec -T postgres pg_dump -U opendx_local -d opendx --format=custom --no-owner --no-privileges > "$${dump_tmp}"; \
	test -s "$${dump_tmp}" || { echo "Custom backup is empty" >&2; exit 1; }; \
	ln "$${sql_tmp}" "$${sql_path}"; \
	if ! ln "$${dump_tmp}" "$${dump_path}"; then rm -f -- "$${sql_path}"; exit 1; fi; \
	cleanup; \
	trap - EXIT HUP INT TERM; \
	echo "Created $${sql_path}"; \
	echo "Created $${dump_path}"

db-restore:
	@set -eu; \
	backup_path="$${BACKUP:-}"; \
	test -n "$${backup_path}" || { echo "BACKUP path is required" >&2; exit 1; }; \
	test -f "$${backup_path}" || { echo "Backup not found: $${backup_path}" >&2; exit 1; }; \
	case "$${backup_path}" in \
		*.sql) restore_format=sql ;; \
		*.dump) restore_format=dump ;; \
		*) echo "BACKUP must end in .sql or .dump" >&2; exit 1 ;; \
	esac; \
	$(COMPOSE) stop api console storefront; \
	trap '$(COMPOSE) start api console storefront' EXIT; \
	if [ "$${restore_format}" = sql ]; then \
		$(COMPOSE) exec -T postgres psql -X -U opendx_local -d opendx \
			--set ON_ERROR_STOP=1 --single-transaction < "$${backup_path}"; \
	else \
		$(COMPOSE) exec -T postgres pg_restore -U opendx_local -d opendx \
			--clean --if-exists --no-owner --exit-on-error --single-transaction < "$${backup_path}"; \
	fi
