# BazarCRM — Navigation & Route Structure

---

## Full Route Tree

```
app/
├── page.tsx                          → redirect to /dashboard
├── layout.tsx                        → root layout (Inter, ThemeProvider, TopLoader)
│
├── (auth)/
│   ├── layout.tsx                    → centered auth shell
│   ├── login/page.tsx                ✓ EXISTS
│   ├── setup-2fa/page.tsx            ✓ EXISTS
│   ├── verify-2fa/page.tsx           ✓ EXISTS
│   ├── change-password/page.tsx      ✓ EXISTS (forced on first login with temp password)
│   ├── forgot-password/page.tsx      → TO BUILD (proxy.ts already allows this path)
│   └── reset-password/page.tsx       → TO BUILD (proxy.ts already allows this path)
│
├── (public)/
│   ├── layout.tsx                    ✓ EXISTS — minimal layout, no auth, no sidebar
│   └── q/[token]/page.tsx            ✓ EXISTS — customer-facing quote/order portal
│                                       No login required — proxy.ts treats /q/ as public
│                                       Phases: confirm → pay → evidence review → in production → ready for pickup
│                                       Clickable pickup address (Google Maps), tel/mailto links
│
└── (app)/
    ├── layout.tsx                    ✓ EXISTS (sidebar + mobile nav shell)
    │
    ├── dashboard/page.tsx            ✓ EXISTS — role router (SDR / Sales / Admin / Accountant dashboards); SDR/Sales/Admin use DashboardDateRangeFilter (default Last 30 Days)
    ├── tickets/page.tsx              ✓ EXISTS — redirect stub → `/quotes` (legacy; hub removed in migration 028)
    ├── overview/page.tsx             ✓ EXISTS — admin overview alias (renders DashboardPage)
    │
    ├── leads/page.tsx                ✓ EXISTS (SDR + Admin only)
    │
    ├── sales/page.tsx                ✓ EXISTS (Sales + Admin only)
    │
    ├── crm/page.tsx                  ✓ EXISTS (SDR, Sales, Admin)
    │
    ├── quotes/
    │   ├── page.tsx                  ✓ EXISTS — Quoted Requests list
    │   ├── new/page.tsx              ✓ EXISTS — New Quote form
    │   └── [id]/page.tsx             ✓ EXISTS — Quote detail (Overview + History when sent+)
    │
    ├── orders/
    │   ├── page.tsx                  ✓ EXISTS — Orders list (All / Pending Payment / In Production / Cancelled)
    │   └── [id]/page.tsx             ✓ EXISTS — Order detail (QuoteDetail context="order"; in-production uses same route)
    │
    ├── payments/
    │   ├── page.tsx                  ✓ EXISTS — Accountant payment review queue (accountant + admin)
    │   └── [id]/page.tsx             ✓ EXISTS — Payment review detail (context="payment")
    │
    ├── production/                   ⚠ LEGACY — redirects to /orders (proxy.ts); pages row removed (migration 079)
    │   ├── page.tsx                  → redirect /orders?tab=in_production
    │   └── [id]/page.tsx             → redirect /orders/[id]
    │
    ├── completed/
    │   ├── page.tsx                  ✓ EXISTS — Completed orders list (SDR own scope; accountant + admin all)
    │   └── [id]/page.tsx             ✓ EXISTS — Completed detail (context="completed")
    │
    ├── activity-log/page.tsx           ✓ EXISTS — Activity Log (Order / Lead + User Activity tabs)
    ├── notifications/page.tsx          ✓ EXISTS — redirect → /activity-log (legacy bookmarks)
    │
    ├── reports/page.tsx              ✓ EXISTS — Admin reports (cash, scorecards, ledger, awaiting collection; see feature-specs/reports.md)
    │
    ├── settings/page.tsx             ✓ Stub — “coming soon” (not in sidebar nav)
    ├── profile/page.tsx              ✓ Stub — sidebar user card links here (universal route)
    │
    └── admin/
        ├── layout.tsx                ✓ EXISTS — border-b sub-nav strip (Overview / Settings)
        ├── page.tsx                  ✓ EXISTS — card grid overview (6 built + Broadcast Notifications deferred)
        └── settings/
            ├── layout.tsx            ✓ EXISTS — SettingsTabNav above children
            ├── page.tsx              ✓ EXISTS — redirects → /admin/settings/users
            └── [tab]/page.tsx        ✓ EXISTS — renders section per tab:
                                        users         → UsersSection (full user management) ✅
                                        roles         → RolesSection (role list + permission matrix) ✅
                                        dropdowns     → DropdownsSection (all lookup_values categories) ✅
                                        products      → ProductsSection (product types, materials, links) ✅
                                        company       → CompanySection (branding, address, order defaults) ✅
                                        integrations  → IntegrationsSection (Twilio SMS ✅ live, Instantly AI ✅ live; Stripe/Zelle out of scope) ✅
                                        notifications → ❌ Not needed — removed from scope
```

