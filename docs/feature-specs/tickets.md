# Feature Spec — Tickets (Quotes & Orders)

Routes: `/quotes` · `/orders` · `/quotes/new` · `/quotes/[id]`

> **Status: Built** — all phases complete as of 2026-05-15.  
> Original design used an OrderDrawer modal. **Revised design uses dedicated full pages** (better UX, deep-linkable, side-by-side lead info).

---

## Overview

The Tickets module manages all job tickets: quotes sent to clients and production orders. Both use the same `job_tickets` table, distinguished by `ticket_kind` (`'quote'` | `'order'`) and `ticket_status`.

### Ticket Status Flow

```
[New Quote Created]
  └─ draft  ──► sent ──► order ──► in_production ──► completed
       │           │       ▲
       │           └───────┘  (customer confirms via /q/[token])
       │                ▲
       │                └─── (rep clicks "Convert to Order")
       │
       └─ [SDR total > HV threshold] ──► routed ──► [Sales claims] ──► draft (new owner)
```

- `draft` — in progress, not yet sent to client
- `sent` — quote delivered to client; awaiting approval
- `approved` — **retired** — kept in `TicketStatus` type for backwards compatibility only; new code never sets this
- `routed` — SDR's quote exceeded High-Value Threshold; routed to Sales for claiming
- `order` — confirmed production order. Set by: (a) customer confirms via public `/q/[token]` page, or (b) rep clicks "Convert to Order" button. Auto-generates `ORD-YYYY-NNN` reference code. Auto-sets `client_confirmed = true` for path (a).
- `cancelled` — terminal; no payment recorded

> **Record Locking:** Once a ticket becomes an `order` via **customer confirmation** (`client_confirmed = true`), the record is locked for SDR/Sales users. Only Admins can edit or cancel. Locking applies to the order detail header buttons, action bar, and editing mode.

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

**Component:** `components/quotes-page.tsx`

### Tabs (count badge on all tabs)

| Tab | Filter | Visible to |
|-----|--------|-----------|
| All | All non-order, non-routed tickets | All roles |
| Draft | `ticket_status = 'draft'` | All roles |
| Sent | `ticket_status = 'sent'` | All roles |
| Won | `ticket_status = 'approved'` | All roles |
| **Routed to Sales** | `ticket_status = 'routed'` | Sales + Admin only |

**Table columns (standard tabs):** Contact, Title, Channel, Total, Status pill, Follow-up (red if overdue), Created

**Routed to Sales tab columns:** Contact, Title, Total (warning color), Routed By (SDR name), Date, Claim button

**Behaviors:**
- Search: contact name, company, title, reference code
- Row click → `/quotes/[id]`
- Realtime: Supabase `postgres_changes` channel on `job_tickets` + `bazaar:tickets-changed` window event → silent refresh on any change from any session
- Claim action: `PATCH /api/tickets/[id]` with `{ claim_ownership: true }` → sets `ticket_status = 'draft'`, `created_by_id = claimant`, redirects to quote detail

### Sidebar badge (`/quotes`)

- **SDR:** count of `draft` + `sent` + `approved` tickets (own)
- **Sales/Admin:** same + count of all `routed` tickets

---

## `/orders` — Orders page

**Component:** `components/orders-page.tsx`

### Tabs (count badge on all tabs)

| Tab | Filter |
|-----|--------|
| All | `ticket_status IN ('order', 'cancelled')` |
| Active | `ticket_status = 'order'` |
| Cancelled | `ticket_status = 'cancelled'` |

> **Note:** `draft`, `sent`, `approved`, and `routed` tickets do NOT appear on the Orders page. They belong to the Quotes page only. The Orders page shows only tickets that have been fully confirmed as orders (status `order`) or cancelled.

**Table columns:** Order # (ORD-YYYY-NNN), Contact, Title (⚡ Rush), Total, Priority (colour-coded), Due Date (orange = due soon, red = overdue), Status pill, Created

**Behaviors:**
- Search: contact name, company, title, reference
- Row click → `/quotes/[id]`
- No "New Order" button — orders are always created from the Quotes flow
- Realtime: listens to `bazaar:tickets-changed`

