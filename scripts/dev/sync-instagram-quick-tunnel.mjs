// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { constants } from "node:fs";
import { access, readFile, rename, stat, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const QUICK_TUNNEL_PATTERN = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/giu;
const PUBLIC_MEDIA_PATH = "/v1/public/marketing/media";
const DEFAULT_CONTAINER = "opendx-instagram-quick-tunnel";

export function selectLatestQuickTunnelOrigin(logs) {
  const matches = [...logs.matchAll(QUICK_TUNNEL_PATTERN)];
  if (matches.length === 0) {
    throw new Error("Could not find a valid quick tunnel URL in cloudflared logs");
  }
  const origin = new URL(matches.at(-1)[0]);
  if (
    origin.protocol !== "https:"
    || origin.username !== ""
    || origin.password !== ""
    || !origin.hostname.endsWith(".trycloudflare.com")
  ) {
    throw new Error("Cloudflared returned an invalid quick tunnel URL");
  }
  return origin.origin;
}

export function publicMediaBaseUrl(origin) {
  return new URL(PUBLIC_MEDIA_PATH, `${origin}/`).toString().replace(/\/$/, "");
}

export function updateEnvironmentValue(contents, name, value) {
  const lines = contents.split("\n");
  const matchingIndexes = lines.flatMap((line, index) => (
    line.startsWith(`${name}=`) ? [index] : []
  ));
  if (matchingIndexes.length > 1) {
    throw new Error(`${name} must be declared at most once`);
  }
  const replacement = `${name}=${value}`;
  if (matchingIndexes.length === 0) {
    const insertionIndex = lines.at(-1) === "" ? lines.length - 1 : lines.length;
    lines.splice(insertionIndex, 0, replacement);
  } else {
    lines[matchingIndexes[0]] = replacement;
  }
  const updated = lines.join("\n");
  return { contents: updated, changed: updated !== contents };
}

function environmentValue(contents, name, fallback = "") {
  const matches = contents
    .split("\n")
    .filter((line) => line.startsWith(`${name}=`));
  if (matches.length > 1) {
    throw new Error(`${name} must be declared at most once`);
  }
  return matches.length === 0 ? fallback : matches[0].slice(name.length + 1).trim();
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    encoding: "utf8",
    stdio: options.capture ? ["ignore", "pipe", "pipe"] : "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${command} exited with status ${result.status}`);
  }
  return `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
}

async function writeAtomically(path, contents) {
  const metadata = await stat(path);
  const temporaryPath = `${path}.tmp-${process.pid}`;
  await writeFile(temporaryPath, contents, { mode: metadata.mode });
  await rename(temporaryPath, path);
}

async function fetchTunnelReadiness(origin, fetcher, requestTimeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), requestTimeoutMs);
  try {
    return await fetcher(new URL("/health/ready", origin), {
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

export async function waitForTunnelReady(origin, options = {}) {
  const attempts = options.attempts ?? 12;
  const delayMs = options.delayMs ?? 5_000;
  const requestTimeoutMs = options.requestTimeoutMs ?? 5_000;
  const fetcher = options.fetcher ?? fetch;
  const sleeper = options.sleeper ?? ((milliseconds) => new Promise(
    (resolveSleep) => setTimeout(resolveSleep, milliseconds),
  ));
  let lastFailure = "unreachable";

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetchTunnelReadiness(origin, fetcher, requestTimeoutMs);
      if (response.ok) return;
      lastFailure = `HTTP ${response.status}`;
    } catch (error) {
      lastFailure = error instanceof Error ? error.message : "unreachable";
    }
    if (attempt < attempts) await sleeper(delayMs);
  }

  throw new Error(`Quick tunnel did not become ready: ${lastFailure}`);
}

async function main() {
  const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
  const environmentPath = resolve(repositoryRoot, process.env.OPENDX_ENV_FILE ?? ".env");
  try {
    await access(environmentPath, constants.R_OK | constants.W_OK);
  } catch {
    return;
  }

  const contents = await readFile(environmentPath, "utf8");
  if (environmentValue(contents, "INSTAGRAM_PUBLICATION_MODE", "simulation") !== "live") {
    return;
  }

  const container = process.env.INSTAGRAM_QUICK_TUNNEL_CONTAINER ?? DEFAULT_CONTAINER;
  const logs = run("docker", ["logs", "--tail", "200", container], { capture: true });
  const origin = selectLatestQuickTunnelOrigin(logs);
  await waitForTunnelReady(origin);

  const updated = updateEnvironmentValue(
    contents,
    "INSTAGRAM_PUBLIC_MEDIA_BASE_URL",
    publicMediaBaseUrl(origin),
  );
  if (!updated.changed) {
    process.stdout.write("Instagram quick tunnel URL is current.\n");
    return;
  }

  await writeAtomically(environmentPath, updated.contents);
  process.stdout.write("Instagram quick tunnel URL changed; recreating API.\n");
  run("docker", [
    "compose",
    "--env-file",
    environmentPath,
    "-f",
    resolve(repositoryRoot, "infra/docker/docker-compose.yml"),
    "up",
    "-d",
    "--no-deps",
    "--force-recreate",
    "--wait",
    "api",
  ], { cwd: repositoryRoot });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`Instagram quick tunnel synchronization failed: ${error.message}\n`);
    process.exitCode = 1;
  });
}
