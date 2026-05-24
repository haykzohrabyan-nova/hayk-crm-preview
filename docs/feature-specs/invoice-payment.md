# Feature Spec — Invoice & Payment Flow

> **Status: Phases A + B + B+ + B++ + accountant review queue + production lifecycle + quote-until-payment built. Phases C–E deferred.**
>
> | Phase | What | Status |
> |-------|------|--------|
> | A | DB columns + public token | ✅ Built (migrations 052, 053, 054) |
> | B | Public quote/invoice page at `/q/[token]` | ✅ Built — customer views + confirms quote |
> | B+ | Prepayment / Deposit display on public page | ✅ Built — Payment Schedule block for partial prepayments |
> | B++ | Per-ticket payment config (`QuotePaymentConfig`) + checkout stepper + payment recording | ✅ Built (migrations 065, 066) |
> | B++ | Admin → Payment tab (Wire/ACH/Zelle remittance settings) | ✅ Built — `components/admin/payment-section.tsx`, migration 065 |
> | B+++ | Payment evidence queue + accountant role | ✅ Built (migrations 068, 071) — `/payments`, `record_payment`, customer proof upload |
> | B+++ | Production / completed lifecycle + net terms auto-release | ✅ Built (migrations 069, 072) — in-production on **`/orders?tab=in_production`**, `/completed`, `maybe-auto-release-production.ts`, `markLeadWonOnProduction()` |
> | B+++ | Quote-until-payment + balance on public link | ✅ Built — `maybe-convert-quote-to-order.ts`; confirm sets `client_confirmed` only; balance pay while in production |
> | B+++ | Customer notifications (payment confirmed, invoice link, pickup ready) | ✅ Built — `payment-confirmed-template.ts`, `invoice-link-template.ts`, `order-ready-template.ts` |
> | C | Stripe Card payment (online Checkout) | ⏳ Deferred — DB ready, API wiring not started |
| C-alt | Offline card via merchant terminal + authorization queue | ⏳ Planned — see [`offline-card-payment.md`](./offline-card-payment.md) |
> | D | Zelle code matching | ⏳ Deferred |
> | E | Dashboard revenue KPIs | ⏳ Deferred |

---

## Overview

When a rep clicks **Send Quote**, the customer should receive a link to a beautifully designed
public invoice page. From that page, the customer can view all order details, print it, and pay
using whichever payment method the rep selected on the quote.

Three payment methods are supported:

| Method | Integration | How it works |
|---|---|---|
| Card | Stripe Checkout | Customer clicks Pay Now → Stripe hosted page → webhook confirms |
| Zelle | Inbound email parsing | Customer uses an 8-digit code in the Zelle memo → email is parsed to auto-confirm |
| Offline | None | Customer pays at the office; rep marks paid manually in the CRM |

Payment data (amount received, date paid, method) is stored on the `job_tickets` record and
feeds into the Dashboard revenue KPIs.

---

## Architecture

```mermaid
flowchart TD
    Rep["Rep on /quotes/[id]"]
    Send["Click Send Quote"]
    Token["Generate public_token + zelle_code\nPATCH job_ticket"]
    InvoicePage["Public /invoice/[token]\n(no auth required)"]
    Customer["Customer receives link\n(SMS / WhatsApp / Email)"]

    subgraph payment [Payment Flow]
        Offline["Offline\n→ show instructions\n→ rep marks paid manually"]
        Zelle["Zelle\n→ show 8-digit code\n→ parse incoming email\n→ auto-confirm"]
        Stripe["Card\n→ Stripe Checkout\n→ webhook confirms"]
    end

    Rep --> Send --> Token --> Customer
    Customer --> InvoicePage
    InvoicePage --> Offline
    InvoicePage --> Zelle
    InvoicePage --> Stripe
    Zelle --> DB["job_tickets\npayment_status = paid"]
    Stripe --> DB
    Offline --> DB
    DB --> Dashboard["Dashboard revenue KPIs"]
```

---

## Phase A — Database + Public Token ✅ BUILT

### Migrations applied

| Migration | File | What it adds |
|-----------|------|-------------|
| 052 | `add_public_token_to_tickets.sql` | `public_token UUID DEFAULT gen_random_uuid()` + unique index |
| 053 | `add_payment_status_to_tickets.sql` | `payment_status TEXT NOT NULL DEFAULT 'unpaid'` — `'unpaid'` \| `'partial'` \| `'paid'` |
| 054 | `add_prepayment_status_to_tickets.sql` | `prepayment_status TEXT NOT NULL DEFAULT 'pending'` — `'pending'` \| `'paid'` — Stripe webhook will update this |

