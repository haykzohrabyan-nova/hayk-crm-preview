# Changelog

All notable changes to BazaarPrinting CRM are documented here.
Format: `## [version or date] — description`, newest first.

## [2026-05-07] — Add Quoted Requests and Orders as nav pages

### Added
- `app/(app)/quotes/page.tsx` — Quoted Requests spec preview (formal + informal quotes, Quote Drawer, line items, follow-up, Convert to Order)
- `app/(app)/orders/page.tsx` — Orders spec preview (order table, Order Drawer, PDF export via jspdf, API routes)
- `supabase/migrations/027_add_quotes_orders_pages.sql` — inserts `/quotes` and `/orders` into the `pages` table (sort_order 5 and 6); shifts Statistics to 7 and Notifications to 8

### Changed
- `app/(app)/tickets/page.tsx` — redesigned as a Tickets hub landing page with two cards (Quoted Requests · Orders) that link to their individual pages; replaced the previous monolithic spec preview

## [2026-05-07] — Remove /settings page from nav

### Removed
- `/settings` page removed from navigation — password resets and 2FA are Admin-managed; theme toggle lives in the sidebar; no use case for a personal settings page
- `supabase/migrations/025_remove_settings_page.sql` — deletes /settings from pages table and cleans up role_permissions rows

## [2026-05-07] — Add all planned pages with spec previews

### Added
- `app/(app)/notifications/page.tsx` — spec preview: bell popover, real-time setup, all notification types (lead_routed, hold reminder, follow-up due, system broadcast, lead_assigned v2)
- `supabase/migrations/024_add_notifications_page.sql` — seeds /notifications into main nav; seeds audit-log, company, products as admin-sub pages
- Admin Settings tabs: `audit-log`, `company`, `products` — full spec content for each (deferred from MVP)
- Admin Settings tabs: `dropdowns`, `notifications` — replaced "coming soon" stubs with full spec content

### Changed
- `components/admin/settings-tab-nav.tsx` — added Audit Log, Company Info, Products tabs
- `app/(app)/admin/page.tsx` — added deferred cards (Audit Log, Company Info, Products) with "Planned" badge; built cards show accent icon, unbuilt show muted icon + "View spec →"

## [2026-05-07] — Spec preview pages for unbuilt features

### Added
- `components/ui/spec-preview.tsx` — shared `SpecPreviewPage`, `SpecSection`, `SpecCard`, `SpecNote`, `SpecBadge` components for rendering feature documentation as styled in-app pages
- `app/(app)/tickets/page.tsx` — full spec preview: Quoted Requests tab, Orders tab, Order Drawer (line items, pricing, follow-up, history), PDF export, period filter
- `app/(app)/statistics/page.tsx` — full spec preview: SDR KPIs + charts, Sales KPIs + charts, Admin KPIs + extras, chart library notes

## [2026-05-07] — Tab count badges always visible (Sales Pipeline + rule)

### Added
- `app/api/leads/sales-counts/route.ts` — lightweight endpoint returning `{ pipeline, hold, rejected }` counts for the Sales Pipeline tabs
- `.cursor/rules/tab-counts.mdc` — rule enforcing upfront count fetching and always-visible badges on all tab UIs

### Changed
- `components/sales-page.tsx` — count badges now show on **all** tabs before the user clicks; counts fetched from API on mount and refreshed on `bazaar:refresh-counts` event; Refresh button also triggers count refresh

## [2026-05-07] — Fix mobile navigation menu

### Fixed
- `components/mobile-nav.tsx` — rewrote mobile drawer to load role-based pages from Supabase (same as sidebar), replacing the hardcoded `[Dashboard, Settings]` stub that showed wrong items for SDR/Sales/Admin roles
- Mobile nav now shows sidebar badge counts (Leads, Sales) and refreshes them via the `bazaar:refresh-counts` event, matching desktop sidebar behavior
- Active-route detection matches sidebar logic (exact match for `/dashboard`, prefix match for all others)

## [2026-05-07] — Design System Tokenization

### Added
- `components/ui/urgency-pill.tsx` — reusable `<UrgencyPill urgency={...} />` component; replaces 5 copies of inline urgency ternary logic across leads, sales, and CRM pages
- `.cursor/rules/color-tokens.mdc` — Cursor rule enforcing CSS variable usage; documents all available tokens and `<StatusPill>` / `<UrgencyPill>` components with good/bad examples
- New semantic tokens in `app/globals.css` (light + dark): `--color-success-bg/border`, `--color-warning-bg/border/text-deep`, `--color-info-bg/text/border/text-deep`, `--color-neutral-bg/text/border`, `--color-danger-text-deep`

### Changed
- `components/ui/status-pill.tsx` — all status styles now reference CSS vars (no hardcoded hex)
- `components/crm-page.tsx`, `components/customer-profile.tsx` — customer status and heat tag style objects converted to CSS vars
- `components/verify-drawer.tsx`, `components/sales-drawer.tsx` — banners, borders, buttons all tokenized
- `components/leads-page.tsx`, `components/sales-page.tsx` — urgency pills replaced with `<UrgencyPill>`, all hex replaced with vars
- `components/admin/roles-section.tsx` — danger colors tokenized
- `components/sidebar.tsx` — badge colors tokenized
- `components/ui/phone-input.tsx`, `components/ui/email-input.tsx` — error state colors tokenized

---

## [2026-05-07] — Testing & Polish Pass (Post-Phase 6)

### Added
- `app/api/customers/[id]/merge/route.ts` — POST endpoint that moves all leads and activities from a source (duplicate) customer to a surviving target, logs a merge activity, then deletes the duplicate
- `app/api/leads/workspace/counts/route.ts` — lightweight endpoint returning per-tab lead counts scoped to the current SDR (`all` = shared queue, `hold/routed/rejected` = own leads only)
- `app/api/sidebar-counts/route.ts` — role-aware endpoint returning action-required counts per nav route (SDR → `/leads`, Sales → `/sales`, Admin → both); used to populate sidebar badges
- Merge Duplicate button on customer profile: two-step modal — search for surviving customer → yellow warning → merge & redirect

