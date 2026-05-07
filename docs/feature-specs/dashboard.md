# Feature Spec — Dashboard

Route: `/dashboard` (all roles)

---

## Overview

The Dashboard is the first page users land on after login. It shows role-scoped KPI cards and a quick-action area. It replaces the current stub (`return null`).

**Data:** `GET /api/dashboard/kpis?period=month`

The period defaults to "This Month" and is controlled by a compact period selector on the page (not shared with Statistics — this is a standalone quick overview, not the full analytics page).

---

## SDR Dashboard

### KPI Cards (2-column grid on mobile, 4-column on desktop)

| Card | Value | Subtext |
|------|-------|---------|
| Inbox | Count of `is_inbox = true` leads | "leads waiting" |
| Handled | `leads_handled` in period | "this month" |
| Quoted | `leads_verified` with `status = 'Quoted'` | "this month" |
| Routed to Sales | `leads_routed` | "this month" |
| My Handled Share | `handled_share_percent`% | "vs other SDRs" |
| Total Quote Value | `$quote_value` formatted | "this month" |

### Quick Actions

Prominent buttons for the most common tasks:

- **Go to Inbox** → `/leads?tab=inbox` — shows current inbox count as badge
- **Add Lead Manually** → opens Manual Add Lead modal directly from dashboard
- **View CRM** → `/crm`

### Recent Activity Strip

Last 5 activities performed by the current SDR — fetched from `GET /api/activity?by_user_id=...&limit=5` (or derived from leads/tickets). Shows event type, contact name, and relative time.

---

## Sales Dashboard

### KPI Cards

| Card | Value | Subtext |
|------|-------|---------|
| New in Pipeline | Count of unclaimed + newly routed leads | "waiting for you" |
| Active Deals | `leads_in_pipeline` | "ongoing" |
| Won | `leads_won` | "this month" |
| Won Value | `$won_value` | "this month" |
| Pipeline Value | `$pipeline_value` | "current" |
| Orders Created | `order_count` | "this month" |

### Quick Actions

- **Go to Pipeline** → `/sales`
- **View Quotes & Orders** → `/tickets`

### Follow-up Alerts

A list of tickets where `follow_up_at <= today` and `follow_up_completed = false`. Shows:
- Contact name
- Ticket total
- Follow-up date (highlighted red if overdue)
- **Open** button → opens ticket drawer

---

## Admin Dashboard

### KPI Cards

| Card | Value |
|------|-------|
| Total Leads (period) | `total_leads` |
| In Inbox | `inbox_leads` |
| Routed to Sales | `routed_leads` |
| Won | `won_leads` |
| Total Revenue | `$total_revenue` |
| Pipeline Value | `$pipeline_value` |

### Team Overview

A compact table: one row per active user, showing:

| Column | Notes |
|--------|-------|
| Name | |
| Role | Pill |
| Leads (period) | Count of leads they've touched |
| Revenue (period) | Sum of their tickets' `total` |

**View all** → `/admin/audit` or `/statistics`

### Quick Actions

- **Manage Users** → `/admin/users`
- **System Settings** → `/admin/settings`

---

## Period Selector

A small segmented control in the page header:
- This Week | This Month | This Quarter

Updates KPI card data on change. Does **not** affect the Statistics page period.

---

## Loading State

KPI card skeletons (rectangles matching card dimensions) while data loads. Minimum skeleton display: 300ms (avoids flash of skeleton on fast connections).

---

## Design Notes

- KPI cards: `background: var(--color-surface)`, `border: 1px solid var(--color-border)`, `border-radius: 10px`, `padding: 20px`
- KPI value: `font-size: 28px / font-weight: 600 / color: var(--color-text-primary)`
- KPI label: `font-size: 12px / color: var(--color-text-muted) / uppercase / letter-spacing: 0.06em`
- Accent highlight on the primary KPI card for each role (e.g. Inbox count for SDR, Won Value for Sales)
