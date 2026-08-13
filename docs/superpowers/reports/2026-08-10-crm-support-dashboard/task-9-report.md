# Task 9 Report: Customer and CRM Console Workspaces

Implemented the Console Customer and CRM workspaces for Phase 7.

## Delivered

- Added Customer list API/schema/hook/table/page under `features/customers`.
- Added CRM Customer 360 API/schema/hook/components/page under `features/crm`.
- Mounted `/customers` and `/customers/:customerId` in the Console router.
- Gated Customer routes to Administrator and CRM Operator only.
- Added Customers navigation for Administrator and CRM Operator.
- Preserved read-only Customer 360 behavior: profile/address display, paid facts,
  deterministic segment labels, immutable notes with correction references,
  chronological timeline, and versioned follow-up self-claim recovery.
- Added compact responsive CSS for Customer tables, detail cards, long
  Vietnamese data, and timeline metadata.
- Updated `CHANGELOG.md`.

## Verification

- `pnpm --filter @opendx/console test -- src/features/customers/tests/customer-list-page.test.tsx src/features/crm/tests/customer-detail-page.test.tsx src/features/authentication/tests/commerce-operations-routing.test.tsx`
  - 17 files passed.
  - 75 tests passed.
- `pnpm --filter @opendx/console typecheck`
  - Passed.
- `pnpm --filter @opendx/console build`
  - Passed.

## Notes

- Console UI consumes only existing CRM/Customer Operations APIs.
- No Storefront customer mutation API was added.
