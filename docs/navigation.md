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
│   └── q/[token]/page.tsx            ✓ EXISTS — customer-facing quote/invoice page
│                                       No login required — proxy.ts allows /q/ paths
│                                       Shows: line items, pricing, Payment Schedule (partial prepay),
│                                       payment methods, "Confirm & Accept" CTA (sent status only)
│
└── (app)/
    ├── layout.tsx                    ✓ EXISTS (sidebar + mobile nav shell)
    │
    ├── dashboard/page.tsx            ✓ EXISTS — role router (SDR / Sales / Admin dashboards)
    │
    ├── leads/page.tsx                ✓ EXISTS (SDR + Admin only)
    │   └── Tabs: All Leads | On Hold | Directed to Sales | Rejected | Won (shows orders from SDR's leads)
    │
    ├── sales/page.tsx                ✓ EXISTS (Sales + Admin only)
    │   └── Tabs: Pipeline | On Hold | Rejected
    │
    ├── crm/page.tsx                  ✓ EXISTS (all roles)
    │
    ├── quotes/
    │   ├── page.tsx                  ✓ EXISTS — Quoted Requests list (QuotesPage component)
    │   │   └── Tabs: All | Draft | Sent | Won | Routed to Sales (sales/admin only)
    │   ├── new/page.tsx              ✓ EXISTS — New Quote form (?lead_id=uuid or CRM params optional)
    │   └── [id]/page.tsx             ✓ EXISTS — Quote/Order detail + edit
    │
    ├── orders/page.tsx               ✓ EXISTS — Orders list (OrdersPage component)
    │   ├── Tabs: All | Active | Cancelled
    │   └── [id]/page.tsx             ✓ EXISTS — Order detail (reuses QuoteDetail); record locked for non-admins after customer confirmation; Payment Link Bar; payment status badge in header; mobile-responsive
    │
    ├── notifications/page.tsx        ✓ EXISTS — Activity Log (ActivityLogSection); paginated, mobile-card, live refresh
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

### Admin Sidebar

```
BAZAARPRINTING

─── Main ───────────────────────
✓ Dashboard                        /dashboard
✓ Leads                            /leads          (badge: inbox count)
✓ Pipeline                         /sales          (badge: pipeline count)
✓ CRM                              /crm
✓ Quoted Requests                  /quotes         (badge: active quotes)
✓ Orders                           /orders         (badge: sent/active orders)

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

/orders             → defaults to ?tab=all
/orders?tab=all     → All
/orders?tab=active  → Active
/orders?tab=cancelled → Cancelled
```

Tab switches use `router.replace` (not `router.push`) — no browser history pollution.

---

## Tab Structure within Pages

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
| All | All non-order, non-routed tickets | count | All roles |
| Draft | `ticket_status = 'draft'` | count | All roles |
| Sent | `ticket_status = 'sent'` | count | All roles |
| Won | `ticket_status = 'approved'` (legacy — `approved` status retired; tab remains for historical records) | count | All roles |
| Routed to Sales | `ticket_status = 'routed'` | count | Sales + Admin only |

### `/orders` — Orders

> Only tickets with `ticket_status = 'order'` appear here. Draft, sent, approved, and routed tickets stay on the Quotes page.

| Tab | Content | Badge |
|-----|---------|-------|
| All | `ticket_status IN ('order', 'cancelled')` | count |
| Active | `ticket_status = 'order'` | count |
| Cancelled | `ticket_status = 'cancelled'` | count |

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

`components/mobile-nav.tsx` already exists. It will be updated with the same role-aware nav items as the sidebar. The drawer pattern and sign-out behavior remain unchanged.

---

## `proxy.ts` Path Classifications

Paths that bypass the auth/AAL2 check (already defined), plus new additions:

```typescript
const AUTH_PATHS = [
  '/login',
  '/forgot-password',
  '/reset-password',
  '/setup-2fa',
  '/verify-2fa',
  '/change-password',    // ← new: temp password change (allowed after AAL1, before AAL2 check)
]
const PUBLIC_PREFIXES = ['/_next', '/favicon', '/api/auth']
```

**Note on `/change-password`:** This path is intercepted AFTER the AAL2 check but BEFORE the role permission check. A user with `must_change_password = true` is redirected here regardless of their role or which page they requested.

All `(app)` routes go through the full proxy check (session → AAL2 → `must_change_password` → role permission gate).
