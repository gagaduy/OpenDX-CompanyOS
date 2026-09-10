<!--
SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
SPDX-License-Identifier: Apache-2.0
-->

# Marketing Visual Preview

`GET /v1/admin/marketing/visual-assets/:assetId/preview` returns the original
rendered visual from private Marketing storage. `assetId` must be a UUID from
the campaign detail response's `visualAssets`. Previewing does not generate
deliverables or publish content.

The endpoint requires a staff bearer token with one of the existing Marketing
viewer roles: `administrator`, `agentic_operator`, `agentic_approver`,
`agentic_governance_admin`, or `agentic_auditor`.

- `200`: binary image with the asset's `Content-Type`, `Content-Length`,
  `Cache-Control: private, no-store`, and `X-Content-Type-Options: nosniff`.
- `400`: invalid asset ID.
- `401` / `403`: authentication or role denied before reading storage.
- `404`: `VISUAL_ASSET_NOT_FOUND`.
- `503`: `MARKETING_ASSET_STORAGE_UNAVAILABLE` when storage cannot be read or
  the stored bytes do not match the recorded size and SHA-256 digest.

The Console fetches the image with its staff bearer token and renders a local
blob URL. It releases that URL when the selected visual changes or the page
unmounts. Image dimensions and alternative text come from the selected asset;
unavailable images show a retryable error without substituting sample artwork.

## Image Generation

Campaign visual generation uses the full brief and revision feedback through
OpenRouter's chat completion image modality. `MARKETING_VISUAL_MODELS` selects
the comma-separated image-capable models; `MARKETING_VISUAL_TIMEOUT_MS` sets
the bounded request timeout (default 120000 ms, supported 1000-300000 ms).
The API Compose service forwards both environment settings.

The provider must return a decodable image. The adapter normalizes it to PNG
before storing bytes and recording their digest and actual dimensions. Missing
configuration returns `MARKETING_VISUAL_GENERATION_UNAVAILABLE`; provider
errors, timeouts, missing images, and corrupt bytes return
`MARKETING_VISUAL_GENERATION_FAILED`. Failed generation does not create an
asset or approval package, and the campaign becomes `failed`.
Previously saved placeholder assets are not rewritten: regeneration creates a
new version that still requires human approval before publication.

Provider request fields follow the
[OpenRouter chat completion API](https://openrouter.ai/docs/api/api-reference/chat/create-a-chat-completion).