---

## Sidebar Navigation per Role

### SDR Sidebar

```
BAZAARPRINTING                      ← brand logo text (accent color)

─── Main ───────────────────────
✓ Dashboard                        /dashboard
✓ Leads                            /leads          (badge — see Sidebar badge counts)
✓ CRM                              /crm            (no badge)
✓ Quoted Requests                  /quotes         (badge — see Sidebar badge counts)
✓ Orders                           /orders         (badge — see Sidebar badge counts)
✓ Completed                        /completed      (badge — see Sidebar badge counts)

─── Bottom ─────────────────────
✓ My Profile                       /profile
✓ [Dark mode toggle]
✓ [Sign out]
✓ [Collapse]
```

### Sales Sidebar

```
BAZAARPRINTING

─── Main ───────────────────────
✓ Dashboard                        /dashboard
✓ Pipeline                         /sales          (badge — see Sidebar badge counts)
✓ CRM                              /crm            (no badge)
✓ Quoted Requests                  /quotes         (badge — see Sidebar badge counts)
✓ Orders                           /orders         (badge — see Sidebar badge counts)

─── Bottom ─────────────────────
✓ My Profile                       /profile
✓ [Dark mode toggle]
✓ [Sign out]
✓ [Collapse]
```

### Accountant Sidebar

```
BAZAARPRINTING

─── Main ───────────────────────
✓ Dashboard                        /dashboard
✓ Payments                         /payments         (badge — see Sidebar badge counts)
✓ Orders                           /orders           (badge — see Sidebar badge counts)
✓ Completed                        /completed        (badge — see Sidebar badge counts)

─── Bottom ─────────────────────
✓ My Profile                       /profile
✓ [Dark mode toggle]
✓ [Sign out]
✓ [Collapse]
```

### Admin Sidebar

```
BAZAARPRINTING

─── Main ───────────────────────
✓ Dashboard                        /dashboard
✓ Leads                            /leads          (badge — see Sidebar badge counts)
✓ Pipeline                         /sales          (badge — see Sidebar badge counts)
✓ CRM                              /crm            (no badge)
✓ Quoted Requests                  /quotes         (badge — see Sidebar badge counts)
✓ Orders                           /orders         (badge — see Sidebar badge counts)
✓ Payments                         /payments       (badge — see Sidebar badge counts)
✓ Completed                        /completed      (badge — see Sidebar badge counts)
✓ Reports                          /reports        (no badge)
✓ Activity Log                     /activity-log   (no badge)

─── Admin ──────────────────────
✓ Admin Panel                      /admin

─── Bottom ─────────────────────
✓ My Profile                       /profile
✓ [Dark mode toggle]
✓ [Sign out]
✓ [Collapse]
```

✓ = built and live   ⬜ = to build

---

## Sidebar badge counts

Sidebar and mobile nav show a numeric pill on nav items when the count is **> 0**. Counts cap at **99+** (expanded) or **99** (collapsed icon dot). Items with no badge: **Dashboard**, **CRM**, **Reports**, **Activity Log**, **Admin Panel**, **Settings**.

**Source:** `GET /api/sidebar-counts?routes=…` → `lib/utils/sidebar-counts-query.ts`. Desktop sidebar passes only the user's visible routes; mobile nav fetches all applicable counts. Refreshes on mount, Supabase Realtime (`leads`, `job_tickets`, `activities`, `customers`), and the `bazaar:refresh-counts` window event (debounced 300 ms on desktop).

