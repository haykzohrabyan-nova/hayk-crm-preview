# Feature Spec — Dashboard

Route: `/dashboard` (all roles)

---

## Overview

The Dashboard is the first page users land on after login. It shows role-scoped KPI cards and (for Admin) a live **Team** section with session activity plus per-user work metrics.

**Architecture:** One route, four role-specific components. `dashboard-page.tsx` is a thin role-router that detects the logged-in user's role via Supabase and renders the appropriate component. No role-based conditionals inside the individual dashboards — each is self-contained.

```
components/admin/dashboard-page.tsx        ← role router
  components/sales/sdr-dashboard.tsx       ← SDR dashboard
  components/sales/sales-dashboard.tsx     ← Sales dashboard
  components/admin/admin-dashboard.tsx       ← Admin dashboard
  components/admin/accountant-dashboard.tsx  ← Accountant dashboard (payments KPIs)
```

**Data:** **Admin:** `GET /api/dashboard/kpis?admin_preset=…` (default `last_month`). **SDR:** `?sdr_preset=…` (default `last_month`). **Sales:** `?sales_preset=…` (default `last_month`). **Accountant:** `GET /api/payments/counts` (not KPIs route). Custom ranges use `date_from` + `date_to` on all preset-based dashboards.

The API returns role-scoped data — SDR and Sales see only their own numbers; Admin sees company totals.

Each KPI card shows a **help line** below the value explaining how the number is calculated (`lib/utils/kpi-help-text.ts`).

**Money detail:** Admin/Sales **Cash Collected** on the dashboard matches **Reports → Total Cash Collected** for the same period. Both sum **`ticket_payment_recorded`** activities only — customer-submitted evidence awaiting accountant review (`ticket_payment_evidence_submitted`) is excluded until confirmed. Order value, balance due, rep scorecards, and payment ledger live on **Reports** (`/reports`).

---

## Dashboard privacy (Hide / Show values)

Screen-sharing privacy for KPI numbers. Available on **SDR**, **Sales**, **Accountant**, and **Admin** dashboards.

### Behaviour

| Aspect | Detail |
|--------|--------|
| **Toggle** | **Hide values** / **Show values** button (EyeOff / Eye icon) in dashboard header |
| **Confirm** | Modal before persisting — explains that numbers are not loaded while hidden |
| **Persistence** | Per-user flag on `user_profiles.dashboard_values_hidden` (migration `087`); survives logout and devices |
| **New users** | `POST /api/admin/users/create` sets `dashboard_values_hidden: false` (visible by default) |
| **Values-only mode** | Card **labels**, date filter, and help text stay visible; only numeric KPI values are concealed |
| **Security** | Server reads the DB flag on each request — client cannot spoof hidden mode. When hidden, metric routes **omit numeric fields** from JSON (early return where possible) |
| **UI placeholder** | `DashboardHiddenValue` — EyeOff + bullet mask (`$ • • • • •` for currency, `• • •` for counts); `aria-label="Hidden"` for screen readers |

### API routes affected when hidden

| Route | Hidden response |
|-------|-----------------|
| `GET /api/dashboard/kpis` | `{ values_hidden: true, role, range }` only — no metric queries for SDR/Sales/Admin |
| `GET /api/payments/counts` | `{ values_hidden: true, counts: null }` |
| `GET /api/admin/team` | `{ values_hidden: true, members: [...] }` — numeric fields zeroed (`claimed_leads`, etc.) |
| `GET /api/admin/sessions` | `{ values_hidden: true, summary: [...], sessions: [...], total: 0 }` — session counts/minutes redacted |

**Preference API:** `GET` / `PATCH /api/user/dashboard-privacy` — read/update `dashboard_values_hidden` for the session user.

**Shared UI:** `components/dashboard/dashboard-privacy.tsx` — `useDashboardPrivacy`, `DashboardValuesPrivacyToggle`, `DashboardHiddenValue`.

**Utils:** `lib/utils/dashboard-privacy.ts` — `getDashboardValuesHidden`, `setDashboardValuesHidden`, redact helpers.

---

## SDR Dashboard — `components/sales/sdr-dashboard.tsx`

KPIs scoped to the current SDR with **date filters**: Today, Yesterday, Last 7 Days, Last 30 Days, Custom. **Default:** Last 30 Days (`last_month`). Trend metrics show **% change vs the prior equivalent period** (e.g. today vs yesterday; last 7 days vs prior 7 days).

