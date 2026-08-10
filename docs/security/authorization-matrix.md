<!--
SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
SPDX-License-Identifier: Apache-2.0
-->

# Authorization Matrix

This matrix documents Phase 8 backend/runtime authorization boundaries for the
NovaCommerce single-store platform. Frontend route guards are usability aids;
backend routes and service ownership checks remain authoritative.

## Staff Operations

| Audience | Role/session | Resource | Action | Decision |
| --- | --- | --- | --- | --- |
| staff | administrator | catalog | create/update/publish/archive/read audit | allow |
| staff | catalog_manager | catalog | create/update/publish/archive/read audit | allow |
| staff | inventory_manager | catalog | create/update/publish/archive | deny |
| staff | inventory_operator | catalog | create/update/publish/archive | deny |
| staff | administrator | inventory | read/receive/adjust stock | allow |
| staff | catalog_manager | inventory | read stock and availability | allow |
| staff | inventory_manager | inventory | read/receive/adjust stock | allow |
| staff | inventory_operator | inventory | read/receive/adjust stock | deny |
| staff | administrator | promotions | create/update/archive promotions | allow |
| staff | operations_manager | promotions | create/update/archive promotions | allow |
| staff | finance_operator | promotions | create/update/archive promotions | deny |
| staff | administrator | orders | list/detail/transition/cancel | allow |
| staff | operations_manager | orders | list/detail/transition/cancel | allow |
| staff | finance_operator | orders | list/detail/transition/cancel | deny |
| staff | administrator | payment operations | list/detail/reconcile | allow |
| staff | finance_operator | payment operations | list/detail/reconcile | allow |
| staff | operations_manager | payment operations | list/detail/reconcile | deny |
| staff | administrator | customer CRM | search/read 360/notes/follow-ups/segments | allow |
| staff | crm_operator | customer CRM | search/read 360/notes/follow-ups/segments | allow |
| staff | support_operator | customer CRM | search/read 360/notes/follow-ups/segments | deny |
| staff | administrator | support tickets | list/create/detail/claim/transition/reassign/message/attachments | allow |
| staff | support_operator | support tickets | list/create/detail/claim/transition/reassign/message/attachments | allow |
| staff | crm_operator | support tickets | create and read customer context only where explicitly allowed | allow |
| staff | crm_operator | support ticket workflow | claim/transition/reassign operational tickets | deny |
| staff | executive_viewer | support tickets | list/detail/workflow | deny |
| staff | administrator | reporting dashboard | read aggregate commerce/product/customer/operations metrics | allow |
| staff | executive_viewer | reporting dashboard | read aggregate commerce/product/customer/operations metrics | allow |
| staff | crm_operator | reporting dashboard | read aggregate metrics | deny |
| staff | support_operator | reporting dashboard | read aggregate metrics | deny |

## Storefront Customers

| Audience | Role/session | Resource | Action | Decision |
| --- | --- | --- | --- | --- |
| public | anonymous | public catalog | browse products/categories/media | allow |
| public | anonymous | cart | read empty anonymous cart | allow |
| public | anonymous | cart mutation | add/update/remove | deny |
| storefront | guest | cart | add/update/remove own guest cart with CSRF and allowed origin | allow |
| storefront | guest | checkout | create checkout or payment initiation | deny |
| storefront | customer session | account | read/update own profile and addresses | allow |
| storefront | customer session | account | read/update another profile | deny |
| storefront | customer session | cart | merge/read/update own cart with CSRF and allowed origin | allow |
| storefront | customer session | checkout | create own checkout from backend-validated cart | allow |
| storefront | customer session | orders | list/read own orders | allow |
| storefront | customer session | orders | list/read another customer's orders | deny |
| storefront | expired or invalid customer session | account/cart/checkout/orders | authenticated actions | deny |

## Provider and Public Webhooks

| Audience | Role/session | Resource | Action | Decision |
| --- | --- | --- | --- | --- |
| provider | SePay IPN secret | payment webhook | ingest valid event | allow |
| public | missing/invalid IPN secret | payment webhook | ingest event | deny |
| public | browser redirect | payment status | mark payment/order paid | deny |

## Enforcement Notes

- Customer ownership is enforced by session-bound customer IDs and repository
  owner constraints.
- Staff authorization is enforced by Keycloak-derived staff roles and backend
  role guards.
- Denied staff operations that affect CRM, Support, Reporting, Inventory, or
  Payment surfaces must preserve audit/provenance without logging PII.
- `inventory_operator` is intentionally documented as denied because the
  current runtime role is `inventory_manager`.
