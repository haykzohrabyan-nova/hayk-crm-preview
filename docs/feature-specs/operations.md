# Feature Spec — Admin Operations (`/operations`)

**Access:** Admin role only. Route is in `ADMIN_ONLY_PAGE_ROUTES` (`lib/auth/admin-only-pages.ts`); `proxy.ts` hard-blocks non-admins. Not grantable in Admin → Roles → Page Access.

**Purpose:** Single admin view of the full lead → quote → order pipeline with filter tabs, team performance scorecard, deal detail dialog, and read-only lead drawer.

---

## Architecture

```
app/(app)/operations/page.tsx          ← thin Server Component
  └── components/admin/operations-page.tsx
        ├── OperationsPerformancePanel   ← Performance tab only
        ├── OperationsDealDetailDialog   ← row click
        └── VerifyDrawer (read-only)     ← View full lead
```

**API:** `GET /api/admin/operations/page-data` — `requireAdmin()`

**Business logic:**

| Module | Purpose |
|--------|---------|
| `lib/utils/admin-deal-stage.ts` | Filter buckets, stage labels, owner highlight, `matchesOperationsFilter` |
| `lib/utils/fetch-admin-operations-data.ts` | Lead pool + deals list + tab counts |
| `lib/utils/fetch-admin-operations-performance.ts` | Per-user performance aggregation |

**Migrations:**

- `20260629_operations_page.sql` — `pages` row (`GitBranch`, `sort_order = 1` after Dashboard)
- `20260630_operations_nav_order.sql` — reorder existing main nav + icon fix

**Nav:** Sidebar **directly below Dashboard** (admin). Icon: **`GitBranch`**. `resolve-nav-pages.ts` pins Operations after Dashboard even if DB `sort_order` is stale. No sidebar badge.

---

## Filter tabs (order)

| Tab | Bucket | What it shows |
|-----|--------|----------------|
| **Performance** | — (not a lead bucket) | Team totals + per-user scorecard |
| **All active** | `all_active` | Every non-rejected, non-completed deal in range |
| **SDR** | `sdr` | Inbox / pending / validated / SDR-locked leads |
| **Unclaimed leads** | `sales_queue` | Routed to Sales, **no rep claimed yet** |
| **Sales working** | `sales_working` | Claimed by rep, **no quote ticket yet** |
| **Quoted** | `quoted` | Quote exists or Quote Sent / Quoted status |
| **Order** | `order` | Order or in-production ticket (includes Won leads still in production) |
| **Completed** | `completed` | `ticket_status === "completed"` only (matches `/completed`) |
| **On hold / Follow up** | `hold` | On Hold or Follow Up Later |
| **Rejected** | `rejected` | Lead/sales status Rejected (not cancelled-only tickets) |

Tab **counts** reflect date + user filters but exclude search and active stage pill. **Performance** tab has no count badge.

Bucket priority (one bucket per deal): Rejected → Completed → Hold → Order → Quoted → Sales working → Unclaimed → SDR.

---

## Date range filter

Default: **Last 30 days** (`DashboardDateRangeFilter`).

A deal is **in range** when **any** of:

- Lead `created_at`
- Linked quote `created_at` or sent/approved `updated_at`
- Order created, converted (`ticket_converted` activity), or in-production `updated_at`
- Completed order `updated_at`

Also includes **unlinked** quote/order/completed tickets (no `linked_lead_id`) via synthetic lead ids (`__ticket__:{ticketId}`).

---

## Pipeline table (non-Performance tabs)

**Columns:** Customer · Stage · SDR · Sales rep · Quote · Order · Created · Action

- **Stage** — from linked ticket when one exists (same labels as Quotes/Orders `StatusPill`); otherwise lead status. Sub-line: ticket ref or “Lead status”.
- **Owner highlight** — “Active owner” on SDR or Sales rep column for current pipeline step.
- **Quote / Order** — clickable refs (`TicketListViewButton` pattern); opens detail via **`useGlobalLoading`** overlay.
- **Dates** — numeric US format via `formatDateNumeric` (`6/29/2026`).
- **Typography** — matches Orders list (`lg:text-xs xl:text-sm`, shared padding).
- **Column grouping** — click **Stage**, **SDR**, or **Sales rep** header to group rows on the current page (layers icon; click again to clear). Stage groups follow pipeline order; rep columns put Unassigned / Unclaimed last.
- **Pagination** — 25 / 50 / 100 rows (`useStoredListPageSize`, `localStorage` key `bazaar-list-page-size`).