**API:** `GET /api/dashboard/kpis?sdr_preset=today|yesterday|last_week|last_month|custom` — custom adds `date_from` + `date_to` (`YYYY-MM-DD`).

**Preset semantics (UI labels vs API keys):**

| UI label | API key | Range |
|----------|---------|--------|
| Today | `today` | Today 00:00 – end of today |
| Yesterday | `yesterday` | Prior calendar day |
| Last 7 Days | `last_week` | Rolling 7 days including today |
| Last 30 Days | `last_month` | Rolling 30 days including today |
| Custom | `custom` | User-selected `date_from` / `date_to` |

| Card | Meaning | Period? | % trend |
|------|---------|---------|---------|
| **Closed Order Value** | Total value of orders closed by the SDR during the selected period | ✓ | $ only |
| **Paid From Closed Orders** | Total payments received from the SDR's closed orders during the selected period | ✓ | — |
| **Remaining Balance for Closed Orders** | Remaining unpaid balance from the SDR's closed orders during the selected period | ✓ | — |
| **Qty of Claimed Leads** | QTY of claimed leads by SDR from all lead sources during the selected period | ✓ | ✓ |
| **Manually Created Leads** | Leads personally created by SDR (walk-ins, referrals, direct contacts) | ✓ | ✓ |
| **Unclaimed/Pending Leads** | New leads not yet claimed, touched, or assigned (live snapshot) | snapshot | — |
| **Rejected / Not Qualified** | Leads rejected — no quote/order, outside target segment, or unclear needs | ✓ | ✓ |
| **Pending Follow-Up** | Leads that could not be reached or are waiting for a status update | ✓ | ✓ |
| **Qty of Leads Routed to Sales Team** | Leads forwarded to sales because they were outside the SDR's quoting criteria | ✓ | ✓ |

**Orders** credit requires: you created the quote (`created_by_id`), did **not** route it to Sales (`routed_by_id` null, lead not routed), converted to order, recorded payment, and the ticket is **not cancelled or refunded**. Routed hand-offs where Sales closes the deal are excluded.

> **List pages vs dashboard:** `/quotes`, `/orders`, and `/completed` show all tickets where `created_by_id = you` (including unpaid or in-progress). Dashboard **Closed Order Value / Paid From Closed Orders / Remaining Balance** apply the stricter self-closed + paid filter above — do not expect dollar totals to match the Orders page row count one-to-one.

Activity-based counts — see `lib/utils/sdr-dashboard-metrics.ts`.

**UI card order (9):** Closed Order Value (accent) → Paid From Closed Orders → Remaining Balance for Closed Orders → Qty of Claimed Leads → Manually Created Leads → Unclaimed/Pending Leads → Rejected / Not Qualified → Pending Follow-Up → Qty of Leads Routed to Sales Team. Lead counts display as `N leads`; help text under each card matches owner copy in `lib/utils/kpi-help-text.ts`.

---

## Sales Dashboard — `components/sales/sales-dashboard.tsx`

KPIs scoped to the current sales rep with **date filters**: Today, Yesterday, Last 7 Days, Last 30 Days, Custom. **Default:** Last 30 Days (`last_month`). Trend metrics show **% change vs the prior equivalent period**.

**API:** `GET /api/dashboard/kpis?sales_preset=today|yesterday|last_week|last_month|custom` — custom adds `date_from` + `date_to`. Same preset semantics as SDR dashboard (`last_week` = Last 7 Days rolling, `last_month` = Last 30 Days rolling).

| Card | Meaning | Period? | % trend |
|------|---------|---------|---------|
| **Orders** | Production-released **total** ($) with subtext **from N orders converted** (merged former Total + Order Created); % trend on dollar value | ✓ | $ only |
| **Received** / **Balance** | Payments and balance on your production-released orders | ✓ | — |
| **Lead Claimed** | Routed leads you claimed | ✓ | ✓ |
| **Inbox** | Unclaimed routed leads (live snapshot) | snapshot | — |

> **Lead Created** is not shown on the Sales dashboard — only SDRs create workspace leads. Sales work routed hand-offs and their own quotes/orders.
| **Rejected** | Pipeline rejections you logged | ✓ | ✓ |
| **On Hold** | Times you put a deal on hold | ✓ | ✓ |

Activity-based counts — see `lib/utils/sales-dashboard-metrics.ts`.

**UI card order (7):** Orders (accent) → Received → Balance → Lead Claimed → Inbox → Rejected → On Hold.

---

## Admin Dashboard — `components/admin/admin-dashboard.tsx`

