<!--
SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
SPDX-License-Identifier: Apache-2.0
-->

# Cross-Department Proactive Email Campaigns for Support & CRM Design

## 1. Executive Summary

This specification defines the architectural upgrade of the **CSKH & Trải nghiệm (Support & CRM)** department within OpenDX CompanyOS. 

Currently, the department operates reactively (responding to individual support tickets via email and generating retention vouchers for VIP customer complaints). This design elevates Support & CRM into a **proactive, cross-department collaborative outreach engine** capable of:
1. Announcing **New Product Launches** with live catalog data and MinIO image assets.
2. Announcing **Upcoming & Active Promotions / Flash Sales** with discount pricing and voucher codes.
3. Engaging segmented customer cohorts (VIPs, recent buyers, or all active registered customers).
4. Preserving the **AI CEO strategic dispatch and delegation flow** down to the department queue, as well as direct command execution.
5. Upholding **Human-in-the-Loop Governance** via interactive rich-preview modals, audience selection toggles, Word (`.docx`) deliverable reports, and fail-closed human approvals before sending.
6. Enforcing **Strict Clean Architecture & Zero Hardcoding**: dynamic data querying via inward ports, resilient PostgreSQL persistence, and authenticated email dispatching via `EmailDispatcherPort`.

---

## 2. Product Guardrails & Architectural Principles

1. **Company-First & Governed**: The company and store customer relationship remain central. Digital employees (`SUP-01` and `SUP-02`) do not act autonomously without human approval for external communications.
2. **Human-in-the-Loop Gate**: External bulk emails directly affect store reputation. No email campaign is dispatched without explicit Admin review and approval in the Staff Console.
3. **Clean Architecture & Inward Dependencies**:
   - The `support` module interacts with `catalog`, `marketing`, and `customer` through inward-facing query ports (`CatalogQueryPort`, `PromotionQueryPort`, `CustomerSegmentQueryPort`).
   - Repositories, MinIO SDK, and Email/SMTP dispatchers remain behind infrastructure adapters.
4. **Authoritative Backend**: Recipients, pricing, promotion discounts, and email logs are evaluated and persisted by the backend API and PostgreSQL. Frontend is an interactive presentation canvas.
5. **Zero Hardcoding**: All recipient lists, product attributes, image URLs, and promotion schedules are pulled live from PostgreSQL, MinIO, and runtime services.

---

## 3. Digital Workforce Collaboration & Roles

```text
               [ AI CEO / Admin Strategic Goal ]
                              │
               (Intent Detection & Decomposition)
                              │
                              ▼
           [ CSKH & Trải nghiệm Department Queue ]
                              │
       ┌──────────────────────┴──────────────────────┐
       ▼                                             ▼
[ SUP-01: Quản gia CSKH ]                 [ SUP-02: Chuyên viên CRM ]
 • Queries Catalog (New SKUs, MinIO)       • Crafts Responsive HTML Email
 • Queries Marketing (Active Promotions)   • Creates Vouchers (if applicable)
 • Segments Customer Cohorts (VIP, All)    • Generates Word (.docx) Deliverable
       │                                             │
       └──────────────────────┬──────────────────────┘
                              ▼
                [ Email Campaign Proposal ]
                 Status: pending_approval
                              │
                              ▼
           [ Admin Pending Approvals on Console ]
            • Interactive HTML Email Preview
            • Recipient Checkbox Toggles
            • Download Word (.docx) Report
            • [Reject] or [Approve & Dispatch]
                              │
                              ▼
         [ Execution via EmailDispatcherPort (SMTP) ]
            • Live Activity Feed Event Published
            • Recent Deliverables Updated (.docx)
            • Audit Log Record Persisted
```

### 3.1. AI CEO Delegation Flow (Preserved)
- The existing AI CEO task breakdown and department assignment mechanism is fully preserved.
- When an executive directive is issued (e.g., *"Tổ chức chiến dịch ra mắt dòng sản phẩm mới trên mọi kênh"*), the AI CEO:
  1. Directs `merchandising` to finalize catalog pricing and stock.
  2. Directs `marketing` to create campaign poster visuals and social copy.
  3. Directs `support` to prepare a synchronized customer announcement email campaign.
- When a direct prompt is given (e.g., *"Gửi email quảng bá 3 sản phẩm mới nhất đến toàn bộ khách hàng"*), the AI CEO routes directly to `support`.

### 3.2. Role: SUP-01 (Quản gia CSKH)
- **Primary Function**: Intelligence gathering, cross-department data correlation, and customer audience segmentation.
- **Responsibilities**:
  - Connects to `CatalogQueryPort` to retrieve latest active SKUs with positive stock (`availableQuantity > 0`) and MinIO public asset URLs.
  - Connects to `PromotionQueryPort` to retrieve active or scheduled Flash Sales and discount rates.
  - Connects to `CustomerSegmentQueryPort` to query and segment recipient candidates (VIP, recent buyers, all active registered).
  - Sanitizes recipient lists: validates RFC email format, filters out disabled accounts, and removes duplicate emails.

