#!/usr/bin/env python3
# SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
# SPDX-License-Identifier: Apache-2.0
"""Credential-owned OpenRouter acceptance; writes only aggregate evidence."""
from __future__ import annotations

import json
import os
import tempfile
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

AGENTS = ("ai_ceo", "catalog", "inventory", "order", "finance", "crm", "support")
MODELS = (
    "z-ai/glm-5.2:free",
    "google/gemma-4-26b-a4b-it:free",
    "nvidia/nemotron-3-super-120b-a12b:free",
    "nvidia/nemotron-3-super-120b-a12b:free",
    "openai/gpt-oss-20b:free",
    "dots-studio/dots-3-note-preview:free",
    "nvidia/nemotron-nano-9b-v2:free",
)
FALLBACK_MODEL = "liquid/lfm-2.5-2.6b:free"

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
    base_url = os.environ.get("OPENROUTER_BASE_URL", "https://openrouter.ai/api/v1").rstrip("/")
    evidence = Path(tempfile.mkdtemp(prefix="opendx-openrouter-live-"))
    try:
        catalog = request_json(f"{base_url}/models", api_key)
        catalog_ids = {item.get("id") for item in catalog.get("data", []) if isinstance(item, dict)}
        approved_models = {*MODELS, FALLBACK_MODEL}
        if not approved_models.issubset(catalog_ids): raise RuntimeError("approved catalog records are unavailable")
        for agent, model in zip(AGENTS, MODELS, strict=True):
            payload = {"model": model, "messages": [{"role": "system", "content": "Return only a JSON object."}, {"role": "user", "content": json.dumps({"classification": "internal", "agent": agent, "summary": "synthetic acceptance data"})}], "response_format": {"type": "json_object"}, "max_tokens": 64}
            response = request_json(f"{base_url}/chat/completions", api_key, payload)
            if not isinstance(response, dict) or not response.get("choices"): raise RuntimeError("structured completion was rejected")
        (evidence / "summary.json").write_text(json.dumps({"catalogRecords": len(approved_models), "agents": len(AGENTS)}), encoding="utf8")
        print("OpenRouter live acceptance passed: 7 catalog records, 7 synthetic Agents", flush=True)
        return 0
    except (HTTPError, URLError, TimeoutError, ValueError, RuntimeError) as error:
        print(f"OpenRouter live acceptance failed: {type(error).__name__}", flush=True)
        return 1

if __name__ == "__main__": raise SystemExit(main())
