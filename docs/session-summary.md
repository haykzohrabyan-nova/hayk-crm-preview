# BazarCRM — Session Summary & Complete Plan
**Last updated:** May 13, 2026
**Status:** MVP complete + CRM + Roles Editor + Tickets (Quotes & Orders) fully built + Admin panel fully built + High-Value Threshold SDR routing system built + Quote creation flow redesigned + Realtime live updates on Quotes page + all documentation audited and updated. Ready for end-to-end testing.

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

### Supabase Realtime Live Updates — Fixed & Documented (2026-05-10)

Two root-cause bugs were found and fixed that prevented real-time DB change events from reaching the admin's browser:

- **Bug 1 — RLS `SECURITY DEFINER` trap:** The `leads` table SELECT policies used `current_user_role()`, a `SECURITY DEFINER` function. In the Supabase Realtime evaluation context, this runs as `postgres` so `auth.uid()` returns `NULL` — every RLS check failed and events were silently dropped server-side. Fixed by replacing `current_user_role()` calls with inline `EXISTS` subqueries (`migration 038_fix_leads_rls_for_realtime.sql`).
- **Bug 2 — JWT timing trap:** `sidebar.tsx` was calling `.subscribe()` synchronously before `getSession()` resolved. Channels opened without a JWT, making the Realtime server treat them as unauthenticated. Fixed by moving all `.channel().subscribe()` calls inside the `getSession().then()` callback and removing manual `setAuth`/`onAuthStateChange` calls (those conflicted with `createBrowserClient`'s automatic JWT management).
- **Migration 037:** `GRANT SELECT ON public.leads TO authenticated` and same for `activities` — required for Realtime's RLS evaluation to succeed.
- **Sidebar badge count fixed:** `/api/sidebar-counts` now shows only **unclaimed** leads (`locked_by_id IS NULL`) for both admin and SDR roles, not total leads.
- **Admin dashboard Total Leads card:** now shows Open and Claimed sub-counts (`open_leads`, `claimed_leads`) alongside the period-scoped total. Realtime listener added — KPIs silently re-fetch whenever `bazaar:leads-changed` fires (no skeleton flash).
- **`docs/realtime-live-updates.md`:** fully rewritten with both bug explanations, correct RLS policy templates, subscription pattern guide, step-by-step checklist for new entities (e.g. orders), and complete debugging checklist.
- **`docs/api-contract.md`:** updated admin KPI response shape to include `open_leads`, `claimed_leads`, and the full `sdr_performance`, `rejection_reasons`, `source_breakdown` fields.
- **`docs/component-architecture.md`:** added Realtime Listeners table and `bazaar:leads-changed` row in Data Fetching Strategy.

### SDR History Tab, Sales Notes & Dashboard Enhancements (2026-05-09)
- **Verify Drawer History tab:** third tab added to the SDR's Verify Drawer (Lead Info | Quote | History). Same lazy-load pattern as Sales Drawer — fetches `GET /api/leads/[id]/activities` on first open. Full activity history visible even after a lead moves to Sales.
- **Sales Notes field:** `sales_notes text` column added to `leads` table (`migration 034`). Sales reps have a dedicated textarea in the Sales Drawer Lead Info tab. Changes saved via `PATCH /api/leads/[id]` and auto-logged as `lead_edited` activity entry.
- **Sales Pipeline tab renamed:** "Rejected (SDR)" → "Rejected" — the old label was misleading (these leads were rejected by Sales, not by SDRs).
- **Reset migration fix:** `033_reset_leads_to_pending.sql` corrected to set `is_inbox = false` (was `true`, which hid all leads from the workspace after reset).
- **`docs/TODO.md` created:** deferred item TODO-001 — Admin Override for Terminal Leads, with full problem description, fix sketch, and note that Won/Dropped must be handled separately after Tickets.
- **Dashboard — SDR:** two new KPI cards: Quote Value and My Share %.
- **Dashboard — Admin:** three new sections: SDR Performance Table (period-scoped, per-SDR stats), Rejection Reasons breakdown (all-time, red bars), Lead Sources breakdown (all-time, gold bars). No chart library — pure CSS bars matching the design system.

### Mobile Nav — Fixed
- Rewrote `components/mobile-nav.tsx` from a hardcoded static list to role-based DB-driven pages (same logic as sidebar)
- Fixed admin-sub page filtering (was showing `/admin/users`, `/admin/roles` etc. in mobile menu)
- Added badge counts and `bazaar:refresh-counts` listener

### Tickets / Quotes & Orders — Complete (2026-05-12)
- Migrations 041–048: product catalog, extended job_tickets, admin RLS, order/quote lookup seed, company_settings, order sequence function, realtime for job_tickets, SKU lookup categories
- `lib/utils/ticket-math.ts` — QuoteSku interface, computePricing(), skuLineTotal(), formatCurrency()
- `lib/types/index.ts` — fully updated: QuoteSku (15 fields), JobTicket (40+ columns), TicketForm, CompanySettings, LookupCategory union (all categories)
- `/quotes/new` — `new-quote-form.tsx` — full 3-tab quote builder: Line Items (Color Mode, Sides, Roll Direction, Add-on Finishes, Design on File, Die Cut), Quote tab (all dropdowns admin-managed), Settings tab
- `/quotes/[id]` — `quote-detail.tsx` — full detail view + edit mode, 4-tab layout matching new-quote-form
- `/quotes` — `quotes-page.tsx` — 4-tab Quoted Requests list with counts, search, sort
- `/orders` — `orders-page.tsx` — 4-tab Orders list with counts, search, sort
- All dropdowns dynamically loaded from `lookup_values` via `/api/lookups`; `renderLookupOptions` helper prevents data loss for deactivated values
- Sidebar badges for `/quotes` and `/orders`
- `GET /api/lookups/products` — public product-type + material lookup for OrderDrawer

### Quote/Order UI Redesign & Customer Flow (2026-05-13)

Major UX improvements and business rule enforcement:

- **New Quote form — unified entry point**: 4-step wizard (Customer → Info → Line Items → Quote) when creating standalone. Customer tab hidden when entering from Lead (`?lead_id`) or CRM (`?first_name&last_name&...` params). Read-only lead/customer card shown on left sidebar instead.
- **Customer upsert**: customer data saved to `customers` table on "Save Draft" or "Save & Send Quote" — customers created via quotes now appear in CRM.
- **CRM "Add Quote" button**: new action on CRM page pre-fills customer params in URL → skips Customer tab, shows read-only customer card.
- **Customer info card on quote detail**: if no linked lead but customer exists, shows customer card (`CustomerInfoCard` component) on the left sidebar.
- **Validation**: required fields enforced per tab before advancing. Line Items requires ≥ 1 fully-filled item.
- **Orders page**: now shows only `ticket_status = 'order'` tickets. `draft`, `sent`, `approved`, `routed` stay on Quotes page. "New Order" button removed.
- **Sidebar counts**: Quotes badge = `draft+sent+approved` (SDR) or `draft+sent+approved+routed` (Sales/Admin). Orders badge = `order` status only.
- **UI polish**: pill/chip checkboxes, single-select payment methods, custom DatePicker, redesigned Adjustments card, "Order Flow" segmented control (Quote First / Direct Order), "Add Line Item" as full-width dashed button, `#f8fafc` page background, `Urgent` priority hidden from user dropdown.

### High-Value Threshold (HVT) SDR Routing — Complete (2026-05-13)

Full business rule implementation for routing high-value quotes from SDRs to Sales:

- **`routed` ticket status** added to `lib/types/index.ts` `TicketStatus` union
- **HVT modal in `new-quote-form.tsx`**: fires when SDR advances from Line Items → Quote tab and `pricing.final_total > company_settings.high_value_threshold`. Non-dismissible modal with 30-second countdown. On "OK" or timeout: saves as `routed`, redirects to `/quotes`.
- **HVT modal in `quote-detail.tsx`**: same block fires when SDR clicks "Save Changes" on an existing `draft` quote over threshold.
- **`routed` tickets hidden from SDR Quotes page** "All" tab count (correctly subtracted in `GET /api/tickets/counts`)
- **"Routed to Sales" tab** on `/quotes` — visible to Sales/Admin only. Shows Contact, Title, Total (warning color), Routed By (SDR name), Date, Claim button.
- **Claim action** (`PATCH /api/tickets/[id]` with `claim_ownership: true`): Sales/Admin only; sets `ticket_status = 'draft'` and `created_by_id = claimant`; once claimed it disappears from other Sales users' "Routed to Sales" tab.
- **Supabase Realtime on `quotes-page.tsx`**: direct `postgres_changes` channel (independent of sidebar) so cross-session updates (SDR routes → Sales sees it; Sales claims → others see it disappear) happen instantly without manual refresh.
- **Sidebar badge**: Sales/Admin `/quotes` badge includes routed count.
- **`GET /api/tickets`**: Sales/Admin receive all `routed` tickets enriched with `created_by_name`.
- **Migration `050_add_urgent_priority.sql`**: seeds 'Urgent' to `ticket_priority` lookup (system-set only; hidden from UI dropdown).
- **Migration `051_backfill_routed_status.sql`**: retroactively marks SDR-created draft quotes over threshold as `routed`.
- **`docs/feature-specs/tickets.md`**: fully rewritten to document all current behaviour.

### Admin Panel — Complete (2026-05-12)
- `/admin/settings/dropdowns` — fully built; 15+ categories (lead + order/quote + SKU)
- `/admin/settings/products` — product types + material library, full CRUD + link/unlink
- `/admin/settings/company` — EmailInput + PhoneInput components, ZIP digits-only, client-side validation
- `/admin/settings/integrations` — placeholder for Stripe + Zelle (configured buttons deferred)
- Admin overview card grid updated with Integrations card
- `components/ui/email-input.tsx` — added optional onBlur prop for external validation
- All phone fields use `PhoneInput`; all email fields use `EmailInput` — no inline duplicates

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

## Current Navigation (as of 2026-05-13)

| Route | Section | Built? |
|-------|---------|--------|
| `/dashboard` | main | ✅ Built — role router (SDR / Sales / Admin dashboards) |
| `/leads` | main | ✅ Built |
| `/sales` | main | ✅ Built |
| `/crm` | main | ✅ Built |
| `/crm/customers/[id]` | main | ✅ Built — full customer profile page |
| `/quotes` | main | ✅ Built — Quoted Requests list (4 tabs) |
| `/quotes/new` | main | ✅ Built — New Quote/Order form (3 tabs) |
| `/quotes/[id]` | main | ✅ Built — Quote/Order detail + edit (4 tabs) |
| `/orders` | main | ✅ Built — Orders list (4 tabs) |
| `/statistics` | main | ❌ Removed — Dashboard handles all KPIs and analytics |
| `/notifications` | main | ⏳ Spec preview |
| `/admin` | admin | ✅ Built — card grid overview |
| `/admin/settings/users` | admin-sub | ✅ Built |
| `/admin/settings/roles` | admin-sub | ✅ Built |
| `/admin/settings/dropdowns` | admin-sub | ✅ Built — all lead + order/quote categories |
| `/admin/settings/products` | admin-sub | ✅ Built — product types, materials, links |
| `/admin/settings/company` | admin-sub | ✅ Built — with EmailInput + PhoneInput validation |
| `/admin/settings/integrations` | admin-sub | ✅ Built — Stripe + Zelle placeholder |
| `/admin/settings/notifications` | admin-sub | ⏳ Spec preview |
| `/admin/settings/audit-log` | admin-sub | ⏳ Spec preview |

---

## Migrations (in order)

See `docs/schema.md` → Migration File Order for the full list (001–048). Key milestones:

| # | File | Purpose |
|---|------|---------|
| 001–021 | Core schema + seed | All base tables, RLS, indexes, triggers, views, functions, seed data |
| 022–033 | Nav + workflow fixes | Admin sub-pages, notifications page, lead reset, Realtime |
| 034 | `add_sales_notes_to_leads` | sales_notes field |
| 035–038 | Realtime | leads + activities realtime; RLS fix for realtime |
| 039 | `add_initial_interest_to_leads` | initial_interest field |
| 040 | `fix_activities_by_user_fkey` | activities FK → user_profiles |
| 041 | `create_products_catalog` | product_types, materials, material_groups, links (15 types, 37 materials) |
| 042 | `extend_job_tickets` | 28 new columns on job_tickets + order_sequence_counters |
| 043 | `fix_admin_rls_full_access` | admin full-access policies; no DELETE on tickets/leads |
| 044 | `seed_order_lookup_values` | 7 new lookup categories for order/quote dropdowns |
| 045 | `create_company_settings` | single-row company_settings table |
| 046 | `order_sequence_function` | increment_order_sequence() for ORD-YYYY-NNN |
| 047 | `enable_job_tickets_realtime` | REPLICA IDENTITY FULL + supabase_realtime for job_tickets |
| 048 | `add_sku_lookup_values` | color_mode, sides, roll_direction lookup categories |
| 049 | `remove_statistics_page` | deletes /statistics from pages table (Dashboard handles all analytics) |
| 050 | `add_urgent_priority` | seeds 'Urgent' to ticket_priority lookup (system-set only; hidden from user UI) |
| 051 | `backfill_routed_status` | retroactively sets ticket_status = 'routed' for SDR draft quotes over HVT threshold |

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
| Dashboard enhancements | Revenue from approved tickets surfaced on Dashboard KPIs. |
| Notifications | Supabase Realtime bell + feed. Lazy check for hold expiry + follow-up due in v1. |
| Admin: Broadcast Notifications | Send system messages to all users or by role. |
| Admin: Audit Log | Full activity history with filters and pagination. |
| Integrations | Stripe + Zelle configured (placeholder built; wiring deferred). |
| PDF Export | Quote/Order PDF with company logo from company_settings. |
| ~~High-value SDR block~~ | ✅ Done (2026-05-13) |
| Admin Override (terminal leads) | Admin can reopen Rejected/Won/Dropped leads (TODO-001). |
| Email / SMS outreach | Future — after Stats + Notifications. |
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
