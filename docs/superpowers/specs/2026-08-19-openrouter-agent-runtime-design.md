<!--
SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
SPDX-License-Identifier: Apache-2.0
-->

# OpenRouter Agent Runtime Design

## Status

Approved by the user on 2026-08-19. This is the focused design for Phase D of
the Post-Commerce Agentic Workforce. Its file-level implementation plan is
`docs/superpowers/plans/2026-08-19-openrouter-agent-runtime.md`.

## Purpose

Phase D gives the seven governed Digital Employees a provider-neutral model
runtime, OpenRouter integration, deterministic structured-result validation,
atomic cost accounting, and a backend-verifiable Quality Gate. It consumes
only authorized, provenance-bearing context supplied by existing Agentic and
Commerce boundaries.

This phase does not add file intake, task decomposition, Department dispatch,
fan-out/fan-in coordination, cross-Agent collaboration, AI CEO synthesis over
live Department runs, memory, Agentic Console pages, generic SQL, or Commerce
mutations. AI CEO may analyze one pre-authorized structured input, but it may
not create or assign subtasks until Phase F.

## Approved Decisions

- Only aggregate, redacted data classified `internal` may leave the local
  system. `confidential`, `restricted`, PII, payment/provider evidence,
  credentials, raw task text that contains prohibited fields, and secrets are
  blocked before prompt construction.
- Real OpenRouter acceptance is mandatory for Phase D completion. The API key
  is operator-owned and supplied only through `OPENROUTER_API_KEY` in an
  ignored local environment file or deployment secret.
- The OpenRouter adapter uses the existing `httpx` dependency and the stable
  OpenAI-compatible `POST /api/v1/chat/completions` contract. No OpenRouter or
  OpenAI SDK dependency is added.
- Every Agent has a distinct fixed primary model. The seven Agents share one
  fixed emergency fallback model so provider failure remains bounded without
  silently selecting a paid or random model.
- Model aliases such as `latest` and the random `openrouter/free` router are
  prohibited because they prevent reproducible model, pricing, and audit
  evidence.
- All Agents return one common envelope with a strict Agent-specific payload.
- Missing authoritative evidence becomes an explicit partial result. Scope
  violation, restricted-data leakage, or unresolved contradiction causes human
  escalation.
- A result receives at most two correction rounds after its initial generation.

## Model Assignment

The approved initial model map is:

| Agent | Primary model |
| --- | --- |
| AI CEO | `z-ai/glm-5.2:free` |
| Catalog | `google/gemma-4-26b-a4b-it:free` |
| Inventory | `google/gemma-4-31b-it:free` |
| Order | `nvidia/nemotron-3-super-120b-a12b:free` |
| Finance | `openai/gpt-oss-20b:free` |
| CRM | `dots-studio/dots-3-note-preview:free` |
| Support | `nvidia/nemotron-nano-9b-v2:free` |

The emergency fallback for every Agent is
`liquid/lfm-2.5-2.6b:free`.

These IDs were reported by the OpenRouter model catalog on 2026-08-19 with
zero prompt and completion prices and support for `response_format`. Runtime
preflight and credential-owned acceptance must verify those properties again.
If a configured model is absent, paid, or lacks strict structured output, the
call fails closed before sending company context. Configuration never falls
back to a paid model or a provider-selected model ID.

## Architecture

```text
authorized task + provenance-bearing tool context
                         |
                         v
AI Runtime application AgentExecutor
  classification filter -> redaction -> bounded prompt builder
                         |
                         v
Agentic API internal model-run reservation
  policy + revision + model allow-list + atomic maximum-cost budget
                         |
                         v
provider-neutral ModelGateway port
                         |
                         v
OpenRouterModelGateway infrastructure adapter
  httpx + fixed model + strict JSON schema + bounded timeout/response
                         |
                         v
strict Agent result parser -> deterministic QualityGate
                         |
           +-------------+-------------+
           |             |             |
        accepted       correct      partial/escalate
           |             |             |
           +------ model-run completion + settlement
                         |
                audit + provenance evidence
```

`services/ai-runtime/app/agentic/domain` owns framework-neutral model and
quality contracts. `application` owns context filtering, prompt construction,
execution, correction, and the `ModelGateway` port. `infrastructure` owns the
OpenRouter HTTP adapter and internal Agentic API client. Temporal activities
may call these application services, but Phase D does not change the workflow
into a coordinator.

`apps/api/src/modules/agentic` remains the authority for identity, task,
configuration revision, policy, model allow-list, revocation, budget, durable
model-run state, audit, and provenance. The AI Runtime never receives database
credentials and cannot settle its own budget without an authenticated internal
API call.

## Provider-Neutral Contracts

