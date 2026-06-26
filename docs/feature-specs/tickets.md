# Feature Spec — Tickets (Quotes & Orders)

> **Status: Built** — full quote → order → payment → production → completed lifecycle as of 2026-05-23.

**Routes:** `/quotes` · `/orders` · `/payments` · `/completed` · `/quotes/new` · `/quotes/[id]` · `/orders/[id]` · `/payments/[id]` · `/completed/[id]`

> Legacy `/production` and `/production/[id]` redirect to `/orders?tab=in_production` and `/orders/[id]`.

### Ticket Status Flow

```
[New Quote Created]
  └─ draft  ──► sent ──► order ──► in_production ──► completed
       │           │       ▲              ▲
       │           │       │              └── production release (payment + confirm gates)
       │           │       └── quote → order via payment recorded, net confirm, or admin convert
       │           └── client_confirmed on /q/[token] (quote may stay sent until payment)
       │
       └─ [SDR total > HV threshold] ──► routed ──► [Sales claims] ──► draft (new owner)
```

- `draft` — in progress, not yet sent to client
- `sent` — quote delivered to client; may remain here after customer confirms until payment converts to order (**quote-until-payment**)
- `approved` — **retired** — kept in `TicketStatus` type for backwards compatibility only; new code never sets this
- `routed` — SDR's quote exceeded High-Value Threshold; routed to Sales for claiming
- `order` — production order (`ticket_kind = order`, `ORD-*`). Set by payment recorded, net terms on confirm, or **admin** manual convert. **Does not** mark the linked lead Won — that happens at production release.

### Reference codes vs `ticket_kind` (May 2026)

| Code | Meaning | `ticket_kind` |
|------|---------|---------------|
| `QUO-YYYY-NNNN` | Quote-stage record | `quote` |
| `ORD-YYYY-NNNN` | Order-stage record (converted from quote — same number) | `order` |
| `ORD-YYYY-NNN` | Order-stage record (legacy / direct order creation) | `order` |

**Source of truth:** `reference_code` prefix wins over `ticket_kind` in UI helpers (`ticketIsQuoteStage()`, `ticketIsOrderStage()`, `resolveTicketQuoteStage()` in `lib/utils/reference-codes.ts` and `lib/utils/ticket-lifecycle-timeline.ts`). Public customer portal/PDF use `ticketIsOrderStage()` so cancelled `ORD-*` tickets still display as **INVOICE**. API create/update enforces alignment via `ticketKindForReference()` on `POST /api/tickets` and `PATCH /api/tickets/[id]`. `maybeConvertQuoteToOrder()` aborts if `ORD-*` assignment fails (no `ticket_kind: order` while reference stays `QUO-*`).
- `in_production` — released to shop floor (`production_released_at` set). Partial orders may owe balance. **Linked lead `sales_status` → `Won`** via `markLeadWonOnProduction()`.
- `completed` — finished; customer notified (email/SMS pickup message with same `/q/{token}` URL); public page shows **Ready for pickup**
- `cancelled` — terminal; **Admin + Accountant** cancel with reason (`cancelled_at` set). **List placement:** quote-stage (`ticket_kind = 'quote'`) → `/quotes` **Cancelled** tab; order-stage (`ticket_kind = 'order'`) → `/orders` **Cancelled** tab (includes fully refunded then cancelled). Record and payment audit fields are retained.

### Where tickets appear by status

| Status | Primary page |
|--------|----------------|
| `draft`, `sent`, `approved`, `routed` | `/quotes` |
| `sent` + payment evidence pending | `/quotes` **and** `/payments` (accountant queue) |
| `order` (no pending evidence) | `/orders` |
| `order` + payment evidence pending | `/orders` for ticket owner (Awaiting payment confirmation) **and** `/payments` for accountant |
| `in_production` | `/orders` (In Production tab) |
| `in_production` + balance evidence pending | `/orders` (Awaiting payment confirmation) **and** `/payments` |
| `completed` | `/completed` |
| `cancelled` (quote-stage, `ticket_kind = 'quote'`) | `/quotes` (**Cancelled** tab) |
| `cancelled` (order-stage, `ticket_kind = 'order'`) | `/orders` (**Cancelled** tab) |

> **Record Locking:** Once `client_confirmed = true`, the record is locked for SDR/Sales users. Only **admin** can edit or cancel (including **completed** orders). Locking applies to the order detail header buttons, action bar, and editing mode for non-admins. Manual admin convert without customer confirm shows an amber **Admin converted** banner instead of **Confirmed by Customer**.

---

## Entry Points for New Quotes

A new quote can be started from three places. The entry point controls the UI shown:

| Entry | URL | Customer Tab | Left Sidebar |
|-------|-----|:---:|---|
| From a **Lead** (SDR Verify or Sales drawer) | `/quotes/new?lead_id=<uuid>` | Hidden | `LinkedLeadCard` (read-only lead info) |
| From **CRM** ("Add Quote" button) | `/quotes/new?first_name=...&last_name=...&email=...&phone=...&company=...` | Hidden | Customer info card (read-only) |
| From **Quotes page** ("New Quote" button) | `/quotes/new` | Shown (step 1) | Nothing |

---

## `/quotes` — Quoted Requests page

**Component:** `components/quotes/quotes-page.tsx`  
**List API:** `GET /api/quotes/page-data` — slim ticket list (`ticket_kind = 'quote'`; tabs include **Cancelled** for quote-stage cancellations). Returns `pagination` + tab `counts`. Full record on `/quotes/[id]` includes `line_items` tree.

**Date filter (May 2026):** `DashboardDateRangeFilter` in page header — default **Last 30 Days** (`last_month`); Today / Yesterday / Last 7 Days / Last 30 Days / Custom. Filters rows by `created_at` **server-side** via `date_from` / `date_to`. **Tab badges** from page-data `counts` under the same filters; sidebar `/quotes` badge stays all-time total.

**Pagination (May 2026):** Default 25 rows; `ListPagination` with 25 / 50 / 100 selector. Search and admin team filter are server-side.

**Mobile (< `lg`):** `TicketListToolbar` (scrollable tabs + full-width search) + `MobileListCard` per row. Desktop: full table. See `components/ui/mobile-list-card.tsx` and `.cursor/rules/mobile-table-cards.mdc`.

**Quick preview (Jun 2026):** Click a list row (desktop or mobile card) to expand line items without opening the detail page. Rows on the current list page include `line_preview` from `GET …/page-data` (instant expand); cache miss uses `GET /api/tickets/[id]/line-preview`. Renders read-only `LineItemsForm` (same cards, thumbnails, and `LineItemFilePreviewModal` as quote detail). **View** navigates to detail; **Claim** unchanged on Routed tab. Wired on **Quoted Requests**, **Orders**, **Completed**, and **Payment Evidence** tabs. One expanded row at a time; expand state clears on tab/filter/page change.

**Line item card display (Jun 2026):** Each read-only card (`DetailLineItemCard`) shows:
- **Title** — `Product Type · Material · Lamination` (lamination omitted when "None")
- **Spec pills** — labelled: `Color:`, `Sides:`, `Roll:`, `Size:`, `Qty:`, `Unit:`, `Note:`, `Designer:` (designer hidden when "Unassigned")
- **Finishing pills** (amber) — `Spot UV`, `Foil`, `Perforation`, `Die Cut`, `Needs Design`; shown only when the flag is set on the line
- **Line total** — right-aligned; when the total is a manual override (not `qty × unit price`) an `OVERRIDE` label appears beneath it
- **File thumbnail** — clickable image/PDF preview when a line-level file exists
- **Additional SKUs** — name, qty, and optional file thumbnail per variant

### Tabs (count badge on all tabs)

| Tab | Filter | Visible to |
|-----|--------|-----------|
| All | `draft` + `sent` + `approved` (badge excludes in-production/completed/order) | All roles |
| Draft | `ticket_status = 'draft'` | All roles |
| Sent | `ticket_status = 'sent'` | All roles |
| Won | `ticket_status = 'approved'` | All roles |
| **Cancelled** | `ticket_kind = 'quote'` + `ticket_status = 'cancelled'` | All roles (SDR/Sales: own `created_by_id` only; Admin: all) |
| **Routed to Sales** | `ticket_status = 'routed'` | **Sales + Admin** (Claim) · **SDR** (View own routed quotes — `created_by_id`; HVT auto-route or manual Line Items route) |

**Table columns (standard tabs):** Contact, Title, Channel, Total, **Due Now** (partial deposit when configured; `—` otherwise), Status pill, Follow-up (red if overdue), Created

**Status pills on `/quotes`** (from `lib/utils/quote-list-status.ts`): e.g. **Sent**, **Confirmed — awaiting deposit**, **Awaiting payment confirmation** (evidence pending on sent quote).

