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
- `in_production` — released to shop floor (`production_released_at` set). Partial orders may owe balance. **Linked lead `sales_status` → `Won`** via `markLeadWonOnProduction()`.
- `completed` — finished; customer notified (email/SMS pickup message with same `/q/{token}` URL); public page shows **Ready for pickup**
- `cancelled` — terminal; no payment recorded

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
| `cancelled` | `/orders` (Cancelled tab) |

> **Record Locking:** Once `client_confirmed = true`, the record is locked for SDR/Sales users. Only Admins can edit or cancel. Locking applies to the order detail header buttons, action bar, and editing mode. Manual admin convert without customer confirm shows an amber **Admin converted** banner instead of **Confirmed by Customer**.

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
**List API:** `GET /api/tickets?kind=quote` — slim payload (no `quote_skus` on list). Full record on `/quotes/[id]`.

**Mobile (< `lg`):** `TicketListToolbar` (scrollable tabs + full-width search) + `MobileListCard` per row. Desktop: full table. See `components/ui/mobile-list-card.tsx` and `.cursor/rules/mobile-table-cards.mdc`.

### Tabs (count badge on all tabs)

| Tab | Filter | Visible to |
|-----|--------|-----------|
| All | `draft` + `sent` + `approved` (badge excludes in-production/completed/order) | All roles |
| Draft | `ticket_status = 'draft'` | All roles |
| Sent | `ticket_status = 'sent'` | All roles |
| Won | `ticket_status = 'approved'` | All roles |
| **Routed to Sales** | `ticket_status = 'routed'` | **Sales + Admin** (Claim button) · **SDR** (View button, read-only) |

**Table columns (standard tabs):** Contact, Title, Channel, Total, **Due Now** (partial deposit when configured; `—` otherwise), Status pill, Follow-up (red if overdue), Created

**Status pills on `/quotes`** (from `lib/utils/quote-list-status.ts`): e.g. **Sent**, **Confirmed — awaiting deposit**, **Awaiting payment confirmation** (evidence pending on sent quote).

**Routed to Sales tab columns:** Contact, Title, Total (warning color), Routed By (SDR name), Date, Action button

**Action button in Routed tab:**
- **Sales / Admin** — "Claim" button → `PATCH /api/tickets/[id]` with `{ claim_ownership: true }` → sets `ticket_status = 'draft'`, `created_by_id = claimant`, redirects to quote detail
- **SDR** — "View" button → navigates to `/quotes/[id]` in read-only mode with a yellow banner

**Routed tab banner:**
- **Sales / Admin:** "These quotes were created by SDR users but exceed the high-value threshold. Claim one to take ownership and complete it."
- **SDR:** "These quotes exceeded the high-value threshold and were handed off to Sales. You can view them in read-only mode."

### Sidebar badge (`/quotes`)

- **SDR:** count of `draft` + `sent` + `approved` tickets (own)
- **Sales/Admin:** same + count of all `routed` tickets

---

## `/orders` — Orders page

**Component:** `components/orders/orders-page.tsx`  
**List API:** `GET /api/orders/orders` — scoped to `order` + `in_production` + `cancelled`. Includes evidence-pending rows for the ticket owner.

**Mobile (< `lg`):** same card pattern as Quotes (`MobileListCard` + `TicketListToolbar`).

### Tabs (count badge on all tabs; URL `?tab=`)

| Tab | Filter |
|-----|--------|
| All | `order` + `in_production` + `cancelled` — **default tab** |
| Pending Payment | `ticket_status = 'order'` (includes evidence-pending) |
| In Production | `ticket_status = 'in_production'` |
| Cancelled | `ticket_status = 'cancelled'` |

**Status column:** API `status_label` / `status_tone` from `lib/utils/order-list-status.ts` — e.g. Confirmed by Customer, Converted by {name}, **Awaiting payment confirmation** (evidence pending on `order` **or** `in_production`), In Production, **Admin converted — …** (admin override without confirm/payment).

**Row click** → `/orders/[id]` (`QuoteDetail` with `context="order"`). In-production orders use the same detail route (header badge **In Production**).

