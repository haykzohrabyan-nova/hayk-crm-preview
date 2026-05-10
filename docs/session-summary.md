# BazarCRM — Session Summary & Complete Plan
**Last updated:** May 9, 2026
**Status:** MVP complete + CRM + Roles Editor + testing/polish pass + spec preview system + Sales Pipeline history tab + Rejected tab bug fix. Ready for user testing.

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
- Product Interests UI: tag-picker (select + quantity rows) replaces checkbox grid
- CRM filter bar: removed duplicate "All" button, heat pills toggle correctly
- Verify drawer: context-aware footer (Resume replaces On Hold when lead is already on hold)
- Hold timestamp bug fix (`hold_until || null` — empty string was crashing Supabase)
- Leads tab badges: all tabs show counts before clicking via `/api/leads/workspace/counts`
- Sales tab badges: all tabs show counts before clicking via `/api/leads/sales-counts`
- Sidebar badges: role-aware red count pills on Leads and Sales nav items
- Counts refresh immediately after any action via `bazaar:refresh-counts` custom event
- SDR lead scoping: On Hold / Directed to Sales / Rejected tabs scoped to current SDR's own leads

### Design System & Code Quality — Complete
- All hardcoded hex values replaced with CSS variables (`var(--color-*)`) across all components
- New semantic tokens added to `globals.css` (danger-bg, success-bg, warning-bg, info-bg, neutral-bg + borders/text variants)
- `components/ui/urgency-pill.tsx` — reusable UrgencyPill component, replaces inline ternary logic in 5+ places
- `components/ui/status-pill.tsx` — fully tokenized
- `components/ui/spec-preview.tsx` — shared building blocks for spec preview pages
- Cursor rules added: `color-tokens.mdc`, `tab-counts.mdc`, `git-push-policy.mdc`, `mobile-table-cards.mdc`, `select-labels.mdc`

### Sales Pipeline — Rejected Tab Bug Fix & History Tab (2026-05-09)
- **Bug fixed:** Sales Pipeline Rejected tab was showing all system rejections (including SDR-rejected leads that never reached sales). Now uses `GET /api/leads/workspace?status=Rejected&prev_status=Routed+to+Sales` to show only leads rejected from within the sales pipeline.
- **`prev_status` on reject:** `PATCH /api/leads/[id]` now auto-saves `prev_status = current.status` when rejecting, enabling the above filter and the history label "Rejected from Sales pipeline".
- **`lead_rejected` payload enriched:** now includes `from: prevStatus` so the activity log shows the pipeline origin of every rejection.
- **`ActivityType` union fixed:** added `'lead_sales_claimed'` and `'lead_edited'` (both were used in code but missing from the type).
- **`GET /api/leads/[id]/activities`:** new endpoint — returns the full activity timeline for one lead, newest first, with `by_user.full_name` joined.
- **Sales Drawer History tab:** third tab in the drawer (alongside Lead Info and Order/Quote). Lazy-loads activities on first open. Renders a vertical timeline with colored dots, human-readable labels, optional notes, actor name, and relative timestamp.
- **`sales-counts` rejected badge:** now counts only `prev_status = 'Routed to Sales'` rejections so the badge matches the tab list.
- **Migration 033:** `033_reset_leads_to_pending.sql` — resets all leads to Pending/inbox for testing (clears all workflow state, truncates activities).

### Mobile Nav — Fixed
- Rewrote `components/mobile-nav.tsx` from a hardcoded static list to role-based DB-driven pages (same logic as sidebar)
- Fixed admin-sub page filtering (was showing `/admin/users`, `/admin/roles` etc. in mobile menu)
- Added badge counts and `bazaar:refresh-counts` listener

### Spec Preview System — Complete
All unbuilt pages now show their full feature spec as a styled in-app page instead of "coming soon":

