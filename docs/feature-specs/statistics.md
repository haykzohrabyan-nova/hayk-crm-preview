# Feature Spec — Statistics

Route: `/statistics` (all roles)

---

## Overview

The Statistics page gives SDRs, Sales reps, and Admins a data-driven view of their activity. Charts and KPI tables are all scoped to the selected period. The period selector is shared with the CRM and Tickets pages via `PeriodFilterContext`.

---

## Period Filter

A tab-style control at the top of the page (also affects `/crm` and `/tickets`):

| Option | Date Range |
|--------|-----------|
| Today | `created_at >= start of today` |
| This Week | `created_at >= start of current week (Monday)` |
| This Month | `created_at >= start of current month` |
| This Quarter | `created_at >= start of current quarter` |
| All Time | No date filter |
| Custom | User-selected `from` / `to` date picker |

**Leads** are filtered on `leads.created_at`.
**Tickets** are filtered on `job_tickets.created_at`.

---

## SDR Statistics View

### KPI Cards (top row)

| KPI | Calculation |
|-----|------------|
| Leads Handled | Count of workspace leads created/verified by this SDR in period |
| Leads Verified | Count with `status IN ('Validated', 'Quoted', 'Routed to Sales')` |
| Leads Routed | Count with `status = 'Routed to Sales'` |
| Leads Rejected | Count with `status = 'Rejected'` |
| Total Quote Value | Sum of `quote_total` for all quoted/routed leads |
| My Handled Share % | This SDR's verified leads ÷ all SDRs' verified leads × 100 |

### Charts

1. **Leads Over Time** (line chart) — count of new leads per day/week in period
2. **Status Mix** (donut chart) — breakdown of leads by `status`
3. **Sources** (horizontal bar chart) — leads by `source`
4. **Quote Value Over Time** (bar chart) — sum of `quote_total` per period bucket

---

## Sales Statistics View

### KPI Cards

| KPI | Calculation |
|-----|------------|
| Leads in Pipeline | Count with `sales_status IN ('Ongoing', 'Quote Sent')` owned by this user |
| Leads Won | Count with `sales_status = 'Won'` in period |
| Leads Dropped | Count with `sales_status = 'Dropped'` in period |
| Pipeline Value | Sum of `quote_total` for active pipeline leads |
| Won Value | Sum of `total` on `job_tickets` where `ticket_status = 'approved'` in period |
| Orders Created | Count of `job_tickets` with `ticket_kind = 'order'` in period |

### Charts

1. **Pipeline Over Time** — leads entering `Routed to Sales` per period bucket
2. **Won vs Dropped** (bar chart grouped) — per period bucket
3. **Revenue Over Time** (bar chart) — sum of ticket `total` per bucket
4. **Sales Status Mix** (donut) — breakdown of current leads by `sales_status`

---

## Admin Statistics View

### KPI Cards

| KPI | Calculation |
|-----|------------|
| Total Leads | Count of all leads in period |
| Inbox Leads | Count of `is_inbox = true` leads |
| Routed to Sales | Count with `status = 'Routed to Sales'` |
| Leads Won | Count with `sales_status = 'Won'` |
| Total Revenue | Sum of ticket `total` where `ticket_status IN ('approved', 'completed')` |
| Pipeline Value | Sum of `quote_total` for active leads |
| Active SDRs | Count of SDR users with at least 1 lead in period |
| Active Sales | Count of Sales users with at least 1 owned lead in period |

### Charts

All SDR charts + all Sales charts, aggregated across all users. Plus:

5. **SDR Performance Table** — per-SDR row: name, leads handled, routed, rejected, quote value, handled share %
6. **Rejection Reasons** (pie chart) — breakdown of `rejection_reason` values

---

## Chart Library

**Recharts** (`recharts` package). Port the POC's chart implementations.

Chart color tokens:
- Primary series: `var(--color-accent)` (#E8C97A light / #F97316 dark)
- Secondary series: `var(--color-tab-active)` (#1B2B4B light / #F97316 dark)
- Muted series: `var(--color-text-muted)`
- Chart background: transparent (inherits page bg)
- Grid lines: `var(--color-border)`

---

## SDR Handled Share Formula

```
handled_share = (leads_verified_by_this_sdr / total_leads_verified_by_all_sdrs) * 100
```

Only counts leads in the selected period. If no other SDRs have data in the period, shows "100%" or "Only SDR in period".

---

## Loading State

Skeleton placeholders for each KPI card and chart while data loads. Do not show stale data while refetching — show skeleton on refetch too.

---

## Empty State

If no data exists for the selected period, each chart shows: "No data for this period."

---

## Shared Period Context

`PeriodFilterContext` in `lib/context/period-filter-context.tsx` stores:
```typescript
{
  period: StatsPeriod
  range: DateRange
  setPeriod: (p: StatsPeriod) => void
  setRange: (r: DateRange) => void
}
```

Wrap `(app)/layout.tsx` with this provider. Both Statistics and CRM read from this context. The Tickets tab also uses it for date filtering.
