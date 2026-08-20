#!/usr/bin/env python3
# SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
# SPDX-License-Identifier: Apache-2.0
"""Credential-owned OpenRouter acceptance; writes only aggregate evidence."""
from __future__ import annotations

import json
import os
import sys
import tempfile
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

AGENTS = ("ai_ceo", "catalog", "inventory", "order", "finance", "crm", "support")


def configured_models(path: Path) -> tuple[tuple[str, ...], frozenset[str]]:
    document = json.loads(path.read_text(encoding="utf8"))
    if not isinstance(document, dict):
        raise ValueError("configuration export must be an object")
    data = document.get("data", document)
    if not isinstance(data, dict):
        raise ValueError("configuration data must be an object")
    children = data.get("children", data)
    if not isinstance(children, dict):
        raise ValueError("configuration children must be an object")
    records = children.get("modelConfigurations")
    if not isinstance(records, list):
        raise ValueError("modelConfigurations must be an array")
    by_agent: dict[str, str] = {}
    all_models: set[str] = set()
    for record in records:
        if not isinstance(record, dict):
            raise ValueError("model configuration must be an object")
        agent = record.get("agentKind")
        primary = record.get("primaryModel")
        fallbacks = record.get("fallbackModels")
        if agent not in AGENTS or not isinstance(primary, str) or not primary:
            raise ValueError("model configuration identity is invalid")
        if agent in by_agent or not isinstance(fallbacks, list):
            raise ValueError("model configuration fallback is invalid")
        if any(not isinstance(model, str) or not model for model in fallbacks):
            raise ValueError("configured model is invalid")
        by_agent[agent] = primary
        all_models.update((primary, *fallbacks))
    if set(by_agent) != set(AGENTS):
        raise ValueError("all seven Agent model configurations are required")
    return tuple(by_agent[agent] for agent in AGENTS), frozenset(all_models)

def request_json(url: str, key: str, payload: object | None = None) -> object:
    data = None if payload is None else json.dumps(payload, separators=(",", ":")).encode()
    request = Request(url, data=data, headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"})
    with urlopen(request, timeout=30) as response:
        return json.loads(response.read(1_048_576))

def main() -> int:
    api_key = os.environ.get("OPENROUTER_API_KEY")
    if not api_key:
        print("OPENROUTER_API_KEY is required for live acceptance", flush=True)
        return 2
    if len(sys.argv) != 2:
        print("usage: openrouter-live-acceptance.py CONFIGURATION_EXPORT.json", flush=True)
        return 2
    base_url = os.environ.get("OPENROUTER_BASE_URL", "https://openrouter.ai/api/v1").rstrip("/")
    evidence = Path(tempfile.mkdtemp(prefix="opendx-openrouter-live-"))
    try:
        MODELS, configured_catalog_models = configured_models(Path(sys.argv[1]))
        catalog = request_json(f"{base_url}/models", api_key)
        catalog_ids = {item.get("id") for item in catalog.get("data", []) if isinstance(item, dict)}
        if not configured_catalog_models.issubset(catalog_ids): raise RuntimeError("configured catalog records are unavailable")
        for agent, model in zip(AGENTS, MODELS, strict=True):
            payload = {"model": model, "messages": [{"role": "system", "content": "Return only a JSON object."}, {"role": "user", "content": json.dumps({"classification": "internal", "agent": agent, "summary": "synthetic acceptance data"})}], "response_format": {"type": "json_object"}, "max_tokens": 64}
            response = request_json(f"{base_url}/chat/completions", api_key, payload)
            if not isinstance(response, dict) or not response.get("choices"): raise RuntimeError("structured completion was rejected")
        (evidence / "summary.json").write_text(json.dumps({"catalogRecords": len(configured_catalog_models), "agents": len(AGENTS)}), encoding="utf8")
        print(f"OpenRouter live acceptance passed: {len(configured_catalog_models)} configured catalog records, 7 synthetic Agents", flush=True)
        return 0
    except (HTTPError, URLError, OSError, TimeoutError, ValueError, RuntimeError) as error:
        print(f"OpenRouter live acceptance failed: {type(error).__name__}", flush=True)
        return 1

if __name__ == "__main__": raise SystemExit(main())