---

## `/quotes/new` — New Quote

**Component:** `components/new-quote-form.tsx`

### Layout

| | With Lead / CRM params | Without params |
|--|--|--|
| Left sidebar | Read-only lead/customer card | None |
| Main area | 3-tab form (Info, Line Items, Quote) | 4-tab form (Customer, Info, Line Items, Quote) |
| Starting tab | Info | Customer |

### Customer Tab (only shown when no lead/CRM params)

Field order: **Phone** | **Email** → **First Name** | **Last Name** → **Company**

**Phone-first customer search:**
- As the user types a phone number (600 ms debounce), `GET /api/customers/lookup?phone=...` is called
- **0 matches** → all fields remain editable; user fills in fresh
- **1 match** → picker modal shown with the matched customer; user selects it or chooses "Create New"
- **2+ matches** → same modal with all matches listed; user picks one or creates new
- When a customer is **selected**: all fields except Phone auto-fill and lock (read-only). Only Phone input is editable.
- Lock state is **lifted to the parent component** and survives tab navigation (navigating to Info and back does not reset the lock)

> Customer data is **not saved to DB** until the user clicks Save Draft or Save & Send Quote. Customer is upserted into `customers` table at save time so they appear in CRM.

### Info Tab

- Title \* (required)
- Priority (Low / Normal / High — from `ticket_priority` lookup; **Urgent** is system-set and filtered from user-facing dropdown)
- Due Date (custom `DatePicker` component — click anywhere on the input to open)
- Rush toggle — **auto-toggled** by due date: today or tomorrow → Rush ON; any later date → Rush OFF. User can override.
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
- **Follow-up Schedule**: First Reminder (custom `DatePicker`), Cycles (default 3), Frequency

### Validation before advancing

| Tab | Required before Next |
|-----|----------------------|
| Customer | First Name |
| Info | Title |
| Line Items | ≥ 1 fully filled item (product + qty + unit price) |
| Quote | Destination field (email / phone / location) must not be empty |

### High-Value Threshold (HVT) — SDR only

When an SDR advances from Line Items → Quote tab **and** `pricing.final_total > company_settings.high_value_threshold`:

1. A **non-dismissible blocking modal** appears
2. Displays the total, the threshold, and a 30-second countdown
3. On "OK" click or countdown reaching 0: quote is saved with `ticket_status = 'routed'` and SDR is redirected to `/quotes`
4. The routed quote appears in the "Routed to Sales" tab for all Sales/Admin users

### Footer actions

| Button | Condition | Effect |
|--------|-----------|--------|
| Back | Any tab (hidden on first tab if Customer tab is first) | Previous tab |
| Next | Any tab before Quote | Validate + advance |
| Save Draft | Line Items tab onwards | `POST /api/tickets` with `status = 'draft'` |
| Save & Send Quote | Quote tab | `POST /api/tickets` with `status = 'sent'`; redirects to `/quotes` |
| Cancel | Any | Navigate back |

---

## `/quotes/[id]` — Quote / Order Detail

**Component:** `components/quote-detail.tsx`

### Header (sticky)

- Back button
- Title + reference code badge (ORD-YYYY-NNN for orders)
- Status pill
- Save PDF link (`/api/tickets/[id]/pdf`)
- **Edit button** — visibility rules:
  - `draft` or `sent` → always shown
  - `order` with `payment_status = 'unpaid'` (or null) → shown
  - `order` with `payment_status = 'partial'` or `'paid'` → hidden (locked)
  - `cancelled` → always hidden (locked)

### Layout

- **Left sidebar** (sticky): `LinkedLeadCard` if lead is linked; `CustomerInfoCard` if customer exists but no lead; nothing if neither
- **Right**: **2-tab view — Info | History**

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

### Action bar (read-only mode)

Hidden entirely when record is locked (`isLocked = true`).