### Order detail — payment under review (owner view)

When customer submitted payment evidence:
- **Pricing & payment** combined read-only card (`PricingPaymentSummary`) for sales/SDR
- Duplicate **Pricing** overview section hidden; quote metadata in **Quote details**
- Evidence file link **not shown** to sales/SDR — accountant/admin only via `GET /api/tickets/[id]/evidence`
- **Order settings** section shows payment config read-only
- Confirm payment only on `/payments/[id]` or order detail for accountant/admin (`record_payment`)

---

## `/payments` — Payment review (Accountant + Admin)

**Component:** `components/orders/payments-page.tsx`

Queue of orders where customer uploaded payment evidence and accountant has not yet confirmed.

**Mobile (< `lg`):** card list with Evidence + Confirm buttons per row (no horizontal table scroll).

**Row click** → `/payments/[id]` (`QuoteDetail` with `context="payment"`)

**Actions:** Confirm payment (`PATCH { record_payment: true }` — accountant/admin only; shows global loading overlay), view evidence file

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

## `/completed` — Completed orders (Accountant + Admin)

**Component:** `components/orders/completed-page.tsx`

**Mobile (< `lg`):** `MobileListCard` list + full-width search.

**Row click** → `/completed/[id]` (`QuoteDetail` with `context="completed"`)

**Actions:** Resend invoice link (customer portal access)

---

## Unified ticket detail (Overview + History)

All post-draft detail routes share the **overview layout** (`isOverviewLayout`):

| Component | Purpose |
|-----------|---------|
| `ticket-stats-row.tsx` | Top stat cards (total, received, balance, due date, payment) |
| `customer-info-card.tsx` / `linked-lead-card.tsx` | Left sidebar contact card (lookup labels for industry/source) |
| `detail-quick-actions.tsx` | **All action buttons** under customer card |
| `ticket-detail-overview.tsx` | Routes to payment / production / quote-stage contextual notices |
| `ticket-overview-sections.tsx` | Line items, pricing, payment config (read-only) |
| `history-section.tsx` | Full activity trail |

**Customer link** (sent quotes / orders with `public_token`): **Customer Link** + **Copy Link** in `DetailQuickActions` — opens `/q/{token}` in new tab; copy with **Copied!** feedback.

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
- Due Date (custom `DatePicker` component — past dates disabled; click anywhere on the input to open)
- Rush toggle — manual only. No automatic connection to the due date (auto-toggle was removed).
- Special Requirements
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
- Design on file + Die Cut checkboxes (pill/chip style)
- **Line Item Comment** (free-text, full-width row)
- **Line Total ($) override** — input field that overrides qty × unit price calculation. Shown with gold border when active. When blank, calculated value is used.
- Add Line Item — full-width dashed button; **page auto-scrolls to the new item** on click

> All selects in Line Items tab use `appearance-none` + custom ChevronDown via `SkuSelect` helper for consistent cross-browser styling.

**Validation:** At least one line item must be fully filled (product type + qty + unit price > 0) before advancing to Quote tab or saving.

### Quote Tab

- **Pricing Summary** (live — updates as you type): Subtotal → Shipping → Discount → Pre-tax Total → Tax → **Total** (gold)
- **Adjustments card**:
  - Row 1: Shipping ($) + Tax Rate (%) inputs — local string state prevents snap-back to "0" when cleared
  - Row 2: Discount selector (None / % / $) + Tax Exempt toggle; conditional inputs when active
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

### High-Value Threshold (HVT) — SDR only

When an SDR advances from Line Items → Quote tab **and** `pricing.final_total > company_settings.high_value_threshold`:

1. A **blocking modal** appears showing the total, the threshold, and a 30-second countdown
2. Two buttons are shown:
   - **Cancel — Edit Amount** → stops the countdown, closes the modal, SDR returns to Line Items to adjust the quote
   - **OK — Route to Sales** → immediately saves the quote as `ticket_status = 'routed'` and redirects to `/quotes`
