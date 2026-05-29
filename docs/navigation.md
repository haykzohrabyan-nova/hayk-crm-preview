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
    ├── crm/page.tsx                  ✓ EXISTS (all roles)
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
    ├── settings/page.tsx             → TO BUILD (currently stub — personal profile)
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
✓ Leads                            /leads          (badge: inbox count)
✓ CRM                              /crm
✓ Quoted Requests                  /quotes         (badge: active quotes)
✓ Orders                           /orders         (badge: pending payment + in production)
✓ Completed                        /completed      (badge: own completed count)

─── Bottom ─────────────────────
✓ Settings                         /settings
✓ [Dark mode toggle]
✓ [Sign out]
✓ [Collapse]
```

### Sales Sidebar

```
BAZAARPRINTING

─── Main ───────────────────────
✓ Dashboard                        /dashboard
✓ Pipeline                         /sales          (badge: pipeline count)
✓ CRM                              /crm
✓ Quoted Requests                  /quotes         (badge: active quotes)
✓ Orders                           /orders         (badge: pending payment + in production)

─── Bottom ─────────────────────
✓ Settings                         /settings
✓ [Dark mode toggle]
✓ [Sign out]
✓ [Collapse]
```

### Accountant Sidebar

```
BAZAARPRINTING

─── Main ───────────────────────
✓ Dashboard                        /dashboard
✓ Payments                         /payments         (badge: unreviewed evidence)
✓ Orders                           /orders           (badge: pending payment + in production)
✓ Completed                        /completed        (badge: completed count)

─── Bottom ─────────────────────
✓ Settings                         /settings
✓ [Dark mode toggle]
✓ [Sign out]
✓ [Collapse]
```

### Admin Sidebar

```
BAZAARPRINTING

─── Main ───────────────────────
✓ Dashboard                        /dashboard
✓ Leads                            /leads          (badge: inbox count)
✓ Pipeline                         /sales          (badge: pipeline count)
✓ CRM                              /crm
✓ Quoted Requests                  /quotes         (badge: active quotes)
✓ Orders                           /orders         (badge: pending payment + in production)
✓ Payments                         /payments       (admin only — optional queue access)
✓ Completed                        /completed
✓ Reports                          /reports        (admin only — grant via Roles & Permissions)
✓ Activity Log                     /activity-log   (system activity feed)

─── Admin ──────────────────────
✓ Admin Panel                      /admin

