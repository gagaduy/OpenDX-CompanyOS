// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const source = readFileSync("scripts/dev/openrouter-live-acceptance.py", "utf8");
const agents = ["ai_ceo", "catalog", "inventory", "order", "finance", "crm", "support"];

function validateConfiguration(fallbacksFor) {
  const directory = mkdtempSync(join(tmpdir(), "opendx-openrouter-config-unit-"));
  const configuration = join(directory, "configuration.json");
  writeFileSync(configuration, JSON.stringify({
    data: { children: { modelConfigurations: agents.map((agent) => ({
      agentKind: agent,
      primaryModel: `provider/${agent}-primary`,
      fallbackModels: fallbacksFor(agent),
    })) } },
  }), "utf8");
  const program = [
    "import importlib.util, pathlib, sys",
    "spec = importlib.util.spec_from_file_location('openrouter_live', 'scripts/dev/openrouter-live-acceptance.py')",
    "module = importlib.util.module_from_spec(spec)",
    "spec.loader.exec_module(module)",
    "try:",
    "    models, catalog = module.configured_models(pathlib.Path(sys.argv[1]))",
    "    print(len(models), len(catalog))",
    "except ValueError:",
    "    print('invalid')",
    "    raise SystemExit(2)",
  ].join("\n");
  return spawnSync("python3", ["-c", program, configuration], {
    cwd: process.cwd(), encoding: "utf8",
  });
}

test("live runner is credential-owned and payload-safe", () => {
  assert.match(source, /OPENROUTER_API_KEY/);
  assert.match(source, /tempfile\.mkdtemp/);
  assert.match(source, /"internal"/);
  assert.match(source, /zip\(AGENTS, MODELS/);
  assert.doesNotMatch(source, /google\/gemma-4-31b-it:free/);
  assert.doesNotMatch(source, /print\(\s*(?:api_key|response\.text|payload)/i);
});

test("configuration export accepts exactly one fallback per Agent", () => {
  const result = validateConfiguration((agent) => [`provider/${agent}-fallback`]);

  assert.equal(result.status, 0);
  assert.match(result.stdout, /7 14/);
});

test("configuration export rejects invalid fallback cardinality", () => {
  for (const fallbacks of [[], ["provider/one", "provider/two"]]) {
    const result = validateConfiguration(() => fallbacks);
    assert.equal(result.status, 2);
    assert.match(result.stdout, /invalid/);
  }
});

test("package runner requires and forwards the configuration export path", () => {
  const environment = { ...process.env, OPENROUTER_API_KEY: "synthetic-test-key" };
  delete environment.OPENROUTER_CONFIGURATION_EXPORT;
  const missing = spawnSync("pnpm", ["run", "run:openrouter-live"], {
    cwd: process.cwd(), env: environment, encoding: "utf8",
  });
  assert.equal(missing.status, 2);
  assert.match(`${missing.stdout}${missing.stderr}`, /OPENROUTER_CONFIGURATION_EXPORT is required/);

  const directory = mkdtempSync(join(tmpdir(), "opendx-openrouter-config-"));
  const configuration = join(directory, "configuration.json");
  writeFileSync(configuration, "not-json", "utf8");
  const forwarded = spawnSync("pnpm", ["run", "run:openrouter-live"], {
    cwd: process.cwd(),
    env: { ...environment, OPENROUTER_CONFIGURATION_EXPORT: configuration },
    encoding: "utf8",
  });
  assert.equal(forwarded.status, 1);
  assert.match(`${forwarded.stdout}${forwarded.stderr}`, /JSONDecodeError/);
});

test("Make forwards the explicit configuration export path", () => {
  const configuration = "/tmp/opendx-config-export.json";
  const result = spawnSync(
    "make",
    ["-n", "check-openrouter-live", `OPENROUTER_CONFIGURATION_EXPORT=${configuration}`],
    { cwd: process.cwd(), encoding: "utf8" },
  );

  assert.equal(result.status, 0);
  assert.match(result.stdout, new RegExp(`OPENROUTER_CONFIGURATION_EXPORT="${configuration}"`));
  assert.match(result.stdout, /pnpm check:openrouter-live/);
});