> Columns added for the future: `zelle_code`, `payment_amount_received`, `payment_paid_at`, `payment_method_used`, `stripe_session_id`, `stripe_payment_intent_id` — **not yet added to DB**. Add them in a future migration when Stripe/Zelle is wired.

### Token generation

`public_token` is set as a DB default (`gen_random_uuid()`) so every ticket has one from creation. The public URL is `{NEXT_PUBLIC_APP_URL}/q/{public_token}`.

`sendQuoteToCustomer()` in `lib/integrations/send-quote.ts` reads `ticket.public_token` to build the link included in every email/SMS delivery.

---

## Phase B — Public Quote Page ✅ BUILT

### Route

`app/(public)/q/[token]/page.tsx`

- **No auth required** — `proxy.ts` allows `/q/` paths without authentication
- Client component — fetches via `GET /api/public/quotes/[token]` (uses admin client server-side, returns safe public fields only)
- Not found or draft → "Quote Not Found" screen
- Already confirmed → "Order Confirmed" screen with reference code

### Layout sections (as built)

1. **Header** — company logo or name + "PROFESSIONAL PRINTING SERVICES" sub-label (navy background)
2. **Greeting** — "Hi [Customer Name], your quote is ready" (or order variant)
3. **Reference card** — reference code + status badge (Awaiting Approval / Order / Cancelled)
4. **Rush Order banner** — amber, shown when `rush = true`
5. **Line items** — desktop table (Product, Qty, Unit Price, Total) + mobile card layout
6. **Pricing Summary** — subtotal → shipping → discount → tax → **Order Total** (gold)
7. **Payment Schedule** *(partial prepayment only)*:
   - Amber box: **Deposit Due Now** + amount + "Required to begin your order"
   - **Balance Remaining** + "Due upon completion / delivery"
   - Gold border wrapping the entire block for prominence
   - Hidden entirely for Full Payment orders
8. **Accepted Payment Methods** — green badge block
9. **Special Requirements** — amber block (if set)
10. **"Confirm & Accept Quote"** CTA — gold button, only when `ticket_status = "sent"`
11. **Footer** — company name, address, phone, email, website

### On Confirm

`POST /api/public/quotes/[token]/confirm`:
- Sets `client_confirmed = true` only (does **not** always convert to `order` immediately)
- **Quote stays on `/quotes`** until payment is recorded or net-terms gates pass — see `lib/utils/maybe-convert-quote-to-order.ts`
- **Net terms exception:** on confirm, may convert to `order` and auto-release to `in_production` when `$0` upfront gates pass
- Logs `ticket_client_confirmed` activity (`by_user_id = null` — customer action)
- May auto-release to `in_production` when payment + confirm gates already satisfied (`maybeAutoReleaseProduction`)
- Returns `{ ok: true, reference_code, in_production?, converted_to_order? }`
- Page transitions to payment stepper or success state depending on payment config

### Public portal phases (as of 2026-05-23)

The customer page derives a **portal phase** from ticket status + payment state (`computePortalState()` in `app/(public)/q/[token]/page.tsx`):

| Phase | When | Customer sees |
|-------|------|---------------|
| `needs_confirm` | `sent`, `ticket_require_client_confirm = true`, not yet `client_confirmed` | Step 1 title **Confirm quote price** + **Confirm & Accept Quote** button; summary **Required — pending** |
| `needs_payment` | Price gate open, deposit/full not yet paid | Payment step active — deposit or full pay CTA |
| `evidence_pending` | Wire/ACH/Zelle/check/card proof uploaded, accountant not yet confirmed | Amber **under review** — not marked paid; balance submissions while in production use **Balance payment under review** copy |
| `balance_due` | Partial deposit paid (or in production) with remaining balance | **Pay remaining balance** — CTA under Step 3 (In production) when already in shop |
| `fully_paid` | Paid in full (may still be in production) | **Paid in full** messaging; Step 3 shows production / pickup states |
| `net_terms` | Net strategy, price gate open | Net terms copy; optional early pay |
| `order_ready` | `ticket_status = completed` | Green **Ready for pickup** banner with shop address + phone |