### 3.3. Role: SUP-02 (Chuyên viên CRM)
- **Primary Function**: Creative copywriting, responsive email composition, voucher generation, and deliverable documentation.
- **Responsibilities**:
  - Assembles a structured, responsive HTML email body containing:
    * NovaCommerce branding and header banner.
    * Personalized greeting (`Chào bạn {{fullName}}`).
    * Product showcase grid with MinIO product images, product title, regular price, and discount sale price.
    * Promotion highlight banner, discount code, and validity period.
    * Prominent Call-to-Action (CTA) button pointing to Storefront product/category pages.
    * Standard footer with store address and unsubscribe information.
  - Generates the formal Word (`.docx`) Campaign Plan Deliverable for executive review and archiving.
  - Submits the proposal to the persistent database with `pending_approval` status.

---

## 4. Domain & Application Architecture

### 4.1. Entity & DTO Specifications

#### `EmailCampaignType`
```typescript
export type EmailCampaignType = 
  | "new_product_announcement"
  | "promotion_announcement"
  | "customer_care_vip"
  | "ticket_resolution";
```

#### `CustomerSegmentType`
```typescript
export type CustomerSegmentType =
  | "vip_customers"          // High total spend, frequent orders
  | "recent_buyers"          // Orders within last 60 days
  | "all_active_customers";  // All verified, non-disabled customer accounts
```

#### `SupportEmailCampaignProposal`
```typescript
export interface CampaignRecipientItem {
  readonly customerId: string;
  readonly email: string;
  readonly fullName: string;
  readonly totalSpentVnd: number;
  readonly orderCount: number;
  readonly isSelected: boolean;
}

export interface FeaturedProductItem {
  readonly productId: string;
  readonly name: string;
  readonly sku: string;
  readonly regularPriceVnd: number;
  readonly salePriceVnd?: number;
  readonly imageUrl: string;
  readonly categoryName?: string;
  readonly storefrontUrl: string;
}

export interface CampaignPromotionDetails {
  readonly campaignId?: string;
  readonly campaignName: string;
  readonly discountPercent?: number;
  readonly voucherCode?: string;
  readonly startTime?: string;
  readonly endTime?: string;
  readonly description?: string;
}

export interface SupportEmailCampaignProposal {
  readonly id: string;
  readonly type: EmailCampaignType;
  readonly title: string;
  readonly emailSubject: string;
  readonly targetSegment: CustomerSegmentType;
  readonly recipients: readonly CampaignRecipientItem[];
  readonly totalRecipients: number;
  readonly selectedCount: number;
  readonly featuredProducts: readonly FeaturedProductItem[];
  readonly promotionDetails?: CampaignPromotionDetails;
  readonly htmlContent: string;
  readonly docxFilename: string;
  readonly status: "pending_approval" | "approved" | "rejected" | "sent" | "partially_sent";
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly sentAt?: string;
  readonly executionSummary?: {
    readonly successfulDispatches: number;
    readonly failedDispatches: number;
    readonly dispatchedAt: string;
  };
}
```

### 4.2. Inward Query Ports (Clean Architecture)

Placed in `apps/api/src/modules/support/application/ports/`:

1. **`CatalogQueryPort`**:
   ```typescript
   export interface CatalogQueryPort {
     getLatestProducts(limit: number): Promise<FeaturedProductItem[]>;
     getProductsByIds(productIds: string[]): Promise<FeaturedProductItem[]>;
     getProductsByPromotion(promotionId: string): Promise<FeaturedProductItem[]>;
   }
   ```

2. **`PromotionQueryPort`**:
   ```typescript
   export interface PromotionQueryPort {
     getActiveAndUpcomingCampaigns(): Promise<CampaignPromotionDetails[]>;
     getCampaignById(campaignId: string): Promise<CampaignPromotionDetails | null>;
   }
   ```

3. **`CustomerSegmentQueryPort`**:
   ```typescript
   export interface CustomerSegmentQueryPort {
     getCustomersBySegment(segment: CustomerSegmentType): Promise<CampaignRecipientItem[]>;
     getCustomerCountBySegment(segment: CustomerSegmentType): Promise<number>;
   }
   ```

### 4.3. Application Services & Ports

- **`EmailCampaignService`**: Coordinates the end-to-end flow:
  1. `createProposal(input)`: Orchestrates data gathering from ports, HTML generation, Word document creation, and database persistence.
  2. `getProposal(proposalId)`: Retrieves proposal with full recipient and product details.
  3. `applyProposal(proposalId, selectedRecipientIds?)`: Executes dispatching through `EmailDispatcherPort`, updates delivery statuses, publishes audit events.
  4. `cancelProposal(proposalId)`: Marks proposal as rejected/canceled.
- **`CustomerSegmentationService`**: Encapsulates SQL queries joining `customers` and `orders` to cleanly segment cohorts with zero hardcoding.
- **`SupportEmailComposer`**: Template engine generating high-converting, accessible, inline-styled responsive HTML emails.
- **`SupportEmailCampaignDocxGenerator`**: Uses the `docx` library to construct professional corporate deliverables detailing the campaign strategy, SKU breakdown, recipient metrics, and visual snapshots.

---

## 5. API Endpoints & Transport Layer