**Search:** customer, company, QUO/ORD ref, stage label (pipeline tabs only).

**Admin user filter:** matches SDR, sales owner, or locker on the lead.

---

## Deal detail dialog

Row click opens `OperationsDealDetailDialog`:

- Header: customer, company, stage pill, ticket-ref context
- **Team** — SDR + Sales rep with active-owner hint
- **Linked records** — full-width clickable Quote/Order rows → `router.push` + global loading
- **Recent activity** — collapsed by default; loads in background; expand to scroll list (footer buttons stay pinned)
- **View full lead** — read-only `VerifyDrawer` (disabled for `ticket_only` synthetic rows)

---

## Performance tab

**First tab** in the pill row.

**Total row** (highlighted) + one row per active Admin / SDR / Sales user with activity in range.

**UI hints:** Info callout explains On hand vs stage columns; each row shows a plain-language summary under the rep name via `formatPerformanceRowSummary()` (e.g. `4 on hand — 2 quoted (1 sent, 1 not sent) · 2 ordered / in production`).

| Column | Meaning |
|--------|---------|
| On hand | Active pipeline deals attributed to user |
| Unclaimed | Totals only — unclaimed sales queue |
| Claimed | Claimed, no quote |
| In progress | Sales working — In Progress / Ongoing |
| On hold | Hold / follow up |
| Rejected | Rejected |
| Quoted | Quote-stage deals |
| Sent | Quote sent to customer |
| Ordered | Order / in production |
| Completed | Completed orders |
| Paid | Collected on user's orders (`getAmountPaid`) |
| Awaiting | Balance due on open orders (`computeInvoicePaymentSummary`) |

Attribution: SDR bucket → `sdr_id` / `locked_by_id`; sales buckets → `sales_owner_id`. Fully refunded tickets excluded from Paid/Awaiting.

Uses same date range and user filter as pipeline. Search is not applied.

---

## Live updates

`operations-page.tsx` uses `useStaleWhileRevalidate` with window events:

- `bazaar:leads-changed`
- `bazaar:tickets-changed`
- `bazaar:refresh-counts`

No polling. Refetch is immediate (`REALTIME_REFETCH_MS = 0`). Paused while lead drawer is open.

Sidebar Supabase Realtime on `leads` / `job_tickets` dispatches the same events for other users/tabs.

---

## API — `GET /api/admin/operations/page-data`

**Auth:** `requireAdmin()`

| Query param | Notes |
|-------------|--------|
| `stage` | Filter pill id; `performance` returns scorecard instead of deals |
| `date_preset` | `today`, `yesterday`, `last_week`, `last_month`, `custom`, … |
| `date_from`, `date_to` | Required when `date_preset=custom` |
| `user_id` | Optional admin user filter |
| `search` | Pipeline tabs only |
| `limit`, `offset` | Pagination (pipeline tabs; ignored for Performance) |

**Response (pipeline tab):**

```json
{
  "deals": [/* OperationsDealRow[] */],
  "counts": { "all_active": 100, "sdr": 1, "sales_queue": 0, … },
  "pagination": { "limit": 25, "offset": 0, "total": 42, "hasMore": true }
}
```

**Response (`stage=performance`):**

```json
{
  "performance": {
    "totals": { "user_id": "__total__", "full_name": "Total", … },
    "users": [/* OperationsPerformanceRow[] */]
  },
  "counts": { … },
  "deals": [],
  "pagination": { "total": 0, … }
}
```

---

## Related docs

- Navigation & sidebar order: `docs/reference/navigation.md`
- API contract: `docs/reference/api-contract.md`
- RBAC: `docs/reference/rbac.md`
- Realtime: `docs/guides/realtime-live-updates.md`