**Step 1 (price confirmation) display rules:**
- **Confirm quote price** + **Customer must confirm the quote** — when approval required and not yet confirmed
- **Quote price confirmed** + **Confirmed** — only after customer clicks Confirm
- **Quote price confirmation** + **Not required** — when `ticket_require_client_confirm = false`
- Payment summary row: **Required — pending** / **Confirmed** / **Not required** (matches staff `order-payment-summary.tsx`)

Additional UX:
- Addresses (company + pickup) open **Google Maps** on click (`components/public/address-map-link.tsx`)
- Phone, email, website are clickable (`tel:` / `mailto:` / link) with no visual style change
- PDF download does not show paid rows until accountant confirms evidence
- Staff logged in can preview `/q/{token}` — `proxy.ts` skips RBAC on public paths

### Payment evidence workflow (Accountant)

1. Customer submits proof via `POST /api/public/quotes/[token]/submit-payment` (multipart: `method`, `amount`, optional `file`, optional `receiptId` — **digits only** for cash)
2. For wire / ACH / Zelle / check / card: file stored in Supabase Storage `payment-evidence` bucket; `payment_evidence_url`, `payment_evidence_submitted_at`, `payment_evidence_amount` set; **payment totals are NOT updated**
3. Ticket appears on **`/payments`** for accountant confirm — queue includes **`sent`** quotes and **`in_production`** orders with pending evidence. Ticket **owner** (sales/SDR) also sees evidence-pending rows on **`/orders`** with status **Awaiting payment confirmation** (read-only payment review card; no evidence file link for sales/SDR).
4. Accountant opens `/payments/[id]` or order detail, reviews evidence (`GET /api/tickets/[id]/evidence` — accountant/admin only), clicks **Confirm**
5. `PATCH /api/tickets/[id]` with `{ record_payment: true, … }` — **accountant + admin only**; runs `maybeConvertQuoteToOrder()` then `maybeAutoReleaseProduction()`; clears evidence fields; sends **payment confirmed** email/SMS (balance on in-production orders emphasizes **paid in full**)
6. Cash / in-person channels without evidence file may still auto-record and auto-release when gates pass (respecting `ticket_require_client_confirm`)

### Net terms auto-production

When `ticket_payment_strategy = 'net'` and production gates are met (price set, client confirm satisfied if required), the order moves to `in_production` **without requiring full payment**.

Triggered from:
- Ticket create/update (rep saves payment config)
- Public confirm (`POST …/confirm`)
- Public submit-payment (cash channels only — not while evidence is pending review)
- Accountant `record_payment` confirm

Shared helper: `lib/utils/maybe-auto-release-production.ts` (migration 072 adds net-terms support flag if needed).

When production release succeeds, `markLeadWonOnProduction()` sets the linked lead's `sales_status = 'Won'` (SDR Won tab + dashboard metrics). Won is **not** set at order conversion alone.

### Quote send validation (staff)

Before a rep can **Send Quote** or **Convert to Order**, `lib/utils/validate-quote-send.ts` checks required fields. Draft saves remain permissive.

When cash/offline deposit or full cash-only payment is configured, **Receipt ID** is required and must be numeric only. Missing fields disable send buttons and show an amber banner listing what's incomplete.

### Resend invoice link & pickup notification

| Action | API | Customer receives |
|--------|-----|-------------------|
| Resend invoice link | `PATCH { resend_invoice: true, invoice_channel?, invoice_destination? }` | Email/SMS with permanent `/q/{token}` link (works paid or unpaid) |
| Mark completed | Normal PATCH `{ ticket_status: "completed" }` on in-production order | Email/SMS **order ready for pickup** via `sendOrderReadyToCustomer()` |

History logs: `ticket_invoice_resent`, `ticket_order_ready_sent`, `ticket_order_ready_failed`, `ticket_payment_confirmed_sent`.

**Mark Completed rules:**
- **Admin** — may mark in-production orders complete; when balance is still due, UI shows acknowledgment modal and API requires `acknowledge_outstanding_balance: true` (see **TODO-009** / open-questions **B7** for owner policy)
- **Accountant** — only when `isTicketPaidInFull()` (`lib/utils/invoice-payment-summary.ts`)
- Pickup email (`sendOrderReadyToCustomer`) always uses the same `/q/{public_token}` URL

### Public & staff API routes

