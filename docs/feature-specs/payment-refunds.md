# Feature Spec — Payment Refunds & Post-Refund Lifecycle

> **Status: Built (May 2026)** — unified refund ledger, Payment Evidence **Refunded** tab, order detail refund UI, public portal blocks, reports/dashboard exclusions, cancel + refund edge cases.
>
> Related: [`invoice-payment.md`](./invoice-payment.md) (payment evidence, Stripe Checkout), [`tickets.md`](./tickets.md) (detail quick actions, list tabs), [`api-contract.md`](../api-contract.md) (refund + page-data endpoints), [`schema.md`](../schema.md) (columns + ledger table).

---

## Overview

Staff can refund recorded payments **per slot** (deposit, balance, or full payment) via manual entry or Stripe API. Each refund appends a row to `ticket_payment_refunds` and updates summary fields on `job_tickets` (`refund_status`, `total_refunded_amount`).

Fully or partially refunded orders move to **Payment Evidence → Refunded**. They are **excluded** from active Operations lists (Orders in-production/all, Production tab, Completed) but remain visible on **Orders → Cancelled** when also cancelled, and on **Refunded** with optional **Cancelled** badge.

**Customer portal (`/q/{token}`):**
- **Cancelled** — red banner, read-only invoice; pay / confirm / Stripe blocked
- **Partial or full refund** — amber banner; same blocks; no customer “refund received” confirmation in v1

**Revenue:** Tickets with `refund_status = 'full'` are excluded from dashboard cash collected, released order value, and reports awaiting collection. Partial refunds still count until the ticket becomes fully refunded.

---

## Database

| Migration | What |
|-----------|------|
| `097_stripe_payment_columns.sql` | Stripe session/PI/charge IDs, amount, card brand/last4, receipt URL on `job_tickets` |
| `098_stripe_refund_tracking.sql` | `stripe_amount_refunded_cents` on ticket |
| `099_seed_stripe_refund_reasons.sql` | Legacy Stripe-only reason seeds (superseded by unified reasons) |
| `100_payment_refunds.sql` | `ticket_payment_refunds` ledger; `refund_status`, `total_refunded_amount`, `last_refunded_*` on `job_tickets`; `payment_refund_reason` lookups |
| `101_refund_evidence_storage.sql` | `refund-evidence` storage bucket |
| `102_ticket_cancelled_at.sql` | `job_tickets.cancelled_at` set on cancel |

### `ticket_payment_refunds` (ledger)

| Column | Notes |
|--------|-------|
| `ticket_id` | FK → `job_tickets` |
| `amount` | Dollars refunded in this row |
| `payment_mode` | `deposit` \| `balance` \| `full` |
| `method` | e.g. `cash`, `wire`, `card` |
| `source` | `stripe` \| `manual` |
| `stripe_refund_id` | When Stripe processed the refund |
| `reason` | Lookup value `payment_refund_reason` |
| `notes`, `evidence_path` | Optional |
| `refunded_by_id`, `created_at` | Audit |

### `job_tickets` refund summary

| Column | Values |
|--------|--------|
| `refund_status` | `none` (default) \| `partial` \| `full` |
| `total_refunded_amount` | Sum of ledger rows |
| `last_refunded_at`, `last_refunded_by_id` | Latest refund audit |
| `cancelled_at` | Set when status → `cancelled`; GET may backfill from `ticket_cancelled` activity |

---

## Refundable payment slots

Logic: `lib/payments/refundable-payment-slots.ts`

| Order payment shape | Slots | Stripe vs manual |
|---------------------|-------|------------------|
| Partial strategy (deposit + balance) | **Deposit** — always manual refund in CRM | Balance — Stripe if `stripe_payment_intent_id` + evidence reviewed; else manual |
| Full payment | **Full payment** — one slot | Stripe or manual per how balance/full was paid |

**Full order refund** when deposit was cash and balance was card: two separate **Refund payment** actions (one per remaining slot).

**Caps:** Partial refund amount ≤ slot balance minus prior refunds on that slot. Stripe path calls `stripe.refunds.create` then `applyTicketRefund` (`lib/stripe/process-refund.ts`, `lib/payments/apply-ticket-refund.ts`).

**Reasons:** Admin → Dropdown Options → **Payment Refund Reasons** (`payment_refund_reason`). UI and API use only `POST /api/tickets/[id]/refund` via `record-refund-modal.tsx`.

---

## Staff UI

### Payment Evidence (`/payments`)

Three tabs from `GET /api/payments/page-data`:

| Tab | Filter | Badge |
|-----|--------|-------|
| Pending approval | Unreviewed evidence/Stripe; `refund_status` none | `counts.pending` |
| Approved | Reviewed; `refund_status` none | `counts.approved` |
| **Refunded** | `refund_status IN ('partial','full')` | `counts.refunded` |

**Refunded tab columns:** Paid via (how order was paid) · Refunded via (channel + Stripe/manual + slot). Rows may show **Cancelled** badge when `ticket_status = cancelled`.

Search (`filter-payment-evidence-rows.ts`) includes refund status, total refunded, refunded-by name.

### Order / payment / production / completed detail

