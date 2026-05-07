# BazarCRM — Session Summary & Complete Plan
**Session date:** May 6–7, 2026
**Status:** All 6 MVP phases built + CRM customer profiles + Roles Editor + testing/polish pass complete. Ready for user testing.

---

## What Was Accomplished (All Sessions to Date)

Starting point: BazarCRM had only an auth scaffold (login, 2FA, session gate). No database, no pages, no features.

### Phase 1–6 (MVP) — Complete
- Full DB schema with RLS, indexes, triggers, views, seed data (23 migrations)
- Auth additions: change-password, is_active check, must_change_password, DB-driven route RBAC
- SDR Leads page — All Leads, On Hold, Directed to Sales, Rejected tabs; Manual Add Lead with dedup lookup; Verify Drawer (lock + hold/reject/route/resume)
- Sales Pipeline page — Unclaimed, On Hold, Rejected tabs; Sales Drawer (lock + hold/reject/claim)
- Dashboard — role-scoped KPI cards (SDR / Sales / Admin), period selector, quick actions
- Admin panel — Users section (create/edit/deactivate), Settings tabs, Roles & Permissions matrix

### Post-MVP: CRM + Roles Editor — Complete
- `/crm` — customer list with search, status filter, heat filter, count badge
- `/crm/customers/[id]` — customer profile with edit modal, lead history table
- Merge Duplicate Customers — two-step modal + API (moves leads & activities, deletes duplicate)
- `/admin/settings/roles` — role list, create/delete custom roles, permission matrix toggle

### Testing & Polish Pass — Complete
- Product Interests UI: tag-picker replaces checkbox grid
- CRM filter bar: removed duplicate "All" button, heat pills toggle
- Verify drawer: context-aware footer (Resume replaces On Hold when lead is already on hold)
- Hold timestamp bug fix (`hold_until || null`)
- Leads tab badges: all tabs show counts before clicking
- Sidebar badges: role-aware red count pills on nav items, refresh on action via custom event
- SDR lead scoping: On Hold / Directed to Sales / Rejected tabs scoped to current SDR's own leads

---

## The Application

**BazaarPrinting CRM** — internal CRM for a B2B printing company.

**Two core roles for the MVP:**
- **SDR** — adds leads, validates them, routes to Sales, holds or rejects
- **Sales Rep** — works leads routed by SDR, holds, rejects, or converts to order (future)

**Admin role** — full access, manages users, roles, and settings (built after MVP)

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16, App Router, React 19, TypeScript 5 strict |
| Auth | Supabase Auth — email/password + TOTP 2FA (AAL2) — **already built** |
| Database | Supabase Postgres with Row Level Security |
| Styling | Tailwind CSS v4 + design system tokens (Navy/Gold light, Charcoal/Orange dark) |
| UI | shadcn (base-nova) + Lucide icons |
| Hosting | Vercel |
| Session gate | `proxy.ts` (Next.js 16 Proxy — never `middleware.ts`) |

---

## What's Already Built (Auth Scaffold)

- `app/(auth)/login/page.tsx` — email + password login
- `app/(auth)/setup-2fa/page.tsx` — TOTP enrollment with QR code
- `app/(auth)/verify-2fa/page.tsx` — TOTP 6-digit challenge
- `components/sidebar.tsx` — collapsible desktop nav
- `components/mobile-nav.tsx` — mobile top bar + drawer
- `components/theme-provider.tsx` — light/dark toggle
- `proxy.ts` — session + AAL2 enforcement
- `lib/supabase/client.ts` and `admin.ts`
- `app/(app)/dashboard/page.tsx` — stub (returns null)
- `app/(app)/settings/page.tsx` — stub (returns null)

---

## Documentation Files Created

All files live in `/Users/nilay/Documents/MyGit/BazarCRM/docs/`

| File | Contents |
|------|----------|
| `schema.md` | Full DB schema — 8 tables, all SQL, indexes, RLS, triggers, migration order |
| `api-contract.md` | Every Route Handler — method, path, body, business rules, response |
| `rbac.md` | Role definitions, route matrix, DB matrix, proxy.ts extension (DB-driven) |
| `navigation.md` | Full route tree, sidebar per role, tab URL conventions |
| `types.md` | All canonical TypeScript types |
| `component-architecture.md` | Server/client split, shared vs role-specific components, data flow |
| `mvp-scope.md` | Exact MVP boundary — what's in and out |
| `feature-specs/leads-sdr.md` | SDR pipeline, Verify Drawer, customer dedup flow |
| `feature-specs/leads-sales.md` | Sales pipeline, Sales Drawer |
| `feature-specs/crm.md` | Contact registry (deferred) |
| `feature-specs/tickets.md` | Quotes & Orders (deferred) |
| `feature-specs/activity.md` | History timeline |
| `feature-specs/statistics.md` | Analytics dashboard (deferred) |
| `feature-specs/notifications.md` | Notification bell (deferred) |
| `feature-specs/admin.md` | Admin panel — user mgmt, roles editor (deferred) |
| `feature-specs/dashboard.md` | KPI dashboard |
| `feature-specs/lead-locking.md` | Lead locking spec |