**Routed to Sales tab columns:** Contact, Title, Total (warning color), Routed By (SDR name), Date, Action button

**Action button in Routed tab:**
- **Sales / Admin** — "Claim" button → `PATCH /api/tickets/[id]` with `{ claim_ownership: true }` → sets `ticket_status = 'draft'`, `created_by_id = claimant`, redirects to quote detail. **`409` `ALREADY_CLAIMED`** if another rep claimed first (`UPDATE … WHERE ticket_status = 'routed'`). Success clears quotes list cache via `notifyListDataChanged`.
- **Live refresh (May 2026):** Other Sales users on this tab refresh when a colleague claims or when an SDR routes a new HVT quote — requires migration **`086_job_tickets_routed_realtime_rls.sql`** (`sales_read_routed_tickets` RLS + Realtime-safe `admin_read_all_tickets`). `quotes-page.tsx` also subscribes to `job_tickets` + `activities` INSERT; sidebar dispatches `bazaar:tickets-changed` on claim activities. **Why it broke:** `job_tickets` RLS only allowed `created_by_id = auth.uid()`, so non-owner Sales never received Realtime for SDR-owned routed rows; post-claim UPDATE is still invisible to others (row no longer `routed`) — claim is signaled via `activities` INSERT (`order_ticket_status_changed`, `action: claimed`).
- **SDR** — "View" button → navigates to `/quotes/[id]` in read-only mode with a yellow banner

**Routed tab banner:**
- **SDR:** optional amber banner — "These quotes exceeded the high-value threshold and were handed off to Sales. You can view them in read-only mode."
- **Sales/Admin:** no tab-level explainer banner (Jun 2026)

### Sidebar badge (`/quotes`)

- **SDR:** count of own `draft` + `sent` + `approved` (`created_by_id` only)
- **Sales/Admin:** same + count of all `routed` tickets (company claim queue)

### List scope (`scopeJobTicketsQuery` / `applyTicketScope`)

| Role | `/quotes` | `/orders` | `/completed` |
|------|-----------|-----------|--------------|
| **SDR** | `created_by_id = session user` | `created_by_id = session user` | `created_by_id = session user` |
| **Sales** | `created_by_id = me` **OR** all `ticket_status = routed` | `created_by_id = me` (routed rows excluded by status filter) | `created_by_id = me` |
| **Admin / Accountant** | All | All | All |

**SDR detail access (not list):** `canAccessTicket()` still allows read-only GET on in-progress hand-offs where `routed_by_id = session user` (until `completed`). After Sales claims an HVT quote, `created_by_id` becomes Sales — the ticket drops off SDR list pages but remains openable by URL while in progress.

---

## `/orders` — Orders page

**Component:** `components/orders/orders-page.tsx`  
**List API:** `GET /api/orders/page-data` — scoped to `ticket_kind = 'order'` and `ticket_status IN ('order', 'in_production', 'cancelled')`. Returns `pagination`. Includes evidence-pending rows for the ticket owner. **SDR / Sales:** `created_by_id = session user` (see list scope table under `/quotes`).

**Date filter (May 2026):** Same `DashboardDateRangeFilter` as Quotes — default **Last 30 Days**; filters by `created_at` **server-side**. **Tab badges** from page-data `counts` under the same filters; sidebar `/orders` badge stays all-time scoped total.

**Column sort (May 2026):** Server-side sort on Created by (A–Z), Balance Due (high→low), Due Date (overdue first), Status (In Production first), Payment (Unpaid→Partial→Paid). Click header again to reset default sort.

**Pagination (May 2026):** Default 25 rows; `ListPagination` with 25 / 50 / 100 selector.

**Due today highlight (May 2026):** Rows with due date **today** and not cancelled use a full-row danger background on all table cells (desktop) and matching fill on mobile cards (`isDueToday()` in `lib/utils/format.ts`). Past-due rows still show **· Overdue** on the due date column.

**Mobile (< `lg`):** same card pattern as Quotes (`MobileListCard` + `TicketListToolbar`).

### Tabs (count badge on all tabs; URL `?tab=`)

| Tab | Filter |
|-----|--------|
| All | `ticket_kind = 'order'` + (`order` + `in_production` + `cancelled`) — **default tab**; excludes `refund_status = full` from active rows (still on Cancelled when also cancelled) |
| Pending Payment | `ticket_kind = 'order'` + `ticket_status = 'order'` (includes evidence-pending) |
| In Production | `ticket_kind = 'order'` + `ticket_status = 'in_production'` |
| Cancelled | `ticket_kind = 'order'` + `ticket_status = 'cancelled'` |

Fully/partially refunded orders (not cancelled) appear on **`/payments` → Refunded** only — not on All / In Production / **Completed**.

**Status column:** API `status_label` / `status_tone` from `lib/utils/order-list-status.ts` — e.g. Confirmed by Customer, Converted by {name}, **Awaiting payment confirmation** (evidence pending on `order` **or** `in_production`), In Production, **Admin converted — …** (admin override without confirm/payment).

**Row click** → `/orders/[id]` (`QuoteDetail` with `context="order"`). In-production orders use the same detail route (header badge **In Production**).

### Order detail — payment under review (owner view)

When customer submitted payment evidence:
- **Pricing & payment** combined read-only card (`PricingPaymentSummary`) for sales/SDR
- Duplicate **Pricing** overview section hidden; quote metadata in **Quote details**
- Evidence file link **not shown** to sales/SDR — accountant/admin only via `GET /api/tickets/[id]/evidence`
- **Quote details** collapsible section (replaces separate Pricing header when evidence pending) — default collapsed
- **Payment & order settings** collapsible — default collapsed
- Confirm payment only on `/payments/[id]` or order detail for accountant/admin (`record_payment`)

---

## `/payments` — Payment evidence (Accountant + Admin)

**Component:** `components/orders/payments-page.tsx`

Three tabs — **Pending approval**, **Approved**, and **Refunded** — with badge counts on all (`GET /api/payments/page-data`). See [`payment-refunds.md`](./payment-refunds.md).

| Tab | UX |
|-----|-----|
| Pending approval | Evidence + **Confirm** (`PATCH { record_payment: true }`); global loading overlay on confirm |
| Approved | **View evidence** only; shows `payment_evidence_reviewed_at`; no Confirm |
| Refunded | Read-only list; **Paid via** / **Refunded via** columns; may show **Cancelled** badge |

**Desktop table columns (both tabs):** Order · Customer · Claimed · **Payment For** · Method · Submitted · Actions (Pending) or Approved (Approved tab).

**Payment For** (UI label — distinct from **Method**; same on list, detail review card, and payment summary):
- **Deposit** — partial strategy, deposit not yet confirmed (`inferPaymentEvidenceMode` → `deposit`); subtitle: *Prepayment due before production*
- **Balance** — partial strategy, deposit already paid (`balance`); subtitle: *Remaining balance after deposit*
- **Full payment** — full or net strategy, or evidence amount equals order total (`full`); subtitle: *Full order total*

Inference uses `ticket_payment_strategy`, `deposit_paid_at`, `payment_amount_received`, and `payment_evidence_amount` (`lib/utils/payment-evidence-type.ts`). Badge: `components/orders/payment-type-badge.tsx`. Detail review header uses labeled **Payment for** / **Method** columns (`payment-detail-overview.tsx`).

Evidence files are **retained** after accountant confirm (`payment_evidence_reviewed_at` set; URL not cleared). `isPaymentEvidencePending()` uses reviewed timestamp, not `payment_paid_at` (partial deposit approvals no longer show "Awaiting review" on `/orders`).

**Mobile (< `lg`):** card list per tab (no horizontal table scroll); includes Payment For row.

**Row click** → `/payments/[id]?from=/payments` (`QuoteDetail` with `context="payment"`). Approved detail: read-only review card + evidence link.

**Detail (`/payments/[id]`):** Same overview layout as order detail — **stats row** + **lifecycle timeline** at top, left sidebar (customer/lead + quick actions), Payment review section default **open**. **Back** → `/payments` (context `payment` wins over `in_production` status; see `resolveTicketDetailBackPath()`).

**Request updated proof (Jun 2026):** **Request** on Pending tab or payment detail (`ResendQuoteModal` mode `payment_evidence_resubmit`) → PATCH `request_payment_evidence_resubmit` with outreach channel + destination only. Server generates `payment_evidence_resubmit_token` + OTP, sends admin **Email** / **SMS** template `payment_evidence_resubmit_requested` (`{otpCode}`, `{link}` → `/evidence/{token}`). Template copy is **not** stored on the ticket or shown on public pages. Customer uploads on `/evidence/{token}` (not `/q`). See [`invoice-payment.md`](./invoice-payment.md) and `docs/api-contract.md` (Public Evidence Routes). Activity: `ticket_payment_evidence_resubmit_requested` / `ticket_payment_evidence_resubmitted`.