### Changed
- **Product Interests UI** (`verify-drawer.tsx`) — replaced always-visible checkbox grid with a tag-picker: `+ Add product interest…` dropdown adds items; selected items appear as rows with qty input and remove button
- **CRM filter bar** (`crm-page.tsx`) — removed duplicate "All" button from Heat filter group; Heat pills now toggle (click to filter, click again to deselect); added thin vertical divider between Status and Heat groups
- **Verify drawer footer** — On Hold lead now shows `Resume` button instead of `On Hold`; `Resume` calls `/api/leads/[id]/resume` and restores `prev_status`; all action buttons are now context-aware
- **Sidebar** (`sidebar.tsx`) — NavLink now accepts a `badge` prop; `Sidebar` fetches `/api/sidebar-counts` on mount and every 60 s; expanded sidebar shows red pill count on right, collapsed sidebar shows red dot on icon corner
- **Sidebar badge refresh** — every successful drawer action (validate, route, hold, reject, resume) dispatches `window.dispatchEvent(new Event("bazaar:refresh-counts"))` so sidebar counts update immediately without waiting for the 60 s poll
- **SDR lead scoping** — On Hold, Directed to Sales, and Rejected tabs in `/leads` now pass `scope=mine` to the workspace API, filtering by `sdr_id = userId`; All Leads tab remains a shared queue visible to all SDRs
- **Leads tab badges** — all four tabs show their count badge before the user clicks; active tab uses accent colour, inactive tabs use muted grey; zero-count tabs hide the badge

### Fixed
- `hold_until` empty-string bug — changed `hold_until ?? null` to `hold_until || null` in `/api/leads/[id]/hold/route.ts`; Supabase was rejecting `""` as an invalid timestamp
- CRM customer list showing duplicate entries — root cause was two separate customer records created during testing; explained dedup lookup flow and provided SQL to delete orphan; built Merge feature to prevent future manual cleanup

---

## [2026-05-07] — Merge Duplicate Customers

### Added
- `app/api/customers/[id]/merge/route.ts` — POST endpoint that moves all leads and activities from a source customer to a target, then deletes the source
- Merge Duplicate button on customer profile header opens a two-step modal: search for the surviving customer → confirm with warning → redirect to merged profile

---

## [2026-05-07] — CRM + Roles Editor

### Added
- `GET /api/customers` — list all customers with embedded lead count, last activity, and computed `customer_status` (new / known)
- `GET /api/customers/[id]` — single customer with full lead history
- `POST /api/admin/roles` — create custom role (validates slug format, rejects duplicates)
- `DELETE /api/admin/roles/[id]` — delete custom role; guards system roles and roles with assigned users
- `GET /api/admin/pages` — list all navigable pages for permission matrix
- `POST /api/admin/roles/[id]/permissions` — grant a page to a role (upsert)
- `DELETE /api/admin/roles/[id]/permissions/[pageId]` — revoke a page from a role
- `components/crm-page.tsx` — CRM list: customer table with search, status filter (All / New / Known), heat tag filter, desktop table + mobile cards, click-to-navigate
- `components/customer-profile.tsx` — customer profile page: header with status/heat badges, contact fields grid, Edit Customer modal (PhoneInput, EmailInput, heat tag select), Lead History table, Order History placeholder
- `app/(app)/crm/page.tsx` — updated from placeholder to render `<CRMPage />`
- `app/(app)/crm/customers/[id]/page.tsx` — customer profile route
- `components/admin/roles-section.tsx` — two-panel roles editor: left panel lists roles with New Role form and delete; right panel is permission matrix with instant toggle (POST/DELETE); Admin role shown as locked/read-only

### Changed
- `app/api/admin/roles/route.ts` (GET) — now includes embedded `role_permissions` flattened to `permitted_page_ids` array
- `app/(app)/admin/settings/[tab]/page.tsx` — roles tab now renders `<RolesSection />` instead of ComingSoon

---

## [2026-05-07] — Phase 6: Dashboard (MVP complete)

### Added
- `app/api/dashboard/kpis/route.ts` — `GET /api/dashboard/kpis?period=week|month|quarter`; role-scoped: SDR gets inbox/handled/routed/on-hold/rejected counts, Sales gets pipeline/won/hold/value counts, Admin gets total/inbox/routed/won/revenue counts; all queries run in parallel
- `components/dashboard-page.tsx` — client component: period selector (This Week / This Month / This Quarter), 6 role-scoped KPI cards with icons and accent highlight on primary card, Quick Actions grid (role-specific links), 300ms minimum skeleton display
- `app/(app)/dashboard/page.tsx` — updated from null stub to render `<DashboardPage />`

---

## [2026-05-07] — Phase 5: Sales Pipeline page

### Added
- `components/sales-drawer.tsx` — right-side drawer for Sales reps: read-only contact info, editable Sales fields (sales_status, quote_total), lock on open / unlock on close, Sales-specific hold sub-form (4 reasons), reject sub-form (sets `status = 'Rejected'`), Order/Quote tab placeholder
- `components/sales-page.tsx` — full Sales Pipeline client component: 3 tabs (Pipeline, On Hold, Rejected SDR View), Claim/Open actions, Resume from hold, desktop table + mobile card layout, lazy-fetch for Rejected tab, userId lookup for ownership display
- `app/(app)/sales/page.tsx` — updated from placeholder to render `<SalesPage />`
- `app/api/leads/[id]/claim/route.ts` — `POST /api/leads/[id]/claim` → sets `sales_owner_id` to session user, `sales_status = 'Ongoing'`; 409 if already claimed

---

## [2026-05-07] — Phase 3 SDR Leads page refinements & bug fixes

