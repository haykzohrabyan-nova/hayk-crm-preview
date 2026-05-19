# Feature Spec — Dashboard

Route: `/dashboard` (all roles)

---

## Overview

The Dashboard is the first page users land on after login. It shows role-scoped KPI cards, a quick-action area, and (for Admin) a live team overview.

**Architecture:** One route, three completely separate components. `dashboard-page.tsx` is a thin role-router that detects the logged-in user's role via Supabase and renders the appropriate component. No role-based conditionals inside the individual dashboards — each is self-contained and can be redesigned independently.

```
components/dashboard-page.tsx   ← role router (detects role, renders one of:)
  components/sdr-dashboard.tsx  ← SDR-specific dashboard
  components/sales-dashboard.tsx ← Sales-specific dashboard
  components/admin-dashboard.tsx ← Admin-specific dashboard
```

**Data:** `GET /api/dashboard/kpis?period=month`

The API returns role-scoped data — SDR and Sales see only their own numbers, Admin sees global totals.

The period defaults to "This Month" and is controlled by a compact segmented control (This Week / This Month / This Quarter) in each dashboard's header.

---

## SDR Dashboard — `components/sdr-dashboard.tsx`

KPIs are **scoped to the current SDR**. The inbox count is global (how many unclaimed workspace leads are available).

### KPI Cards (2-column on mobile, 3-column on desktop)

| Card | Value | Query basis | Subtext | Accent |
|------|-------|-------------|---------|--------|
| Inbox | Unclaimed workspace leads | `leads WHERE is_inbox=false AND status IN ('Pending','Validated') AND locked_by_id IS NULL` — matches sidebar badge exactly | "leads waiting to be claimed" | ✓ (highlighted) |
| Handled | Distinct leads acted on by this SDR in period | `activities WHERE by_user_id=me AND type IN (claimed/routed/rejected/held) AND created_at >= periodStart` — deduplicated by lead_id | period label | |
| Routed to Sales | Distinct leads routed by this SDR in period | Same activities, filtered to `type = 'lead_routed_to_sales'` | period label | |
| On Hold | Direct count of paused leads | `leads WHERE is_inbox=false AND sdr_id=me AND status='On Hold'` | "currently paused" | |
| Rejected | Distinct leads rejected in period | Activities filtered to `type = 'lead_rejected'` | period label | |
| Quote Value | `sum(quote_total)` for all leads acted on in period | Lead rows fetched by the handled lead IDs | period label | |
| My Share | `my handled leads ÷ all SDR handled leads × 100` | Denominator uses same activity types across all users | "of all SDR work this period" | |

> **Why activities instead of `leads.updated_at`?** Using `updated_at` on the leads table causes drift — if Sales or Admin updates a lead the SDR processed last month, it would appear in the current month's counts. Activity records have their own `created_at` tied to when the SDR actually performed the action, so period counts are always accurate.

### Period Selector

This Week / This Month / This Quarter — updates all KPI cards on change.

### Future Enhancements
- Conversion rate card (leads routed ÷ leads handled)
- Recent activity strip (last 5 events by this SDR)

---

## Sales Dashboard — `components/sales-dashboard.tsx`

KPIs are **scoped to the current Sales rep** (`sales_owner_id = userId`). New in Pipeline is global (unclaimed routed leads).

### KPI Cards (2-column on mobile, 3-column on desktop)

| Card | Value | Query basis | Subtext | Accent |
|------|-------|-------------|---------|--------|
| Won Value | sum of `quote_final_total` from Won tickets in period | `job_tickets WHERE created_by_id=me AND ticket_status IN (order/in_production/completed) AND created_at >= periodStart` | period label | ✓ (highlighted) |
| New in Pipeline | unclaimed Routed to Sales leads (global) | `leads WHERE status='Routed to Sales' AND sales_owner_id IS NULL` | "waiting to be claimed" | |
| Active Deals | leads where sales work is in progress | `leads WHERE sales_owner_id=me AND sales_status IN ('Ongoing','Quote Sent')` — includes both pre-quote and post-quote leads | "ongoing" | |
| Won | count of won tickets in period | Same `job_tickets` query as Won Value — `count` field — period-consistent with the revenue figure | period label | |
| On Hold | leads with `sales_status = On Hold` | `leads WHERE sales_owner_id=me` filtered in JS | "paused deals" | |
| Pipeline Value | sum of active quote values | `job_tickets WHERE created_by_id=me AND ticket_status IN (draft/sent)` | "current total" | |