---

## In production (on `/orders`)

In-production tickets appear on **`/orders?tab=in_production`**, not a separate nav page (migration `079_remove_production_page.sql`).

**Detail:** `/orders/[id]` — overview layout with `ProductionDetailOverview` in Overview tab when `ticket_status = 'in_production'`.

**Actions (left sidebar `DetailQuickActions`, below customer card):**
- **Resend invoice link** — emails/SMS `/q/{token}`; channel icons (Mail / SMS / both) from ticket outreach settings
- **Mark Completed** — admin always (modal when balance due); accountant when paid in full → sends pickup notification with same `/q/{token}` URL
- **In Production** status shown in header badge only (not duplicated in overview body)

Legacy `components/orders/production-page.tsx` and `/api/production/*` remain in codebase but UI redirects to `/orders`.

---

## `/completed` — Completed orders (SDR own created; Accountant + Admin all)

**Component:** `components/orders/completed-page.tsx`

**Who sees what:**

| Role | Completed list scope |
|------|---------------------|
| **SDR** | `ticket_status = 'completed'` **and** `created_by_id = session user` — self-created quote/order through completion only |
| **Accountant / Admin** | All completed tickets |

**Excluded from SDR Completed:** quotes the SDR routed to Sales where Sales **claimed** and completed the order (`created_by_id` becomes Sales). While still `routed` or before claim, own HVT quotes may appear on `/quotes` → Routed tab; after Sales claims, list pages no longer show the row — detail read-only access via `routed_by_id` until `completed`.

**Mobile (< `lg`):** `MobileListCard` list + full-width search.

**Row click** → `/completed/[id]` (`QuoteDetail` with `context="completed"`)

**Date filter (May 2026):** `DashboardDateRangeFilter` in page header — default **Last 30 Days**; filters list by completion date (`updated_at`) **server-side**. Sidebar completed badge stays all-time total.

**Pagination (May 2026):** Default 25 rows; server-side search, date, admin team filter; `ListPagination`.

**Actions:** Resend invoice link (Admin + Accountant only on detail)

**API:** `GET /api/completed/page-data` → `{ orders, counts, pagination }`; `GET /api/completed/counts` (sidebar badge — all-time scoped). Scoped via `scopeCompletedTicketsQuery()` in `lib/utils/db-counts.ts`.

---

## Unified ticket detail (Overview + History)

All post-draft detail routes share the **overview layout** (`isOverviewLayout`), including **`context="payment"`** on `/payments/[id]`:

| Component | Purpose |
|-----------|---------|
| `ticket-stats-row.tsx` | Top stat cards (total, received, balance, due date, payment) |
| `customer-info-card.tsx` / `linked-lead-card.tsx` | Left sidebar contact card (lookup labels for industry/source) |
| `detail-quick-actions.tsx` | **All action buttons** under customer card |
| `ticket-detail-overview.tsx` | Routes to payment / production / quote-stage contextual notices |
| `ticket-overview-sections.tsx` | Line items, pricing (collapsible), payment config (read-only) |
| `ticket-lifecycle-timeline.tsx` | Lifecycle milestone row (**collapsible**, default closed) |
| `detail-layout-primitives.tsx` | Stat cards, section titles, `DetailCollapsibleSection` |
| `history-section.tsx` | Full activity trail |

**Customer link** (when `public_token` is set): **Customer Link** + **Copy Link** as two 50/50 buttons on their own row in `DetailQuickActions` — opens `/q/{token}` in new tab; copy with **Copied!** feedback. Shown for `sent`, `order`, `in_production`, `completed`, and **`cancelled`** (portal read-only with cancellation banner). See [`payment-refunds.md`](./payment-refunds.md) for refund-blocked portal behavior.

**Refunds (May 2026):** When payments were recorded, Overview leads with **Refunds** (`refund-history-section.tsx`) — ledger rows, optional evidence, **Open in Stripe** links. Stats row shows **Collected** / **Refunded** / refund status instead of misleading **Unpaid** after refund. Sidebar **Refund payment** (Admin + Accountant) when a slot remains. Orders list **Payment** column shows **Fully refunded** / **Partially refunded** when applicable. Fully refunded orders appear only on Payment Evidence **Refunded** tab (not active Orders/Completed lists) unless also cancelled (then visible on Orders → Cancelled too).

**Global loading:** slow PATCH/POST actions use `useGlobalLoading()` full-screen overlay (send quote, convert, confirm payment, etc.).

---

## `/quotes/new` — New Quote

**Component:** `components/quotes/new-quote-form.tsx`

### Layout

| | With Lead params | With CRM params (`customer_id` + contact) | Standalone (Quotes page) |
|--|--|--|--|
| Left sidebar | Read-only `LinkedLeadCard` | Read-only customer card | None |
| Main area | 3-tab form (Info, Line Items, Quote) | 3-tab form | 4-tab form (Customer, Info, Line Items, Quote) |
| Starting tab | Info | Info | Customer |
| Source input | Pre-filled from linked lead (`leads.source`) — not editable on quote | **Info tab** — Quote source card (required); saved as `quote_source` on ticket | **Customer tab** — Source * required before advancing; saved as `quote_source` on ticket |

### Customer Tab (only shown for standalone Quotes page — no `lead_id`, no CRM params)

Field order: **Phone** | **Email** → **First Name** | **Last Name** → **Company** → **Source** * → **Industry** * | **Website / Social**

> **Decision Maker** is **not** on the quote form. It lives on the **customer record** (`customers.authority`) and is set in Add Lead, Verify Drawer, or CRM Edit Customer.

**Phone-first customer search:**
- As the user types a phone number (600 ms debounce), `GET /api/customers/lookup?phone=...` is called
- **0 matches** → all fields remain editable; user fills in fresh
- **1 match** → picker modal shown with the matched customer; user selects it or chooses "Create New"
- **2+ matches** → same modal with all matches listed; user picks one or creates new
- When a customer is **selected**: identity fields (name, email, company) auto-fill and lock (read-only). **Phone stays editable.** Source, Industry, and Website remain editable (rep may set source for *this* quote).
- Pre-fill includes **all customer fields** (`industry`, `website`, `authority` on customer row) plus **`latest_source`** from the customer's most recent lead or prior direct quote
- Industry and Source selects show **admin lookup labels** (value stored in DB)
- Lock state is **lifted to the parent component** and survives tab navigation (navigating to Info and back does not reset the lock)
- Selected customer's `customer_id` is stored in form state and sent on save

> Customer contact data is **upserted on save** (Save Draft / Save & Send). **Source for Quotes-page-only creates** is stored on the ticket as `quote_source` — **not** on a new lead. Send `from_quote_page: true` with `POST /api/tickets`.

### Info Tab — Quote source (CRM Add Quote only)

When the Customer tab is skipped **and** there is **no** linked lead (`skipCustomerTab && !leadId`), a **Quote source** card appears at the top of the Info tab:
- Required before save
- Admin-managed source lookup (label shown, value stored)
- Saved as `job_tickets.quote_source` with `from_quote_page: true`
- Does **not** write to `leads.source`

When entering from a **linked lead**, source comes from the lead — no Quote source card on Info.

### Info Tab — General fields

- Title \* (required)
- Priority (Low / Normal / High — from `ticket_priority` lookup; **Urgent** is system-set and filtered from user-facing dropdown)
- Due Date (optional on create and edit; custom `DatePicker` — past dates disabled when a date is set)
- Rush toggle — manual only. No automatic connection to the due date (auto-toggle was removed).
- Internal Notes

### Line Items Tab

Each SKU row:

| Row | Left | Right |
|-----|------|-------|
| 1 | Product Type \* | Material \* |
| 2 | Width (in) \* | Height (in) \* |
| 3 | Color Mode | Sides |
| 4 | Quantity \* | Unit Price ($) \* |
| 5 | Lamination | Roll Direction |

- Add-on Finishings (UV Coating, Foil, Perforation checkboxes — pill/chip style)
- Need a design + Die Cut checkboxes (pill/chip style)
- **Line Item Comment** (free-text, full-width row)
- **Line Total ($) override** — input field that overrides qty × unit price calculation. Shown with gold border when active. When blank, calculated value is used.
- Add Line Item — full-width dashed button; **page auto-scrolls to the new item** on click

> All selects in Line Items tab use `appearance-none` + custom ChevronDown via `SkuSelect` helper for consistent cross-browser styling.

