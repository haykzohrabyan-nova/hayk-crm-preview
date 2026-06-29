# Feature Spec — Sales Pipeline

Route: `/sales` (Sales + Admin only)

---

## Overview

The Sales Pipeline shows leads that have been routed from SDRs. **Assignment** is permanent via **`sales_owner_id`** (`POST /api/leads/[id]/claim`) — other Sales reps do not see claimed leads on their tabs. **Open** on a lead you already own does **not** acquire a session lock; see `docs/feature-specs/lead-locking.md` (Sales vs SDR).

Sales workflow stages: **claim** → **Claimed** tab → rep clicks **In Progress** → **In Progress** tab → create quote → **Quote Sent** tab. Reps may **Hold** or **Follow Up Later** from Claimed or In Progress; **Resume** restores `prev_sales_status` (Claimed, In Progress, or Quote Sent).

**Won credit** for linked leads is applied when the ticket enters **`in_production`**, not at order conversion.

> **List vs drawer (2026-05-22):** Tab tables load a **slim** lead row from **`GET /api/leads/sales/page-data`**. Opening the Sales modal fetches the **full** record via `GET /api/leads/[id]` (`fetchLeadById()`).

> **Page load (2026-06-29):** Seven tabs with count badges from one **`GET /api/leads/sales/page-data`** call. Admin **search + team member filter** on Claimed, In Progress, and Quote Sent tabs only.

---

## Tabs summary

| Tab | `sales_status` | Sales rep scope | Admin |
|-----|----------------|-----------------|-------|
| **Pipeline** | `NULL` (unclaimed) | Unclaimed pool | All unclaimed |
| **Claimed** | `Claimed` | Own only | All (+ `?user_id=` + search) |
| **In Progress** | `In Progress` | Own only | All (+ `?user_id=` + search) |
| **Quote Sent** | `Quote Sent` | Own only | All (+ `?user_id=` + search) |
| **Follow Up Later** | `Follow Up Later` | Own only | All |
| **On Hold** | `On Hold` | Own only | All |
| **Rejected** | `status = Rejected`, `prev_status = Routed to Sales` | All sales rejections | All |

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

## Tab: Quote Sent

**Data:** `GET /api/leads/sales/page-data?tab=quote_sent`

- `sales_status = 'Quote Sent'` (set by `POST /api/tickets` when quote has line items)
- Same ownership / admin filter rules as Claimed

**Action:** **Open** / View + Reassign

---

## Shared worklist columns (Pipeline · Claimed · In Progress · Quote Sent)

| Column | Notes |
|--------|-------|
| Name | |
| Company | |
| Product Interests | `ProductName[quantity]` |
| Phone | |
| Sales Status | Pill: Claimed / In Progress / Quote Sent / — on Pipeline |
| Urgency | `UrgencyPill` |
| Owner | Unclaimed / You / rep name (Admin) |
| Routed | `updated_at` relative time |
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

---

## Tab: On Hold

**Data:** `GET /api/leads/sales/page-data?tab=hold`

- `sales_status = 'On Hold'`
- Sales rep: owner-only; Admin: all

**Hold** snapshots `prev_sales_status`. **Resume** → `POST /api/leads/[id]/resume` with `role: 'sales'` restores prior tab/status.

---

## Tab: Rejected

**Data:** `GET /api/leads/sales/page-data?tab=rejected`

- `status = 'Rejected'` AND `prev_status = 'Routed to Sales'`
- Excludes SDR-only rejections

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
| **Create Quote / Order** | Edit mode | Navigate to `/quotes/new?lead_id=` → may set **Quote Sent** |
| **Reject** | Not Rejected | Terminal; → Rejected tab |

**Reject:** `status = 'Rejected'`, `sales_status = null`, `prev_status = 'Routed to Sales'`

---

## API

- `GET /api/leads/sales/page-data?tab=&limit=&offset=&search=&user_id=` → `{ leads, counts: { pipeline, claimed, in_progress, quote_sent, follow_up, hold, rejected }, pagination }`
- `GET /api/leads/sales-counts` → lightweight `{ counts }` (same shape)
- `POST /api/leads/[id]/claim` → `sales_status: "Claimed"`
- `POST /api/leads/[id]/in-progress` with `{ role: "sales" }` → `sales_status: "In Progress"` (from Claimed only)

---

## Migration note (2026-06-29)

`supabase/migrations/20260629_sales_status_claimed_in_progress.sql` maps legacy data:

- Unowned `Ongoing` → `NULL` (Pipeline)
- Owned `NULL` or `Ongoing` → **Claimed**
- Mistaken `In Progress` from earlier migration → **Claimed**
- **Quote Sent** unchanged