KPIs are **company-wide**. **Date filter:** same presets as Orders/Quotes/Completed (`DashboardDateRangeFilter`); default **Last 30 Days** (`last_month`).

**API:** `GET /api/dashboard/kpis?admin_preset=today|yesterday|last_week|last_month|custom` — custom adds `date_from` + `date_to`. Response includes `range.label` for period-scoped card subtexts.

### KPI Cards

| Card | Value | Period? | Accent |
|------|-------|---------|--------|
| **Cash Collected** | All recorded payments in period | ✓ | ✓ |
| **Pipeline Value** | Sum of draft/sent `quote_final_total` | snapshot | |
| Total Leads | Leads created in period (+ Open/Claimed/In Pipeline/Quoted/Ordered/Rejected/Cancelled/Refunded sub-badges — mutually exclusive, sum to total) | ✓ | |
| In Inbox | Inbox leads (`is_inbox = true`) | snapshot | |
| Routed to Sales | Current Routed to Sales count | snapshot | |
| Won | Orders released to production in period (count) | ✓ | |

Footer link points to **Reports** for released order value, awaiting collection, and payment ledger.

> **Removed (May 2026):** Standalone **SDR Performance** table, **Lead Sources**, and **Rejection Reasons** blocks — consolidated into Team cards + Reports.

### Team Section

Grid of active non-admin users from `GET /api/admin/team` (sorted **SDR → Sales → Accountant**, then name).

**Row 1 — Sessions (last 7 days)** from `GET /api/admin/sessions`:

| Field | Notes |
|-------|-------|
| Avatar + online dot | Green = currently active session |
| Sessions / Active time / Last seen | 7-day window (independent of dashboard period) |
| Idle sign-outs | Warning badge when applicable |

**Row 2 — Work metrics (dashboard period)** from `team_member_metrics` in KPI response (`lib/utils/team-dashboard-metrics.ts`):

| Role | Columns |
|------|---------|
| **SDR** | Handled · Routed · **Sourced** (cash) |
| **Sales** | **Collected** · **Released** · **Balance due** (live snapshot) |

Sales cards also show “X active deals” when `claimed_leads > 0` from team API.

Hidden when all work metrics are zero for that user.

---

## Accountant Dashboard — `components/admin/accountant-dashboard.tsx`

Payment queue KPIs from `GET /api/payments/counts` — `pending_evidence` counts **unreviewed** proof only (`payment_evidence_reviewed_at` null). Approved evidence history lives on `/payments` → Approved tab; refunded orders on **Refunded** tab (`GET /api/payments/page-data`). **Cash collected** and **released order value** exclude tickets with `refund_status = full`. See [`invoice-payment.md`](./invoice-payment.md).

**Privacy:** Same **Hide / Show values** toggle as SDR/Sales. When hidden, KPI cards show masked placeholders; the “Review Now” banner (pending count) is suppressed.

---

## Shared utilities

| File | Purpose |
|------|---------|
| `lib/utils/dashboard-privacy.ts` | Per-user hide flag read/write; server-side redact helpers |
| `components/dashboard/dashboard-privacy.tsx` | Privacy toggle, confirm dialog, `useDashboardPrivacy`, `DashboardHiddenValue` |
| `lib/utils/dashboard-metrics.ts` | `sumCashCollectedInPeriod`, `sumProductionReleasedValue` |
| `lib/utils/team-dashboard-metrics.ts` | Per-user metrics for admin Team cards |
| `lib/utils/kpi-help-text.ts` | KPI calculation hints |
| `lib/utils/sdr-dashboard-date-range.ts` | `resolveSdrDashboardDateRange` — preset bounds for SDR/Sales/Admin KPIs |
| `lib/utils/dashboard-date-range-filter.ts` | Client filter value + `isoTimestampInDashboardRange()` for list pages |
| `components/ui/dashboard-date-range-filter.tsx` | Shared period picker UI |
| `lib/utils/get-period-start.ts` | `getDashboardPeriodBounds` — Reports presets only (not dashboard KPIs) |
| `components/ui/kpi-help-line.tsx` | Help text under card values |

---

## Loading States

- **Role loading:** skeleton grid while role resolves
- **KPI loading:** card skeletons, 300 ms minimum display
- Team section: loads independently via team + sessions APIs

---

## Design

- KPI cards: `var(--color-surface)`, `border-radius: 10px`
- Accent card: `var(--color-btn-verify-bg)`
- All colors via CSS variables — no hardcoded hex in components
