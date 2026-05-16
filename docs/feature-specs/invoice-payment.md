# Feature Spec — Invoice & Payment Flow

> **Status: Phase A + B Built (2026-05-14/15). Phases C–E deferred.**
>
> | Phase | What | Status |
> |-------|------|--------|
> | A | DB columns + public token | ✅ Built (migrations 052, 053, 054) |
> | B | Public quote/invoice page at `/q/[token]` | ✅ Built — customer views + confirms quote |
> | B+ | Prepayment / Deposit display on public page | ✅ Built — Payment Schedule block for partial prepayments |
> | C | Stripe Card payment | ⏳ Deferred — DB ready, API wiring not started |
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
- Sets `client_confirmed = true`, `ticket_status = "order"`, `ticket_kind = "order"`
- Generates `ORD-YYYY-NNN` reference code via `increment_order_sequence()`
- Logs `order_ticket_status_changed` activity (`by_user_id = null` — customer action)
- Returns `{ ok: true, reference_code }`
- Page transitions to "Order Confirmed!" success state

### New API routes

| Route | Auth | Purpose |
|-------|------|---------|
| `GET /api/public/quotes/[token]` | None | Returns safe public ticket fields + company settings |
| `POST /api/public/quotes/[token]/confirm` | None | Customer confirms → converts to order |

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

In `components/quote-detail.tsx` action bar:
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
| `supabase/migrations/052_add_public_token_to_tickets.sql` | A | ✅ Built | `public_token` column + unique index |
| `supabase/migrations/053_add_payment_status_to_tickets.sql` | A | ✅ Built | `payment_status` column |
| `supabase/migrations/054_add_prepayment_status_to_tickets.sql` | A | ✅ Built | `prepayment_status` column — Stripe-ready |
| `lib/integrations/send-quote.ts` | A | ✅ Built | Channel router — includes public_token URL |
| `lib/integrations/quote-email-template.ts` | A | ✅ Built | HTML email template builder |
| `app/(public)/layout.tsx` | B | ✅ Built | Minimal public layout (no auth) |
| `app/(public)/q/[token]/page.tsx` | B | ✅ Built | Customer-facing quote/order page |
| `app/api/public/quotes/[token]/route.ts` | B | ✅ Built | Public GET — safe ticket fields |
| `app/api/public/quotes/[token]/confirm/route.ts` | B | ✅ Built | Customer confirm → convert to order |
| `app/api/tickets/[id]/route.ts` | A | ✅ Built | `prepayment_status` in ALLOWED_FIELDS; triggers send on status=sent |
| `components/quote-detail.tsx` | B+ | ✅ Built | Payment status bar + deposit status bar |
| `components/new-quote-form.tsx` | B+ | ✅ Built | Full/Partial prepayment toggle |
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
