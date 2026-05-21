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
    ├── dashboard/page.tsx            ✓ EXISTS — role router (SDR / Sales / Admin / Accountant dashboards)
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
    │   ├── page.tsx                  ✓ EXISTS — Orders list (All / Pending Payment / Cancelled; excludes in-production, evidence-pending)
    │   └── [id]/page.tsx             ✓ EXISTS — Order detail (QuoteDetail context="order")
    │
    ├── payments/
    │   ├── page.tsx                  ✓ EXISTS — Accountant payment review queue (accountant + admin)
    │   └── [id]/page.tsx             ✓ EXISTS — Payment review detail (context="payment")
    │
    ├── production/
    │   ├── page.tsx                  ✓ EXISTS — In Production list (accountant + admin)
    │   └── [id]/page.tsx             ✓ EXISTS — Production detail (context="production")
    │
    ├── completed/
    │   ├── page.tsx                  ✓ EXISTS — Completed orders list (accountant + admin)
    │   └── [id]/page.tsx             ✓ EXISTS — Completed detail (context="completed")
    │
    ├── notifications/page.tsx        ✓ EXISTS — Activity Log
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
                                        integrations  → IntegrationsSection (Twilio SMS ✅ live, Instantly AI ✅ live, Stripe + Zelle — placeholder) ✅
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
✓ Orders                           /orders         (badge: sent/active orders)

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
✓ Orders                           /orders         (badge: sent/active orders)

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
✓ Payments                         /payments         (badge: pending evidence)
✓ In Production                    /production       (badge: in production count)
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
✓ Orders                           /orders         (badge: active orders)
✓ Payments                         /payments       (admin only — optional queue access)
✓ In Production                    /production
✓ Completed                        /completed

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
| In Production (`/production`) | `Factory` |
| Completed (`/completed`) | `PackageCheck` |
| Settings (personal) | `Settings` |
| Admin Panel | `ShieldCheck` |
| Users (admin section) | `Users` |
| Roles & Permissions | `KeyRound` |
| Dropdown Options | `ListFilter` |
| Notifications Broadcast | `Megaphone` |
| Audit Log | `ClipboardList` |
| Notification Bell | `Bell` |

---

## Tab URL Convention

All tabs are reflected in the URL via `?tab=` query param. This enables bookmarking and back-button navigation.

```
/leads              → defaults to ?tab=all
/leads?tab=all      → All Leads
/leads?tab=on-hold  → On Hold
/leads?tab=directed → Directed to Sales
/leads?tab=rejected → Rejected

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

/orders             → defaults to Pending Payment tab (in-page state; no URL param yet)
/orders             → tabs: All | Pending Payment | Cancelled

/payments             → Accountant payment review queue (no tabs)

/production           → In Production tabs: All | Balance Due

/completed            → Completed orders (search only, no tabs)
```

Tab switches use `router.replace` (not `router.push`) — no browser history pollution.

---

## Detail routes (shared QuoteDetail component)

| Route | `context` prop | Back navigates to |
|-------|----------------|-------------------|
| `/quotes/[id]` | `quote` | `/quotes` |
| `/orders/[id]` | `order` | `/orders` |
| `/payments/[id]` | `payment` | `/payments` |
| `/production/[id]` | `production` | `/production` |
| `/completed/[id]` | `completed` | `/completed` |

All non-draft detail views use **Overview + History** tabs and shared overview sections (`ticket-detail-overview.tsx`).

---

## Tab Structure within Pages (legacy section header kept below)

### `/leads` — SDR Lead Pipeline

| Tab | Content | Badge |
|-----|---------|-------|
| Inbox | `status = 'Pending'`, `is_inbox = true` | count |
| On Hold | `status = 'On Hold'` | count |
| Directed to Sales | `status = 'Routed to Sales'` (just routed, not yet claimed) | count |
| Rejected | `status = 'Rejected'` | — |
| Won | `sales_status = 'Won'` — shows leads that converted to orders. SDR sees own; admin sees all. Table shows order reference, total, and closer's name. | count |