**Important:** Sidebar badges are **all-time** totals with **no date filter**. Page tab badges may differ — Quotes, Orders, and Completed list pages apply `DashboardDateRangeFilter` (default Last 30 Days) to tab counts only.

**Personal profile:** Sidebar bottom user card → `/profile` (universal in `proxy.ts`, not `role_permissions`). `/settings` exists as a legacy stub but is not linked from nav.

| Route | Shown on roles | What the number counts |
|-------|----------------|------------------------|
| `/leads` | SDR, Admin | `is_inbox = false` · `status IN ('Pending', 'Validated')` · `locked_by_id IS NULL` (unclaimed pool). **SDR:** matches **All Leads** tab. **Admin:** sidebar is unclaimed-only; Admin **All Leads** tab includes claimed rows too. |
| `/sales` | Sales, Admin | **Sales rep:** unclaimed routed leads (`status = 'Routed to Sales'`, `sales_owner_id IS NULL`, any `sales_status`) **+** own active pipeline (`sales_owner_id = me`, `sales_status IN ('Ongoing', 'Quote Sent')`). **Admin:** `status = 'Routed to Sales'` AND `sales_status IN ('Ongoing', 'Quote Sent')`. Not identical to the **Pipeline** tab (tab filters `sales_status` on unclaimed rows and includes null `sales_status`). |
| `/quotes` | SDR, Sales, Admin, Accountant† | Sum of scoped **`draft` + `sent` + `approved`** quote tickets (`ticket_kind = 'quote'`). **Sales + Admin:** also add **all** company-wide **`routed`** tickets (unscoped). Excludes **Cancelled**. **SDR:** own tickets only (`created_by_id = me`). **Sales:** own tickets + company **Routed to Sales** queue. |
| `/orders` | SDR, Sales, Admin, Accountant | Scoped sum of **`ticket_status = 'order'`** (pending payment) **+** **`in_production`**. Excludes cancelled and completed. Same role scoping as list pages (`created_by_id` for SDR; Sales sees own + `routed`; Admin/Accountant see all). All-time — not reduced by the Orders page date filter. |
| `/payments` | Admin, Accountant | Tickets with **`payment_evidence_url` set**, **`payment_evidence_reviewed_at` null**, and `ticket_status IN ('sent', 'order', 'in_production', 'completed')`. Company-wide — not scoped to a user. Matches **Pending approval** tab on `/payments`. |
| `/completed` | SDR, Admin, Accountant | **`ticket_status = 'completed'`**. **SDR:** own created tickets only (`created_by_id = me`). **Admin + Accountant:** all completed. All-time — not reduced by Completed page date filter. Sales role has no `/completed` nav item. |

† Accountant has `/orders` and `/completed` in the default permission seed but not `/quotes`; if granted via a custom role, quote badge logic applies the same scoping rules.

**Display rules:** Badge hidden when count is 0. No badge on Dashboard, CRM, Reports, Activity Log, Admin Panel, or Profile.

**Legacy:** `/production` badge (in-production only, unscoped) still exists in the counts helper but that route redirects to `/orders?tab=in_production` and is not in the sidebar.

---

## Icon Map (Lucide)

| Nav Item | Lucide Icon |
|----------|-------------|
| Dashboard | `LayoutDashboard` |
| Leads | `Inbox` |
| Pipeline (Sales) | `Briefcase` |
| CRM | `BookUser` |
| Quoted Requests (`/quotes`) | `FileText` |
| Orders (`/orders`) | `Package` |
| Payments (`/payments`) | `CreditCard` |
| Completed (`/completed`) | `PackageCheck` |
| Activity Log (`/activity-log`) | `ClipboardList` |
| Settings (personal) | `Settings` | Sidebar user card → `/profile` |
| Admin Panel | `ShieldCheck` |
| Users (admin section) | `Users` |
| Roles & Permissions | `KeyRound` |
| Dropdown Options | `ListFilter` |
| Notifications Broadcast (deferred) | `Megaphone` |
| Audit Log | `ClipboardList` |
| Per-user Notifications (V2 — not built, route `/notifications`) | `Bell` |