Added to `SupportController` (`/api/v1/support/agentic/email-campaigns`):

| Method | Path | Description | Access |
| :--- | :--- | :--- | :--- |
| `POST` | `/proposals` | Generate a new proactive email campaign proposal | Staff / Admin |
| `GET` | `/proposals/:id` | Get email campaign proposal details & preview | Staff / Admin |
| `GET` | `/proposals/active` | Get current active pending proposal | Staff / Admin |
| `POST` | `/proposals/:id/apply` | Approve and dispatch email campaign to selected recipients | Staff / Admin |
| `POST` | `/proposals/:id/cancel` | Cancel / reject the email campaign proposal | Staff / Admin |
| `GET` | `/proposals/:id/docx` | Download the Word (`.docx`) deliverable report | Staff / Admin |

---

## 6. Frontend Console Experience & Approvals

### 6.1. Pending Approval Card
- In `AgenticCommandCenter`'s **Chờ phê duyệt (Pending Approvals)** panel:
  - Card Title: `📧 [Chiến dịch Email] Giới thiệu 3 Sản phẩm Mới cho 24 Khách hàng`
  - Author: `Chuyên viên CRM & Quản gia CSKH (SUP-02 & SUP-01)`
  - Risk Level: `medium`
  - Action: Clicking "Xem chi tiết" opens the dedicated inspection modal.

### 6.2. Interactive Modal: `SupportEmailCampaignApprovalModal`
- **Tab 1: Interactive Email HTML Preview**:
  - Live preview of the email exactly as rendered in modern mail clients.
  - Header with NovaCommerce brand logo and subject line.
  - Product showcase cards displaying real MinIO images, titles, regular/discount prices, and store links.
  - Discount voucher badge (if promotion-related).
  - Call-to-action button linking directly to the Storefront.
- **Tab 2: Audience & Recipient Selection**:
  - Searchable list of customer recipients with details: Name, Email, Cohort Tag (VIP / Recent), Total Spend, Order Count.
  - Checkbox per row with "Select All" / "Deselect All" master toggle.
  - Real-time counter: `Đã chọn: 24/25 khách hàng`.
- **Action Bar**:
  - **Tải Báo Cáo Kế Hoạch Word (.docx)**: Direct download of the formal deliverable.
  - **Hủy Đề Xuất**: Safely rejects and cancels the campaign proposal.
  - **Phê Duyệt & Gửi Email**: Submits approved recipient IDs, triggers sending, displays progress indicator.

### 6.3. Post-Approval State & Feeds
- **Live Activity Feed**: An event is pushed:
  `CSKH & Trải nghiệm đã gửi thành công email chiến dịch đến 24 khách hàng`.
- **Recent Deliverables**: A new entry is added under `CSKH & Trải nghiệm`:
  `Báo cáo: Kế hoạch Email Ra Mắt Sản Phẩm Mới T9/2026 (.docx)`.
- **Department Card**: `support` card reflects completed tasks, resets progress bar, and sets status back to `idle`.

---

## 7. Error Handling, Resilience & Security

1. **Email Address Sanitization**:
   - RFC 5322 regex validation before queuing.
   - Exclusion of customer accounts with `status = 'disabled'` or unverified email when strict verification is required.
   - Deduplication across orders to prevent spamming the same individual multiple times in one campaign.
2. **Dispatcher Resilience**:
   - Sequential or throttled batch dispatching through `EmailDispatcherPort` to prevent SMTP rate-limit bans.
   - Individual dispatch errors are caught and recorded (`successfulDispatches`, `failedDispatches`) without crashing the workflow.
   - Clear diagnostic feedback in Console if SMTP server is unreachable.
3. **Empty Data Guard**:
   - If no products match or inventory is depleted, SUP-01 alerts the operator rather than generating a broken email.
   - If a customer cohort has 0 recipients, proposal creation is prevented with a descriptive notification.
4. **Audit & Provenance**:
   - Dispatches log an audit event in `agentic_audit_events` with `action: "support.email_campaign.dispatch"`, proposal ID, staff ID, recipient count, and timestamp.

---

## 8. Testing Strategy

1. **Unit Tests**:
   - `customer-segmentation.service.test.ts`: Verify cohort queries (VIP spend calculations, order frequency filters, disabled customer exclusion).
   - `support-email-composer.test.ts`: Test responsive HTML compilation, dynamic variable insertion, and MinIO image URL embedding.
   - `support-email-campaign-docx.generator.test.ts`: Verify Word `.docx` generation without corrupted tags.
2. **Integration Tests**:
   - `ai-support-campaign.api.test.ts`: Test proposal creation, persistence, recipient filtering, approval dispatch, simulated dispatcher calls, and cancellation.
3. **Frontend Component Tests**:
   - `support-email-campaign-approval-modal.test.tsx`: Test HTML preview rendering, checkbox toggles, approval trigger with selected IDs, and download action.
   - `agentic-command-center.test.tsx`: Verify approval queue integration, live event feed, and deliverable display for support email campaigns.
4. **Repository Validation Gates**:
   - `git diff --check`
   - `pnpm audit:repo`
   - `pnpm check`