```python
class ModelGateway(Protocol):
    async def generate(self, request: ModelRequest) -> ModelResult: ...

@dataclass(frozen=True)
class ModelRequest:
    task_id: str
    agent_kind: AgentKind
    configuration_revision_id: str
    model: str
    fallback_position: int
    result_schema_name: str
    result_schema: dict[str, object]
    trusted_instructions: tuple[str, ...]
    untrusted_context: dict[str, object]
    max_output_tokens: int
    idempotency_key: str

@dataclass(frozen=True)
class ModelResult:
    provider_request_id: str
    model: str
    content: dict[str, object]
    input_tokens: int
    output_tokens: int
    total_tokens: int
    provider_cost_micros: int | None

@dataclass(frozen=True)
class QualityDecision:
    outcome: Literal["accepted", "correct", "partial", "escalate"]
    reasons: tuple[str, ...]
    evidence_ids: tuple[str, ...]
```

Provider-specific response objects, error bodies, headers, and SDK types never
enter domain or application contracts.

## OpenRouter Request Contract

The adapter sends non-streaming requests with:

- one fixed `model` from the active configuration;
- separate trusted system instructions and explicitly labeled untrusted
  context;
- `response_format.type=json_schema`, a versioned schema name, `strict=true`,
  and `additionalProperties=false` throughout;
- `provider.require_parameters=true` so a provider that cannot honor strict
  structured output is not selected;
- configured `max_tokens` and an injected timeout;
- optional attribution headers containing only the public project name and
  configured public URL.

The adapter accepts only a successful JSON response whose returned `model`
matches the requested model, whose content is bounded, and whose usage fields
are non-negative integers. Authentication, rate-limit, timeout, malformed
response, unsupported-parameter, and provider errors map to stable safe error
codes. Normal logs never contain request messages, response content, headers,
provider errors, or the API key.

## Context and Prompt Boundary

Prompt construction is code-owned, not model-owned. It has three immutable
parts:

1. trusted role and output instructions selected by `agent_kind`;
2. the exact JSON Schema and deterministic Quality Gate requirements; and
3. a serialized context block labeled as untrusted data, never instructions.

Every context leaf carries or inherits a classification. The context builder
allows only `internal`, rejects unknown classifications, removes fields not in
the Agent's purpose-specific allow-list, bounds strings and collections, and
applies deterministic PII/secret/provider-evidence detectors. Redaction is
repeated before cross-Agent or final sharing. Injection strings cannot add
tools, models, permissions, policies, system instructions, or approvals.

## Common Result Envelope

Every result uses schema version `1` and contains exactly:

- `schemaVersion`: literal `1`;
- `agentKind`: the executing Agent kind;
- `status`: `complete` or `partial`;
- `summary`: 1-1,000 characters;
- `conclusions`: at most eight objects containing `code`, `statement`,
  `confidenceBasis`, and one to eight `provenanceIds`;
- `risks`: at most eight objects containing `code`, `severity`, `statement`,
  and one to eight `provenanceIds`;
- `recommendedActions`: at most eight read-only recommendation objects with
  `code`, `statement`, `requiresHumanApproval`, and `provenanceIds`;
- `evidence`: at most 24 references containing `provenanceId`, `source`,
  `retrievedAt`, `freshnessStatus`, and literal classification `internal`;
- `payload`: exactly one Agent-specific payload below.

Codes use uppercase snake case. Statements are bounded plain text. Evidence
contains identifiers and metadata only, never copied source bodies.

## Agent-Specific Payloads

All integer fields are non-negative safe integers. Monetary values are VND
integers. Basis points are between 0 and 10,000. Risk levels are
`low`, `medium`, or `high`.

- `catalog`: `completenessBasisPoints`, `productsAtRisk`,
  `publicationBlockerCount`, `merchandisingSignalCount`, and `riskLevel`.
- `inventory`: `atRiskSkuCount`, `slowStockSkuCount`, `reservationAnomalyCount`,
  `affectedProductCount`, and `riskLevel`.
- `order`: `stalledOrderCount`, `invalidTransitionCount`, `expiryRiskCount`,
  `affectedOrderCount`, and `riskLevel`.
- `finance`: `pendingPaymentCount`, `pendingAmountVnd`, `discrepancyCount`,
  `discrepancyAmountVnd`, `providerEvidenceCoverageBasisPoints`, and
  `riskLevel`. No provider identifier or payload is permitted.
- `crm`: `segmentCount`, `followupOpportunityCount`, `repeatCustomerCount`,
  `lifetimePaidRevenueVnd`, and `riskLevel`. No customer identifier or PII is
  permitted.
- `support`: `slaRiskCount`, `overdueCount`, `classificationCount`,
  `relatedOrderContextCount`, and `riskLevel`. No ticket text is permitted.