---

## Tab URL Convention

All tabs are reflected in the URL via `?tab=` query param. This enables bookmarking and back-button navigation.

```
/leads              → defaults to ?tab=all
/leads?tab=all      → All Leads (SDR: All Leads / My Leads toggle via ?owner_scope=all|mine)
/leads?tab=follow-up → Follow Up Later (SDR deferred queue; admin-managed reasons)
/leads?tab=hold     → On Hold
/leads?tab=routed   → Directed to Sales
/leads?tab=rejected → Rejected
/leads?tab=won      → Won

/sales              → defaults to ?tab=pipeline
/sales?tab=pipeline → Pipeline
/sales?tab=follow_up → Follow Up Later (owner-only for Sales reps)
/sales?tab=hold     → On Hold
/sales?tab=rejected → Rejected

/quotes             → defaults to ?tab=all
/quotes?tab=all     → All
/quotes?tab=draft   → Draft
/quotes?tab=sent    → Sent
/quotes?tab=approved → Approved
/quotes?tab=cancelled → Cancelled (quote-stage only)
/quotes?tab=routed  → Routed to Sales (sales/admin only)

/orders             → defaults to All tab (`?tab=` omitted)
/orders?tab=pending         → Pending Payment
/orders?tab=in_production  → In Production
/orders?tab=cancelled       → Cancelled

/payments             → Payment evidence (Pending | Approved | Refunded tabs)
/payments?tab=pending   → default — unreviewed evidence
/payments?tab=approved  → reviewed evidence (file still viewable)
/payments?tab=refunded  → partial/full refund_status orders

/completed            → Completed orders (date filter + search, no tabs)
```

> **Legacy redirects:** `/production` → `/orders?tab=in_production`; `/production/[id]` → `/orders/[id]` (`proxy.ts`).

Tab switches use `router.replace` (not `router.push`) — no browser history pollution.

---

## Detail routes (shared QuoteDetail component)

| Route | `context` prop | Back navigates to |
|-------|----------------|-------------------|
| `/quotes/[id]` | `quote` | `/quotes` |
| `/orders/[id]` | `order` | `/orders` |
| `/payments/[id]` | `payment` | `/payments` (always; `?from=/payments` from list rows) |
| `/completed/[id]` | `completed` | `/completed` |

In-production orders use **`/orders/[id]`** with `context="order"` (header badge **In Production**). Legacy `/production/[id]` redirects here.

All non-draft detail views use **Overview + History** tabs and shared overview sections. **Stats row** and **lifecycle timeline** appear at the top on all overview contexts including `/payments/[id]`. Long optional blocks use **`DetailCollapsibleSection`** (default **collapsed**): Timeline (milestone row under stats — separate collapsible block in sections), Quote & Pricing, Fulfillment, Pricing, Payment & order settings, Quote delivery, Follow-up, Production & evidence, Payment review, Payment plan. **Line Items**, **Fulfillment**, and **Quote & Pricing** are collapsible in overview (collapsed by default). While **editing**, those sections expand automatically. On `/payments/[id]`, Payment review defaults **open**.

---

## Tab Structure within Pages (legacy section header kept below)

### `/leads` — SDR Lead Pipeline

| Tab | Content | Badge |
|-----|---------|-------|
| All Leads | `Pending` + `Validated` (unclaimed pool badge for SDR) | count |
| Follow Up Later | `status = 'Follow Up Later'` (SDR own; admin all) | count |
| On Hold | `status = 'On Hold'` | count |
| Directed to Sales | `routed=true` — all leads SDR routed to Sales (`lead_routed_to_sales` activity) | count |
| Rejected | `status = 'Rejected'` | count |
| Won | `sales_status = 'Won'` **and** SDR routed lead to Sales first — linked ticket entered production. Shared **Lead History** table (`LeadHistoryTable`): Status, Source, **Product Interests**, Urgency, Quote/Order refs, Created. **SDR row click → read-only Verify Drawer.** | count |

