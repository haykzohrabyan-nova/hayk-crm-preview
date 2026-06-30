# Feature Spec — Sales Pipeline

Route: `/sales` (Sales + Admin only)

---

## Overview

The Sales Pipeline shows leads that have been routed from SDRs. **Assignment** is permanent via **`sales_owner_id`** (`POST /api/leads/[id]/claim`) — other Sales reps do not see claimed leads on their tabs. **Open** on a lead you already own does **not** acquire a session lock; see `docs/feature-specs/lead-locking.md` (Sales vs SDR).

Sales workflow stages: **claim** → **Claimed** tab → rep clicks **In Progress** → **In Progress** tab → create quote in **Quoted Requests** (`/quotes`). Reps may **Hold** or **Follow Up Later** from Claimed or In Progress; **Resume** restores `prev_sales_status` (Claimed or In Progress).

**Won credit** for linked leads is applied when the ticket enters **`in_production`**, not at order conversion.

> **List vs drawer (2026-05-22):** Tab tables load a **slim** lead row from **`GET /api/leads/sales/page-data`**. Opening the Sales modal fetches the **full** record via `GET /api/leads/[id]` (`fetchLeadById()`).

> **Page load (2026-06-29):** Six tabs with count badges from one **`GET /api/leads/sales/page-data`** call. Admin **search + team member filter** on Claimed and In Progress tabs only.

> **List date display (2026-06-29):** List columns use **`formatTimeTodayOrDateNumeric`** (time if today, else `6/28/2026`). Milestone timestamps come from **activity enrichment** on page-data (`routed_at`, `in_progress_at`) with `updated_at` fallback. Rejection reasons use **`rejectReasonLabel`**. Drawer History timelines still use **`relativeTime`**.

---

## Tabs summary

| Tab | `sales_status` | Sales rep scope | Admin |
|-----|----------------|-----------------|-------|
| **Pipeline** | `NULL` (unclaimed) | Unclaimed pool | All unclaimed |
| **Claimed** | `Claimed` | Own only | All (+ `?user_id=` + search) |
| **In Progress** | `In Progress` | Own only | All (+ `?user_id=` + search) |
| **Follow Up Later** | `Follow Up Later` | Own only | All |
| **On Hold** | `On Hold` | Own only | All |
| **Rejected** | `status = Rejected`, `prev_status = Routed to Sales` | All sales rejections | All |

> **Quotes:** After creating a quote from a lead, use **Quoted Requests** (`/quotes`) — Draft / Sent tabs. The lead may still have `sales_status = Quote Sent` internally but is no longer listed on a dedicated Sales tab.

---

## Tab: Pipeline

**Data:** `GET /api/leads/sales/page-data?tab=pipeline`

- `status = 'Routed to Sales'`
- `sales_owner_id IS NULL`
- `sales_status IS NULL`
- Optional `?search=` (all roles)

**Action:** **Claim** (Sales) / **View** + **Reassign** (Admin)

---

## Tab: Claimed

**Data:** `GET /api/leads/sales/page-data?tab=claimed`

- `status = 'Routed to Sales'`
- `sales_status = 'Claimed'`
- Sales rep: `sales_owner_id = current user`
- Admin: all claimed; optional `?user_id=` and `?search=`

**Action:** **Open** (Sales) / **View** + **Reassign** (Admin)

---

## Tab: In Progress

**Data:** `GET /api/leads/sales/page-data?tab=in_progress`

- `sales_status = 'In Progress'`
- Same ownership / admin filter rules as Claimed

**Action:** **Open** / View + Reassign

---

## Shared worklist columns (Pipeline · Claimed · In Progress)

| Column | Notes |
|--------|-------|
| Name | |
| Company | |
| Product Interests | `ProductName[quantity]` |
| Phone | |
| Sales Status | Pill: Claimed / In Progress / Quote Sent / — on Pipeline |
| Urgency | `UrgencyPill` |
| Owner | Unclaimed / You / rep name (Admin) |
| Created | `created_at` |
| Milestone | **Pipeline · Claimed:** column header **Routed** — `routed_at` (`lead_routed_to_sales` activity). **In Progress tab:** column header **In Progress** — `in_progress_at` (sales `lead_in_progress` activity). Both use `formatTimeTodayOrDateNumeric`; fallback `updated_at`. |
| Action | See per-tab above |

### Claim behavior