| Route | Auth | Purpose |
|-------|------|---------|
| `GET /api/public/quotes/[token]` | None | Safe public ticket fields + company settings + payment/evidence state |
| `POST /api/public/quotes/[token]/confirm` | None | Customer confirms → converts to order |
| `POST /api/public/quotes/[token]/submit-payment` | None | Customer payment proof / cash submission |
| `GET /api/public/quotes/[token]/pdf` | None | Customer PDF download |
| `GET /api/payments/pending` | Accountant + Admin | Evidence-pending queue |
| `GET /api/payments/counts` | Accountant + Admin | Tab badge counts |
| `GET /api/production/orders` | Authenticated | Legacy — prefer `GET /api/orders/orders` |
| `GET /api/production/counts` | Authenticated | Legacy production tab counts |
| `GET /api/completed/orders` | Authenticated | Completed list |
| `GET /api/completed/counts` | Authenticated | Completed tab counts |
| `GET /api/tickets/[id]/evidence` | Staff with ticket access | Signed URL for evidence file |

---

## Phase B+ — Prepayment / Deposit on Public Page ✅ BUILT

**Prepayment / Deposit section in CRM (New Quote + Quote Detail):**

- **Full Payment / Partial Payment** toggle (segmented button, default Full Payment)
- When Partial selected: % / $ type toggle + amount input + "Due now / Balance" summary
- Saves to `prepayment_type` (`"full"` | `"percent"` | `"fixed"`) and `prepayment_value`

**Deposit status bar on Order detail (read-only mode):**

- Visible when `ticket_status = "order"` AND `prepayment_type IN ('percent', 'fixed')`
- Shows calculated deposit amount
- **Pending / Paid** toggle — saves `prepayment_status` via `PATCH /api/tickets/[id]`
- "Will be auto-updated by Stripe" note
- `payment_status` bar (Unpaid / Partial / Paid) shown for all orders

**Customer approval gate (`ticket_require_client_confirm`):**

- When enabled, `lib/utils/compute-checkout.ts` requires `client_confirmed = true` before production release — regardless of payment type (cash, deposit, full pay, net terms)
- Public `/q/[token]` shows confirm step before payment when gate is on
- Cash auto-record on ticket create/update does not simulate `client_confirmed` when approval is required
- `POST /api/public/quotes/[token]/submit-payment` does not set `client_confirmed` or convert to order before customer confirms

---

## Phase C — Stripe Card Payment

### Dependencies

```
npm install stripe @stripe/stripe-js
```

### Environment variables

```
STRIPE_SECRET_KEY=sk_live_...          # server only
STRIPE_WEBHOOK_SECRET=whsec_...        # server only
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_...
```

### API routes

**`POST /api/payments/stripe/create-session`**

- Creates a Stripe Checkout Session from the ticket's line items and total
- `metadata: { ticket_id, public_token }` — used by webhook to match the payment
- Success URL: `/invoice/[token]?paid=1`
- Cancel URL: `/invoice/[token]`
- Returns `{ session_url }` — invoice page redirects the customer there

**`POST /api/payments/stripe/webhook`**

- Receives `checkout.session.completed` event from Stripe
- Verifies signature with `STRIPE_WEBHOOK_SECRET`
- Matches ticket via `metadata.ticket_id`
- Updates `job_tickets`:
  - `payment_status = 'paid'`
  - `payment_amount_received` (from Stripe amount)
  - `payment_paid_at = now()`
  - `payment_method_used = 'card_default'`
  - `stripe_session_id`
  - `ticket_status = 'approved'` (quote auto-converts to order on payment)
- Logs `activity: order_payment_received`

### Invoice page

- "Pay Now" button calls `create-session` → redirects to Stripe Checkout URL
- On return with `?paid=1` query param: show a green success banner *"Payment received — thank you!"*

---

## Phase D — Zelle Code Matching

### Concept

Every quote sent with Zelle as a payment method shows an 8-character code (e.g. `Z-38291047`).
The customer includes this code in the Zelle memo field when they send payment.
Zelle sends a payment confirmation email. That email is parsed to extract the code and
automatically mark the order as paid.

### Email parsing setup (Postmark or Mailgun)

1. Company sets their Zelle-receiving email as the Postmark inbound address
   (or set up a `payments@` alias that forwards there)
2. Postmark parses the raw email and POSTs JSON to a webhook URL
3. The webhook extracts the memo code and matches it to a ticket

### API route: `POST /api/payments/zelle/inbound`