### Added
- `components/ui/phone-input.tsx` — custom phone input with `(xxx) xxx-xxxx` auto-format; stores digits-only
- `components/ui/email-input.tsx` — email input with blur-time format validation
- `components/ui/status-pill.tsx` — reusable `StatusPill` component for all lead/sales statuses
- `components/hold-sub-form.tsx` — hold reason sub-form with 2-column radio grid + notes + date picker
- `components/verify-drawer.tsx` — full Verify Drawer (lock-on-open, release-on-close, validate / hold / route / reject actions)
- `components/leads-page.tsx` — SDR Leads page with tab filters, desktop table, mobile cards, Add Lead modal
- `lib/utils/phone.ts` — `digitsOnly`, `formatPhone`, `validatePhone` utilities
- `lib/auth/require-session.ts` — reusable server-side session + role resolver for Route Handlers
- `app/(app)/leads/page.tsx` — server component rendering `<LeadsPage />`
- `app/api/lookups/route.ts` — `GET /api/lookups` → active lookup values (sources, industries, etc.)
- `app/api/customers/lookup/route.ts` — `GET /api/customers/lookup` → customer dedup by phone/email
- `app/api/customers/route.ts` — `POST /api/customers` → create new customer profile
- `app/api/customers/[id]/route.ts` — `PATCH /api/customers/[id]` → update customer + log `contact_edited`
- `app/api/leads/workspace/route.ts` — `GET /api/leads/workspace` → workspace leads filtered by status/search
- `app/api/leads/manual/route.ts` — `POST /api/leads/manual` → create lead manually
- `app/api/leads/[id]/route.ts` — `PATCH /api/leads/[id]` → update lead fields
- `app/api/leads/[id]/lock/route.ts` — `POST /api/leads/[id]/lock` → acquire optimistic lock
- `app/api/leads/[id]/unlock/route.ts` — `POST /api/leads/[id]/unlock` → release lock on drawer close
- `app/api/leads/[id]/hold/route.ts` — `POST /api/leads/[id]/hold` → place lead on hold + log activity
- `app/api/leads/[id]/resume/route.ts` — `POST /api/leads/[id]/resume` → resume lead from hold

### Changed
- **Authority field**: options changed from "Decision Maker / Influencer / User / Unknown" to "Yes / No"; label renamed to "Decision Maker?"
- **Urgency field**: added "Not Defined" option (UI sentinel `not_defined`, stored as `null` in DB to satisfy `leads_urgency_check`); displays a grey "Not Defined" pill instead of a dash when unset
- **Hold reasons**: updated from 4 generic options to 6 POC-aligned options displayed as a 2-column radio grid:
  - Awaiting customer response, Awaiting artwork / files, Awaiting payment confirmation, Pricing review needed, Vacation / customer unavailable, Other
- **Add Lead modal**: widened to `sm:max-w-[820px]`; `SelectTrigger` components set to `w-full`
- **Verify Drawer**: `SelectTrigger` components set to `w-full`; urgency and authority options aligned with above changes
- **Leads table**: added Urgency column (colour-coded pill); renamed "Work" action button to "Verify" on both desktop and mobile
- **Add User modal** (`components/admin/users-section.tsx`): role `SelectTrigger` set to `w-full`; `SelectValue` now renders the resolved `display_name` instead of the raw UUID
- `components/ui/dialog.tsx` — default modal width increased from `sm:max-w-sm` (384 px) to `sm:max-w-lg` (512 px); default padding increased from `p-4` to `p-6`
- `docs/feature-specs/leads-sdr.md` — updated table columns (added Urgency), Authority options, Urgency options, hold reasons sub-form, and Verify button label
- `docs/mvp-scope.md` — updated Authority and Urgency field descriptions in lead form reference table
- `docs/session-summary.md` — updated Authority and Urgency field notes in lead form reference table

### Fixed
- **DB constraint error** `leads_urgency_check`: `POST /api/leads/manual` and `PATCH /api/leads/[id]` now convert `urgency = 'not_defined'` or `''` to `null` before DB write
- **PostgREST relationship error** "Could not find a relationship between 'leads' and 'user_profiles'": removed the invalid `locked_by:user_profiles!locked_by_id` join from workspace and patch routes; lock conflict response now performs a direct `user_profiles` lookup by ID
- **Role UUID display in Add User modal**: `SelectValue` now explicitly renders the resolved role `display_name` so the dropdown shows the human-readable label instead of the raw UUID after selection

---

## [2026-05-07] — CRM spec: customer profile page + enriched dedup banner

### Changed
- `docs/feature-specs/crm.md` — full rewrite to include:
  - Three-tier customer status system (New Contact / Known Customer / Returning Customer) replacing the manual `is_returning_customer` checkbox
  - Enriched dedup banner showing status, order count, and last order date
  - Customer profile page (`/crm/customers/[id]`) with lead history, order history, and activity timeline sections
  - `GET /api/customers/lookup` response schema expanded with `order_count`, `lead_count`, `last_order_at`, `customer_status`
  - "View customer profile →" deep-link from Add Lead modal and Verify Drawer
  - Build dependency table listing what's needed before CRM can be built

## [2026-05-07] — Phase 3: SDR Leads page