**List API:** `GET /api/leads/workspace/page-data` — paginated (default 25 rows); server-side search, SDR owner scope, routed sub-filters, sort. Tab badges from `counts` (not limited by page). Routed tab stage pills use `routedSubCounts` from API.

### `/sales` — Sales Pipeline

| Tab | Content | Badge |
|-----|---------|-------|
| Pipeline | `status = 'Routed to Sales'` AND `sales_status IN ('Ongoing', 'Quote Sent')` | count |
| Follow Up Later | `sales_status = 'Follow Up Later'` — Sales rep sees own (`sales_owner_id`); Admin sees all | count |
| On Hold | `sales_status = 'On Hold'` | count |
| Rejected | `status = 'Rejected'` and `prev_status = 'Routed to Sales'` — leads rejected from the sales pipeline. Admin sees all; Sales rep sees only their own. | count |

**List API:** `GET /api/leads/sales/page-data?tab=…` — list + tab counts. **Claim** → `POST /claim`; **Open** (owned) → no `POST /lock`. See `docs/feature-specs/lead-locking.md`.

**Sales list columns (all tabs):** Name, Company, **Product Interests** (`ProductName[quantity]`), then tab-specific fields (Phone, Sales Status, Hold Reason, etc.).

### `/quotes` — Quoted Requests

**Date filter (May 2026):** `DashboardDateRangeFilter` in page header — default **Last 30 Days**; filters `created_at` **server-side** via `date_from` / `date_to` on page-data. **Tab badges** from page-data `counts` under the same filters; sidebar nav badge stays all-time total.

**Pagination (May 2026):** Default 25 rows; `ListPagination` (25 / 50 / 100). Search and admin team filter are server-side.

| Tab | Content | Badge | Visible to |
|-----|---------|-------|-----------|
| All | `ticket_kind = 'quote'` + (`draft` + `sent` + `approved`) — excludes cancelled | count | All roles |
| Draft | `ticket_kind = 'quote'` + `ticket_status = 'draft'` | count | All roles |
| Sent | `ticket_kind = 'quote'` + `ticket_status = 'sent'` | count | All roles |
| Won | `ticket_kind = 'quote'` + `ticket_status = 'approved'` (legacy — `approved` status retired; tab remains for historical records) | count | All roles |
| **Cancelled** | `ticket_kind = 'quote'` + `ticket_status = 'cancelled'` | count | All roles (SDR/Sales: own `created_by_id`; Admin: all) |
| Routed to Sales | `ticket_status = 'routed'` | count | Sales + Admin (all) · SDR (own HVT only) |

**List scope:** SDR — `created_by_id = session user` on all tabs. Sales — own quotes + company-wide **Routed to Sales** queue. **Admin** — all records; optional **team member filter** (`?user_id=`) on Leads, Quotes, Orders, and Completed narrows to that user's work.

### `/orders` — Orders

**Date filter (May 2026):** Same `DashboardDateRangeFilter` as Quotes — default **Last 30 Days**; filters by `created_at` **server-side**. **Tab badges** from page-data `counts`; sidebar nav badge stays all-time scoped total.

**Column sort (May 2026):** Created by, Balance Due, Due Date, Status, Payment — server-side via `?sort=`.

**Pagination (May 2026):** Default 25 rows; `ListPagination` (25 / 50 / 100).

Includes **`ticket_kind = 'order'`** with statuses **`order`**, **`in_production`**, and **`cancelled`** (order-stage cancellations only). Cancelled **quotes** appear on **`/quotes` → Cancelled**. **SDR / Sales list scope:** `created_by_id = session user` (via `scopeJobTicketsQuery()`). Evidence-pending orders are **included** for the ticket owner with status **Awaiting payment confirmation**; accountants also see them on **`/payments`**.

| Tab | Content | Badge |
|-----|---------|-------|
| All | `ticket_kind = 'order'` + (`order` + `in_production` + `cancelled`) | count — **default tab** |
| Pending Payment | `ticket_kind = 'order'` + `ticket_status = 'order'` (includes evidence-pending for owner) | count |
| In Production | `ticket_kind = 'order'` + `ticket_status = 'in_production'` | count |
| Cancelled | `ticket_kind = 'order'` + `ticket_status = 'cancelled'` | count |

