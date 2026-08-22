<!--
SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
SPDX-License-Identifier: Apache-2.0
-->

# Dual-format Make Database Backup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the root `make db-backup` create one safe `.sql`/`.dump` pair and make `make db-restore` restore either supported format.

**Architecture:** Keep the root Makefile as the contributor interface and preserve the production backup scripts unchanged. Exercise the Make recipes through a Node test that places fake `docker` and `date` executables first on `PATH`, so command selection, file publication, cleanup, collision behavior, and path quoting are verified without mutating a real database.

**Tech Stack:** GNU Make, POSIX shell, Docker Compose CLI contract, PostgreSQL `pg_dump`/`psql`/`pg_restore`, Node.js built-in test runner.

## Global Constraints

- Work on branch `phuong`; do not modify `main`.
- Change only the root Make commands, focused test/check wiring, contributor documentation, and changelog.
- Keep `scripts/ops/postgres-backup.sh` and `scripts/ops/postgres-restore.sh` custom-format production behavior unchanged.
- Use one UTC `YYYYMMDD-HHMMSS` timestamp for the `.sql` and `.dump` pair.
- Publish neither final output unless both dumps succeed and are non-empty.
- Never overwrite an existing backup path.
- Accept only exact `.sql` and `.dump` restore extensions.
- Preserve the application service stop/start trap during restore.
- Add no dependency.

---

## File Map

- Create `scripts/dev/make-database-backup.test.mjs`: isolated behavioral tests for Make backup and restore recipes.
- Modify `Makefile`: dual-format backup, atomic publication, extension-aware restore, and safe `BACKUP` export.
- Modify `package.json`: expose the focused Node test command.
- Modify `scripts/dev/check.sh`: include the focused Make behavior regression in the normal source gate.
- Modify `docs/development/database-operations.md`: document both artifacts and restore commands.
- Modify `docs/project-structure.md`: describe `infra/backups` as the ignored dual-format local destination.
- Modify `infra/backups/.gitignore`: ignore generated `.sql` files alongside `.dump` archives.
- Modify `scripts/audit/repo.sh`: reject tracked local backup files in either format.
- Modify `CHANGELOG.md`: record delivered behavior under `[Unreleased]`.

### Task 1: Dual-format backup with fail-closed publication

**Files:**
- Create: `scripts/dev/make-database-backup.test.mjs`
- Modify: `Makefile:5-54`
- Modify: `package.json:9-31`
- Modify: `scripts/dev/check.sh:5-18`

**Interfaces:**
- Consumes: GNU Make target `db-backup` and the existing Docker Compose command prefix.
- Produces: `pnpm test:make-database-backup`; one `.sql` and one `.dump` sharing a timestamp.

- [ ] **Step 1: Write the backup RED tests**

Create a Node test harness that makes a temporary working directory with a fake
`docker` executable and runs the repository Makefile with that directory as
`cwd`. The fake executable must append `process.argv.slice(2)` as one JSON line
to `FAKE_DOCKER_LOG`, emit distinct non-empty content for
`--format=plain`/`--format=custom`, and exit non-zero for the format selected by
`FAIL_DUMP_FORMAT`.

Add these assertions using `node:test`, `node:assert/strict`, `mkdtempSync`,
`mkdirSync`, `writeFileSync`, `chmodSync`, `readFileSync`, `readdirSync`, and
`spawnSync`:

```js
test("db-backup publishes one SQL/custom pair with one UTC timestamp", () => {
  const result = runMake("db-backup");
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(backupNames(), [
    "opendx-20260814-120102.dump",
    "opendx-20260814-120102.sql",
  ]);
  assert.match(readBackup(".sql"), /plain backup/);
  assert.match(readBackup(".dump"), /custom backup/);
  assertDockerCallContains("--format=plain", "--clean", "--if-exists", "--no-owner", "--no-privileges");
  assertDockerCallContains("--format=custom", "--no-owner", "--no-privileges");
});

test("db-backup publishes neither final file when either dump fails", () => {
  const result = runMake("db-backup", { FAIL_DUMP_FORMAT: "custom" });
  assert.notEqual(result.status, 0);
  assert.deepEqual(backupNames(), []);
  assert.deepEqual(temporaryBackupNames(), []);
});

test("db-backup rejects a final-path collision without overwriting it", () => {
  seedBackup("opendx-20260814-120102.sql", "keep-me");
  const result = runMake("db-backup");
  assert.notEqual(result.status, 0);
  assert.equal(readNamedBackup("opendx-20260814-120102.sql"), "keep-me");
  assert.deepEqual(temporaryBackupNames(), []);
});
```