**Validation:** At least one line item must be fully filled (product type + qty + unit price > 0) before advancing to Quote tab or saving.

**Resend after edit (May 2026):** Saving changes does **not** auto-email the customer. **SDR/Sales** editing a **sent** quote before customer confirm see a modal to **Resend quote**. **Admin** edits on `sent`, `order`, `in_production`, or **completed** tickets see **Send update** (quote resend or invoice link with “revised by our team” copy). Portal `/q/{token}` always shows latest data after save.

**Line attachment (May 2026, lifecycle May 29):** In **Add-on Finishings**, **Attach file** (image or PDF) on the line. **One shared line file** per catalog row — not duplicated across every SKU.

| Step | Behavior |
|------|----------|
| File on line, **no SKUs** | Stored at line level (`ticket_files.variant_id` null) |
| **Add first SKU(s)** and save | File moves to **first SKU** (lowest `sort_order`) |
| **Delete first SKU** (others may remain) | File returns to **line level** (Storage kept) |
| **Add SKU again** from 0 SKUs | File moves to new first SKU on save |
| **Delete non-first SKU** with its own file | That file removed from **Storage + DB** |
| **Remove** via attachment control | Storage + DB row deleted |
| **Delete whole line item** | All files for that line removed from **Storage + DB** |

Each **non-first** additional SKU may still have its **own** optional attachment (independent of the shared line file).

**Staff UI (May 29):** **View** opens in-page preview modal (`LineItemFilePreviewModal` — spinner + min-height while loading); **Download** on Overview and edit rows. Edit form mirrors server rules via `applyVariantListAttachmentChanges()` (first SKU removed → file back on line control).

**Overview / PDF / email:** `lineFile` when a line-level attachment exists; per-SKU `file` on variant rows — both can appear on the same line.

**Additional SKUs (per line, May 2026):** Under each catalog line, staff can add zero or more **additional SKUs** — **name** and **quantity** required; optional image/PDF uploaded after save via `POST /api/tickets/{ref}/files`. Stored in `ticket_line_variants` + `ticket_files`. **Add SKU** is a primary gold/orange button (no `+` icon). **Quantity sync (May 2026):** With no additional SKUs, line **Quantity *** is entered directly. After **Add SKU**, the first SKU quantity pre-fills from line Quantity; each further SKU pre-fills from the first SKU’s quantity. Line **Quantity *** becomes the **sum** of all SKU quantities (read-only while SKUs exist); changing any SKU quantity updates the line total used for `qty × unit price`. Shown on staff detail, PDF, and email. **Public quote `/q/[token]` (May 2026):** additional SKUs in a **2×2 grid** under each product (`SKU1. name · Qty N`) with image preview or embedded PDF via `GET /api/public/quotes/[token]/files/[fileId]`. Persisted with `line_items` on `POST`/`PATCH /api/tickets`.

### Quote Tab

- **Pricing Summary** (live — updates as you type): Subtotal → Shipping → Discount → Pre-tax Total → Tax → **Total** (gold)
- **Fulfillment card** (`ShippingFulfillmentSection`):
  - Segmented control: **Pickup** (default) | **Ship to customer**
  - When **Ship** selected: one or more destination blocks — **Shipping ($)** per block (optional, may be `0`) + optional delivery address (Line 1, Line 2, City, State, ZIP)
  - **Add shipping address** — duplicates the block; `quote_shipping` on save = sum of all `shipping_amount` values
  - When customer is linked: each destination block has its own **Previous addresses** dropdown (from `GET /api/customers/[id]/shipping-addresses` — deduped history from past tickets for that `customer_id`, including `ticket_shipping_destinations`; not a separate address book). **Enter new address** clears that block’s fields so a fresh address can be typed without snapping back to a prior selection
  - When **Pickup**: all destination rows cleared; saved as `requires_shipping = false`, `quote_shipping = 0`
- **Adjustments card**:
  - Single row: Tax Rate (%) + Discount (None / % / $) + Tax Exempt toggle; conditional inputs when active
  - "Sales permit #" input shown when Tax Exempt is selected
- **Order Flow** (segmented control): **Quote First** | **Direct Order**
  - **Quote First** → "Send Quote to Customer" section (Send Via + destination; destination auto-fills from locked customer)
  - **Direct Order** → Payment Methods + Prepayment / Deposit section + Send Payment Link
- **Payment Methods** — segmented button group (one per option from `ticket_payment` lookup)
- **Prepayment / Deposit** (Direct Order only):
  - **Full Payment** | **Partial Payment** toggle (default: Full Payment)
  - When Partial is selected: % / $ type toggle + amount input + live "Due now / Balance" calculation
  - Saves `prepayment_type = "full"` for Full, or `"percent"/"fixed"` for Partial
- **Send Quote to Customer** (if Quote First): Send Via `*` + destination field `*` (both required — inline error shown if blank on save or Next). Destination auto-fills from locked customer when channel switches.
- **Follow-up Schedule**: First Reminder (custom `DatePicker`, past dates disabled), Cycles (select: 1–5, default 3), Frequency

### Validation before advancing

| Tab | Required before Next |
|-----|----------------------|
| Customer | First + Last Name; phone or email; **Source**; **Industry** |
| Info | Title |
| Line Items | ≥ 1 fully filled item (product + qty + unit price) |
| Quote | Destination field (email / phone / location) must not be empty |

### Manual Route to Sales (SDR only) — Line Items + Quote tabs

On **Line Items** and **Quote**, SDR users see **Route to Sales** even when the quote is **below** the high-value threshold. Clicking opens `RouteToSalesModal`:

- Reason grid from admin-managed `route_reason` lookups (same category as lead Route to Sales)
- Optional notes; choosing **Other** requires free-text in **Please specify** (same as hold / cancel flows)
- Confirm saves via `POST /api/tickets` with `ticket_status = 'routed'`, `routed_reason`, optional `routed_notes`
- Redirects to `/quotes` (Routed to Sales tab)
- **Line Items:** requires ≥ 1 complete line item (product + qty + unit price)
- **Quote tab:** also validates tax-exempt permit, shipping ZIPs, and website when routing from that step — SDR can fill shipping, tax, and payment settings before routing

**Send quote via prefill (May 2026):** When saving (including Route to Sales), `lib/utils/resolve-quote-delivery-from-contact.ts` copies customer phone/email into `ticket_dest_phone` / `ticket_dest_email` and picks SMS vs Email — prevents "Required field missing: Phone number" on routed saves. Quote detail backfills the same on load for edit.

HVT auto-route (below) does **not** prompt for a reason; manual route stores `routed_reason` / `routed_notes` on `job_tickets` (migration **095**).

### High-Value Threshold (HVT) — SDR only

When an SDR advances from Line Items → Quote tab **and** `pricing.final_total > company_settings.high_value_threshold`:

1. A **blocking modal** appears showing the total, the threshold, and a 30-second countdown
2. Two buttons are shown:
   - **Cancel — Edit Amount** → stops the countdown, closes the modal, SDR returns to Line Items to adjust the quote
   - **OK — Route to Sales** → immediately saves the quote as `ticket_status = 'routed'` and redirects to `/quotes`
3. If neither button is clicked, the countdown reaches 0 and the quote is auto-routed (same as clicking OK)
4. The routed quote appears in the "Routed to Sales" tab for Sales/Admin (Claim button) and the SDR (View/read-only)
5. Client dispatches `bazaar:tickets-changed` after save so open Quotes sessions refetch; other browsers rely on Supabase Realtime (migration **086** + `quotes-page-routed-sync` channel — see Routed tab section above)

> **SDR visibility after routing:** The ticket stores `routed_by_id = userId` at creation. While `ticket_status = 'routed'` and `created_by_id` is still the SDR, the quote appears on the SDR **Routed to Sales** tab (read-only). After Sales claims (`created_by_id` → Sales), it leaves SDR list pages; `canAccessTicket()` may still allow read-only detail via `routed_by_id` until `completed`.

### Footer actions

| Button | Condition | Effect |
|--------|-----------|--------|
| Back | Any tab (hidden on first tab if Customer tab is first) | Previous tab |
| Next | Any tab before Quote | Validate + advance; **inline errors on invalid fields**; scrolls first invalid field into view |
| Save Draft | Line Items tab onwards | `POST /api/tickets` with `status = 'draft'` |
| Route to Sales | Line Items or Quote tab, SDR only | Opens reason modal → `POST /api/tickets` with `status = 'routed'` + `routed_reason`; redirects to `/quotes` |
| Save & Send Quote | Quote tab | `POST /api/tickets` with `status = 'sent'`; blocked until `validateQuoteSend()` passes; global loading overlay; redirects to `/quotes` or quote detail |
| Cancel | Any | Navigate back |