3. If neither button is clicked, the countdown reaches 0 and the quote is auto-routed (same as clicking OK)
4. The routed quote appears in the "Routed to Sales" tab for Sales/Admin (Claim button) and the SDR (View/read-only)

> **SDR visibility after routing:** The ticket stores `routed_by_id = userId` at creation time. Even after Sales claims the ticket (which changes `created_by_id` to the Sales rep), the SDR can still see and view the ticket via the Routed to Sales tab on `/quotes`.

### Footer actions

| Button | Condition | Effect |
|--------|-----------|--------|
| Back | Any tab (hidden on first tab if Customer tab is first) | Previous tab |
| Next | Any tab before Quote | Validate + advance; **inline errors on invalid fields**; scrolls first invalid field into view |
| Save Draft | Line Items tab onwards | `POST /api/tickets` with `status = 'draft'` |
| Save & Send Quote | Quote tab | `POST /api/tickets` with `status = 'sent'`; blocked until `validateQuoteSend()` passes; global loading overlay; redirects to `/quotes` or quote detail |
| Cancel | Any | Navigate back |

### Send validation (draft save vs send)

Draft saves (`Save Draft`, `Save Changes`) allow incomplete fields. **Send Quote**, **Save & Send Quote**, and **Convert to Order** are disabled until all required send fields pass `lib/utils/validate-quote-send.ts`.