| Page | Status |
|------|--------|
| `/tickets` | Spec preview — Quoted Requests, Orders, Order Drawer, PDF export, period filter |
| `/statistics` | Spec preview — SDR/Sales/Admin KPIs, charts, Recharts notes |
| `/notifications` | Spec preview — bell, real-time, all notification types |
| `/admin/settings/dropdowns` | Spec preview — categories, options table, API |
| `/admin/settings/notifications` | Spec preview — broadcast form, recent broadcasts |
| `/admin/settings/audit-log` | Spec preview — audit table, filters, pagination |
| `/admin/settings/company` | Spec preview — company info fields for PDF headers |
| `/admin/settings/products` | Spec preview — product types, materials, finishes |

### Navigation Cleanup — Complete
- `/settings` (personal account settings) removed from nav and DB — Admin manages passwords/2FA; theme is in sidebar
- Admin overview page updated: built sections show accent icon + "Open →"; unbuilt sections show "Planned" badge + "View spec →"
- Admin settings tab nav expanded with Audit Log, Company Info, Products tabs

### Build Gap Documentation — Complete
- `docs/feature-specs/leads-sdr.md` — "Build Status & Gaps" section added (6 deferred items with exact file/method to implement)
- `docs/feature-specs/leads-sales.md` — "Build Status & Gaps" section added (5 deferred items tied to Tickets phase)

---

## The Application

**BazaarPrinting CRM** — internal CRM for a B2B printing company.

**Roles:**
- **SDR** — adds leads, validates them, routes to Sales, holds or rejects
- **Sales Rep** — works leads routed by SDR, holds, rejects, or converts to order (future)
- **Admin** — full access, manages users, roles, and all settings

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16, App Router, React 19, TypeScript 5 strict |
| Auth | Supabase Auth — email/password + TOTP 2FA (AAL2) |
| Database | Supabase Postgres with Row Level Security |
| Styling | Tailwind CSS v4 + design system tokens (Navy/Gold light, Charcoal/Orange dark) |
| UI | shadcn (base-nova) + Lucide icons |
| Hosting | Vercel |
| Session gate | `proxy.ts` (Next.js 16 Proxy — never `middleware.ts`) |

---

## Current Navigation (as of 2026-05-07)

| Route | Section | Built? |
|-------|---------|--------|
| `/dashboard` | main | ✅ Built |
| `/leads` | main | ✅ Built |
| `/sales` | main | ✅ Built |
| `/crm` | main | ✅ Built |
| `/tickets` | main | ⏳ Spec preview |
| `/statistics` | main | ⏳ Spec preview |
| `/notifications` | main | ⏳ Spec preview |
| `/admin` | admin | ✅ Built |
| `/admin/settings/users` | admin-sub | ✅ Built |
| `/admin/settings/roles` | admin-sub | ✅ Built |
| `/admin/settings/dropdowns` | admin-sub | ⏳ Spec preview |
| `/admin/settings/notifications` | admin-sub | ⏳ Spec preview |
| `/admin/settings/audit-log` | admin-sub | ⏳ Spec preview |
| `/admin/settings/company` | admin-sub | ⏳ Spec preview |
| `/admin/settings/products` | admin-sub | ⏳ Spec preview |

---

## Migrations (in order)

| # | File | Purpose |
|---|------|---------|
| 001 | `create_roles` | roles table |
| 002 | `create_pages` | pages table |
| 003 | `create_role_permissions` | many-to-many |
| 004 | `create_user_profiles` | user profiles |
| 005 | `create_customers` | customers table |
| 006 | `create_leads` | leads table |
| 007 | `create_job_tickets` | tickets table |
| 008 | `create_activities` | activity log |
| 009 | `create_notifications` | notifications table |
| 010 | `create_lookup_values` | dropdown options |
| 011 | `create_indexes` | performance indexes |
| 012 | `enable_rls` | Row Level Security |
| 013 | `rls_policies` | RLS policies |
| 014 | `triggers` | auto-timestamps |
| 015 | `views` | DB views |
| 016 | `functions` | DB functions |
| 017 | `seed_system_roles` | SDR, Sales, Admin |
| 018 | `seed_pages` | all nav routes |
| 019 | `seed_role_permissions` | default permissions |
| 020 | `seed_lookup_values` | default dropdowns |
| 021 | `seed_dev` | dev test data |
| 022 | `fix_admin_subpages_section` | admin-sub fix |
| 023 | `admin_settings_routes` | admin settings routes |
| 024 | `add_notifications_page` | /notifications + admin deferred sub-pages |
| 025 | `remove_settings_page` | removes /settings from nav |

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
- DB fields: `locked_by_id`, `locked_at` on `leads` table