- [ ] **Step 2: Run the tests and verify RED**

Run:

```bash
node --test scripts/dev/make-database-backup.test.mjs
```

Expected: FAIL because the existing target creates only one `.dump`, does not
request plain format, and does not provide pair-level cleanup/collision safety.

- [ ] **Step 3: Implement the minimal dual-format backup recipe**

Update `db-backup` to:

```make
db-backup:
	@mkdir -p infra/backups
	@set -eu; \
	stamp="$$(date -u +%Y%m%d-%H%M%S)"; \
	sql_path="infra/backups/opendx-$${stamp}.sql"; \
	dump_path="infra/backups/opendx-$${stamp}.dump"; \
	sql_tmp="$${sql_path}.tmp.$$$$"; dump_tmp="$${dump_path}.tmp.$$$$"; \
	cleanup() { rm -f -- "$${sql_tmp}" "$${dump_tmp}"; }; \
	trap cleanup EXIT HUP INT TERM; \
	test ! -e "$${sql_path}" && test ! -e "$${dump_path}" || { echo "Backup already exists for $${stamp}" >&2; exit 1; }; \
	$(COMPOSE) exec -T postgres pg_dump -U opendx_local -d opendx --format=plain --clean --if-exists --no-owner --no-privileges > "$${sql_tmp}"; \
	test -s "$${sql_tmp}" || { echo "SQL backup is empty" >&2; exit 1; }; \
	$(COMPOSE) exec -T postgres pg_dump -U opendx_local -d opendx --format=custom --no-owner --no-privileges > "$${dump_tmp}"; \
	test -s "$${dump_tmp}" || { echo "Custom backup is empty" >&2; exit 1; }; \
	ln "$${sql_tmp}" "$${sql_path}"; \
	if ! ln "$${dump_tmp}" "$${dump_path}"; then rm -f -- "$${sql_path}"; exit 1; fi; \
	cleanup; trap - EXIT HUP INT TERM; \
	echo "Created $${sql_path}"; echo "Created $${dump_path}"
```

Keep the fixed backup directory and validate all computed paths before their
only removal sites. Do not introduce recursive deletion or glob deletion.

- [ ] **Step 4: Wire and run the focused test**

Add to root `package.json`:

```json
"test:make-database-backup": "node --test scripts/dev/make-database-backup.test.mjs"
```

Add `pnpm test:make-database-backup` before `pnpm audit:repo` in
`scripts/dev/check.sh`, then run:

```bash
pnpm test:make-database-backup
```

Expected: all Task 1 tests PASS with no temporary files left behind.

- [ ] **Step 5: Commit Task 1**

```bash
git add Makefile package.json scripts/dev/check.sh scripts/dev/make-database-backup.test.mjs
git commit -m "feat(database): create dual-format local backups"
```

### Task 2: Extension-aware restore and hostile-path safety

**Files:**
- Modify: `scripts/dev/make-database-backup.test.mjs`
- Modify: `Makefile:5-72`

**Interfaces:**
- Consumes: `make db-restore BACKUP=<existing .sql or .dump path>`.
- Produces: exact extension dispatch to `psql` or `pg_restore`; unsupported inputs fail before `docker compose stop`.

- [ ] **Step 1: Add restore RED tests**

Extend the fake Docker executable to consume stdin and log every argument. Add:

```js
test("db-restore sends SQL to psql with fail-fast transaction flags", () => {
  const backup = seedBackup("backup with spaces.sql", "SELECT 1;");
  const result = runMake("db-restore", { makeVariables: [`BACKUP=${backup}`] });
  assert.equal(result.status, 0, result.stderr);
  assertDockerCallContains("psql", "-X", "--set", "ON_ERROR_STOP=1", "--single-transaction");
  assertDockerCallDoesNotContain("pg_restore");
});

test("db-restore sends custom archives to pg_restore", () => {
  const backup = seedBackup("backup.dump", "custom backup");
  const result = runMake("db-restore", { makeVariables: [`BACKUP=${backup}`] });
  assert.equal(result.status, 0, result.stderr);
  assertDockerCallContains("pg_restore", "--clean", "--if-exists", "--no-owner", "--exit-on-error", "--single-transaction");
});

test("db-restore rejects unsupported formats before stopping services", () => {
  const backup = seedBackup("backup.zip", "not supported");
  const result = runMake("db-restore", { makeVariables: [`BACKUP=${backup}`] });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /must end in \.sql or \.dump/);
  assert.equal(dockerCalls().length, 0);
});
```