### Added
- `lib/utils/phone.ts` — `digitsOnly`, `formatPhone`, `validatePhone` helpers
- `lib/auth/require-session.ts` — generic session + role resolver for Route Handlers
- `components/ui/phone-input.tsx` — validated phone input with auto-formatting `(xxx) xxx-xxxx`
- `components/ui/email-input.tsx` — email input with blur validation
- `components/ui/status-pill.tsx` — colour-coded status badge for `LeadStatus` / `SalesStatus`
- `components/hold-sub-form.tsx` — inline hold reason / notes / date sub-form used in Verify Drawer
- `components/verify-drawer.tsx` — right-side slide-in drawer for working a lead: lock on open, Validate / Route to Sales / Hold / Reject / Save actions, "Update customer?" prompt, read-only banner when locked by another user
- `components/leads-page.tsx` — full SDR Leads client component: four tabs (All Leads, On Hold, Directed to Sales, Rejected), Add Lead modal with 600ms debounce customer dedup (single match banner, multi-match picker), desktop table + mobile card layout, Verify Drawer integration, optimistic removal on action
- `app/(app)/leads/page.tsx` — updated from stub to render `<LeadsPage />`
- `app/api/lookups/route.ts` — `GET /api/lookups?categories=…` returns active dropdown options
- `app/api/customers/lookup/route.ts` — `GET /api/customers/lookup` phone/email dedup
- `app/api/customers/route.ts` — `POST /api/customers` create customer
- `app/api/customers/[id]/route.ts` — `PATCH /api/customers/[id]` update customer + activity log
- `app/api/leads/workspace/route.ts` — `GET /api/leads/workspace` with status + search filters
- `app/api/leads/manual/route.ts` — `POST /api/leads/manual` create lead + optional customer
- `app/api/leads/[id]/route.ts` — `PATCH /api/leads/[id]` with lock guard + terminal state guard + activity logging
- `app/api/leads/[id]/lock/route.ts` — `POST /api/leads/[id]/lock` acquire / refresh lock
- `app/api/leads/[id]/unlock/route.ts` — `POST /api/leads/[id]/unlock` release lock
- `app/api/leads/[id]/hold/route.ts` — `POST /api/leads/[id]/hold` put on hold (SDR or Sales role)
- `app/api/leads/[id]/resume/route.ts` — `POST /api/leads/[id]/resume` restore from hold

## [2026-05-07] — Fix self-edit blocked when only name changes

### Fixed
- `components/admin/users-section.tsx` — Edit User dialog was always sending `role_id` in the PATCH payload even when the role hadn't changed; the API's self-modify guard (`role_id !== undefined`) would then reject any self-edit including a plain name change. Fixed: `role_id` is now only included in the payload when it actually changed from the original value. Also added a no-op early exit if nothing changed at all.

## [2026-05-07] — Select dropdowns always show labels, never raw DB values

### Added
- `.cursor/rules/select-labels.mdc` — rule: any `<Select>` pre-filled from DB data must pass resolved label as children of `<SelectValue>` to avoid showing UUIDs/slugs when options load asynchronously

### Fixed
- `components/admin/users-section.tsx` — Edit User dialog Role dropdown was showing UUID instead of display name; fixed by passing `roles.find(r => r.id === roleId)?.display_name` as children of `<SelectValue>`

## [2026-05-07] — Mobile card layout for tables + users table updated

### Added
- `.cursor/rules/mobile-table-cards.mdc` — workspace rule: every data table must render as a card list on mobile (`sm:hidden` / `hidden sm:block` pattern)

### Changed
- `components/admin/users-section.tsx` — users table now has a full mobile card view (`sm:hidden`): each user renders as a card with avatar, name, status badge, email/role/joined fields, and Edit/Deactivate buttons; skeleton loader also card-based; desktop table (`hidden sm:block`) updated to use BazarCRM design tokens (row-alt, row-hover, badge-bg, text-muted)

## [2026-05-07] — Edit user opens modal instead of inline row

### Fixed
- `components/admin/users-section.tsx` — replaced inline `EditRow` (which appeared to "disappear" the row) with a proper `EditUserDialog` modal; clicking Edit now opens a dialog matching the Add User modal pattern

## [2026-05-07] — Documentation synced to current implementation

### Changed
- `docs/architecture.md` — file structure updated to reflect all built admin files (`admin/layout.tsx`, `admin/page.tsx`, `admin/settings/layout.tsx`, `admin/settings/[tab]/page.tsx`), admin API routes, and new UI components; noted `max-width: 1980px` on app layout
- `docs/navigation.md` — route tree updated to actual `/admin/settings/[tab]` structure; page title table updated to match real routes; removed stale `/admin/users`, `/admin/roles`, etc.
- `docs/feature-specs/admin.md` — all admin sub-routes updated from `/admin/users` etc. to `/admin/settings/users` etc.; overview card section rewritten to reflect current implementation; permission matrix paths corrected
- `docs/session-summary.md` — Phase 2 marked complete with actual built files listed; "How to start" URL updated to `/admin/settings/users`

## [2026-05-07] — Admin UI redesigned to match PrintManager pattern

### Changed
- `app/(app)/admin/page.tsx` — overview card grid: removed `available` / "Soon" disabled state; all 4 cards fully clickable with BazarCRM design tokens (accent icon, token-based hover, no hardcoded hex)
- `app/(app)/admin/layout.tsx` — restructured to `flex min-h-full flex-col` with a `border-b` sub-nav strip (matches PrintManager layout)
- `components/admin/admin-sub-nav.tsx` — applied BazarCRM CSS token–based active/inactive styles (replaces generic shadcn classes)
- `components/admin/settings-tab-nav.tsx` — removed disabled/coming-soon pill state; all 4 tabs fully clickable; active tab uses `var(--color-btn-verify-bg/text)` (navy + gold); inactive uses muted fill with hover
- `app/(app)/admin/settings/layout.tsx` — removed `<Separator>` and extra padding; now matches PrintManager `px-6 pb-8 pt-4` structure
- `app/(app)/admin/settings/[tab]/page.tsx` — replaced emoji in ComingSoon placeholder with token-based design-system icon

## [2026-05-07] — Admin restructured to proper file-based routing

### Added
- `components/admin/admin-sub-nav.tsx` — client component for Overview/Settings strip; uses `usePathname` for active state
- `components/admin/settings-tab-nav.tsx` — client component for horizontal settings tab pills; links to `/admin/settings/[tab]`
- `app/(app)/admin/settings/layout.tsx` — settings sub-layout: renders `SettingsTabNav` + `<Separator>` above `{children}`
- `app/(app)/admin/settings/page.tsx` — redirects `/admin/settings` → `/admin/settings/users`
- `app/(app)/admin/settings/[tab]/page.tsx` — renders section component per tab (`users`, `roles`, `dropdowns`, `notifications`); unknown tabs → `notFound()`
- `supabase/migrations/023_admin_settings_routes.sql` — inserts new `/admin/settings/*` routes into `pages` table as `section = 'admin-sub'`