---

## Key Architectural Decisions

### 1. Dynamic Role-Permission System
- `roles` table — Admin can create custom roles (e.g. "Manager")
- `pages` table — registry of all app routes
- `role_permissions` — many-to-many: which roles can access which pages
- `proxy.ts` reads permissions from DB on every request
- Adding a new page = add a row to `pages` table, grant to roles in Settings — **no code change**
- 3 system roles (SDR, Sales, Admin) are seeded and locked — cannot be deleted

### 2. User Creation — No Email Required
- Admin creates users with a **temporary password** (no email sent)
- Uses `supabase.auth.admin.createUser({ email_confirm: true })`
- `must_change_password = true` set on `user_profiles`
- `proxy.ts` intercepts: forces `/change-password` before any page loads
- Admin tells user their temp password directly (Slack, in person, etc.)
- After changing password → TOTP 2FA setup → dashboard

### 3. Lead Locking
- When a user opens a lead drawer → `POST /api/leads/[id]/lock` fires immediately
- Other users see the lead in **read-only mode** with "Being worked by [Name]" banner
- **No auto-expiry** — lock persists until user closes drawer OR Admin force-releases
- Admin always overrides any lock
- Enforced in every write Route Handler (lock guard check)
- DB fields: `locked_by_id`, `locked_at` on `leads` table

### 4. Terminal Reject States
- `status = 'Rejected'` (SDR reject) — **only Admin can change**
- `sales_status = 'Rejected'` (Sales reject) — **only Admin can change**
- Route Handlers return `403` with `code: 'LEAD_REJECTED_TERMINAL'` for non-admin attempts
- Admin sees "Admin Override" banner in the drawer

### 5. Customer Deduplication
- `customers` table — **no unique constraint** on phone or email (multiple profiles per phone allowed)
- Phone is the primary lookup key; email is secondary
- When SDR types a phone → live lookup (600ms debounce)
- 0 matches: fill form fresh → new customer on submit
- 1 match: banner "Existing customer found" → Use info / Continue new
- 2+ matches: modal with list of all matches → pick one or add new
- On Hold/Route/Reject action: prompt "Update customer profile?" or "Save as customer?"

### 6. Lead Status Flow
```
INBOX/ALL LEADS (Pending)
  └─ SDR opens + locks
       ├─ Validated (working)
       │    ├─ On Hold → Resume → Validated | Reject | Route to Sales
       │    ├─ Route to Sales → Sales sees it
       │    └─ Reject → TERMINAL (Admin only can change)

SALES PIPELINE (Routed to Sales)
  └─ Sales opens + locks
       ├─ Ongoing
       │    ├─ On Hold → Resume → Ongoing ONLY
       │    ├─ Reject → TERMINAL
       │    └─ Convert to Order → (future)
```

### 7. SDR vs Sales Page Separation
- Two separate routes: `/leads` (SDR) and `/sales` (Sales)
- `proxy.ts` redirects wrong-role users to their correct page (not just blocks)
- Same `LeadTable` shared component — different column configs and action buttons
- Separate drawers: `VerifyDrawer` (SDR) vs `SalesDrawer` (Sales)

---

## Database Schema Summary

```
roles               id, name, display_name, is_system
pages               id, route, display_name, icon, section, sort_order
role_permissions    role_id → roles, page_id → pages
user_profiles       id → auth.users, role_id → roles, full_name,
                    is_active, must_change_password
customers           id, first_name, last_name, email, phone (digits-only),
                    company, industry, website, heat_tag
                    ⚠ NO unique constraints on phone or email
leads               id, customer_id → customers, source, brand, authority,
                    status, sales_status, is_inbox,
                    sdr_id, assigned_sdr_id, sales_owner_id,
                    interests(jsonb), quantities(jsonb),
                    urgency (High/Medium/Low),
                    is_returning_customer, sdr_comment,
                    quote_total, quote_channel, quote_destination,
                    hold fields (reason, notes, until, at, by_id, prev_status),
                    rejection fields (reason, notes),
                    locked_by_id, locked_at
activities          id, customer_id, lead_id, ticket_id,
                    type, channel, by_user_id, payload(jsonb)

lookup_values       id, category, value, label, sort_order, is_active
                    categories: source, industry, urgency, hold_reason,
                    reject_reason, route_reason, sales_drop_reason
                    All seeded from POC data. Admin can edit from Settings.
                    GET /api/lookups?categories=source,industry  (all roles)
                    POST/PATCH /api/admin/lookups  (Admin only)

--- DEFERRED (schema defined but migrations not run yet) ---
job_tickets         quotes + orders
notifications       per-user notification feed
```

