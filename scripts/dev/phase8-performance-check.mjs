#!/usr/bin/env node
/*
 * SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { performance } from "node:perf_hooks";

const apiBaseUrl = process.env.API_BASE_URL ?? "http://localhost:4000";
const iterations = Number(process.env.PHASE8_PERFORMANCE_ITERATIONS ?? "20");
const targets = [
  {
    name: "catalog",
    url: `${apiBaseUrl}/v1/storefront/products?pageSize=12`,
    p95Ms: 300,
  },
  {
    name: "categories",
    url: `${apiBaseUrl}/v1/storefront/categories`,
    p95Ms: 300,
  },
  {
    name: "anonymous-cart",
    url: `${apiBaseUrl}/v1/storefront/cart`,
    p95Ms: 300,
  },
];

const results = [];
for (const target of targets) {
  const durations = [];
  for (let index = 0; index < iterations; index += 1) {
    const startedAt = performance.now();
    const response = await fetch(target.url);
    const body = await response.text();
    const durationMs = performance.now() - startedAt;
    if (!response.ok) {
      throw new Error(`${target.name} returned HTTP ${response.status}`);
    }
    if (body.length === 0) {
      throw new Error(`${target.name} returned an empty response`);
    }
    durations.push(durationMs);
  }
  const p95Ms = percentile(durations, 0.95);
  if (p95Ms > target.p95Ms) {
    throw new Error(
      `${target.name} p95 ${p95Ms.toFixed(1)}ms exceeded ${target.p95Ms}ms`,
    );
  }
  results.push({
    name: target.name,
    p95Ms: Number(p95Ms.toFixed(1)),
    limitMs: target.p95Ms,
  });
}

console.info(JSON.stringify({ apiBaseUrl, iterations, results }, null, 2));
console.info("Phase 8 performance check passed.");

function percentile(values, ratio) {
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(
    sorted.length - 1,
    Math.ceil(sorted.length * ratio) - 1,
  );
  return sorted[index] ?? 0;
}