### Changed
- `app/(app)/admin/layout.tsx` — now renders the shared page title + `AdminSubNav` strip; all admin child routes inherit this wrapper
- `app/(app)/admin/page.tsx` — simplified to only the overview card grid (no more query-param tab logic); cards link to `/admin/settings/[tab]`
- `app/(app)/admin/users/page.tsx` — redirect updated from `?tab=settings&section=users` to `/admin/settings/users`

## [2026-05-07] — Admin hub and users section rebuilt with shadcn UI

### Added
- `components/ui/card.tsx`, `button.tsx`, `badge.tsx`, `dialog.tsx`, `input.tsx`, `select.tsx`, `separator.tsx`, `tooltip.tsx` — installed via shadcn CLI
- `TooltipProvider` wrapper added to `app/layout.tsx`

### Changed
- `app/globals.css` — added full shadcn CSS token bridge (`--color-card`, `--color-primary`, `--color-muted`, `--color-sidebar`, `--radius`, etc.) mapped to existing design system vars
- `app/(app)/admin/page.tsx` — rebuilt using shadcn `Card`/`CardHeader`/`CardContent`, `Separator`; sub-nav strip uses blueprint link-state classes; settings tab bar uses filled-pill primary style from blueprint
- `components/admin/users-section.tsx` — rebuilt using shadcn `Button`, `Input`, `Select`, `Dialog`, `Badge`; table uses blueprint row/header patterns; role and status badges use Tailwind color utility classes; inline edit row and create dialog fully converted

## [2026-05-07] — Fix 404 → back button navigation and double-padding

### Added
- `app/(app)/leads/page.tsx` — "Coming in Phase 3" placeholder inside the app layout
- `app/(app)/sales/page.tsx` — "Coming in Phase 4" placeholder inside the app layout
- `app/(app)/crm/page.tsx` — placeholder inside the app layout
- `app/(app)/tickets/page.tsx` — placeholder inside the app layout
- `app/(app)/statistics/page.tsx` — placeholder inside the app layout
- `app/(app)/settings/page.tsx` — updated to a proper "coming soon" placeholder

### Fixed
- Navigating to an unbuilt route (e.g. `/leads`) no longer renders the global `/_not-found` page outside the `(app)` layout; all planned routes now stay inside the sidebar shell
- Browser Back button from a 404 now correctly restores the previous page with sidebar intact
- Removed duplicate `mx-auto max-w-[1280px] px-6 py-8` wrapper from `admin/page.tsx` and `components/admin/users-section.tsx` — `(app)/layout.tsx` already provides this container

## [2026-05-07] — Admin panel redesigned as two-tab layout (Overview + Settings)

### Changed
- `app/(app)/admin/page.tsx` — complete rewrite: two top-level tabs "Overview" (card grid) and "Settings" (horizontal section tabs). Clicking a card from Overview switches to Settings with that section active — no separate page navigation needed.
- `app/(app)/admin/users/page.tsx` — now redirects to `/admin?tab=settings&section=users`
- `components/admin/users-section.tsx` — users table+modal extracted into a named export component rendered inside the Settings tab

### Added
- `supabase/migrations/022_fix_admin_subpages_section.sql` — updates admin sub-pages (`/admin/users`, `/admin/roles`, etc.) section from `'admin'` to `'admin-sub'` so they no longer appear as individual sidebar items. Only `/admin` remains in the sidebar.

---

## [2026-05-07] — Phase 2 User Management complete

### Added
- `app/(app)/admin/page.tsx` — Admin overview card grid (4 cards: Users active, Roles/Dropdowns/Notifications show "Coming soon")
- `app/(app)/admin/layout.tsx` — Admin section shell
- `app/(app)/admin/users/page.tsx` — Full user management page: table with skeleton loader, search + role filter + show-inactive toggle, avatar initials, role pills, status badges, must-change-password warning icon, relative timestamps, inline edit row (name, role, optional temp password reset), deactivate/reactivate, create modal, bottom-right toast
- `app/api/admin/users/route.ts` — GET: lists all users from `user_profiles_with_role` view, merges email from `auth.admin.listUsers`, supports search/role/is_active filters
- `app/api/admin/users/create/route.ts` — POST: creates auth user (no email), inserts `user_profiles` with `must_change_password: true`, cleans up orphaned auth user on profile failure
- `app/api/admin/users/[id]/route.ts` — PATCH: update name/role/active/temp-password; guards self-modify and last-admin deactivation
- `app/api/admin/roles/route.ts` — GET: lists all roles (used to populate role dropdowns)
- `lib/auth/require-admin.ts` — shared auth guard for all admin Route Handlers

---

## [2026-05-07] — Phase 1 DB Foundation complete

### Added
- `supabase/migrations/001–021` — all 21 migration SQL files: table creation, indexes, RLS, triggers, views, helper functions, and seed data (system roles, pages, role permissions, all dropdown lookup values from POC)
- `lib/types/index.ts` — canonical TypeScript types for all domain entities (UserProfile, Role, Page, Lead, Customer, LookupValue, JobTicket, Activity, AppNotification, KPIs, form types)
- `app/(auth)/change-password/page.tsx` — forced password change UI shown to users with `must_change_password = true`
- `app/api/auth/change-password/route.ts` — POST handler: updates password via admin client, clears `must_change_password` flag

### Changed
- `proxy.ts` — extended with: `is_active` check (deactivated → sign out → `/login?error=deactivated`), `must_change_password` redirect to `/change-password`, DB-driven role permission gate (fetches `role_permissions` + `pages` per request; Admin bypasses check; wrong-role redirects to home)
- `lib/auth/resolve-default-home.ts` — now role-aware: SDR → `/leads`, Sales → `/sales`, Admin/other → `/dashboard`
- `components/sidebar.tsx` — fully rewritten as DB-driven role-aware nav; fetches allowed pages from `role_permissions` join at runtime; supports all 10 Lucide icons mapped by name; shows "Admin" section label; collapses correctly

---

---

## [2026-05-07] — Admin panel redesigned as card grid with separate pages

