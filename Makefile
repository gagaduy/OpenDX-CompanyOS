# SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
# SPDX-License-Identifier: Apache-2.0

COMPOSE_ENV := $(if $(wildcard .env),--env-file .env,)
COMPOSE := docker compose $(COMPOSE_ENV) -f infra/docker/docker-compose.yml
REPO_ROOT := $(patsubst %/,%,$(dir $(abspath $(lastword $(MAKEFILE_LIST)))))
export BACKUP

.PHONY: help up down logs check check-fast check-crm-support-dashboard check-agentic-workflow check-agentic-workflow-recovery check-agentic-department-tools check-agentic-model-runtime check-openrouter-live temporal-cli db-migrate db-rollback db-seed db-backup db-restore

help:
	@echo "help up down logs check check-fast check-crm-support-dashboard check-agentic-workflow check-agentic-workflow-recovery check-agentic-department-tools check-agentic-model-runtime check-openrouter-live temporal-cli db-migrate db-rollback db-seed db-backup db-restore"

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

check-fast:
	pnpm check:fast

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

check-agentic-workflow-recovery:
	pnpm check:agentic-workflow-recovery

check-agentic-department-tools:
	pnpm check:agentic-department-tools

check-agentic-model-runtime:
	pnpm check:agentic-model-runtime

check-openrouter-live:
	OPENROUTER_CONFIGURATION_EXPORT="$(OPENROUTER_CONFIGURATION_EXPORT)" pnpm check:openrouter-live

temporal-cli:
	$(COMPOSE) run --rm --no-deps temporal-cli $(ARGS)

db-migrate:
	$(COMPOSE) run --rm migrate

db-rollback:
	$(COMPOSE) run --rm api pnpm --filter @opendx/api db:rollback:all

db-seed:
	$(COMPOSE) run --rm seed

db-backup:
	@BACKUP_DIR="$(CURDIR)/infra/backups" \
	COMPOSE_FILE="$(CURDIR)/infra/docker/docker-compose.yml" \
	COMPOSE_ENV_FILE="$(if $(wildcard $(CURDIR)/.env),$(CURDIR)/.env,)" \
	OPENDX_DEPLOYMENT_MODE="$${OPENDX_DEPLOYMENT_MODE:-local}" \
	"$(REPO_ROOT)/scripts/ops/postgres-backup.sh"

db-restore:
	@COMPOSE_FILE="$(CURDIR)/infra/docker/docker-compose.yml" \
	COMPOSE_ENV_FILE="$(if $(wildcard $(CURDIR)/.env),$(CURDIR)/.env,)" \
	OPENDX_DEPLOYMENT_MODE="$${OPENDX_DEPLOYMENT_MODE:-local}" \
	"$(REPO_ROOT)/scripts/ops/postgres-restore.sh"