### 4. Terminal Reject States
- `status = 'Rejected'` (SDR reject) — **only Admin can change**
- `sales_status = 'Rejected'` (Sales reject) — **only Admin can change**
- Route Handlers return `403` with `code: 'LEAD_REJECTED_TERMINAL'` for non-admin attempts

### 5. Customer Deduplication
- `customers` table — **no unique constraint** on phone or email
- When SDR types a phone → live lookup (600ms debounce)
- 0 matches: fill form fresh → new customer on submit
- 1 match: banner "Existing customer found" → Use info / Continue new
- 2+ matches: modal with list → pick one or add new
- CRM: Merge Duplicate button on customer profile — moves all leads + activities, deletes duplicate

### 6. Lead Status Flow
```
ALL LEADS (Pending)
  └─ SDR opens + locks
       ├─ Validated → On Hold → Resume → Route to Sales | Reject
       ├─ Route to Sales → Sales Pipeline
       └─ Reject → TERMINAL

SALES PIPELINE (Routed to Sales)
  └─ Sales opens + locks
       ├─ Ongoing → On Hold → Resume (always → Ongoing)
       ├─ Reject → TERMINAL
       └─ Convert to Order → (Tickets phase)
```

### 7. Count Badges Pattern
- Every tabbed UI fetches counts from a dedicated API endpoint on mount
- Badges show on **all tabs** before the user clicks (not just the active tab)
- After any action: `window.dispatchEvent(new Event("bazaar:refresh-counts"))` refreshes all badges instantly
- Sidebar badges also use this event + 60s polling interval
- Rule: `.cursor/rules/tab-counts.mdc`

### 8. Design System
- All colors via CSS variables — never hardcoded hex
- Tokens defined in `app/globals.css` for light and dark themes
- Rule: `.cursor/rules/color-tokens.mdc`

---

## What's Next — Build Queue

| Feature | Notes |
|---------|-------|
| Tickets / Quote builder / Orders | Biggest phase — Order Drawer, line items, PDF export. Build Company Info + Products admin tabs first. |
| Statistics / Charts | Recharts. SDR, Sales, Admin views. Shared period filter with Tickets. |
| Notifications | Supabase Realtime bell + feed. Lazy check for hold expiry + follow-up due in v1. |
| Admin: Dropdown Options | Lookup values editor — sources, industries, hold/reject reasons. |
| Admin: Broadcast Notifications | Send system messages to all users or by role. |
| Admin: Audit Log | Full activity history with filters and pagination. |
| Email / SMS outreach | Future — after Tickets phase. |
| AI/webhook lead ingestion | Future. |

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
| SDR page behavior + gaps | `docs/feature-specs/leads-sdr.md` |
| Sales page behavior + gaps | `docs/feature-specs/leads-sales.md` |
| Lead locking | `docs/feature-specs/lead-locking.md` |
| Tickets spec | `docs/feature-specs/tickets.md` |
| Statistics spec | `docs/feature-specs/statistics.md` |
| Notifications spec | `docs/feature-specs/notifications.md` |
| Activity timeline spec | `docs/feature-specs/activity.md` |
| Admin panel spec | `docs/feature-specs/admin.md` |
| Dashboard spec | `docs/feature-specs/dashboard.md` |
| All changes | `docs/CHANGELOG.md` |