### Changed
- `docs/feature-specs/admin.md` — complete rewrite: `/admin` is now a card overview grid; each admin section is a separate full page (`/admin/users`, `/admin/roles`, `/admin/dropdowns`, `/admin/notifications`). Removed `/admin/settings` route. `/admin/audit` deferred (not in MVP card grid). Added full specs for Roles & Permissions page (two-column with permission matrix), Dropdown Options page (category sidebar + options table with drag-reorder), and Notifications broadcast page.
- `docs/navigation.md` — updated route tree, admin sidebar (single "Admin Panel" link to `/admin`), icon map (added ShieldCheck, KeyRound, ListFilter, Megaphone), page title table

---

## [2026-05-07] — lookup_values table — DB-managed dropdown options

### Added
- `docs/schema.md` — new `lookup_values` table with `category`, `value`, `label`, `sort_order`, `is_active`; 7 seeded categories (source 15 opts, industry 14 opts, urgency 3 opts, hold_reason 6 opts, reject_reason 6 opts, route_reason 6 opts, sales_drop_reason 5 opts); migration 010 + seed 020 added to migration order
- `docs/api-contract.md` — `GET /api/lookups`, `GET /api/admin/lookups`, `POST /api/admin/lookups`, `PATCH /api/admin/lookups/[id]`
- `docs/types.md` — `LookupValue`, `LookupCategory`, `LookupMap` types
- `docs/session-summary.md` — updated DB summary to include lookup_values

---

## [2026-05-07] — Session summary document created

### Added
- `docs/session-summary.md` — complete session record covering tech stack, all architectural decisions, DB schema summary, MVP build phases, lead status flow, customer dedup design, and docs index

---

## [2026-05-06] — Customer deduplication system, contacts renamed to customers

### Changed
- `docs/schema.md` — Renamed `contacts` table to `customers` throughout. Removed unique constraints on `phone` and `email` (multiple customer profiles per phone intentional). Added customer lookup deduplication rules section. Updated all FK references (`contact_id` → `customer_id`). Updated indexes, RLS policies, triggers, and migration file names.
- `docs/api-contract.md` — Renamed all `/api/contacts/*` to `/api/customers/*`. Replaced `GET /api/contacts/lookup` with richer `GET /api/customers/lookup` returning all matches (not just first). Added `POST /api/customers` and `PATCH /api/customers/[id]`. Updated `POST /api/leads/manual` body to include `customer_id` / `create_customer` fields and correct new fields (`urgency`, `is_returning_customer`, `sdr_comment`).
- `docs/types.md` — Renamed `Contact` → `Customer`. Added `CustomerLookupResult` type. Updated `Lead.contact_id` → `Lead.customer_id`. Removed `ContactMergeFields` (dedup is now UI-choice, not field-level merge).
- `docs/feature-specs/leads-sdr.md` — Added complete **Customer Lookup (Smart Deduplication)** section to Manual Add Lead: phone lookup flow, no-match / 1-match / 2+-match modal variants, secondary email lookup, on-submit customer creation logic, "Update Customer?" prompt when SDR takes action on a lead.
- `docs/mvp-scope.md` — Added `customers` table to Phase 1 foundation. Updated Phase 4 description to include customer dedup lookup.

---

## [2026-05-06] — Lead form fields corrected — added Urgency, Returning Customer, SDR Comment

### Changed
- `docs/schema.md` — Added 3 missing lead fields: `urgency` (High/Medium/Low), `is_returning_customer` (boolean), `sdr_comment` (Verify Lead Comment textarea).
- `docs/types.md` — Added `LeadUrgency` type; added `urgency`, `is_returning_customer`, `sdr_comment` to `Lead` interface and `VerifyLeadForm` interface. Reorganized form type to match actual field layout.
- `docs/feature-specs/leads-sdr.md` — Updated Lead Info Tab to show full correct field grid (matches POC screenshot layout). Added Urgency, Returning Customer, Verify Lead Comment. Specified Product Interests are in drawer only, not in add modal. Added two-column layout spec matching screenshot.
- `docs/mvp-scope.md` — Updated Lead Form Fields table with all correct fields and notes on which appear in add modal vs drawer only.

---

## [2026-05-06] — MVP scope defined, plan updated

### Added
- `docs/mvp-scope.md` — Defines exact build boundary: DB foundation, auth additions, minimal user management, SDR leads page, Sales leads page, basic dashboard. All other features explicitly deferred with order.

### Changed
- Build plan updated to reflect MVP-first approach: Phases 1–5 are in scope now; CRM, Tickets, Statistics, full Admin panel, Notifications, and Email/SMS are deferred to named later phases.

---

## [2026-05-06] — Dynamic roles/permissions system, temp password, change-password flow

### Added
- `docs/schema.md` — Three new tables: `roles` (admin-manageable), `pages` (route registry), `role_permissions` (many-to-many). `user_profiles.role` text column replaced by `user_profiles.role_id FK → roles`. Added `must_change_password` boolean. Added `user_profiles_with_role` convenience view. Added `user_can_access_route()` DB function. Updated migration order to 19 files.
- `docs/api-contract.md` — New endpoints: `POST /api/auth/change-password`, full `GET/POST/PATCH/DELETE /api/admin/roles/*` CRUD + permission grant/revoke endpoints. Replaced `POST /api/admin/users/invite` with `POST /api/admin/users/create` (no email, temp password, `must_change_password`). Updated `PATCH /api/admin/users/[id]` with `role_id`, `new_temp_password`, `must_change_password` fields.
- `docs/types.md` — Added `Role`, `Page`, `RolePermission` types. Updated `UserProfile` to use `role_id` and `must_change_password`.
- `docs/navigation.md` — Added `/change-password` to route tree and proxy.ts path classifications.
- `docs/architecture.md` — Added `change-password/page.tsx`, `api/auth/change-password/`, `api/admin/roles/` to file structure.

### Changed
- `docs/rbac.md` — Completely rewrote `proxy.ts` extension: now reads allowed routes from DB (`role_permissions` JOIN `pages`), adds `is_active` check, adds `must_change_password` intercept before role check.
- `docs/feature-specs/admin.md` — Replaced "Invite User" with "Create User" (temp password, no email). Added full **Roles & Permissions** tab spec to Settings (role list, permission matrix, create/delete custom role flow).