### `/sales` — Sales Pipeline

| Tab | Content | Badge |
|-----|---------|-------|
| Pipeline | `status = 'Routed to Sales'` AND `sales_status IN ('Ongoing', 'Quote Sent')` | count |
| On Hold | `sales_status = 'On Hold'` | count |
| Rejected | `status = 'Rejected'` and `prev_status = 'Routed to Sales'` — leads rejected from the sales pipeline. Admin sees all; Sales rep sees only their own. | count |

### `/quotes` — Quoted Requests

| Tab | Content | Badge | Visible to |
|-----|---------|-------|-----------|
| All | `draft` + `sent` + `approved` only (excludes in-production, completed, order) | count | All roles |
| Draft | `ticket_status = 'draft'` | count | All roles |
| Sent | `ticket_status = 'sent'` | count | All roles |
| Won | `ticket_status = 'approved'` (legacy — `approved` status retired; tab remains for historical records) | count | All roles |
| Routed to Sales | `ticket_status = 'routed'` | count | Sales + Admin only |

### `/orders` — Orders

> Only `ticket_status = 'order'` or `'cancelled'`. Tickets with pending payment evidence or already in production/completed appear on `/payments`, `/production`, or `/completed` instead.

| Tab | Content | Badge |
|-----|---------|-------|
| All | `order` + `cancelled` (excludes evidence-pending) | count |
| Pending Payment | `ticket_status = 'order'` (excludes evidence-pending) — default tab | count |
| Cancelled | `ticket_status = 'cancelled'` | count |

### `/payments` — Payment review (Accountant + Admin)

| Content | Filter |
|---------|--------|
| Pending evidence | `payment_evidence_url IS NOT NULL` and not yet confirmed |

Row click → `/payments/[id]`. Counts: `GET /api/payments/counts`.

### `/production` — In Production (Accountant + Admin)

| Tab | Content |
|-----|---------|
| All in Production | `ticket_status = 'in_production'` |
| Balance Due | in production + unpaid/partial balance |

Row click → `/production/[id]`. Counts: `GET /api/production/counts`.

### `/completed` — Completed (Accountant + Admin)

| Content | Filter |
|---------|--------|
| All completed | `ticket_status = 'completed'` |

Row click → `/completed/[id]`. Counts: `GET /api/completed/counts`.

### `/admin/settings/users`

No sub-tabs. Single table view with filters (search, role filter, show inactive toggle).

---

## Activity Log / Notifications Page

`/notifications` — built, accessible to all roles via DB-driven page permissions.

- Shows the system `activities` table — all lead actions, customer merges, etc.
- Columns: Who (name + role pill) | Action (human-readable label) | Lead / Customer | When (relative, hover for absolute)
- Paginated 50 per page with "Load more" button; total event count in header
- Mobile card layout below `sm` breakpoint
- Live-refreshes when `bazaar:activities-changed` event fires
- API: `GET /api/admin/activity-log?limit=50&offset=0` (admin-auth required)

> **Notification Bell (V2 — not yet built):** Per-user unread count in the sidebar, popover feed, and Supabase Realtime subscription. Planned after Broadcast Notifications.

---

## Breadcrumbs / Page Titles

Each page has a simple `<h1>` page title. No breadcrumbs needed given the shallow route structure.

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
| `/payments` | Payments |
| `/payments/[id]` | Payment Review |
| `/production` | In Production |
| `/production/[id]` | In Production |
| `/completed` | Completed Orders |
| `/completed/[id]` | Completed Order |
| `/q/[token]` | Customer portal (public) |
| `/settings` | Account Settings |
| `/admin` | Admin (Overview) |
| `/admin/settings/users` | Users |
| `/admin/settings/roles` | Roles & Permissions |
| `/admin/settings/dropdowns` | Dropdown Options |
| `/notifications` | Activity Log |
| `/admin/settings/integrations` | Integrations |
| `/notifications` | Activity Log |

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