List API: `GET /api/orders/page-data` → `{ orders, counts, pagination }`. Tab badge counts from API `counts` (same filters as list, excluding `limit`/`offset`). Sidebar `/orders` badge stays all-time scoped total.

Row click → `/orders/[id]`.

### `/payments` — Payment evidence (Accountant + Admin)

**Mount:** `GET /api/payments/page-data` — returns pending list, approved list, refunded list, and tab counts in one response.

| Tab | Content | Badge | Filter |
|-----|---------|-------|--------|
| Pending approval | Customer proof awaiting accountant confirm | `counts.pending` | Unreviewed evidence/Stripe; `refund_status` none |
| Approved | Evidence already reviewed — **View evidence** only (no Confirm) | `counts.approved` | Reviewed; `refund_status` none |
| **Refunded** | Orders with partial/full refunds | `counts.refunded` | `refund_status IN ('partial','full')` — includes **Cancelled** badge when applicable; **Paid via** / **Refunded via** columns |

Pending and Approved tabs include **`sent`**, **`order`**, **`in_production`**, and **`completed`** tickets. Refunded tab lists all matching refund_status rows (may include cancelled orders).

> Spec: [`feature-specs/payment-refunds.md`](feature-specs/payment-refunds.md)

**List columns:** Order · Customer · Claimed · **Payment For** (Deposit / Balance / Full payment + short description) · Method · Submitted · Actions or Approved date.

Row click → `/payments/[id]?from=/payments`. Detail uses full overview layout (stats row + lifecycle timeline + Payment review). **Back** → `/payments` (`resolveTicketDetailBackPath` — payment context before ticket status). Sidebar badge = pending count only (`GET /api/sidebar-counts`). Accountant dashboard KPI: `GET /api/payments/counts` → `pending_evidence`.

### `/completed` — Completed (SDR own scope; Accountant + Admin all)

| Content | Filter |
|---------|--------|
| All completed | `ticket_status = 'completed'` — **SDR:** own `created_by_id` only. **Admin + Accountant:** all. **Sales:** no default nav item (no `/completed` in seed permissions). |

**Date filter:** `DashboardDateRangeFilter` — default **Last 30 Days**; filters list **server-side** by completion date (`updated_at`); sidebar completed badge stays all-time total.

**Pagination (May 2026):** Default 25 rows; server-side search, date, admin team filter.

Row click → `/completed/[id]`. Mount: `GET /api/completed/page-data`; counts-only: `GET /api/completed/counts`.

### `/crm` — Customer registry

**List API:** `GET /api/crm/page-data` — paginated (default 25 rows); server-side search, status, heat filters; requires `/crm` page permission. **`GET /api/customers`** used only for merge search and Add Customer (same permission).

**Header:** **Add Customer** button (modal → `POST /api/customers`, no lead). Live updates via Realtime — no manual Refresh button. **Pagination:** `ListPagination` at bottom (25 / 50 / 100).

| Column | Notes |
|--------|-------|
| Name | `first_name + last_name` |
| Company | Link (or **—**) → `/crm/customers/[id]` |
| Phone | `tel:` when present |
| Email | `mailto:` when present |
| Status | New / Known badge (`customer_status` from API — New = no leads/tickets yet) |
| Industry | Lookup label (not raw value) |
| Leads | Count |
| Last Activity | Relative time |
| Actions | **View** · **Add Quote** |

**Row interaction:** Row itself is not clickable — use Company, View, or action buttons. Heat filter pills (Hot / Warm / Cold) filter manual `heat_tag` only; heat badge is on profile/edit only, not list column.

### `/reports` — Admin reports

No tabs. Single page with period filters + optional team member dropdown.

| Section | Notes |
|---------|-------|
| KPI row | Cash collected, released order value, awaiting collection (live snapshot) |
| Sales / SDR scorecards | Display-only — filter via team member dropdown (rows not clickable) |
| Awaiting collection | Balance due on open orders; link → lifecycle detail (`/orders/[id]?from=/reports`, etc.) |
| Payment ledger | Period-filtered payments; **Open order** → same lifecycle + `?from=/reports` |