| Action | Condition | Effect |
|--------|-----------|--------|
| Send Quote | `status = 'draft'` | `PATCH → ticket_status = 'sent'`; triggers `sendQuoteToCustomer()`; logs `ticket_sent` |
| Resend Quote | `status = 'sent'` | Same — re-triggers delivery; logs `ticket_sent` with `resend: true` in payload |
| Convert to Order | `status = 'draft'` or `'sent'` | `PATCH → ticket_status = 'order'`; auto-generates `ORD-YYYY-NNN`; logs `ticket_converted`; updates linked lead `sales_status = 'Won'` |
| Cancel Ticket | non-locked only | `PATCH → ticket_status = 'cancelled'` |

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

1. Same non-dismissible blocking modal (30-second countdown)
2. On "OK" or timeout: ticket PATCH'd to `routed`, SDR redirected to `/quotes`

### Realtime

- Direct Supabase `postgres_changes` channel on `job_tickets` (within the component, independent of sidebar) — silent re-fetch
- `bazaar:leads-changed` → silent re-fetch (updates lead info card)
- `bazaar:activities-changed` → refreshes History tab

---

## API Routes

| Route | Method | Purpose |
|-------|--------|---------|
| `GET /api/tickets` | GET | List tickets. SDRs see own. Sales/Admin see own + all `routed`. `kind`, `search`, `short_id` params. |
| `POST /api/tickets` | POST | Create ticket. Upserts customer. Auto-generates ORD-YYYY-NNN for orders. Logs activity. Updates linked lead status. Accepts `ticket_status = 'routed'` for HVT saves. |
| `GET /api/tickets/[id]` | GET | Single ticket. Sales/Admin can GET `routed` tickets they don't own. |
| `PATCH /api/tickets/[id]` | PATCH | Multi-mode update: (1) `claim_ownership: true` — Sales claim a routed ticket; (2) `send_payment_reminder: true` — send payment reminder email/SMS/WhatsApp; (3) normal update. On `ticket_status = 'sent'`: triggers `sendQuoteToCustomer()`; logs `ticket_sent`. On `ticket_status = 'order'` (manual): generates ORD-YYYY-NNN, logs `ticket_converted`, updates linked lead `sales_status = 'Won'`. |
| `GET /api/tickets/counts` | GET | Tab badge counts: `{ drafts, sent, approved, orders, routed, cancelled, total }`. |
| `GET /api/activities` | GET | `?ticket_id=xxx&include_linked_lead=true` → full lifetime (lead + ticket activities merged) |
| `GET /api/public/quotes/[token]` | GET (no auth) | Public ticket data for `/q/[token]` customer page |
| `POST /api/public/quotes/[token]/confirm` | POST (no auth) | Customer confirms quote → sets `client_confirmed = true`, `ticket_status = 'order'`, generates ORD ref; updates linked lead `sales_status = 'Won'` |

---

## Activity Types (ticket-related)

| Type | When logged |
|------|-------------|
| `order_ticket_created` | Ticket created |
| `order_ticket_updated` | Fields updated (edit mode save) |
| `order_ticket_status_changed` | Status transition (claim, route, etc.) |
| `ticket_sent` | Quote sent or resent. Payload: `{ channel, destination, resend?: true }` |
| `ticket_client_confirmed` | Customer confirms via public page |
| `ticket_converted` | Rep clicks "Convert to Order". Payload: `{ from, to: 'order', reference_code }` |
| `ticket_payment_reminder_sent` | Payment reminder sent. Payload: `{ channel, destination }` |

---

## Sidebar Badges

| Badge | SDR | Sales / Admin |
|-------|-----|---------------|
| `/quotes` | `draft` + `sent` (own) | same + all `routed` |
| `/orders` | `order` status (own) | `order` status (all) |

Both updated in `app/api/sidebar-counts/route.ts` and refresh via `bazaar:refresh-counts`.

---

## High-Value Threshold — Full Business Rule

Configured in **Admin → Company Settings → High-Value Threshold ($)**.  
Default: `$5,000`.

| User Role | Behaviour |
|-----------|-----------|
| SDR creating/editing a quote | Blocked when total > threshold. Modal shown. Quote saved as `routed`. |
| Sales / Admin | No block. Full save regardless of total. |