**Migration order:** 001_create_roles → 002_create_pages → 003_create_role_permissions → 004_create_user_profiles → 005_create_customers → 006_create_leads → 007_create_activities → ... → 019_seed_dev

---

## Lead Form Fields (Complete Reference)

Fields in the Manual Add Lead modal and Verify Drawer:

| Field | Required | Where |
|-------|----------|-------|
| Phone Number | Yes | Add modal + Drawer |
| Email Address | No | Add modal + Drawer |
| First Name | Yes | Add modal + Drawer |
| Last Name | No | Add modal + Drawer |
| Source | Yes | Add modal + Drawer |
| Created | Auto | Add modal (read-only) |
| Authority | No | Add modal + Drawer — "Decision Maker?" Yes / No |
| Company Name | No | Add modal + Drawer |
| Industry | Yes | Add modal + Drawer |
| Website / Social | No | Add modal + Drawer |
| Urgency | No | Add modal + Drawer — Not Defined (null) / High / Medium / Low |
| Returning Customer | No | Add modal + Drawer |
| Verify Lead Comment | No | Add modal + Drawer |
| Brand | No | Drawer only |
| Product Interests | No | Drawer only |
| Quantities | No | Drawer only |

---

## MVP Build Plan — 5 Phases

**Everything else is deferred until MVP is stable and in use.**

### Phase 1 — DB Foundation
- 19 Supabase migration files
- `lib/types/index.ts` — canonical TypeScript types
- `proxy.ts` — extend for RBAC + `is_active` + `must_change_password`
- `app/(auth)/change-password/page.tsx` — forced password change
- `app/api/auth/change-password/route.ts`
- `components/sidebar.tsx` — role-aware nav from DB
- First admin: created manually in Supabase Dashboard + SQL to assign admin role

### Phase 2 — Minimal User Management ✓ COMPLETE
- `app/(app)/admin/page.tsx` — Card grid overview (4 sections, all clickable)
- `app/(app)/admin/layout.tsx` — Admin shell with Overview/Settings sub-nav
- `app/(app)/admin/settings/layout.tsx` — Settings tab bar (Users, Roles, Dropdowns, Notifications)
- `app/(app)/admin/settings/[tab]/page.tsx` — Tab switcher; renders UsersSection for `users` tab
- `components/admin/users-section.tsx` — Full user management table + Add User modal
- `app/api/admin/users/route.ts` — GET all users
- `app/api/admin/users/create/route.ts` — POST create user
- `app/api/admin/users/[id]/route.ts` — PATCH update/deactivate user

### Phase 3 — SDR Leads Page
- `app/(app)/leads/page.tsx` + `components/leads-page.tsx`
- `components/verify-drawer.tsx`
- `components/hold-sub-form.tsx`
- `components/ui/status-pill.tsx`
- All lead API routes (7 endpoints)
- Customer API routes (lookup, create, update)

### Phase 4 — Sales Leads Page
- `app/(app)/sales/page.tsx` + `components/sales-page.tsx`
- `components/sales-drawer.tsx`
- Reuses all lead API routes from Phase 3

### Phase 5 — Basic Dashboard
- Role-aware KPI count cards (no charts)
- Replaces current `return null` stub

---

## Deferred Features (in order)

1. Activity timeline — full `HistoryTimeline` with icons
2. CRM — customer registry, browse, edit
3. Tickets / Quote builder / Orders
4. Statistics — Recharts dashboard
5. Full Admin panel — Roles editor, Settings (products/sources), Audit log
6. Notifications — Supabase Realtime bell
7. Email / SMS outreach abstraction
8. AI/webhook lead ingestion

---

## How to Start Phase 1

1. Open Supabase Dashboard → SQL Editor
2. Run migrations from `supabase/migrations/` in order (001 → 019)
3. Create first admin user:
   - Auth tab → Add user → enter email + password
   - SQL Editor:
     ```sql
     insert into public.user_profiles (id, role_id, full_name, is_active, must_change_password)
     select '[UUID from Auth tab]', r.id, 'Admin', true, false
     from public.roles r where r.name = 'admin';
     ```
4. Log in → 2FA setup → `/admin/settings/users` → create SDR and Sales users
5. Test the full user creation + first-login flow before building any feature pages

---

## Docs Index

| What you need | Where to look |
|---------------|--------------|
| DB schema + SQL | `docs/schema.md` |
| API endpoints | `docs/api-contract.md` |
| Who can access what | `docs/rbac.md` |
| Page routes + sidebar | `docs/navigation.md` |
| TypeScript types | `docs/types.md` |
| Component structure | `docs/component-architecture.md` |
| MVP scope boundary | `docs/mvp-scope.md` |
| SDR page behavior | `docs/feature-specs/leads-sdr.md` |
| Sales page behavior | `docs/feature-specs/leads-sales.md` |
| Lead locking | `docs/feature-specs/lead-locking.md` |
| All changes | `docs/CHANGELOG.md` |
