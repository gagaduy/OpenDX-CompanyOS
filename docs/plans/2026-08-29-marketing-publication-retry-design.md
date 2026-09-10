<!--
SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
SPDX-License-Identifier: Apache-2.0
-->

# Marketing Facebook Publication Retry Design

## Goal

Allow an authorized staff approver to retry a failed Facebook publication after
the connector credential has been corrected, without changing the approved
content package or risking a duplicate post.

## Approved behavior

The Control Room shows a compact `Đăng lại lên Facebook` primary action only
when the campaign is `failed`, its current publication package is `approved`,
and no verified publication record exists. Clicking it is a new explicit human
confirmation to publish the already-approved package. It does not regenerate
content, replace the visual, or bypass approval.

The Console calls a dedicated staff endpoint. The endpoint remains restricted
to the existing Marketing approver roles and obtains the page credential from
the API runtime environment, never from the browser. The application service
requires the failed campaign and approved package, relies on the existing
publication-record idempotency check, creates a fresh publication attempt, and
transitions `failed -> publishing`. Success follows the existing verification,
reporting, and completion path. Provider errors remain fail-closed and are
returned to the Console as sanitized application errors.

## Configuration and failure handling

Development and production Compose explicitly forward
`FACEBOOK_PAGE_ACCESS_TOKEN` into the API container. An absent token produces a
configuration error before any provider request; there is no placeholder-token
fallback. A failed retry leaves the campaign failed and preserves the failed
attempt for evidence. A successful retry records the Facebook post once and
prevents subsequent duplicate publication through the existing package record.

## Verification

Domain tests cover the retry-only state transition. API tests cover approver
authorization, credential absence, successful retry, and provider failure.
Console tests cover conditional visibility, click behavior, loading state, and
error rendering. Focused API and Console suites, typechecks, Compose validation,
repository audit, and `git diff --check` provide completion evidence.