- Receives Postmark (or Mailgun) inbound email webhook
- Verifies a shared secret header to prevent spoofing
- Parses the email text body with regex: `/Z[-\s]?([A-Z0-9]{8})/i`
- Looks up `job_tickets` where `zelle_code = extracted_code`
- If found:
  - `payment_status = 'paid'`
  - `payment_paid_at = now()`
  - `payment_method_used = 'zelle'`
  - `ticket_status = 'approved'`
  - Logs `activity: order_payment_received`
- Responds `200` always (to prevent email provider retries)

### Manual fallback

Always available — the automated parsing depends on consistent email forwarding.

In `components/quotes/quote-detail.tsx` action bar:
- **"Mark as Paid (Zelle)"** button — shown when `quote_payment_types` includes `zelle` and `payment_status` is not yet `paid`
- Prompts for amount received (number input in a small modal)
- Calls `PATCH /api/tickets/[id]` with `payment_status`, `payment_amount_received`, `payment_method_used`

---

## Phase E — Dashboard Revenue Integration

Update `app/api/dashboard/kpis/route.ts`:

```typescript
// Revenue total
const { data: revenue } = await admin
  .from('job_tickets')
  .select('payment_amount_received, payment_method_used, created_by_id')
  .eq('payment_status', 'paid')
  // non-admin: add .eq('created_by_id', userId)

// Compute: total revenue, breakdown by payment_method_used
```

Dashboard KPI cards:
- **Total Revenue** (period-scoped, same as other KPIs)
- **Revenue by Method** (Card / Zelle / Offline) — bar or donut chart

---

## File Inventory

