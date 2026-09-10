<!--
SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
SPDX-License-Identifier: Apache-2.0
-->

# Collapsible Sign-in Panel Implementation Plan

**Goal:** Collapse the sign-in panel to a centered Google trigger and reveal the existing panel on demand.

**Architecture:** `SignInPage` owns one local expanded/collapsed state and refs for focus restoration. The existing `GoogleSignInButton` remains unchanged and is mounted only inside the expanded modal panel; CSS continues to use shared Storefront theme tokens.

**Tech Stack:** React 19, TypeScript, React Router, Lucide React, Vitest, Testing Library, CSS

---

### Task 1: Define collapsed and expanded behavior

**Files:**
- Test: `apps/storefront/src/features/authentication/tests/authentication.test.tsx`
- Modify: `apps/storefront/src/features/authentication/pages/sign-in-page.tsx`

**Step 1: Write the failing collapsed-state test**

Render `SignInPage`, assert the button named `Mở đăng nhập Google` is visible,
and assert the heading `Đăng nhập NovaCommerce` is absent. Click the trigger,
then assert the dialog and heading are visible.

**Step 2: Verify RED**

Run:

```bash
cd apps/storefront
pnpm exec vitest run src/features/authentication/tests/authentication.test.tsx
```

Expected: FAIL because the full panel is currently rendered immediately.

**Step 3: Implement the minimum stateful panel**

Add `panelOpen` state, a labelled trigger button, and conditionally render the
existing panel with `role="dialog"`, `aria-modal="true"`, and
`aria-labelledby="sign-in-title"`.

**Step 4: Verify GREEN**

Run the same focused command and expect all Authentication tests to pass.

### Task 2: Add dismissal and focus behavior

**Files:**
- Test: `apps/storefront/src/features/authentication/tests/authentication.test.tsx`
- Modify: `apps/storefront/src/features/authentication/pages/sign-in-page.tsx`

**Step 1: Write failing interaction tests**

Use `userEvent` to verify the close button, Escape, and backdrop interaction
each close the dialog; a click inside does not. Assert opening focuses the close
button and each dismissal restores focus to the trigger.

**Step 2: Verify RED**

Run the focused Authentication test and expect failures for the absent
dismissal and focus behavior.

**Step 3: Implement minimal interaction handling**

Add trigger and close refs, an effect for Escape and opening focus, a shared
`closePanel` callback, a close button, and a backdrop click handler that checks
`event.target === event.currentTarget`.

**Step 4: Verify GREEN**

Run the focused Authentication test and expect all tests to pass without
warnings.

### Task 3: Style, document, and deploy

**Files:**
- Modify: `apps/storefront/src/shared/styles/globals.css`
- Modify: `CHANGELOG.md`

**Step 1: Add responsive presentation styles**

Style a compact circular trigger, modal stage, close control, focus-visible
states, and reduced-motion fallback using existing semantic tokens.

**Step 2: Run complete Storefront verification**

```bash
pnpm --filter @opendx/storefront test
pnpm --filter @opendx/storefront build
git diff --check
pnpm audit:repo
```

Expected: 0 failures and successful build/audit.

**Step 3: Rebuild and verify runtime**

Rebuild and recreate only `storefront`, then inspect `/sign-in` at desktop and
mobile widths. Confirm the initial trigger, modal expansion, dismissal paths,
video continuity, and absence of overflow.

**Step 4: Commit atomically**

```bash
git add CHANGELOG.md apps/storefront/src/features/authentication \
  apps/storefront/src/shared/styles/globals.css
git commit -m "feat(storefront): collapse sign-in panel"
```