When a `routed` quote is claimed by Sales:
- `ticket_status` → `draft`
- `created_by_id` → claiming Sales user's ID
- All other Sales users see it disappear from "Routed to Sales" tab instantly (via Realtime)
- Claimer finds it in their own "Draft" tab and can continue working it

---

## Customer Upsert (New Quote Flow)

When a quote is saved (draft or sent) from `new-quote-form.tsx`:

1. If `customer_id` already exists in form state → use it
2. Else if contact fields (name/email/phone) are present → `POST /api/customers` with upsert logic (match on email or phone; create if no match)
3. Set `customer_id` on the `job_tickets` row
4. Customer appears in CRM immediately

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

No login required — `proxy.ts` allows `/q/` paths without auth.

**Page contents:**
- Company branding (logo or name, address, contact)
- Quote reference + status badge
- Rush Order banner (if applicable)
- Line items table (desktop) / cards (mobile)
- **Pricing Summary**: Subtotal → Shipping → Discount → Tax → **Order Total** (gold)
- **Payment Schedule** (partial prepayment only):
  - Amber box: **Deposit Due Now** — calculated amount — "Required to begin your order"
  - **Balance Remaining** — "Due upon completion / delivery"
  - Hidden for Full Payment orders
- Accepted Payment Methods
- Special requirements (if set)
- **"Confirm & Accept Quote"** button — only shown when `ticket_status === "sent"`

**On confirm:**
- `POST /api/public/quotes/[token]/confirm`
- Sets `client_confirmed = true`, `ticket_status = "order"`, generates `ORD-YYYY-NNN` reference code
- Logs `order_ticket_status_changed` activity (by_user_id = null — customer action)
- Returns `{ ok: true, reference_code }`
- Page transitions to "Order Confirmed" success state

### New API Routes

| Route | Auth | Purpose |
|-------|------|---------|
| `GET /api/public/quotes/[token]` | None | Returns safe public ticket fields + company settings |
| `POST /api/public/quotes/[token]/confirm` | None | Customer confirms → converts to order |

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
| `app/api/public/quotes/[token]/confirm/route.ts` | Customer confirmation endpoint (no auth) |

### Email Template Design Notes (`quote-email-template.ts`)

- 100% table-based layout (no flexbox/grid — stripped by Gmail/Outlook)
- All styles inline — no `<style>` blocks
- Both `bgcolor` attribute and `background-color` inline style set on every cell (Outlook compatibility)
- Line items table uses `border-collapse:separate; border-spacing:0` — allows `border-radius` to work (unlike `border-collapse:collapse` which disables it)
- **Reference card status badge** (`Awaiting Approval` / `Confirmed`) is anchored to the top-right corner of the reference card using `border-radius:0 7px 0 8px` — independent of title length, no wrapping
- Contains full quote info: company branding, reference + status, line items table, pricing summary, payment methods, gold CTA button, footer with contact details
- Preview: `GET /api/dev/quote-email-preview` (dev server only)

### Deferred (Stripe/Zelle Payment)

The confirm endpoint currently auto-converts to `order` without collecting payment. The DB is ready for Stripe:
- `prepayment_status` column (`pending` | `paid`) on `job_tickets` — webhook will flip to `"paid"` automatically
- `payment_status` column (`unpaid` | `partial` | `paid`) — tracks overall order payment

When Stripe is wired:
1. `POST .../confirm` → sets `ticket_status = "approved"` + creates Stripe Payment Intent for deposit amount
2. Customer pays → Stripe webhook → sets `prepayment_status = "paid"`, `ticket_status = "order"`

---

## Deferred

- **Dashboard revenue integration** — approved ticket totals surfaced on Dashboard KPIs
- **Stripe payment collection** — see `docs/feature-specs/invoice-payment.md` for full spec
- **Zelle code matching** — automated memo parsing; manual "Mark as Paid" fallback
- **WhatsApp delivery** — requires Meta Business Manager registration