| File | Phase | Status | Notes |
|---|---|---|---|
| `supabase/migrations/065_payment_remittance.sql` | B++ | ✅ Built | Company wire/ACH/Zelle remittance settings |
| `supabase/migrations/066_per_ticket_payment_config.sql` | B++ | ✅ Built | Per-ticket payment strategy + recording columns |
| `supabase/migrations/068_accountant_role_and_payment_evidence.sql` | B+++ | ✅ Built | Accountant role + `payment_evidence_*` columns |
| `supabase/migrations/069_production_and_completed_pages.sql` | B+++ | ✅ Built | Production/completed page permissions |
| `supabase/migrations/071_payment_evidence_amount.sql` | B+++ | ✅ Built | `payment_evidence_amount` while pending review |
| `supabase/migrations/072_net_terms_auto_production.sql` | B+++ | ✅ Built | Net terms auto-release support |
| `lib/integrations/send-quote.ts` | A | ✅ Built | Channel router — quote send, payment reminder, invoice link, order ready, payment confirmed |
| `lib/integrations/quote-email-template.ts` | A | ✅ Built | HTML email template builder |
| `lib/integrations/payment-confirmed-template.ts` | B+++ | ✅ Built | Email after accountant confirms evidence |
| `lib/integrations/invoice-link-template.ts` | B+++ | ✅ Built | Resend customer portal link |
| `lib/integrations/order-ready-template.ts` | B+++ | ✅ Built | Pickup-ready notification |
| `lib/utils/compute-checkout.ts` | B++ | ✅ Built | Payment stepper + production gate evaluation |
| `lib/utils/maybe-convert-quote-to-order.ts` | B+++ | ✅ Built | Quote → order conversion gate (payment, net confirm, admin override) |
| `lib/utils/maybe-auto-release-production.ts` | B+++ | ✅ Built | Shared auto-release to in_production |
| `lib/utils/invoice-payment-summary.ts` | B+++ | ✅ Built | Paid-in-full + evidence-pending helpers |
| `lib/utils/quote-list-status.ts` | — | ✅ Built | Quote list status badges |
| `lib/utils/quote-list-due-now.ts` | — | ✅ Built | Due Now column display for quote list |
| `lib/utils/order-list-status.ts` | — | ✅ Built | Orders list status_label / status_tone |
| `lib/utils/manual-convert-meta.ts` | — | ✅ Built | Admin convert banner labels |
| `lib/utils/admin-convert-preview.ts` | — | ✅ Built | Admin convert confirmation modal |
| `app/(public)/layout.tsx` | B | ✅ Built | Minimal public layout (no auth) |
| `app/(public)/q/[token]/page.tsx` | B | ✅ Built | Customer-facing quote/order/payment portal |
| `app/api/public/quotes/[token]/route.ts` | B | ✅ Built | Public GET — safe ticket fields |
| `app/api/public/quotes/[token]/confirm/route.ts` | B | ✅ Built | Customer confirm — sets `client_confirmed`; converts via `maybeConvertQuoteToOrder` when gates pass |
| `app/api/public/quotes/[token]/submit-payment/route.ts` | B+++ | ✅ Built | Customer payment proof upload |
| `app/(app)/payments/page.tsx` | B+++ | ✅ Built | Accountant payment review queue |
| `app/(app)/payments/[id]/page.tsx` | B+++ | ✅ Built | Payment review detail |
| `app/(app)/production/page.tsx` | B+++ | ⚠ Legacy | Redirects to `/orders?tab=in_production` |
| `app/(app)/production/[id]/page.tsx` | B+++ | ⚠ Legacy | Redirects to `/orders/[id]` |
| `app/(app)/completed/page.tsx` | B+++ | ✅ Built | Completed orders list |
| `app/(app)/completed/[id]/page.tsx` | B+++ | ✅ Built | Completed order detail |
| `components/orders/payments-page.tsx` | B+++ | ✅ Built | Payments list |
| `components/orders/payment-detail-overview.tsx` | B+++ | ✅ Built | Payment review + PricingPaymentSummary |
| `components/orders/production-page.tsx` | B+++ | ⚠ Legacy | Superseded by `/orders?tab=in_production` |
| `components/orders/production-detail-overview.tsx` | B+++ | ✅ Built | In-production overview on `/orders/[id]` |
| `components/orders/completed-page.tsx` | B+++ | ✅ Built | Completed list |
| `components/leads/lead-history-table.tsx` | — | ✅ Built | Shared Lead History (customer + Won tab) |
| `lib/utils/lead-history-display.ts` | — | ✅ Built | Quote/order refs + source labels |
| `lib/utils/order-list-status.ts` | — | ✅ Built | Orders list status_label / status_tone |
| `lib/utils/activity-ticket-ref.ts` | — | ✅ Built | Activity log display ref |
| `lib/utils/mark-lead-won-on-production.ts` | — | ✅ Built | Won on production release |
| `app/api/tickets/[id]/route.ts` | A | ✅ Built | `record_payment`, `resend_invoice`, mark completed, send triggers |
| `app/api/tickets/[id]/evidence/route.ts` | B+++ | ✅ Built | Signed evidence file URL |
| `components/quotes/quote-detail.tsx` | B+ | ✅ Built | Unified Overview + History across all contexts |
| `components/quotes/quote-detail/ticket-detail-overview.tsx` | B+++ | ✅ Built | Context-aware overview router |
| `components/quotes/quote-detail/quote-stage-overview.tsx` | B+++ | ✅ Built | Customer link + Copy on quote stage |
| `components/quotes/new-quote-form.tsx` | B+ | ✅ Built | Full/Partial prepayment toggle |
| `app/api/payments/stripe/create-session/route.ts` | C | ⏳ Deferred | Stripe Checkout session |
| `app/api/payments/stripe/webhook/route.ts` | C | ⏳ Deferred | Stripe payment confirmation |
| `app/api/payments/zelle/inbound/route.ts` | D | ⏳ Deferred | Inbound email parsing |
| `app/api/dashboard/kpis/route.ts` | E | ⏳ Deferred | Revenue from paid tickets |

---

## Build Order

1. **Phase A** — DB migration + token generation (unblocks B, C, D)
2. **Phase B** — Public invoice page (customer can see the quote immediately)
3. **Phase C** — Stripe (highest-value payment method, clean integration)
4. **Phase D** — Zelle (email infra setup required; manual fallback covers gap)
5. **Phase E** — Dashboard (last, needs payment data to exist)

---

## Open Questions / Decisions Needed Before Building

| # | Question | Default if not decided |
|---|---|---|
| 1 | Which email provider for Zelle inbound parsing — Postmark or Mailgun? | Postmark (simpler API) |
| 2 | Zelle code format — plain 8 digits (`38291047`) or prefixed (`Z-38291047`)? | `Z-XXXXXXXX` for uniqueness |
| 3 | Should card payment via Stripe auto-approve the ticket (`ticket_status = 'approved'`)? | Yes |
| 4 | Should the invoice page be accessible at any ticket status or only `sent` + `approved`? | `sent` and `approved` only |
| 5 | Company Stripe account — live or test mode to start? | Test mode first |