Counts API: none (all metrics from `GET /api/reports/summary`). **Back from detail:** `QuoteDetail` reads `?from=/reports`.

### `/admin/settings/users`

No sub-tabs. Single table view with filters (search, role filter, show inactive toggle).

---

## Activity Log — `/activity-log`

Built, accessible to **Admin** by default (`/activity-log` in `pages`; API `GET /api/admin/activity-log` requires admin). Custom roles need both page permission and a future non-admin API if extended.

- **`/notifications`** redirects here (legacy URL). Route **`/notifications`** is reserved for a future per-user notification bell.

- Shows the system `activities` table — all lead actions, customer merges, etc.
- Columns: Who (name + role pill) | Action (human-readable label) | Lead / Customer | **Quote / Order** (`ticket_ref`) | When (relative, hover for absolute)
- Paginated 50 per page with "Load more" button; total event count in header
- Mobile card layout below `sm` breakpoint
- Live-refreshes when `bazaar:activities-changed` event fires
- API: `GET /api/admin/activity-log?limit=50&offset=0` (admin-auth required)

> **Notification Bell (V2 — not yet built):** Per-user unread count in the sidebar, popover feed, and Supabase Realtime subscription. Planned after Broadcast Notifications.

---

## Breadcrumbs / Page Titles

Each page has a simple `<h1>` page title. No breadcrumbs needed given the shallow route structure.

**Cross-section detail Back:** Opening a ticket from **Reports** uses `?from=/reports` so Back returns to Reports (sidebar still reflects the detail URL, e.g. Orders). CRM `from` deferred. See `lib/utils/ticket-detail-href.ts`.

| Route | Page Title |
|-------|-----------|
| `/dashboard` | Dashboard |
| `/leads` | Leads |
| `/sales` | Sales Pipeline |
| `/crm` | CRM |
| `/quotes` | Quoted Requests |
| `/quotes/new` | New Quote |
| `/quotes/[id]` | Quote / Order |
| `/orders` | Orders |
| `/orders/[id]` | Order |
| `/payments` | Payment Evidence |
| `/payments/[id]` | Payment Review |
| `/completed` | Completed Orders |
| `/completed/[id]` | Completed Order |
| `/reports` | Reports |
| `/crm/customers/[id]` | Customer Profile |
| `/q/[token]` | Customer portal (public) — quote/order checklist, payment, line items with additional-SKU grid + file preview/download; **shipping** (single Ship To column or 2-col address cards); PDF download (`GET /api/public/quotes/[token]/pdf`) |
| `/profile` | My Profile |
| `/settings` | Account Settings (legacy stub — use `/profile`) |
| `/admin` | Admin (Overview) |
| `/admin/settings/users` | Users |
| `/admin/settings/roles` | Roles & Permissions |
| `/admin/settings/dropdowns` | Dropdown Options |
| `/admin/settings/company` | Company Info |
| `/admin/settings/products` | Products |
| `/admin/settings/integrations` | Integrations |
| `/admin/settings/sms-templates` | SMS Templates |
| `/admin/settings/payment` | Payment (bank / Zelle) |
| `/activity-log` | Activity Log |

---

## Mobile Navigation

`components/layout/mobile-nav.tsx` already exists. It will be updated with the same role-aware nav items as the sidebar. The drawer pattern and sign-out behavior remain unchanged.

---

## `proxy.ts` Path Classifications

```typescript
// Public customer-facing — no auth required; RBAC skipped even when logged in (staff can preview)
const isPublic = pathname.startsWith('/q/') || pathname === '/policy'

const AUTH_PATHS = [
  '/login',
  '/forgot-password',
  '/reset-password',
  '/setup-2fa',
  '/verify-2fa',
  '/change-password',
]
```

**Logged-in staff preview:** `/q/{token}` must remain in `isPublic` so sales reps can open **Customer link** from quote detail without being redirected to their role home (e.g. `/sales`).

**Note on `/change-password`:** Users with `must_change_password = true` are redirected here unless the path is public (`/q/`).

All `(app)` routes go through: session → AAL2 → `must_change_password` → role permission gate (prefix match, e.g. `/quotes` grants `/quotes/[id]`).