- **Claim** → `POST /api/leads/[id]/claim` → `sales_owner_id = currentUser`, **`sales_status = 'Claimed'`** (not In Progress); logs `lead_sales_claimed`; modal opens immediately
- Rep must click **In Progress** in the modal to move lead to the In Progress tab

### In Progress action (modal footer)

- Visible when `sales_status === 'Claimed'`
- **In Progress** → `POST /api/leads/[id]/in-progress` with `{ role: 'sales' }` → `sales_status = 'In Progress'`, saves `prev_sales_status`
- On success: toast, **`onClose()`** (same as Hold / Follow Up — modal closes, row removed from Claimed list, counts refresh)

---

## Tab: Follow Up Later

**Data:** `GET /api/leads/sales/page-data?tab=follow_up`

- `sales_status = 'Follow Up Later'`
- Sales rep: owner-only; Admin: all

**Resume** → restores `prev_sales_status` (Claimed, In Progress, or Quote Sent)

**Columns:** Name · Company · Product Interests · Reason · Follow Up On · Created · Sent to Follow Up · Actions — Created and Sent to Follow Up use time-today or numeric date (`formatTimeTodayOrDateNumeric`).

---

## Tab: On Hold

**Data:** `GET /api/leads/sales/page-data?tab=hold`

- `sales_status = 'On Hold'`
- Sales rep: owner-only; Admin: all

**Hold** snapshots `prev_sales_status`. **Resume** → `POST /api/leads/[id]/resume` with `role: 'sales'` restores prior tab/status.

**Columns:** Name · Company · Product Interests · Hold Reason · Hold Until · Created · Sent to Hold · Actions — Created and Sent to Hold use time-today or numeric date.

---

## Tab: Rejected

**Data:** `GET /api/leads/sales/page-data?tab=rejected`

- `status = 'Rejected'` AND `prev_status = 'Routed to Sales'`
- Excludes SDR-only rejections

**Columns:** Name · Company · Product Interests · Phone · Rejection Reason · Created · Sent to Rejected · Action — reason labels via `rejectReasonLabel`; dates use time-today or numeric format.

---

## Sales Modal

Centered modal (`780px`, `80vh`). See `components/sales/sales-drawer.tsx`.

### Footer actions (edit mode)

| Action | When | Effect |
|--------|------|--------|
| **In Progress** | `sales_status = Claimed` | → In Progress tab; closes modal |
| **Follow Up Later** | Not deferred / terminal | → Follow Up tab; closes modal |
| **On Hold** | Not Rejected | → Hold tab; closes modal |
| **Resume** | On Hold / Follow Up | Restores `prev_sales_status`; closes modal |
| **Create Quote / Order** | Edit mode | Navigate to `/quotes/new?lead_id=` — quote appears in **Quoted Requests** |
| **Reject** | Not Rejected | Terminal; → Rejected tab |

**Reject:** `status = 'Rejected'`, `sales_status = null`, `prev_status = 'Routed to Sales'`

---

## API

- `GET /api/leads/sales/page-data?tab=&limit=&offset=&search=&user_id=` → `{ leads, counts: { pipeline, claimed, in_progress, follow_up, hold, rejected }, pagination }`
  - Every lead row includes optional **`routed_at`** (from `fetchRoutedToSalesAtByLeadIds`)
  - When `tab=in_progress`, each row also includes **`in_progress_at`** (from `fetchSalesInProgressAtByLeadIds`, sales role only)
- `GET /api/leads/sales-counts` → lightweight `{ counts }` (same shape)
- `POST /api/leads/[id]/claim` → `sales_status: "Claimed"`
- `POST /api/leads/[id]/in-progress` with `{ role: "sales" }` → `sales_status: "In Progress"` (from Claimed only)

---

## Admin reassign modal

**Reassign** on Claimed / In Progress / Quote Sent tabs opens a dialog to change `sales_owner_id`.

When the lead's customer has an **active Key Account rep**, the modal shows an advisory info callout with the rep name. Assignment is not forced — admin may still reassign or unassign freely.

---

## Migration note (2026-06-29)

`supabase/migrations/20260629_sales_status_claimed_in_progress.sql` maps legacy data:

- Unowned `Ongoing` → `NULL` (Pipeline)
- Owned `NULL` or `Ongoing` → **Claimed**
- Mistaken `In Progress` from earlier migration → **Claimed**
- **Quote Sent** unchanged