---

## [2026-05-06] — Component architecture doc, tab URL spec, role redirect refinement

### Added
- `docs/component-architecture.md` — Full component architecture: Server vs Client component split for every page, SDR vs Sales side-by-side breakdown, shared vs role-specific components table, `LeadTable` props interface, drawer anatomy, data fetching strategy, URL state convention.

### Changed
- `docs/navigation.md` — Added Tab URL Convention section: all `?tab=` values for `/leads`, `/sales`, `/tickets`; documents use of `router.replace` over `router.push`.
- `docs/rbac.md` — Refined `proxy.ts` extension to use **redirects** (not just blocks): wrong-role user typing `/leads` lands on `/sales`, not `/dashboard`. Added `is_active` check for deactivated users.

---

## [2026-05-06] — Lead locking, terminal reject, corrected status flow

### Added
- `docs/feature-specs/lead-locking.md` — Complete lead locking spec: schema fields (`locked_by_id`, `locked_at`), lock lifecycle, edit vs read-only mode, Admin override, client implementation pattern, concurrency edge case.

### Changed
- `docs/schema.md` — Added `locked_by_id` and `locked_at` to `leads` table + index. Updated status enums to mark `Rejected` (SDR) and `Rejected`/`Won` (Sales) as **terminal states** only Admin can override.
- `docs/api-contract.md` — Added `POST /api/leads/[id]/lock` and `POST /api/leads/[id]/unlock` endpoints. Added lock guard and terminal state guard to `PATCH /api/leads/[id]` and `POST /api/leads/verify`.
- `docs/rbac.md` — Added full Lead Locking Rules section (acquire/release/read-only/admin-override table) and Terminal State Rules table.
- `docs/feature-specs/leads-sdr.md` — Added locking behavior section; updated footer actions to show locking constraints; clarified Hold resume goes back to `Validated`; documented Reject as terminal.
- `docs/feature-specs/leads-sales.md` — Added locking behavior note; updated footer actions for terminal Reject; corrected Hold resume to go back to `Ongoing` only; added distinct Hold/Rejected sections.

---

## [2026-05-06] — Full production documentation suite

### Added
- `docs/schema.md` — Complete Supabase Postgres schema: 6 tables (`user_profiles`, `contacts`, `leads`, `job_tickets`, `activities`, `notifications`), all indexes, RLS policies, `set_updated_at` trigger, migration file order.
- `docs/api-contract.md` — Full Route Handler contract for all endpoints: Leads, Contacts, Tickets, Activity, Notifications, Dashboard KPIs, Outreach, Admin.
- `docs/rbac.md` — Role definitions (SDR / Sales / Admin), route access matrix, API access matrix, DB RLS matrix, `proxy.ts` role-gate extension, user lifecycle.
- `docs/navigation.md` — Full route tree, sidebar nav per role with Lucide icon map, tab structures per page, notification bell placement.
- `docs/types.md` — Canonical TypeScript types for all domain entities: `UserProfile`, `Contact`, `Lead`, `JobTicket`, `Activity`, `Notification`, form input types, KPI types.
- `docs/feature-specs/leads-sdr.md` — SDR Inbox, On Hold, Directed, Rejected tabs + Verify Drawer full spec.
- `docs/feature-specs/leads-sales.md` — Sales Pipeline, On Hold, Rejected tabs + Sales Drawer spec.
- `docs/feature-specs/crm.md` — Contact registry, expand row, merge, edit, great heat, admin toolbar.
- `docs/feature-specs/tickets.md` — Quoted Requests, Orders tabs, Order Drawer (ticket builder), PDF export.
- `docs/feature-specs/activity.md` — HistoryTimeline, icon map, manual logging, server-side auto-logging table.
- `docs/feature-specs/statistics.md` — SDR / Sales / Admin KPI cards, all chart specs, shared period context.
- `docs/feature-specs/notifications.md` — Notification bell, feed, all notification types, Supabase Realtime setup.
- `docs/feature-specs/admin.md` — User management, invite flow, system settings (products, sources, company info, broadcast), audit log.
- `docs/feature-specs/dashboard.md` — Role-scoped KPI cards, quick actions, follow-up alerts, design notes.
- `docs/feature-specs/` directory created.

### Changed
- `docs/architecture.md` — Updated to reflect full production plan: complete file structure (existing + planned), new environment variables (outreach providers), updated "Creating users" section to describe Admin invite flow.

---

## [2026-05-06] — Rule compliance audit & fixes

### Added
- `--color-danger-bg` and `--color-danger-border` CSS tokens (light + dark) to `globals.css` — eliminates hardcoded hex from components.
- `lib/utils/email.ts` — `validateEmail()` helper.
- `components/ui/email-input.tsx` — `EmailInput` component with blur validation, focus ring, and `aria-invalid`/`aria-describedby` support.

### Changed
- All 3 auth pages (`login`, `verify-2fa`, `setup-2fa`): error banners now use `var(--color-danger-bg)` and `var(--color-danger-border)` instead of `#FEF2F2`/`#FECACA`. Added `role="alert"` to error banners.
- `login/page.tsx`: replaced bare `<input type="email">` with `<EmailInput>`. Added `aria-invalid` and `aria-describedby` to the password field when an auth error is present. Error banner now has `id="login-error"` for the `aria-describedby` reference.
- `setup-2fa/page.tsx`: fixed `text-[11px]` → `text-[12px]` on the "Manual entry key" label to match the 12px label standard.

### Removed
- `components/tab-nav.tsx` — unused since navigation switched to sidebar layout.
- `components/topbar.tsx` — unused since navigation switched to sidebar layout.

---

## [2026-05-06] — Auth UX polish & sign-out

### Added
- Auto-submit on 6th digit in `/verify-2fa` — no button press needed
- Wrong code: clears all 6 boxes and shows "Incorrect code — please try again."
- Sign out logic wired in desktop sidebar and mobile nav drawer (calls `supabase.auth.signOut()` then `window.location.assign("/login")`)