When blocked, an amber banner lists missing fields (e.g. Title, Due date, line items, Sales Permit # when tax exempt, delivery destination, **Receipt ID** when cash/offline deposit or full cash-only payment).

**Tab / field validation (May 2026):** On **Next** or save when a tab field fails (Source, Industry, title, due date, website, etc.), the form shows a **red border + inline message** on that field and **scrolls it into view** via `data-field-anchor` markers and `lib/utils/scroll-field-into-view.ts`.

### Automated quote follow-ups (cron)

When **Quote follow-up schedule** is enabled on the Quote tab and the quote is **sent**, the server seeds `follow_up_at` and `follow_up_cycles`. A **Vercel Cron** job (`GET /api/cron/follow-ups`, daily) sends short email/SMS reminders until the customer confirms or cycles are exhausted. Setup: **`docs/cron-follow-ups.md`**.

**Receipt ID:** digits only — `inputMode="numeric"`, non-digit characters stripped on input; validation rejects non-numeric values.

---

## `/quotes/[id]` — Quote / Order Detail

**Component:** `components/quotes/quote-detail.tsx`

### Header (sticky)

- Back button
- Title + reference code badge (ORD-YYYY-NNN for orders)
- Status pill
- Save PDF link (`/api/tickets/[id]/pdf`) — requires MFA-complete session + ticket read scope (`canAccessTicket()`)
- **Edit button** — visibility rules:
  - `draft` or `sent` → always shown
  - `order` with `payment_status = 'unpaid'` (or null) → shown
  - `order` with `payment_status = 'partial'` or `'paid'` → hidden (locked)
  - `cancelled` → always hidden (locked)

### Layout

**Overview layout** (default for sent quotes, orders, payments review, production, completed — not draft edit mode):

- **Top:** `TicketStatsRow` — Order/Quote Total, Received, Balance Due, Due Date, Payment (mobile: full-width total + 2×2 grid for the other four)
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
- Same fields as new-quote Info tab: Title, Priority, Due Date, Rush, Special Requirements, Internal Notes

**2. Line Items** (section divider: "LINE ITEMS")
- Read-only: product, material, size, qty, unit price, line total cards
- Edit mode: full `EditableSkuRow` fields + Add Line Item button

**3. Quote & Pricing** (section divider: "QUOTE & PRICING")
- Read-only: pricing summary + delivery/payment details
- Edit mode: full Quote tab fields (Adjustments, Order Flow, Payment Methods, Prepayment, Send Channel, Follow-up Schedule)
- Includes the **Order Flow** segmented control (Quote First / Direct Order)

### History Tab

- Full lifetime of the record (lead activities + ticket activities), merged chronologically
- Date separators
- Per-event icons, human-readable labels, actor name, relative timestamp
- Auto-refreshes on `bazaar:activities-changed`

### Header — status badges

- **Quotes:** Standard status pill (draft / sent / cancelled). Short ID `/{XXXXXXXX}` shown next to title.
- **Orders (customer-confirmed, `client_confirmed = true`):** Green "Confirmed by Customer" badge + payment status pill. `ORD-YYYY-NNN` is the primary heading, original title as subtitle.
- **Orders (manually converted):** Blue "Converted to Order" badge + payment status pill.

### Record Locking

| Condition | isLocked? | Effect |
|-----------|-----------|--------|
| `ticket_status = 'cancelled'` | ✅ Yes | All edit/cancel controls hidden |
| `client_confirmed = true` AND `userRole ≠ 'admin'` | ✅ Yes | Edit/cancel hidden; amber "Record Locked" banner shown |
| `client_confirmed = true` AND `userRole = 'admin'` | ❌ No | Admin retains full control |
| Any non-confirmed ticket | ❌ No | Normal edit flow |

### Sidebar quick actions (`DetailQuickActions`)

All primary actions live **under the customer/lead card** in the left sidebar — not in a bottom bar (overview layout).

Hidden entirely when record is locked (`isLocked = true`) for quote lifecycle actions; production actions follow their own rules.

Send and Convert buttons are **disabled** when send validation fails; same amber missing-fields banner as new-quote form.

**Quote stage (draft / sent):**

| Action | Condition | Effect |
|--------|-----------|--------|
| Send Quote | `status = 'draft'` and validation passes | `PATCH → ticket_status = 'sent'`; triggers `sendQuoteToCustomer()`; logs `ticket_sent` |
| Resend Quote | `status = 'sent'` and validation passes | Same — re-triggers delivery; logs `ticket_sent` with `resend: true` in payload |
| Convert to Order | **Admin only** — `status = 'draft'` or `'sent'` and validation passes | Opens confirmation modal → `PATCH → ticket_status = 'order'`; auto-generates `ORD-YYYY-NNN`; logs `ticket_converted`. **Does not** set lead Won until production |
| Cancel Ticket | non-locked only | `PATCH → ticket_status = 'cancelled'` |

**Order / production stage (same sidebar block):**

| Action | Condition |
|--------|-----------|
| Customer Link + Copy Link | `public_token` set; sent quote or order |
| Mark Completed | `in_production`; admin always; accountant only if paid in full |
| Resend invoice link | `in_production` or `completed`; sends via ticket outreach channel |
| Cancel Ticket | Admin only; `ticket_status = 'order'` |

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
| `GET /api/tickets` | GET | List tickets. `kind=quote` → slim quote-stage list (no `quote_skus`). SDRs see own + routed-by. Sales/Admin see own + all `routed`. |
| `GET /api/orders/orders` | GET | Scoped orders list for `/orders` — `order` + `in_production` + `cancelled`; includes evidence-pending for owner; returns `status_label` / `status_tone`. |
| `POST /api/tickets` | POST | Create ticket. Upserts customer. Auto-generates `QUO-YYYY-NNNN` (quotes) or `ORD-YYYY-NNN` (orders). Direct Quotes page: stores `quote_source` on ticket (no auto-lead). Lead/CRM flows: may create linked lead with `source`. Logs activity. Updates linked lead status. Sets `routed_by_id = userId` when `ticket_status = 'routed'`. |
| `GET /api/tickets/[id]` | GET | Single ticket by UUID or reference code (`QUO-*`, `ORD-*`). Sales/Admin can GET `routed` tickets they don't own. **Accountant** can GET any ticket (matches list scoping). |
| `PATCH /api/tickets/[id]` | PATCH | Multi-mode: `claim_ownership`, `send_payment_reminder`, `resend_invoice`, `record_payment`, `release_production`, normal field update. See `docs/api-contract.md`. |
| `GET /api/tickets/[id]/evidence` | GET | Signed URL for payment evidence file (Accountant + Admin) |
| `GET /api/tickets/counts` | GET | Tab badge counts: `{ drafts, sent, approved, orders, in_production, completed, routed, cancelled, total }`. `orders` includes evidence-pending `order` rows. |
| `GET /api/payments/pending` | GET | Evidence-pending queue (Accountant + Admin) |
| `GET /api/payments/counts` | GET | Payments page badge counts |
| `GET /api/production/orders` | GET | Legacy in-production list (UI uses `/orders` tab) |
| `GET /api/production/counts` | GET | Legacy production tab counts |
| `GET /api/completed/orders` | GET | Completed orders list |
| `GET /api/completed/counts` | GET | Completed page badge counts |
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
| `/quotes` | draft + sent (own) | + all `routed` | — | all |
| `/orders` | scoped orders (own) | scoped orders | pending + in_production | pending + in_production |
| `/payments` | — | — | pending evidence count | pending evidence count |
| `/completed` | — | — | completed count | completed count |

Counts from `GET /api/tickets/counts`, `/api/payments/counts`, `/api/completed/counts`, `/api/sidebar-counts`. Refresh via `bazaar:refresh-counts`.

---

## High-Value Threshold — Full Business Rule

Configured in **Admin → Company Settings → High-Value Threshold ($)**.  
Default: `$5,000`.

| User Role | Behaviour |
|-----------|-----------|
| SDR creating/editing a quote | Blocked when total > threshold. Modal shown with Cancel (edit amount) and OK (route). Quote saved as `routed` on OK or countdown expiry. |
| Sales / Admin | No block. Full save regardless of total. |

When a `routed` quote is **claimed** by Sales:
- `ticket_status` → `draft`
- `created_by_id` → claiming Sales user's ID
- `routed_by_id` → **unchanged** (preserves original SDR's identity)
- All other Sales users see it disappear from "Routed to Sales" tab instantly (via Realtime)
- Claimer finds it in their own "Draft" tab and can continue working it

**SDR visibility after claiming:** Because `routed_by_id` is never changed, the original SDR can always see the ticket in their "Routed to Sales" tab and open it in read-only mode to track what happened to their quote.

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

When a rep clicks **Send Quote** on `/quotes/[id]`, `PATCH /api/tickets/[id]` sets `ticket_status = "sent"` and triggers `sendQuoteToCustomer()` from `lib/integrations/send-quote.ts`.

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

**Admin** sees convert with confirmation modal (`lib/utils/admin-convert-preview.ts`) listing missing send fields, missing customer confirmation, and whether production may auto-release. Orders list/detail show **Admin converted — customer confirm missing** (etc.) when applicable.

### New API Routes

| Route | Auth | Purpose |
|-------|------|---------|
| `GET /api/public/quotes/[token]` | None | Returns safe public ticket fields + company settings |
| `POST /api/public/quotes/[token]/confirm` | None | Customer confirm — sets `client_confirmed`; converts via `maybeConvertQuoteToOrder` when gates pass |
| `POST /api/public/quotes/[token]/submit-payment` | None | Customer payment proof (multipart); balance while in-production |

### New Files

| File | Purpose |
|------|---------|
| `lib/integrations/send-quote.ts` | Channel router + Twilio/Instantly callers + `toE164()` phone normaliser + `sendPaymentReminder()` |
| `lib/integrations/quote-email-template.ts` | HTML email template for quote delivery (table-based, inline-styled, email-client safe) |
| `lib/integrations/payment-reminder-template.ts` | HTML email template for payment reminders — "Pay Now" focused, no line items |
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
- Preview: `GET /api/dev/quote-email-preview` (dev server only)

## Deferred

- **Dashboard revenue integration** — approved ticket totals surfaced on Dashboard KPIs
- **Stripe payment collection** — see `docs/feature-specs/invoice-payment.md` for full spec
- **Zelle code matching** — automated memo parsing; manual "Mark as Paid" fallback
- **WhatsApp delivery** — requires Meta Business Manager registration
- **Mark completed with balance due** — owner policy (**TODO-009** / open-questions **B7**)
- **Sent-quote email vs live portal after edit** — owner policy (**TODO-008** / open-questions **B6**)
