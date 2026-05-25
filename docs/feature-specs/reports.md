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

### Response sections

| Section | Metrics | Data source |
|---------|---------|-------------|
| `cash_collected` | Total, by method, timeline, payment_events | `ticket_payment_recorded` in period |
| `released_order_value` | Total + order_count | `quote_final_total` where `production_released_at` in period |
| `sales_scorecard` | Cash, payments, orders, booked value, collection % | Rep attribution on payments |
| `sdr_scorecard` | Sourced cash + leads routed | SDR attribution on payments |
| `awaiting_collection` | Balance still due (live snapshot) | Open tickets, `computeInvoicePaymentSummary` |
| `payment_ledger` | Order rows with payment line items | Payments in period |
| `win_rate` | Lead/quote win %, avg days to production | Cohort tickets + releases |
| `funnel` | Quote lifecycle drop-off | Tickets created in period |
| `team_members` | Filter dropdown options | Active sales + SDR profiles |

### Rep attribution (bonus-ready)

**Sales credit:** `leads.sales_owner_id`, else `job_tickets.created_by_id`.

**SDR credit:** `leads.sdr_id`, else `job_tickets.routed_by_id`.

Payment `by_user_id` is the **staff member who recorded** the payment — not used for rep credit.

---

## UI

### Filters
- **Report filters** modal — Week / Month / Quarter presets (update From/To immediately), custom date range, Apply
- Team member dropdown inline (or click scorecard row)
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
1. **Sales scorecard** — click row to filter
2. **SDR scorecard** — sourced cash + routed leads
3. **Awaiting collection** — outstanding balances table
4. **Payment ledger** — expandable payment lines
5. **Charts** — cash by method, timeline, funnel, win rate

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