> **Active Deals note:** The lead's `status` field is intentionally NOT used as a filter. When Sales creates a quote for a lead the lead's status changes from `"Routed to Sales"` to `"Quoted"`, so filtering on `status` would cause quoted leads to disappear from Active Deals. `sales_status` alone correctly represents whether the deal is still in progress.

> **Won count + Won Value are always in sync:** Both derive from the same `job_tickets` query with the same period filter, so switching from "This Month" to "This Quarter" updates both numbers together.

### Quick Actions

- **Go to Pipeline** → `/sales` (primary, accent-tinted)
- **Quotes & Orders** → `/quotes`

### Period Selector

This Week / This Month / This Quarter.

### Future Enhancements (when orders/quotes are live)
- Follow-up alerts (tickets where `follow_up_at <= today`)
- Orders created count

---

## Admin Dashboard — `components/admin-dashboard.tsx`

KPIs are **global** — all SDRs and Sales reps combined.

### KPI Cards (2-column on mobile, 3-column on desktop)

| Card | Value | Subtext | Accent |
|------|-------|---------|--------|
| Total Revenue | sum of `quote_total` for Won leads in period | period label | ✓ (highlighted) |
| Total Leads | count of all leads created in period | period label | |
| In Inbox | `is_inbox = true` leads | "waiting for SDR" | |
| Routed to Sales | `status = Routed to Sales` leads | "active pipeline" | |
| Won | count of Won leads in period | period label | |
| Pipeline Value | sum of `quote_total` for Routed to Sales leads | "current total" | |

### Team Section

A grid of cards showing all active users:

| Field | Notes |
|-------|-------|
| Avatar | First initial, navy background |
| Online dot | Green if last sign-in < 8 hours ago |
| Name | Truncated |
| Role | Display name |
| Active deals | Sales reps only — count of claimed leads |

Data source: `GET /api/admin/team`

### SDR Performance Table

Period-scoped table showing each SDR's output side by side. Only visible to admins.

| Column | Value |
|--------|-------|
| Name | SDR's full name |
| Handled | count of workspace leads they touched in period |
| Routed | count of leads sent to Sales |
| Rejected | count of leads rejected (red text) |
| Quote Value | `sum(quote_total)` for their leads |
| Share | their handled ÷ total handled across all SDRs — shown as % with a gold inline bar |

Sorted by Handled descending. Hidden when no SDR has activity in the period.

Data source: grouped from `sdr_id` field in `/api/dashboard/kpis` response.

### Rejection Reasons Breakdown

All-time breakdown of `rejection_reason` values across all rejected workspace leads. Displayed as a labeled list with red horizontal progress bars proportional to the max count. Top 8 reasons shown.

### Lead Sources Breakdown

All-time breakdown of `source` values across all workspace leads. Same list + bar pattern using gold (`var(--color-accent)`) bars.

Both breakdowns are displayed side-by-side in a 2-column grid and only render when data exists.

### Quick Actions

- **Manage Users** → `/admin/settings/users` (primary)
- **System Settings** → `/admin/settings`
- **SDR Workspace** → `/leads`
- **Sales Pipeline** → `/sales`

### Period Selector

This Week / This Month / This Quarter — affects KPI cards and SDR Performance Table. Rejection Reasons and Lead Sources are always all-time.

---

## Loading States

- **Role loading** (while `dashboard-page.tsx` detects role): full skeleton grid (6 KPI card skeletons)
- **KPI loading** (while API fetches): individual KPI card skeletons (rectangles matching card dimensions)
- Minimum skeleton display: 300 ms to avoid flash on fast connections

---

## Design

- KPI cards: `background: var(--color-surface)`, `border: 1px solid var(--color-border)`, `border-radius: 10px`, `padding: 20px`
- Accent card: `background: var(--color-btn-verify-bg)` (navy light / orange dark), no border
- KPI value: `28px / 600 / var(--color-text-primary)`
- KPI label: `11px / 500 / uppercase / letter-spacing: 0.06em / var(--color-text-muted)`
- Section headers: `13px / 600 / uppercase / letter-spacing: 0.06em / var(--color-text-muted)`
- All colors via CSS variables — no hardcoded hex