- `ai_ceo`: `departmentCoverage`, containing at most six entries with
  `agentKind`, `status`, and `provenanceIds`; `crossDepartmentRiskCount`;
  `unresolvedConflictCodes`; and `riskLevel`. This payload cannot contain a
  task plan, subtask, assignee, delegation, or Agent call.

The Quality Gate compares material counts, amounts, basis points, freshness,
and evidence references against backend-authoritative input. Model arithmetic
never replaces deterministic backend calculation.

## Model Run Persistence

Phase D adds append-oriented model-run records keyed by task, Agent,
configuration revision, schema version, generation round, and idempotency key.
The lifecycle is `reserved`, `running`, `completed`, `failed`, `partial`, or
`escalated`. Records retain:

- requested and returned model IDs plus fallback position;
- policy/configuration/schema versions;
- input and output digests, never bodies;
- token counts, pricing snapshot, maximum reserved cost, settled cost, and
  provider request ID digest;
- latency, safe status/error code, correction round, timestamps, and optimistic
  version;
- Quality Gate outcome/reason codes and provenance IDs.

Existing `agentic_budget_entries` remains the single budget ledger. Model
reservation and settlement use scoped idempotency keys and the existing task,
daily, and monthly limits. Schema changes may add an optional model-run
reference, but must not create a second budget authority.

## Fallback, Retry, and Correction

One generation round tries the configured primary once. Only retryable
transport/provider failures may invoke the shared emergency fallback, once.
Policy denial, unknown/paid model, invalid schema, leakage, budget exhaustion,
or non-retryable provider rejection never triggers fallback.

The initial result may receive at most two correction rounds. Correction input
contains only safe reason codes, evidence IDs, and the original bounded context;
it does not disclose policy internals or rejected response bodies. Each round
has separate idempotency while remaining under one model run and budget scope.

## Quality Gate

The deterministic Quality Gate checks, in order:

1. schema/version and bounded field validity;
2. every material conclusion and action has valid provenance;
3. Agent, tool, purpose, data scope, and classification compliance;
4. freshness against source-specific limits;
5. arithmetic equality with backend-authoritative values;
6. restricted-data, PII, secret, provider-evidence, and injection leakage;
7. contradictions against supplied authoritative or Department summaries.

Schema, provenance, freshness, and arithmetic failures request correction while
rounds remain. Missing authoritative evidence after correction produces
`partial`. Leakage, scope violation, or unresolved contradiction produces
`escalate`. AI CEO cannot fabricate a replacement conclusion.

## Security and Observability

- `OPENROUTER_API_KEY` is required in the AI Runtime environment for real
  execution and prohibited from source, database rows, workflow payloads,
  prompts, logs, metrics, audit details, and evidence files.
- Tool and model calls remain deny-by-default and independently authorized.
- The AI Runtime has no direct PostgreSQL or Commerce credential.
- Logs and metrics use bounded labels only: Agent, model ID, fallback position,
  status, safe error, correction round, token counts, cost, and latency.
- Audit records actor/client, task, model/config/schema versions, policy,
  digests, outcome, duration, safe error, and correlation/causation IDs.
- Provenance links the authorized inputs, model run, Quality Gate decision, and
  accepted/partial result without storing secret or sensitive bodies.

## Testing and Acceptance

Deterministic fake-provider tests cover all seven schemas, classification
filtering, redaction, prompt injection, unknown and paid models, allow-list
isolation, fallback order, timeout, `429`, provider `5xx`, malformed responses,
response bounds, token limits, budget concurrency, idempotency, restart,
settlement, every Quality Gate check, correction exhaustion, partial results,
and escalation. Non-zero fake pricing proves budget behavior even though the
initial real models are free.

The mandatory credential-owned acceptance:

1. requires `OPENROUTER_API_KEY` without printing it;
2. queries the live model catalog and verifies all eight configured model IDs
   are present, free, and support strict structured output;
3. sends synthetic `internal` context only;
4. executes one structured request for each of seven Agents;
5. validates schemas, Quality Gate evidence, usage, audit, and provenance;
6. writes only run IDs, model IDs, statuses, token/cost summaries, and digests
   to a temporary evidence directory; and
7. scans stdout and evidence for API-key, prompt, response, PII, provider
   payload, and canary leakage.

Phase D is not complete when the key is absent, the real check fails, any model
is no longer free, or any required source/build/integration gate is red.

## Exit Decision

Phase D is complete only when deterministic fake-provider, PostgreSQL/API,
Temporal retry/restart, source-build, production Compose/preflight, repository
audit, and mandatory real OpenRouter gates all pass; independent review reports
no Critical or Important findings; and the closure commit is recorded. Phase E
and Phase F remain explicitly unstarted.