─── Bottom ─────────────────────
✓ Settings                         /settings
✓ [Dark mode toggle]
✓ [Sign out]
✓ [Collapse]
```

✓ = built and live   ⬜ = to build

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
| Settings (personal) | `Settings` |
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
/leads?tab=hold     → On Hold
/leads?tab=routed   → Directed to Sales
/leads?tab=rejected → Rejected
/leads?tab=won      → Won

/sales              → defaults to ?tab=pipeline
/sales?tab=pipeline → Pipeline
/sales?tab=on-hold  → On Hold
/sales?tab=rejected → Rejected

/quotes             → defaults to ?tab=all
/quotes?tab=all     → All
/quotes?tab=draft   → Draft
/quotes?tab=sent    → Sent
/quotes?tab=approved → Approved
/quotes?tab=routed  → Routed to Sales (sales/admin only)

/orders             → defaults to All tab (`?tab=` omitted)
/orders?tab=pending         → Pending Payment
/orders?tab=in_production  → In Production
/orders?tab=cancelled       → Cancelled

/payments             → Payment evidence (Pending approval | Approved tabs)
/payments?tab=pending   → default — unreviewed evidence
/payments?tab=approved  → reviewed evidence (file still viewable)

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
| `/payments/[id]` | `payment` | `/payments` |
| `/completed/[id]` | `completed` | `/completed` |

In-production orders use **`/orders/[id]`** with `context="order"` (header badge **In Production**). Legacy `/production/[id]` redirects here.

All non-draft detail views use **Overview + History** tabs and shared overview sections. On overview layout, long optional blocks use **`DetailCollapsibleSection`** (default **collapsed**): Timeline, Quote & Pricing, Fulfillment, Pricing, Payment & order settings, Quote delivery, Follow-up, Production & evidence, Payment review, Payment plan. **Line Items** stays expanded. On `/payments/[id]`, Payment review defaults **open**.

---

## Tab Structure within Pages (legacy section header kept below)

### `/leads` — SDR Lead Pipeline

| Tab | Content | Badge |
|-----|---------|-------|
| Inbox | `status = 'Pending'`, `is_inbox = true` | count |
| On Hold | `status = 'On Hold'` | count |
| Directed to Sales | `routed=true` — all leads SDR routed to Sales (`lead_routed_to_sales` activity) | count |
| Rejected | `status = 'Rejected'` | — |
| Won | `sales_status = 'Won'` **and** SDR routed lead to Sales first — linked ticket entered production. Shared **Lead History** table (`LeadHistoryTable`): Status, Source, **Product Interests**, Urgency, Quote/Order refs, Created. **SDR row click → read-only Verify Drawer.** | count |

**List API:** `GET /api/leads/workspace/page-data` — paginated (default 25 rows); server-side search, SDR owner scope, routed sub-filters, sort. Tab badges from `counts` (not limited by page). Routed tab stage pills use `routedSubCounts` from API.

### `/sales` — Sales Pipeline

| Tab | Content | Badge |
|-----|---------|-------|
| Pipeline | `status = 'Routed to Sales'` AND `sales_status IN ('Ongoing', 'Quote Sent')` | count |
| On Hold | `sales_status = 'On Hold'` | count |
| Rejected | `status = 'Rejected'` and `prev_status = 'Routed to Sales'` — leads rejected from the sales pipeline. Admin sees all; Sales rep sees only their own. | count |

**Sales list columns (all tabs):** Name, Company, **Product Interests** (`ProductName[quantity]`), then tab-specific fields (Phone, Sales Status, Hold Reason, etc.).

### `/quotes` — Quoted Requests

**Date filter (May 2026):** `DashboardDateRangeFilter` in page header — default **Last 30 Days**; filters `created_at` **server-side** via `date_from` / `date_to` on page-data. **Tab badges** from page-data `counts` under the same filters; sidebar nav badge stays all-time total.

**Pagination (May 2026):** Default 25 rows; `ListPagination` (25 / 50 / 100). Search and admin team filter are server-side.

| Tab | Content | Badge | Visible to |
|-----|---------|-------|-----------|
| All | `draft` + `sent` + `approved` only (excludes in-production, completed, order) | count | All roles |
| Draft | `ticket_status = 'draft'` | count | All roles |
| Sent | `ticket_status = 'sent'` | count | All roles |
| Won | `ticket_status = 'approved'` (legacy — `approved` status retired; tab remains for historical records) | count | All roles |
| Routed to Sales | `ticket_status = 'routed'` | count | Sales + Admin (all) · SDR (own HVT only) |

**List scope:** SDR — `created_by_id = session user` on all tabs. Sales — own quotes + company-wide **Routed to Sales** queue. **Admin** — all records; optional **team member filter** (`?user_id=`) on Leads, Quotes, Orders, and Completed narrows to that user's work.

### `/orders` — Orders

**Date filter (May 2026):** Same `DashboardDateRangeFilter` as Quotes — default **Last 30 Days**; filters by `created_at` **server-side**. **Tab badges** from page-data `counts`; sidebar nav badge stays all-time scoped total.

**Column sort (May 2026):** Created by, Balance Due, Due Date, Status, Payment — server-side via `?sort=`.

**Pagination (May 2026):** Default 25 rows; `ListPagination` (25 / 50 / 100).

Includes **`order`**, **`in_production`**, and **`cancelled`** tickets. **SDR / Sales list scope:** `created_by_id = session user` (via `scopeJobTicketsQuery()`). Evidence-pending orders are **included** for the ticket owner with status **Awaiting payment confirmation**; accountants also see them on **`/payments`**.

| Tab | Content | Badge |
|-----|---------|-------|
| All | `order` + `in_production` + `cancelled` | count — **default tab** |
| Pending Payment | `ticket_status = 'order'` (includes evidence-pending for owner) | count |
| In Production | `ticket_status = 'in_production'` | count |
| Cancelled | `ticket_status = 'cancelled'` | count |

List API: `GET /api/orders/page-data` → `{ orders, counts, pagination }`. Tab badge counts from API `counts` (same filters as list, excluding `limit`/`offset`). Sidebar `/orders` badge stays all-time scoped total.

Row click → `/orders/[id]`.

### `/payments` — Payment evidence (Accountant + Admin)

**Mount:** `GET /api/payments/page-data` — returns pending list, approved list, and tab counts in one response.

| Tab | Content | Badge | Filter |
|-----|---------|-------|--------|
| Pending approval | Customer proof awaiting accountant confirm | `counts.pending` | `payment_evidence_url` set, `payment_evidence_reviewed_at` null |
| Approved | Evidence already reviewed — **View evidence** only (no Confirm) | `counts.approved` | `payment_evidence_url` set, `payment_evidence_reviewed_at` set |

Both tabs include **`sent`**, **`order`**, **`in_production`**, and **`completed`** tickets. Row click → `/payments/[id]`. Sidebar badge = pending count only (`GET /api/sidebar-counts`). Accountant dashboard KPI: `GET /api/payments/counts` → `pending_evidence`.

### `/completed` — Completed (SDR own scope; Accountant + Admin all)

| Content | Filter |
|---------|--------|
| All completed | `ticket_status = 'completed'` — SDR / Sales: `created_by_id` matches session user only |

**Date filter:** `DashboardDateRangeFilter` — default **Last 30 Days**; filters list **server-side** by completion date (`updated_at`); sidebar completed badge stays all-time total.

**Pagination (May 2026):** Default 25 rows; server-side search, date, admin team filter.

Row click → `/completed/[id]`. Mount: `GET /api/completed/page-data`; counts-only: `GET /api/completed/counts`.

### `/crm` — Customer registry

**List API:** `GET /api/crm/page-data` — paginated (default 25 rows); server-side search, status, heat filters. **`GET /api/customers`** used only for merge search and Add Customer (not the list page).

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

Built, accessible to roles granted `/activity-log` in the permission matrix (admin has it by default).

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
| `/q/[token]` | Customer portal (public) |
| `/settings` | Account Settings |
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