| UI | Behavior |
|----|----------|
| **Refund payment** | Sidebar quick action (Admin + Accountant) when a refundable slot remains — opens `record-refund-modal.tsx` |
| **Refunds** section | First block inside **Overview** tab (`refund-history-section.tsx`); ledger rows with optional evidence download |
| **Open in Stripe** | Payment Intent + per-row Stripe refund links (`lib/stripe/dashboard-url.ts`, `OpenInStripeLink`) |
| **Stats row** | **Collected**, **Refunded**, **Fully/Partially refunded** — not misleading Unpaid after refund (`ticket-stats-row.tsx`) |
| **Payments received** | Shown with refunds on order overview |
| **Payment column (orders list)** | **Fully refunded** / **Partially refunded** when `refund_status` set |

Refunded orders: hide bottom **Order completed** banner on payment detail; lifecycle lists exclude fully refunded rows (`lib/utils/exclude-refunded-tickets.ts`).

### Cancel order + refunds

| Rule | Behavior |
|------|----------|
| Who can cancel | **Admin** and **Accountant** (`canStaffCancelTicket`) |
| Partial refund warning | `should-warn-partial-refund-before-cancel.ts` — modal before cancel-reason flow if money already refunded |
| After cancel | `cancelled_at` set; **Customer Link** + **Copy Link** still shown (`ticket_status = cancelled` + `public_token`) |
| Linked lead card | Footer **Order cancelled {date}** when cancelled |
| Overview | Red **Cancelled — {reason}** banner (`cancelled-reason-banner.tsx`) |

---

## Public portal (`/q/[token]`)

Helpers: `lib/utils/public-quote-refund-state.ts`, `lib/utils/public-quote-payment-blocked.ts`

| State | Banner | Pay / confirm / Stripe |
|-------|--------|-------------------------|
| `ticket_status = cancelled` | Red — cancellation reason | Blocked — read-only invoice |
| `refund_status = partial` \| `full` | Amber — contact sales rep | Blocked |
| Normal | Phase stepper | Per payment config |

`GET /api/public/quotes/[token]` exposes `refund_status`, `total_refunded_amount` for banner copy. Confirm and submit-payment routes reject when blocked.

**v1:** No customer-facing “I received my refund” confirmation.

---

## API (summary)

| Route | Auth | Purpose |
|-------|------|---------|
| `POST /api/tickets/[id]/refund` | Accountant, Admin | Unified refund (multipart or JSON) |
| `GET /api/tickets/[id]/refund-evidence/[refundId]` | Accountant, Admin | Signed evidence URL |
| `GET /api/payments/page-data` | Accountant, Admin | Pending + approved + **refunded** + counts |
| `PATCH /api/tickets/[id]` | Admin, Accountant | Cancel (`ticket_status: cancelled`, reason, notes); sets `cancelled_at` |

**Ticket GET** (Admin/Accountant): includes `payment_refunds[]`, `cancelled_at`.

Full request/response shapes: [`api-contract.md`](../api-contract.md).

---

## Reports & dashboard

`lib/utils/exclude-refunded-tickets.ts`:
- `excludeFullyRefundedFromRevenue` — cash collected, released order value
- `excludeRefundedTicketsForOrdersList` — active ops lists; cancelled tab still shows refunded+cancelled orders

Used by `dashboard-metrics.ts`, `GET /api/reports/summary`, `fetch-orders-data.ts`, `fetch-payments-data.ts`.

See [`dashboard.md`](./dashboard.md) and [`reports.md`](./reports.md).

---

## RBAC

| Action | Roles |
|--------|-------|
| Record / Stripe refund | Admin, Accountant |
| Cancel quote/order | Admin, Accountant |
| View refund ledger & evidence | Admin, Accountant |
| SDR/Sales | Read-only order detail during payment review; no refund or cancel |

See [`rbac.md`](../rbac.md).

---

## File inventory (key)

| Path | Role |
|------|------|
| `lib/payments/apply-ticket-refund.ts` | Ledger insert + ticket summary update |
| `lib/payments/refundable-payment-slots.ts` | Slot discovery for modal |
| `lib/stripe/process-refund.ts` | Stripe API refund |
| `lib/utils/exclude-refunded-tickets.ts` | List + revenue filters |
| `lib/utils/fetch-payments-data.ts` | Refunded tab rows + paid/refunded via labels |
| `lib/utils/payment-refund-list-labels.ts` | List column labels |
| `lib/utils/should-warn-partial-refund-before-cancel.ts` | Pre-cancel warning |
| `components/orders/payments-page.tsx` | Three-tab payment evidence |
| `components/orders/record-refund-modal.tsx` | Refund payment modal |
| `components/orders/refund-history-section.tsx` | Overview refunds block |
| `components/quotes/quote-detail/detail-quick-actions.tsx` | Refund payment + customer link |
| `components/quotes/quote-detail/partial-refund-cancel-warning-modal.tsx` | Cancel warning |

---

## Changelog

Day-by-day entries: [`CHANGELOG.md`](../CHANGELOG.md) — sections from **2026-05-31** (Stripe refunds through customer link on cancelled orders).
