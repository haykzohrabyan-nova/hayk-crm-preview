# Feature Spec — Reports

Route: `/reports` (admin only)

---

## Overview

Interactive reports for business performance and **rep bonus tracking**. Primary money metric is **cash collected** from offline payments recorded in CRM (`ticket_payment_recorded` activities), not Stripe or quote totals at production.

**Architecture:**

```
app/(app)/reports/page.tsx
  └── components/reports/reports-page.tsx
        ├── reports-filters-modal.tsx   ← period + custom dates
        ├── rep-scorecard-table.tsx
        ├── payment-ledger-section.tsx
        ├── awaiting-collection-section.tsx
        └── GET /api/reports/summary?period=…&date_from=…&date_to=…&user_id=…
```

Non-admin users see an access message with link to Dashboard.

---

## API — `GET /api/reports/summary`

**Auth:** Admin only (`requireAdmin`)

**Query:**

| Param | Values | Default |
|-------|--------|---------|
| `period` | `week` \| `month` \| `quarter` | `month` (when no custom dates) |
| `date_from` | `YYYY-MM-DD` (requires `date_to`) | — |
| `date_to` | `YYYY-MM-DD` (requires `date_from`) | — |
| `user_id` | UUID of sales/SDR user (optional) | all |

Period end is **end of today** for presets; custom ranges use inclusive local dates.

All money totals use `roundMoney()` (2 decimal places) — matches dashboard **Cash Collected**.

**Refunded orders (May 2026):** Tickets with `refund_status = 'full'` are **excluded** from `cash_collected`, `released_order_value`, and `awaiting_collection` (`lib/utils/exclude-refunded-tickets.ts` → `excludeFullyRefundedFromRevenue`). Partial refunds still count toward revenue until the ticket is fully refunded. See [`payment-refunds.md`](./payment-refunds.md).

### Response sections

| Section | Metrics | Data source |
|---------|---------|-------------|
| `cash_collected` | Total, by method, timeline, payment_events | `ticket_payment_recorded` in period; excludes `refund_status = full` |
| `released_order_value` | Total + order_count | `quote_final_total` where `production_released_at` in period; excludes fully refunded |
| `sales_scorecard` | Cash, payments, orders, booked value, collection % | Rep attribution on payments |
| `sdr_scorecard` | Sourced cash + leads routed | SDR attribution on payments |
| `awaiting_collection` | Balance still due (live snapshot) | Open tickets, `computeInvoicePaymentSummary`; excludes fully refunded |
| `payment_ledger` | Order rows with payment line items | Payments in period |
| `win_rate` | Lead/quote win %, avg days to production | Cohort tickets + releases |
| `funnel` | Quote lifecycle drop-off | Tickets created in period |
| `team_members` | Filter dropdown options | Active sales + SDR profiles |

### Rep attribution (bonus-ready)

**Sales credit:** `leads.sales_owner_id`, else `job_tickets.created_by_id`.

**SDR credit:** `leads.sdr_id`, else `job_tickets.routed_by_id`.

Payment `by_user_id` is the **staff member who recorded** the payment — not used for rep credit.

### Cash collected activity contract

All **confirmed** payments must log `ticket_payment_recorded` (payload: `amount`, `method`, `mode`, `via`).

| Activity type | When | Counts in Reports cash? |
|---------------|------|-------------------------|
| `ticket_payment_recorded` | Accountant confirm, staff cash/offline auto-record, public payment (no review queue) | **Yes** |
| `ticket_payment_evidence_submitted` | Customer submitted proof **awaiting accountant review** | **No** (until accountant confirms → new `ticket_payment_recorded`) |

Shared helper: `lib/utils/log-ticket-payment-recorded.ts`. Staff cash auto-record: `lib/utils/maybe-auto-record-cash-payment.ts`.

**Cross-section navigation:** Reports ticket links append `?from=/reports` so `QuoteDetail` Back returns to Reports. Other entry points use list fallbacks until CRM/customer links add their own `from` later. Helper: `lib/utils/ticket-detail-href.ts` (`appendReturnPath`, `resolveTicketDetailBackPath`).

---

## UI

### Filters
- **Report filters** modal — Week / Month / Quarter presets (update From/To immediately), custom date range, Apply
- Team member dropdown inline (scorecard tables are display-only)
- **Reset** — This Month, whole team

Info banner explains period scope; notes that **Awaiting Collection** is a live snapshot (not period-filtered).

### KPI row (company view)

| Card | Meaning |
|------|---------|
| **Total Cash Collected** | Payments recorded in period (full `$X.XX` format) |
| **Released Order Value** | Quote totals at production release in period |
| **Awaiting Collection** | Balance due on open orders today (amber left-border accent) |
| Payments Recorded | Count of payment events |
| Quote Win Rate | Quotes sent in cohort → production |

When filtering by a **sales** rep, their **Released Order Value** card appears in the filtered KPI row.

### Sections (below KPIs)
1. **Sales scorecard** — display-only team summary (not clickable; filter via team member dropdown)
2. **SDR scorecard** — sourced cash + routed leads (display-only)
3. **Awaiting collection** — outstanding balances; link icon → lifecycle detail (`/orders/[id]?from=/reports`, etc.)
4. **Payment ledger** — expandable payment lines; **Open order** → same lifecycle + `from` pattern
5. **Charts** — cash by method, timeline, funnel, win rate

**Detail Back from Reports:** `QuoteDetail` reads `?from=/reports` and Back returns to Reports. Sidebar still highlights Orders/Quotes (URL-based). CRM customer `from` deferred.

### Metric glossary (dashboard alignment)

| Metric | Question it answers |
|--------|---------------------|
| **Cash Collected** | How much money was **recorded** in this period? |
| **Released Order Value** | How much **order value** went to production in this period? |
| **Awaiting Collection** | How much is **still owed** on open orders **right now**? |

Admin dashboard **Cash Collected** matches Reports **Total Cash Collected** for the same period preset.

---

## Shared utilities

| File | Purpose |
|------|---------|
| `lib/utils/dashboard-metrics.ts` | Same cash/release helpers as dashboard |
| `lib/utils/reports-attribution.ts` | Sales/SDR credit resolution |
| `lib/utils/reports-date-range.ts` | Preset + custom date resolution |
| `lib/utils/reports-awaiting-collection.ts` | Outstanding balance builder |
| `lib/utils/log-ticket-payment-recorded.ts` | Canonical `ticket_payment_recorded` activity insert |
| `lib/utils/ticket-detail-href.ts` | Lifecycle detail URLs + `?from=` Back resolution |
| `lib/utils/format.ts` | `roundMoney`, `formatCurrency` |

---

## Not in v2 (future)

- Configurable bonus % preview column
- CSV export for payroll
- Revenue by product type / lead source charts
- Pipeline forecast

---

## Related

- Dashboard: [`dashboard.md`](./dashboard.md)
- Payments: [`invoice-payment.md`](./invoice-payment.md)