---

## [2026-05-06] — Auth pages redesigned

### Added
- `components/otp-input.tsx` — reusable 6-box OTP input with auto-advance on input, backspace navigation, and full paste support

### Changed
- `app/(auth)/login/page.tsx` — full redesign: navy lock icon header, italic subtitle, uppercase labels, show/hide password toggle, step dots, security badge. Removed "Forgot password?" and "Remember device" (not needed for internal tool)
- `app/(auth)/verify-2fa/page.tsx` — 6-box OTP grid replacing single input field; info box; step dots (step 1 green = done, step 2 gold = active); "Use a different account" link
- `app/(auth)/setup-2fa/page.tsx` — matching card style, skeleton loader while QR generates, manual key display, 6-box OTP input

---

## [2026-05-06] — QR code fixes

### Fixed
- Replaced `react-qr-code` with `qrcode.react` — `react-qr-code` threw "code length overflow" on Supabase TOTP URIs
- Switched QR error correction from `level="M"` to `level="L"` for higher data capacity
- Replaced Supabase's full `qr_code` URI with a minimal `otpauth://totp/BazaarPrinting?secret=...` URI — Supabase's URI was too long for any QR library level
- Added `useRef` guard to prevent React StrictMode double-invoke causing duplicate enrollment calls
- Changed TOTP friendly name to `BazarCRM-{timestamp}` — prevents "factor name conflict" 422 error on re-enrollment

---

## [2026-05-06] — Navigation & mobile nav

### Added
- `components/mobile-nav.tsx` — mobile top bar (56px, navy) with hamburger button; full-height slide-in drawer with nav items, dark mode toggle, sign out; closes on route change; locks body scroll while open

### Changed
- `app/(app)/layout.tsx` — sidebar hidden below `lg` breakpoint; mobile nav shown on mobile only; page padding `px-4` mobile / `px-6` desktop

---

## [2026-05-06] — Sidebar navigation

### Changed
- Navigation switched from horizontal tab bar to **collapsible left sidebar** matching Pulse V2 pattern
- `components/sidebar.tsx` — navy background (`var(--color-topbar)`), expanded 224px / collapsed 56px, active item uses gold/orange accent, collapse state persisted in `localStorage` key `bazaar-sidebar-collapsed`, dark mode toggle + sign out + collapse button at bottom
- `app/(app)/layout.tsx` — uses sidebar instead of topbar + tab nav
- Removed old `components/sidebar.tsx` and `components/mobile-nav.tsx` (horizontal tab versions)
- Updated `.cursor/rules/ui-design-system.mdc` to reflect sidebar layout

---

## [2026-05-06] — BazaarPrinting UI design system applied

### Added
- `components/topbar.tsx` — navy/charcoal topbar, gold/orange `BAZAARPRINTING CRM` logo, theme toggle
- `components/tab-nav.tsx` — horizontal tab bar with active gold/orange underline, count badge support

### Changed
- `app/globals.css` — replaced generic Tailwind variables with full BazaarPrinting token set (19 CSS variables, light + dark), skeleton shimmer animation
- `app/layout.tsx` — font swapped Roboto → **Inter**; `NextTopLoader` uses `var(--color-accent)`
- `components/theme-provider.tsx` — localStorage key changed from `bazar-crm-theme` to `bazaar-theme`
- `.cursor/rules/ui-design-system.mdc` — updated to reflect new nav layout

---

## [2026-05-06] — Cursor rules created

### Added
- `.cursor/rules/stack-conventions.mdc` — stack rules (always applied): Next.js 16 proxy.ts pattern, Supabase client split, env var rules
- `.cursor/rules/ui-design-system.mdc` — BazaarPrinting design system (always applied): full color token table, typography, layout rules, component specs, do/don'ts

---

## [2026-05-06] — Vercel deployment fixes

### Added
- `vercel.json` — sets `framework: nextjs` to fix "No Output Directory named public" error
- `package.json` `engines` field — requires `node >=18.18.0` for Next.js 16 compatibility

### Fixed
- Vercel was treating project as static site instead of Next.js app

---

## [2026-05-06] — Supabase + local dev setup

### Added
- `.env.local` — local Supabase credentials (gitignored)
- Auth bypass in `proxy.ts` — skips auth when `NEXT_PUBLIC_SUPABASE_URL` is empty, enabling UI-only local dev without Supabase

### Configured (Supabase dashboard)
- Email signup: disabled
- Confirm email: disabled  
- TOTP MFA: enabled
- Site URL + redirect URLs added for Vercel domain and localhost

---

## [2026-05-06] — Initial scaffold

### Added
- `package.json` — Next.js 16, React 19, TypeScript 5, Tailwind CSS v4, Supabase SSR, shadcn, lucide-react, qrcode.react, nextjs-toploader, tw-animate-css
- `tsconfig.json` — strict mode, path alias `@/*` → project root
- `next.config.ts`, `postcss.config.mjs`, `components.json` (shadcn, style: base-nova)
- `.gitignore`, `.env.local.example`
- `proxy.ts` — Next.js 16 Proxy, AAL2 session enforcement, MFA redirect logic (adapted from Pulse V2)
- `lib/supabase/client.ts` — browser Supabase client
- `lib/supabase/admin.ts` — service-role client (server/Route Handlers only)
- `lib/auth/safe-return-path.ts` — open redirect prevention
- `lib/auth/resolve-default-home.ts` — default post-login path (`/dashboard`)
- `lib/utils.ts` — `cn()` helper
- `app/globals.css`, `app/layout.tsx`, `app/page.tsx` (redirects → `/dashboard`)
- `app/(auth)/layout.tsx`, `login/page.tsx`, `setup-2fa/page.tsx`, `verify-2fa/page.tsx`
- `app/(app)/layout.tsx`, `dashboard/page.tsx`, `settings/page.tsx`
- `components/theme-provider.tsx` — light/dark toggle, localStorage
- `docs/` folder for project documentation