Also pass a filename containing spaces, dollar signs, and semicolons as one
Make command-line argument and assert no additional process is launched and the
entire path is consumed as the restore input.

- [ ] **Step 2: Run the focused tests and verify RED**

Run:

```bash
pnpm test:make-database-backup
```

Expected: restore SQL and unsupported-extension tests FAIL because the existing
recipe always invokes `pg_restore` and interpolates `BACKUP` into shell source.

- [ ] **Step 3: Implement extension-aware restore**

Add the Make directive:

```make
export BACKUP
```

Use only the exported shell value in the recipe:

```make
db-restore:
	@set -eu; \
	backup_path="$${BACKUP:-}"; \
	test -n "$${backup_path}" || { echo "BACKUP path is required" >&2; exit 1; }; \
	test -f "$${backup_path}" || { echo "Backup not found: $${backup_path}" >&2; exit 1; }; \
	case "$${backup_path}" in *.sql) restore_format=sql ;; *.dump) restore_format=dump ;; *) echo "BACKUP must end in .sql or .dump" >&2; exit 1 ;; esac; \
	$(COMPOSE) stop api console storefront; \
	trap '$(COMPOSE) start api console storefront' EXIT; \
	if [ "$${restore_format}" = sql ]; then \
	  $(COMPOSE) exec -T postgres psql -X -U opendx_local -d opendx --set ON_ERROR_STOP=1 --single-transaction < "$${backup_path}"; \
	else \
	  $(COMPOSE) exec -T postgres pg_restore -U opendx_local -d opendx --clean --if-exists --no-owner --exit-on-error --single-transaction < "$${backup_path}"; \
	fi
```

- [ ] **Step 4: Verify GREEN and inspect expansion**

Run:

```bash
pnpm test:make-database-backup
make --dry-run db-backup
make --dry-run db-restore BACKUP='infra/backups/example.sql'
make --dry-run db-restore BACKUP='infra/backups/example.dump'
```

Expected: tests PASS; dry runs show plain/custom backup commands and correct
restore dispatch without executing Docker.

- [ ] **Step 5: Commit Task 2**

```bash
git add Makefile scripts/dev/make-database-backup.test.mjs
git commit -m "feat(database): restore local sql backups"
```

### Task 3: Documentation, real smoke test, and handoff

**Files:**
- Modify: `docs/development/database-operations.md:36-58`
- Modify: `docs/project-structure.md:55-70`
- Modify: `infra/backups/.gitignore:4-5`
- Modify: `scripts/audit/repo.sh:69-72`
- Modify: `CHANGELOG.md:11-20`

**Interfaces:**
- Consumes: completed Make targets and focused test command.
- Produces: contributor instructions and final verification evidence.

- [ ] **Step 1: Update contributor documentation**

Document both generated paths, show one `.sql` and one `.dump` restore example,
explain that SQL is readable while custom archives retain `pg_restore`
capabilities, and state that one failed dump publishes neither file. Change the
project-structure description from custom-only archives to ignored local SQL
and custom-format backup pairs.

- [ ] **Step 2: Record the implementation in the changelog**

Add under `[Unreleased]`:

```markdown
- Make local database backup create matching readable SQL and custom archives,
  and restore either format through an extension-aware fail-closed command.
```

- [ ] **Step 3: Run static and repository gates**

```bash
pnpm test:make-database-backup
git diff --check
pnpm audit:repo
pnpm check
```

Expected: every command exits `0`; `pnpm check` includes the focused Make test.

- [ ] **Step 4: Run a real local smoke test when PostgreSQL is available**

With the local Compose PostgreSQL healthy, run `make db-backup`, capture the two
paths printed by the command, verify both are non-empty, restore the `.sql`, then
restore the `.dump`. Use only the newly created explicit paths; do not glob or
delete unrelated backups. If PostgreSQL is unavailable, report this check as
not run rather than claiming it passed.

- [ ] **Step 5: Commit Task 3**

```bash
git add CHANGELOG.md docs/development/database-operations.md docs/project-structure.md
git commit -m "docs(database): document dual-format local recovery"
```

- [ ] **Step 6: Request review and close findings**

Review the complete commit range against the approved spec, especially partial
publication, existing-path collision, hostile `BACKUP` values, service restart
on failure, and the untouched production scripts. Resolve all Critical and
Important findings, rerun the focused and repository gates, and record exact
evidence in the handoff.
