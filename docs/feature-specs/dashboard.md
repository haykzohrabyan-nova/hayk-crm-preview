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

**Data:** Sales/Admin/Accountant: `GET /api/dashboard/kpis?period=week|month|quarter`. **SDR:** `?sdr_preset=…`. **Sales:** `?sales_preset=…` (see role sections below).

The API returns role-scoped data — SDR and Sales see only their own numbers; Admin sees company totals.

Each KPI card shows a **help line** below the value explaining how the number is calculated (`lib/utils/kpi-help-text.ts`).

**Money detail:** Admin/Sales **Cash Collected** on the dashboard matches **Reports → Total Cash Collected** for the same period. Both sum **`ticket_payment_recorded`** activities only — customer-submitted evidence awaiting accountant review (`ticket_payment_evidence_submitted`) is excluded until confirmed. Order value, balance due, rep scorecards, and payment ledger live on **Reports** (`/reports`).

---

## SDR Dashboard — `components/sales/sdr-dashboard.tsx`

KPIs scoped to the current SDR with **date filters**: Today, Yesterday, Last 7 Days, Last 30 Days, Custom. Trend metrics show **% change vs the prior equivalent period** (e.g. today vs yesterday; last 7 days vs prior 7 days).

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
| **Lead Claimed** | Distinct leads you locked/claimed | ✓ | ✓ |
| **Lead Created** | Leads created with you as `sdr_id` | ✓ | ✓ |
| **Order Value** | Released order totals on **routed** leads you sourced | ✓ | ✓ |
| **Order Created** | Quote → order conversions on routed leads | ✓ | ✓ |
| **Inbox** | Unclaimed workspace leads (live snapshot) | snapshot | — |
| **Rejected** | Leads you rejected | ✓ | ✓ |
| **On Hold** | Times you put a lead on hold | ✓ | ✓ |
| **Routed to Sales** | Leads you routed to Sales | ✓ | ✓ |
| **Sales Win** | Routed leads whose order entered production | ✓ | ✓ |

Order Value / Order Created / Sales Win only credit leads with a **`lead_routed_to_sales`** activity (same rule as Leads **Won** tab).

Activity-based counts — see `lib/utils/sdr-dashboard-metrics.ts`.

---

## Sales Dashboard — `components/sales/sales-dashboard.tsx`

KPIs scoped to the current sales rep with **date filters**: Today, Yesterday, Last 7 Days, Last 30 Days, Custom. Trend metrics show **% change vs the prior equivalent period**.

**API:** `GET /api/dashboard/kpis?sales_preset=today|yesterday|last_week|last_month|custom` — custom adds `date_from` + `date_to`. Same preset semantics as SDR dashboard (`last_week` = Last 7 Days rolling, `last_month` = Last 30 Days rolling).

| Card | Meaning | Period? | % trend |
|------|---------|---------|---------|
| **Order Value** | Released order totals credited to you | ✓ | ✓ |
| **Lead Claimed** | Routed leads you claimed | ✓ | ✓ |
| **Lead Created** | Quotes you created | ✓ | ✓ |
| **Order Created** | Quote → order conversions (your credit) | ✓ | ✓ |
| **Inbox** | Unclaimed routed leads (live snapshot) | snapshot | — |
| **Rejected** | Pipeline rejections you logged | ✓ | ✓ |
| **On Hold** | Times you put a deal on hold | ✓ | ✓ |

Activity-based counts — see `lib/utils/sales-dashboard-metrics.ts`.

---

## Admin Dashboard — `components/admin/admin-dashboard.tsx`

KPIs are **company-wide**.

### KPI Cards

| Card | Value | Period? | Accent |
|------|-------|---------|--------|
| **Cash Collected** | All recorded payments in period | ✓ | ✓ |
| **Pipeline Value** | Sum of draft/sent `quote_final_total` | snapshot | |
| Total Leads | Leads created in period (+ Open/Claimed/… sub-badges) | ✓ | |
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

Payment queue KPIs from `GET /api/payments/counts` — `pending_evidence` counts **unreviewed** proof only (`payment_evidence_reviewed_at` null). Approved evidence history lives on `/payments` → Approved tab (`GET /api/payments/page-data`). See [`invoice-payment.md`](./invoice-payment.md).

---

## Shared utilities

| File | Purpose |
|------|---------|
| `lib/utils/dashboard-metrics.ts` | `sumCashCollectedInPeriod`, `sumProductionReleasedValue` |
| `lib/utils/team-dashboard-metrics.ts` | Per-user metrics for admin Team cards |
| `lib/utils/kpi-help-text.ts` | KPI calculation hints |
| `lib/utils/get-period-start.ts` | `getDashboardPeriodBounds` (aligned with Reports) |
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