### Send validation (draft save vs send)

Draft saves (`Save Draft`, `Save Changes`) allow incomplete fields. **Send Quote**, **Save & Send Quote**, and **Convert to Order** are disabled until all required send fields pass `lib/utils/validate-quote-send.ts`.

When blocked, an amber banner lists missing fields (e.g. Title, line items, Sales Permit # when tax exempt, **valid ZIP** on any ship-to destination with a ZIP entered, delivery destination, **Receipt ID** when cash/offline deposit or full cash-only payment). **Shipping ($) is not required** when ship-to-customer is selected (May 2026). Due date is optional on create and edit.

**Tab / field validation (May 2026):** On **Next** or save when a tab field fails (Source, Industry, title, due date, website, etc.), the form shows a **red border + inline message** on that field and **scrolls it into view** via `data-field-anchor` markers and `lib/utils/scroll-field-into-view.ts`.

### Automated quote follow-ups (cron)

When **Quote follow-up schedule** is enabled on the Quote tab and the quote is **sent**, the server seeds `follow_up_at` and `follow_up_cycles`.

**Sending reminders:**
- **Code:** `GET /api/cron/follow-ups` processes due quotes and sends short email/SMS reminders until the customer confirms or cycles are exhausted.
- **Automatic (daily):** requires **Vercel Pro** — `vercel.json` cron schedule.
- **Hobby / free (current):** cron does not auto-run; trigger manually or use an external scheduler — **`docs/cron-follow-ups.md`**.

**Receipt ID:** digits only — `inputMode="numeric"`, non-digit characters stripped on input; validation rejects non-numeric values.

---

## Public customer portal — `/q/[token]`

**Page:** `app/(public)/q/[token]/page.tsx` · **Document:** `components/public/public-quote-document.tsx`

No login. Staff can open the same URL to preview the customer experience.

### Line items display

- Standard table (desktop) / cards (mobile): product, spec, qty, unit price, line total.
- When a catalog line has **additional SKUs** and/or a **line-level attachment**, a **full-width block** below that row shows `PublicLineItemSkusGrid`:
  - **2-column grid** (`repeat(2, 1fr)`) — optional **Line attachment** cell plus one cell per SKU.
  - Label format: `SKU1. {name} · Qty {quantity}`.
  - **Image** (JPEG/PNG/WebP): inline `<img>` from public files API.
  - **PDF:** client `fetch` → `URL.createObjectURL` → `<object type="application/pdf">` (avoids framing CSP issues with redirected Storage URLs).
  - **Open PDF** — opens inline stream in new tab.
  - **Download** — `?download=1` on the same files endpoint.

### Public files API

`GET /api/public/quotes/[token]/files/[fileId]` — validates `public_token`, streams bytes with correct `Content-Type`. Not the same as staff `GET /api/tickets/.../files/...` (302 redirect).

**CSP:** Quote page allows `blob:` in `frame-src` and `object-src` for PDF previews (`lib/security/content-security-policy.ts`, `/q/:path*` header rule in `next.config.ts`).

### Live updates (May 29)

Customer tabs on `/q/[token]` subscribe to Supabase **Realtime broadcast** on channel `public-quote:{public_token}` (event `updated`). Staff saves, payment confirm, file upload/delete, and customer payment submit trigger `notifyPublicQuoteUpdatedByTicketId()` — debounced silent `GET /api/public/quotes/{token}` refetch. **No HTTP polling.** See `docs/realtime-live-updates.md`.

### Document type, tax-exempt, cancelled/refunded (Jun 2026)

- **Quote vs invoice label:** `ticketIsOrderStage()` — `ORD-*` shows **INVOICE** even when `ticket_status = cancelled` (reference prefix over `ticket_kind`).
- **Tax-exempt review banner:** Shown only when API `tax_exempt_review_pending` is true (`tax_exempt` + permit file on ticket + not reviewed). Pre–migration 103 tickets with permit # only do not show “under review” until staff uploads a file.
- **Cancelled / refunded pricing:** `shouldHidePricingOnCustomerDocument()` — cancelled hides full totals; partial/full refund shows **Amount Refunded** only. Payment-evidence “under review” suppressed when cancelled/refunded (`customerDocumentPaymentSummary`). Shared with `GET /api/public/quotes/[token]/pdf`.
- **Payment proof resubmit (Jun 2026):** While `payment_evidence_resubmit_required` is true, `/q` hides balance-under-review messaging, resubmit banners, and pay CTAs — customer uses the `/evidence` link from email/SMS only. API may expose `payment_evidence_resubmit_path` but the quote portal does not render it.

### Shipping addresses (May 2026)

- API returns `shipping_destinations[]` (resolved via `resolveTicketShippingDestinationsForDisplay()`).
- **One** destination with address or charge → **Ship To** column in the Bill To / Quote Details row (`PublicShippingAddressSingle`).
- **Multiple** destinations → full-width **2-column card grid** below the parties row (`PublicShippingAddressesList`) — same visual pattern as additional SKUs (per-card shipping amount + address lines).
- **Download PDF** (`GET /api/public/quotes/[token]/pdf`) uses the same rules: single **Ship To** column vs **Shipping addresses** 50/50 grid in `InvoicePDF`.

---

## Public payment proof resubmit — `/evidence/[token]`

**Page:** `app/(public)/evidence/[token]/page.tsx` · **Token:** `payment_evidence_resubmit_token` (not `public_token`).

Mirrors tax-exempt `/permit/[token]` flow:

1. Customer opens link from resubmit email/SMS.
2. `POST /api/public/evidence/[token]/verify-otp` with 6-digit code from message.
3. Upload form: read-only **payment method** (`payment_method_used` from original submission), optional receipt #, proof file.
4. `POST /api/public/evidence/[token]/upload` — replaces evidence in Storage; clears OTP/token; sets `payment_evidence_resubmit_received_at`.

Helpers: `lib/utils/public-payment-evidence-resubmit.ts`, `lib/utils/record-payment-evidence-resubmit-upload.ts`, `lib/constants/payment-evidence-resubmit-cookie.ts` (OTP cookie `path: /`).

**Existing DB:** apply `supabase/patches/2026-06-04-payment-evidence-otp.sql` if OTP columns are missing.

---

## `/quotes/[id]` — Quote / Order Detail

**Component:** `components/quotes/quote-detail.tsx`

### Header (sticky)

- Back button
- Title + reference code badge (`ORD-YYYY-NNNN` for orders)
- Status pill
- Save PDF link (`/api/tickets/[id]/pdf`) — requires MFA-complete session + ticket read scope (`canAccessTicket()`). PDF includes multi-destination shipping (50/50 grid), `SKU{n}.` labels, attachment file names, **Need a design** addon (see `lib/pdf/invoice-pdf.tsx`).
- **Edit button** — visibility rules:
  - `draft` or `sent` → always shown (non-admin)
  - `order` with `payment_status = 'unpaid'` (or null) → shown (non-admin)
  - `order` with `payment_status = 'partial'` or `'paid'` → hidden for non-admin (locked)
  - `client_confirmed = true` or `completed` → hidden for non-admin; **admin** always sees Edit on any non-`cancelled` ticket
  - `cancelled` → always hidden (locked)

### Layout

**Overview layout** (default for sent quotes, orders, payments review, production, completed — not draft edit mode):

- **Top:** `TicketStatsRow` — Order/Quote Total, Received, Balance Due, Due Date, Payment (mobile: full-width total + 2×2 grid for the other four)
- **Below stats:** `TicketLifecycleTimeline` — **collapsible** (default **collapsed**); click header to expand. Horizontal (desktop) / vertical (mobile) milestone row when open.
  - **Origin nodes (prepended when applicable):** **Lead created** (linked lead + `lead.source`) · **Customer in CRM** (no linked lead; `customer.created_at` before ticket create — typical CRM **Add Quote**)
  - **Creation node:** **Quote created** or **Order created** from the `order_ticket_created` activity payload (`reference_code`, `ticket_kind`) — **not** from the ticket’s current `ORD-*` after convert (orders detail still shows **Quote created** + `QUO-…` when the row started as a quote)
  - **Milestones:** Quote sent/resent · Customer confirmed · Converted to order (`ticket_converted`) · payment proof / recorded · due-date / completion nodes when applicable
  - Detail lines show `QUO-…` / `ORD-…` from activity payload where present
  - Data: `GET /api/activities?ticket_id=…&include_linked_lead=true` (UUID or `QUO-*` / `ORD-*`); refreshes on `bazaar:activities-changed`
- **Overview tab sections (read-only):** **Line Items** and other long blocks use **`DetailCollapsibleSection`** (default **collapsed**): **Line Items**, **Quote & Pricing**, **Fulfillment** (lists all `shipping_destinations` when present — default **open** when destinations exist), **Pricing** (summary), **Payment & order settings**, **Quote delivery**, **Follow-up schedule**, **Production & evidence**, **Payment review**, **Payment plan** (when shown). On `/payments/[id]`, **Payment review** defaults **open**.
- **Edit mode (May 2026):** Clicking **Edit** sets `defaultOpen={true}` on **Line Items**, **Fulfillment**, and **Quote & Pricing** so all three expand; after **Save**, overview sections return to collapsed.
- **Two-column grid:**
  - **Left sidebar** (always shown): `LinkedLeadCard` or `CustomerInfoCard`, then **`DetailQuickActions`** (all action buttons)
  - **Right panel:** Overview | History tabs; on desktop (`xl+`) only this panel scrolls
- **Mobile:** customer card stacks above content; single page scroll; header status badges swipe horizontally

**Legacy layout** (draft quotes in edit/view): same sidebar + `DetailQuickActions`; form tabs may differ.

- **CustomerInfoCard:** contact block + tags; **industry** and **quote source** display lookup **labels** from `/api/lookups?categories=source,industry` (e.g. "Retail Apparel", "Walk-in"), not raw stored values
- **Right**: **2-tab view — Overview | History** (or full edit form for draft)

### Info Tab

Single scrollable view combining all three edit sections, separated by labelled dividers:

**1. General Info** (top, no divider header)
- Same fields as new-quote Info tab: Title, Priority, Due Date (optional), Rush, Internal Notes

**2. Line Items** (section divider: "LINE ITEMS")
- Read-only: `DetailLineItemCard` per line — labelled spec pills (`Color:`, `Sides:`, `Roll:`, `Size:`, `Qty:`, `Unit:`, `Note:`, `Designer:`), amber finishing pills (`Spot UV`, `Foil`, `Perforation`, `Die Cut`, `Needs Design`), line total with `OVERRIDE` label when manually set, file thumbnail, and additional SKU rows
- Edit mode: full `EditableSkuRow` fields + Add Line Item button

**3. Quote & Pricing** (section divider: "QUOTE & PRICING")
- Read-only: pricing summary + delivery/payment details (fulfillment shown in Overview **Fulfillment** section, not duplicated here)
- Edit mode: full Quote tab fields (Fulfillment, Adjustments, Order Flow, Payment Methods, Prepayment, Send Channel, Follow-up Schedule)
- Includes the **Order Flow** segmented control (Quote First / Direct Order)

### History Tab

- Full lifetime of the record (lead activities + ticket activities), merged chronologically (`history-section.tsx`)
- Date separators
- Per-event icons, human-readable labels, actor name, relative timestamp
- **`order_ticket_created`:** **Quote created** when payload `reference_code` is `QUO-*` (or `ticket_kind: quote`); **Order created** for `ORD-*` / `ticket_kind: order` — same reference-first rules as the lifecycle timeline
- Auto-refreshes on `bazaar:activities-changed`

### Header — status badges

- **Quotes:** Standard status pill (draft / sent / cancelled). Short ID `/{XXXXXXXX}` shown next to title.
- **Orders (customer-confirmed, `client_confirmed = true`):** Green "Confirmed by Customer" badge + payment status pill. `ORD-YYYY-NNNN` is the primary heading (matches the original quote number), original title as subtitle.
- **Orders (manually converted):** Blue "Converted to Order" badge + payment status pill.

### Record Locking

| Condition | isLocked? | Effect |
|-----------|-----------|--------|
| `ticket_status = 'cancelled'` | ✅ Yes | All edit/cancel controls hidden |
| `client_confirmed = true` AND `userRole ≠ 'admin'` | ✅ Yes | Edit/cancel hidden; amber "Record Locked" banner shown |
| `client_confirmed = true` AND `userRole = 'admin'` | ❌ No | Admin retains full edit + cancel |
| `ticket_status = 'completed'` AND `userRole ≠ 'admin'` | ✅ Yes | Non-admins cannot edit or cancel |
| `ticket_status = 'completed'` AND `userRole = 'admin'` | ❌ No | Admin may edit and cancel |
| Any non-confirmed, non-completed ticket | ❌ No | Normal edit flow (subject to payment lock on paid orders) |

### Sidebar quick actions (`DetailQuickActions`)

All primary actions live **under the customer/lead card** in the left sidebar — not in a bottom bar (overview layout).

Hidden entirely when record is locked (`isLocked = true`) for quote lifecycle actions; production actions follow their own rules. **Cancel Quote** / **Cancel Order** is **Admin + Accountant** at all stages (not shown to SDR/Sales). If the ticket has partial refunds, a **partial refund warning** modal runs before the cancel-reason modal. Label from `cancelActionLabel()` — quote stages (`draft`, `sent`, `routed`) vs order stages (`order`, `in_production`, `completed`).

Send and Convert buttons are **disabled** when send validation fails; same amber missing-fields banner as new-quote form.

**Quote stage (draft / sent):**

| Action | Condition | Effect |
|--------|-----------|--------|
| Send Quote | `status = 'draft'` and validation passes | `PATCH → ticket_status = 'sent'`; triggers `sendQuoteToCustomer()` **unless** `ticket_quote_channel = 'none'` (public token still created); also fire-and-forgets `sendQuoteSentStaffNotification()` to creator; logs `ticket_sent` |
| Resend Quote | `status = 'sent'` and validation passes | Same — re-triggers both customer delivery and creator notification (delivery skipped if channel is `'none'`); logs `ticket_sent` with `resend: true` in payload |
| Convert to Order | **Admin only** — `status = 'draft'` or `'sent'` and validation passes | Opens confirmation modal → `PATCH → ticket_status = 'order'`; auto-generates `ORD-YYYY-NNNN` (reuses quote number); logs `ticket_converted`; fire-and-forgets `sendOrderWebhook()` (`via: "manual_convert"`). **Does not** set lead Won until production |

**Order / production / completed stage (same sidebar block):**

| Action | Condition |
|--------|-----------|
| Customer Link | `public_token` set; status `sent`, `order`, `in_production`, `completed`, or **`cancelled`** — opens `/q/{token}` in new tab |
| Copy Link | Same conditions — copies public URL to clipboard |
| Refund payment | **Admin + Accountant** — when a refundable payment slot remains (`record-refund-modal.tsx`) |
| Mark Completed | `in_production`; admin always; accountant only if paid in full |
| Resend invoice link | `in_production` or `completed`; sends via ticket outreach channel |
| Cancel Quote / Cancel Order | **Admin + Accountant** — any status except already `cancelled` (includes **completed**, paid or unpaid); partial-refund warning first when applicable |

**Cancelled state:** Overview shows red banner with stored reason label + notes (`cancelled-reason-banner.tsx`). **Linked lead** card footer shows **Order cancelled {date}** (`cancelled_at` on ticket or from `ticket_cancelled` activity). Reason labels are snapshotted on cancel (`cancel_reason_label`) so they remain visible even if the admin later deactivates or deletes the lookup option.

**Admin-managed reasons:** `/admin/settings/dropdowns` → Order / Quote section → **Quote Cancellation Reasons** / **Order Cancellation Reasons**. In-use reasons cannot be hard-deleted (409) — deactivate instead. **Other** requires free-text detail in the cancel modal (saved in `cancel_notes`).

Layout: row 1 — **Mark Completed** | **Resend Link** (when applicable); row 2 — **Customer Link** | **Copy Link** (50/50 width on mobile).

Long-running actions (send, convert, complete, confirm payment) show the **global loading overlay** (`useGlobalLoading()` — see `components/layout/global-loading-provider.tsx`).

### ~~Action bar (read-only mode)~~ — removed on overview layout

> **Deprecated UI:** The bottom action bar (Cancel left / Send+Convert right) was removed May 2026. Use **Sidebar quick actions** above.

### Payment Link Bar

Visible on all confirmed (`client_confirmed = true`) unpaid orders where `public_token` is set. Always shown — even non-admins can send payment reminders.

| Element | Description |
|---------|-------------|
| URL | Copyable `/q/[token]` payment page link |
| Channel | Email / SMS / WhatsApp segmented selector |
| Destination | Pre-filled with customer email (Email) or phone (SMS/WhatsApp); user-editable |
| Send | `PATCH /api/tickets/[id]` with `{ send_payment_reminder: true, reminder_channel, reminder_destination }` |

On success: logs `ticket_payment_reminder_sent` activity with channel + destination.

### Edit mode action bar

Two buttons: **Cancel** (discard changes) and **Save Changes**. No stepping — all sections on one scrollable page.

### Payment status bar (offline payment orders only)

Visible when `ticket_status = 'order'` AND `quote_payment_types` includes `"offline"`. Shows **Unpaid / Partial / Paid** pill buttons. Clicking any pill calls `PATCH /api/tickets/[id]` with `{ payment_status }` immediately (no edit mode).

### Deposit status bar (partial prepayment orders only)

Visible when `ticket_status = 'order'` **and** `prepayment_type` is `"percent"` or `"fixed"`, in read-only mode. Shows:
- Calculated deposit amount
- **Pending / Paid** toggle buttons (saves `prepayment_status` via PATCH)
- "Will be auto-updated by Stripe" note

### Edit lock

| Condition | Editable? |
|-----------|-----------|
| `draft` or `sent` ticket | ✅ Yes |
| `order`, `client_confirmed = true`, non-admin | ❌ Locked — "Record Locked" banner shown |
| `order`, `client_confirmed = true`, admin | ✅ Yes (admin only) |
| `completed`, non-admin | ❌ Locked |
| `completed`, admin | ✅ Yes (admin only) |
| `cancelled` | ❌ Locked |

> `payment_status` can always be updated from the payment status bar without entering edit mode.

### High-Value Threshold (HVT) — SDR editing draft

When an SDR clicks "Save Changes" on a `draft` quote and `pricing.final_total > company_settings.high_value_threshold`:

1. Same modal with Cancel / OK buttons and 30-second countdown
2. On Cancel: modal closes, SDR can adjust the total
3. On OK or timeout: ticket PATCH'd to `routed`, SDR redirected to `/quotes`

### SDR Read-Only View (routed quotes)

When an SDR opens `/quotes/[id]` for a ticket where `routed_by_id = userId`:
- A yellow banner is shown: "This quote exceeded the high-value threshold and was routed to Sales for handling. You are viewing it in **read-only mode**."
- The **Edit button is hidden**
- **Sidebar quote actions** (Send Quote / Cancel / Convert) are hidden
- All form fields are displayed but not editable
- The History tab is fully accessible

### Realtime

- `bazaar:tickets-changed` → silent re-fetch (sidebar subscription; no page-level channel)
- `bazaar:leads-changed` → silent re-fetch (updates lead info card)
- `bazaar:activities-changed` → refreshes History tab

---

## API Routes

| Route | Method | Purpose |
|-------|--------|---------|
| `GET /api/tickets` | GET | List tickets. `kind=quote` → slim quote-stage list (no `line_items`). **SDR:** `created_by_id` only (same as `/orders`, `/completed`). **Sales/Admin:** own + all `routed`. |
| `POST /api/tickets/[id]/files` | POST | Multipart: `variant_id` + `file` (per additional SKU) **or** `line_item_id` + `file` (line-level). Staff only. Replace uploads new Storage object and deletes prior path. |
| `GET /api/tickets/[id]/files/[fileId]` | GET | Staff: 302 signed URL (preview/download). |
| `DELETE /api/tickets/[id]/files/[fileId]` | DELETE | Removes Storage object + `ticket_files` row. Broadcasts public portal update when applicable. |
| `GET /api/public/quotes/[token]/files/[fileId]` | GET (no auth) | Customer: streamed file; `?download=1` for Download. Token must match ticket. |
| `GET /api/orders/orders` | GET | Scoped orders list for `/orders` — `ticket_kind = 'order'` + `order` / `in_production` / `cancelled`; includes evidence-pending for owner; returns `status_label` / `status_tone`. |
| `POST /api/tickets` | POST | Create ticket. Upserts customer. Auto-generates `QUO-YYYY-NNNN` (quotes) or `ORD-YYYY-NNNN` (direct orders). Direct Quotes page: stores `quote_source` on ticket (no auto-lead). Lead/CRM flows: may create linked lead with `source`. Logs activity. Updates linked lead status. Sets `routed_by_id = userId` when `ticket_status = 'routed'`. |
| `GET /api/tickets/[id]` | GET | Single ticket by UUID or reference code (`QUO-*`, `ORD-*`). Sales/Admin can GET `routed` tickets they don't own. **Accountant** can GET any ticket (matches list scoping). |
| `PATCH /api/tickets/[id]` | PATCH | Multi-mode: `claim_ownership`, `send_payment_reminder`, `resend_invoice`, `record_payment`, `release_production`, normal field update. See `docs/api-contract.md`. |
| `GET /api/tickets/[id]/evidence` | GET | Signed URL for payment evidence file (Accountant + Admin) |
| `GET /api/tickets/counts` | GET | Legacy tab badge counts: `{ drafts, sent, approved, orders, in_production, completed, routed, cancelled, total }`. `cancelled` = quote-stage only; Orders **Cancelled** badge uses `GET /api/orders/page-data` `counts.cancelled`. |
| `GET /api/payments/page-data` | GET | Pending + approved + refunded lists + tab counts (Accountant + Admin) |
| `POST /api/tickets/[id]/refund` | POST | Unified refund — Accountant + Admin (`record-refund-modal.tsx`) |
| `GET /api/tickets/[id]/refund-evidence/[refundId]` | GET | Signed refund evidence URL — Accountant + Admin |
| `GET /api/payments/pending` | GET | Legacy — pending queue only |
| `GET /api/payments/counts` | GET | Accountant dashboard KPIs (`pending_evidence`, in production, completed this month) |
| `GET /api/production/orders` | GET | Legacy in-production list (UI uses `/orders` tab) |
| `GET /api/production/counts` | GET | Legacy production tab counts |
| `GET /api/completed/orders` | GET | Completed orders list — SDR: `created_by_id` only; Admin/Accountant: all |
| `GET /api/completed/counts` | GET | Completed page + sidebar badge — same scope as list |
| `GET /api/completed/page-data` | GET | Paginated list + counts — same scope as list |
| `GET /api/activities` | GET | `?ticket_id=xxx` (UUID or `QUO-*` / `ORD-*`) + optional `include_linked_lead=true` → full lifetime merged |
| `GET /api/tickets/[id]/pdf` | GET | PDF download — MFA + `canAccessTicket()` |
| `GET /api/tickets/[id]/print` | GET | HTML print view — same auth as PDF |
| `GET /api/public/quotes/[token]` | GET (no auth) | Public ticket data for `/q/[token]` customer page |
| `POST /api/public/quotes/[token]/confirm` | POST (no auth) | Customer confirm — sets `client_confirmed`; converts when gates pass |
| `POST /api/public/quotes/[token]/submit-payment` | POST (no auth) | Customer payment proof upload (multipart) |

---

## Activity Types (ticket-related)

| Type | When logged |
|------|-------------|
| `order_ticket_created` | Ticket created |
| `order_ticket_updated` | Fields updated (edit mode save) |
| `order_ticket_status_changed` | Status transition (claim, route, etc.) |
| `ticket_sent` | Quote sent or resent. Payload: `{ channel, destination, resend?: true }` |
| `ticket_client_confirmed` | Customer confirms via public page |
| `ticket_converted` | Admin manual convert (or system convert on payment). Payload includes `require_client_confirm`, `client_confirmed`, `converted_by_role` |
| `ticket_payment_reminder_sent` | Payment reminder sent. Payload: `{ channel, destination }` |
| `ticket_payment_evidence_submitted` | Customer uploaded proof on public page. Payload: `{ method, amount }` |
| `ticket_payment_recorded` | Accountant/staff recorded payment via `record_payment` |
| `ticket_payment_confirmed_sent` | Payment confirmation email/SMS after accountant confirms evidence |
| `ticket_invoice_resent` | Customer portal link resent from production/completed detail |
| `ticket_order_ready_sent` | Pickup notification sent when order marked completed |
| `ticket_order_ready_failed` | Pickup notification failed to send |

---

## Sidebar Badges

| Badge | SDR | Sales | Accountant | Admin |
|-------|-----|-------|------------|-------|
| `/quotes` | own draft + sent + approved | own + all `routed` | — | all |
| `/orders` | own (`created_by_id`) | own (`created_by_id`) | pending + in_production | pending + in_production |
| `/payments` | — | — | unreviewed evidence (sidebar) | unreviewed evidence (sidebar) |
| `/completed` | own (`created_by_id`) | own (`created_by_id`) | completed count (all) | completed count (all) |

Counts from `GET /api/tickets/counts`, `/api/payments/counts`, `/api/completed/counts`, `/api/sidebar-counts`. Refresh via `bazaar:refresh-counts`.

---

## High-Value Threshold — Full Business Rule

Configured in **Admin → Company Settings → High-Value Threshold ($)**.  
Default: `$5,000`.

| User Role | Behaviour |
|-----------|-----------|
| SDR creating/editing a quote | Blocked when total > threshold. Modal shown with Cancel (edit amount) and OK (route). Quote saved as `routed` on OK or countdown expiry. |
| Sales / Admin | No block. Full save regardless of total. |

When a `routed` quote is **claimed** by Sales (other reps’ Routed tab should update live — **`086_job_tickets_routed_realtime_rls.sql`** required):

- `ticket_status` → `draft`
- `created_by_id` → claiming Sales user's ID
- `routed_by_id` → **unchanged** (preserves original SDR's identity)
- All other Sales users see it disappear from "Routed to Sales" tab instantly (via Realtime)
- Claimer finds it in their own "Draft" tab and can continue working it

**SDR visibility after claiming:** `routed_by_id` is never changed. The ticket disappears from SDR **list** pages once `created_by_id` becomes Sales; read-only detail may still work via `canAccessTicket()` until `completed`.

---

## Customer Upsert (New Quote Flow)

When a quote is saved (draft or sent) from `new-quote-form.tsx`:

1. If `customer_id` already exists in form state (existing customer selected from lookup or CRM) → use it; update industry/website on customer if changed
2. Else if contact fields (name/email/phone) are present → server upserts via `POST /api/tickets` (match on email or phone; create if no match)
3. Set `customer_id` on the `job_tickets` row
4. **Quotes page / CRM Add Quote** (`from_quote_page: true`): store `quote_source` on the ticket; do **not** auto-create a linked lead
5. **Lead entry** (`linked_lead_id`): source stays on the linked lead; no `quote_source` on ticket
6. Customer appears in CRM immediately

> **Decision Maker** (`customers.authority`) is never written from the quote form — only from Add Lead, Verify Drawer, or CRM Edit Customer.

---

---

## Quote Delivery & Customer Approval Flow ✅ Built (2026-05-14)

### Send Quote

When a rep clicks **Send Quote** on `/quotes/[id]`, `PATCH /api/tickets/[id]` sets `ticket_status = "sent"` and triggers `sendQuoteToCustomer()` from `lib/integrations/send-quote.ts` — **unless** `ticket_quote_channel = 'none'`, in which case the public page token is still created but no SMS/email is sent to the customer. After the customer email is dispatched, `sendQuoteSentStaffNotification()` (`lib/integrations/send-quote-sent-notification.ts`) is fire-and-forgotten to the quote creator using the admin-editable `quote_sent_staff_notification` template.

Delivery by channel (stored in `quote_channel`):

| `quote_channel` | Delivery |
|---|---|
| `Email` | Instantly AI v2 API — full HTML email with line items, pricing, gold CTA button |
| `SMS` | Twilio — short text message with total + `/q/[token]` link |
| `WhatsApp` | Twilio WhatsApp — same short message, `whatsapp:` prefix on `to` |
| `In-person` | No outreach — status changes to `sent` only |

Delivery is fire-and-forget: errors are logged to console but never block the rep's UI.

### Public Quote Page — `/q/[token]`

Each ticket has a `public_token` (UUID, unique, unguessable). The public URL is `{APP_URL}/q/{public_token}`.

No login required — `proxy.ts` allows `/q/` paths without auth. Staff can preview the same URL while logged in.

**Line items & attachments (May 2026):** Below each product row, `PublicLineItemSkusGrid` shows additional SKUs in a **2-column grid** (`SKU{n}. name · Qty N`) with image inline preview or PDF via `fetch` → `blob:` + `<object>`. **Open PDF** and **Download** (`?download=1`) use `GET /api/public/quotes/[token]/files/[fileId]` (streamed bytes, not Storage redirect). See also **Public customer portal** section above.

**Unified portal (`QuotePortalSection`)** — one permanent link adapts by phase:

| Step / area | Pending confirm | After confirm / not required |
|-------------|-----------------|------------------------------|
| Step 1 title | **Confirm quote price** | **Quote price confirmed** or **Quote price confirmation** (not required) |
| Step 1 subtitle | Customer must confirm the quote + button | Confirmed / Not required |
| Step 2 | Payment (deposit or full) | Same; evidence → amber review |
| Step 3 | Ready for production | In production; **Pay remaining balance** when partial and balance due |
| Payment summary | Price confirmation: **Required — pending** | Confirmed / Not required |

**On confirm:**
- `POST /api/public/quotes/[token]/confirm`
- Sets `client_confirmed = true` only — quote **stays on `/quotes`** until payment converts (net terms exception: may convert + auto-release on confirm)
- Logs `ticket_client_confirmed` activity (`by_user_id = null`)
- Returns `{ ok: true, reference_code, in_production?, converted_to_order? }`

**Balance payments while in production:**
- Customer uses same `/q/{token}` link
- `POST …/submit-payment` accepts `in_production` / `completed` for follow-up balance
- Evidence → `/payments` queue; owner sees **Awaiting payment confirmation** on `/orders`
- After accountant confirms → customer sees **paid in full** on public page

### Convert to Order (admin only)

SDR/Sales **Convert to Order** button is hidden; API returns `403` for non-admin.

**Admin** sees convert with confirmation modal (`lib/utils/admin-convert-preview.ts`) listing missing send fields, missing customer confirmation, and whether production may auto-release. Orders list/detail show **Admin converted — customer confirm missing** (etc.) when applicable. On successful convert, `sendOrderWebhook()` fires fire-and-forget with `via: "manual_convert"` — same as all other order creation paths.

### New API Routes

| Route | Auth | Purpose |
|-------|------|---------|
| `GET /api/public/quotes/[token]` | None | Returns safe public ticket fields + company settings |
| `POST /api/public/quotes/[token]/confirm` | None | Customer confirm — sets `client_confirmed`; converts via `maybeConvertQuoteToOrder` when gates pass |
| `POST /api/public/quotes/[token]/submit-payment` | None | Customer payment proof (multipart); balance while in-production |

### New Files

| File | Purpose |
|------|---------|
| `lib/integrations/send-quote.ts` | Channel router + Twilio/Instantly; loads admin SMS + email templates |
| `lib/integrations/quote-email-template.ts` | Quote/order HTML layout; subject/intro/CTA from admin `email_templates` |
| `lib/integrations/customer-email-builders.ts` | Admin email copy for reminders, invoice link, payment confirmed, etc. |
| `lib/integrations/resubmit-requested-outreach.ts` | Resubmit request email/SMS from admin templates |
| `app/(public)/layout.tsx` | Minimal public layout (no auth, no sidebar) |
| `app/(public)/q/[token]/page.tsx` | Customer-facing quote/order page — shows "Quote Confirmed!" or "Order Confirmed!" based on ticket kind |
| `supabase/migrations/052_add_public_token_to_tickets.sql` | `public_token` column + unique index |
| `app/api/dev/quote-email-preview/route.ts` | Dev-only GET route — renders the email template in-browser with fake data |
| `app/api/public/quotes/[token]/route.ts` | Public ticket fetch (no auth) |
| `app/api/public/quotes/[token]/confirm/route.ts` | Customer confirmation — `client_confirmed` only; order conversion via payment gates |

### Email Template Design Notes (`quote-email-template.ts`)

- 100% table-based layout (no flexbox/grid — stripped by Gmail/Outlook)
- All styles inline — no `<style>` blocks
- Both `bgcolor` attribute and `background-color` inline style set on every cell (Outlook compatibility)
- Line items table uses `border-collapse:separate; border-spacing:0` — allows `border-radius` to work (unlike `border-collapse:collapse` which disables it)
- **Reference card status badge** (`Awaiting Approval` / `Confirmed`) is anchored to the top-right corner of the reference card using `border-radius:0 7px 0 8px` — independent of title length, no wrapping
- Contains full quote info: company branding, reference + status, line items table, pricing summary, payment methods, gold CTA button, footer with contact details
- Preview: `GET /api/dev/quote-email-preview` (dev server only; may use coded defaults, not live admin DB copy)
- **Admin-editable copy:** All customer emails — `docs/email-template-guide.md`; quote emails edit subject, intro, and CTA only (line items unchanged)

## Deferred

- **Dashboard revenue integration** — approved ticket totals surfaced on Dashboard KPIs
- **Stripe payment collection** — see `docs/feature-specs/invoice-payment.md` for full spec
- **Zelle code matching** — automated memo parsing; manual "Mark as Paid" fallback
- **WhatsApp delivery** — requires Meta Business Manager registration
- **Mark completed with balance due** — **decided (Option B):** Admin only with `acknowledge_outstanding_balance: true`; accountants blocked when balance remains (open-questions **B7**)
- **Sent-quote email vs live portal after edit** — owner policy (**TODO-008** / open-questions **B6**)
