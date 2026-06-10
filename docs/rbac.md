# BazarCRM — RBAC (Role-Based Access Control)

> **RBAC migration — Slice 0 complete (2026-06-09):** Action permission foundation shipped. The `permissions` catalog and `role_action_grants` table are live and seeded. Auth helpers (`hasPermission`, `requirePermission`) and `usePermissions()` hook are available. `GET /api/me` returns `actionGrants[]`. The Admin → Roles → **Actions** tab lets admins toggle action grants per role. Enforcement (replacing hardcoded `roleName` checks) rolls out incrementally in Slice 1+. See [`rbac-migration/plan.md`](rbac-migration/plan.md).

Roles are **fully database-driven**. Three system roles (SDR, Sales, Admin) are seeded and cannot be deleted. Admin can create additional custom roles and assign page access to each via the Settings → Roles tab.

**Enforcement layers:**
1. **`proxy.ts`** — reads role permissions from DB on every **page** request; redirects unauthorized roles; hard-blocks **`/settings`**, **`/reports`**, and **`/activity-log`** for non-admins
2. **Route Handlers** — `requireSession()` / `requireAdmin()` + object checks (`canReadLead`, `canAccessTicket`, …) + page gates:
   - **`requirePageAccess(route)`** — single page route (lists, CRM, payments, …)
   - **`requireAnyPageAccess(routes)`** — ticket detail, shipping addresses, contextual ticket APIs
   - **`requireLeadApiPageAccess()`** — lead drawer/mutation APIs (`/leads` or `/sales`)
   - **`requireTicketDetailPageAccess()`** — PDF, print, and ticket detail page routes
3. **Supabase RLS** — database-level row filtering for direct browser/realtime Supabase client access

**Helper modules:** `lib/auth/require-page-access.ts`, `lib/auth/role-checks.ts` (`isAdminRole`, `isPaymentStaffRole`), `lib/auth/admin-only-pages.ts`, `lib/utils/ticket-access.ts`, `lib/utils/lead-access.ts`, `lib/utils/db-counts.ts` (`scopeJobTicketsQuery`).

**Action permission helpers (Slice 0):** `lib/auth/has-permission.ts` (`hasPermission`, `hasAllPermissions`, `hasAnyPermission`), `lib/auth/require-permission.ts` (`requirePermission` — server guard returning 403), `hooks/use-permissions.ts` (`usePermissions().can(key)` — client hook). Action grants are loaded into every session and cached 45 s alongside page routes.

> **Current enforcement status:** Slice 0 is deployed. The `permissions` catalog (50 keys) and `role_action_grants` seeds are in the DB. All helpers are ready. **Zero route handlers have been wired yet** — all existing `roleName` checks are still active and authoritative. Wiring happens slice-by-slice when workflows are stable. See [`rbac-migration/plan.md`](rbac-migration/plan.md) for the exact step-by-step wiring process.

---

## Role Definitions

### SDR (Sales Development Representative)
- Default pages: `/dashboard`, `/leads`, `/crm`, `/quotes`, `/orders`, `/completed` (+ universal `/profile`)
- Triage the AI inbox: validate, quote, route, reject, hold leads
- Add leads manually
- View and manage CRM contacts
- Create new quotes and orders
- **Quotes / Orders / Completed list scope:** tickets where `created_by_id` = SDR only (same rule on all three pages)
- View **Completed** orders they personally created through full lifecycle
- **Excluded from lists:** after Sales **claims** an HVT quote, `created_by_id` becomes Sales — row leaves SDR Quotes/Orders/Completed lists
- **Detail read (not list):** `canAccessTicket()` may still allow read-only GET on in-progress hand-offs where `routed_by_id` = SDR until `completed`
- **Hard-blocked when a quote total exceeds `company_settings.high_value_threshold`** — a non-dismissible modal forces the quote to be saved as `routed` (status) and handed to Sales. SDR cannot bypass this.
- **Voluntary route below threshold:** on new quote **Line Items** or **Quote** tab, SDR may click **Route to Sales** (reason modal + optional notes) — same `routed` status and Sales claim queue as HVT. Quote tab allows completing shipping, tax, and payment settings before routing.

### Sales
- Default pages: `/dashboard`, `/sales`, `/crm`, `/quotes`, `/orders` (+ universal `/profile`)
- Work leads routed to them
- Manage sales pipeline (claim, update status, hold, create orders)
- See "Routed to Sales" tab on `/quotes` page — quotes routed from SDR HVT block
- **Claim** routed quotes (transfers ownership and sets status back to `draft`)

### Admin
- Default pages: all pages including `/admin/*`, `/payments`, `/orders`, `/completed`
- All SDR and Sales capabilities
- Manage users, roles, system settings; **bulk lead import** at `/admin/settings/import-export` (JSON validate-first)
- **Mark Completed** on in-production orders — paid in full, or with outstanding balance after acknowledgment modal (`acknowledge_outstanding_balance: true`; **Option B** — accountants cannot)
- **Resend invoice link** on production/completed detail

### Accountant
- Default pages: `/dashboard`, `/payments`, `/orders`, `/completed` (+ universal `/profile`)
- Default home after login: `/payments`
- **No quote workflow** — `/quotes` not in default pages; `GET /api/quotes/*` and quote-list `GET /api/tickets?kind=quote` return `403`
- Review customer-submitted payment evidence on `/payments` (Pending · **Tax-exempt pending** · Approved · **Refunded** tabs)
- **Confirm payment** via `record_payment` PATCH action (blocked while tax-exempt permit review pending)
- **Approve / deny tax-exempt** via `approve_tax_exempt` / `deny_tax_exempt` PATCH actions; deny requires `sales_permit_denial_notes` (internal only); view permit file via `GET /api/tickets/[id]/sales-permit` (accountant/admin only)
- **Staff replace** on `/payments` Pending + Tax-exempt tabs — `POST /api/tickets/[id]/evidence` (payment proof) or `POST /api/tickets/[id]/sales-permit` (permit + required **Sales Permit #**)
- **Legacy tax-exempt (permit #, no file):** any role with `canMutateTicket` may upload permit on the order (`POST /api/tickets/[id]/sales-permit`); accountant may also upload/replace from `/payments`; approves on `/payments` after file exists
- **Refund payment** via `POST /api/tickets/[id]/refund` (manual + Stripe per slot) — same as Admin
- **Cancel quote/order** via `PATCH /api/tickets/[id]` (`ticket_status: cancelled`) — same as Admin; partial-refund warning in UI first when applicable
- View orders, production, and completed orders (read-only except mark complete, refund, cancel)
- **GET ticket** via `/api/tickets/[id]` only for `sent` / `order` / `in_production` / `completed` / `cancelled` — not draft/routed/approved quote editing
- **Mark Completed** on in-production orders **only when paid in full** (`isTicketPaidInFull()`)
- Cannot edit quote line items or change ticket status otherwise (except cancel, payment confirm, refund)

### Custom Roles (Admin-created)
- Admin gives the role a name and display label
- Admin then checks which pages from the `pages` table this role can access
- Users can be assigned to custom roles exactly like system roles
- Custom roles cannot access `/admin/*`, `/reports`, or `/activity-log` — locked in Roles UI; grant API returns `403`; proxy hard-blocks non-admins

> **Note — System role permissions are locked in the UI.** SDR, Sales, Accountant, and Admin page-permission checkboxes are read-only. Permissions for system roles are fixed and can only be changed via a database migration. Custom roles remain editable; admin-only pages (`/admin`, `/reports`, `/activity-log`) show a lock badge and cannot be granted.

---

## Route Access Matrix

| Route | SDR | Sales | Admin | Accountant | Notes |
|-------|:---:|:-----:|:-----:|:----------:|-------|
| `/dashboard` | ✓ | ✓ | ✓ | ✓ | Role-scoped KPIs |
| `/leads` | ✓ | ✗ | ✓ | ✗ | Inbox + SDR pipeline |
| `/sales` | ✗ | ✓ | ✓ | ✗ | Sales pipeline |
| `/crm` | ✓ | ✓ | ✓ | ✗ | |
| `/quotes` | ✓ | ✓ | ✓ | ✗ | Quoted Requests list |
| `/quotes/new` | ✓ | ✓ | ✓ | ✗ | Create new quote/order |
| `/quotes/[id]` | ✓ | ✓ | ✓ | ✗ | View/edit ticket detail |
| `/orders` | ✓ | ✓ | ✓ | ✓ | Orders list: pending payment, in production, cancelled **orders** (`ticket_kind = 'order'` only; cancelled quotes on `/quotes`) |
| `/orders/[id]` | ✓ | ✓ | ✓ | ✓ | Order / in-production detail via `GET /api/tickets/[id]` — sales/SDR read-only during payment review; accountant confirms on `/payments` or here |
| `/payments` | ✗ | ✗ | ✓ | ✓ | Payment review queue |
| `/payments/[id]` | ✗ | ✗ | ✓ | ✓ | Payment / tax-exempt review detail — Confirm payment or tax-exempt; view evidence/permit (accountant/admin) |
| `/production` | — | — | — | — | **Removed from nav** — redirects to `/orders?tab=in_production` |
| `/production/[id]` | — | — | — | — | Redirects to `/orders/[id]` |
| `/completed` | ✓ (created) | ✗ | ✓ | ✓ | SDR: only tickets they created — not Sales-completed routed hand-offs |
| `/completed/[id]` | ✓ (created) | ✗ | ✓ | ✓ | Resend invoice: admin any ticket; others own tickets only |
| `/q/[token]` | ✓ | ✓ | ✓ | ✓ | Public — staff preview while logged in |
| `/settings` | ✗ | ✗ | ✓ | ✗ | Admin-only — redirects to `/admin/settings/users` |
| `/profile` | ✓ | ✓ | ✓ | ✓ | Personal profile stub — **universal** in `proxy.ts` (not `role_permissions`) |
| `/admin` | ✗ | ✗ | ✓ | ✗ | |
| `/admin/users` | ✗ | ✗ | ✓ | ✗ | |
| `/admin/settings` | ✗ | ✗ | ✓ | ✗ | |
| `/admin/audit` | ✗ | ✗ | ✓ | ✗ | |
| `/reports` | ✗ | ✗ | ✓ | ✗ | Admin-only — proxy hard-block even if granted in DB |
| `/activity-log` | ✗ | ✗ | ✓ | ✗ | Admin-only — proxy hard-block even if granted in DB |

Admin accessing `/leads` or `/sales` should see the full (unfiltered) view of all leads in those sections.

---

## API Endpoint Access Matrix

All app endpoints require **`requireSession()`** (MFA-complete) unless noted. Admin-only routes also call **`requireAdmin()`**. List endpoints call **`requirePageAccess()`**; lead drawer routes call **`requireLeadApiPageAccess()`** (`/leads` or `/sales`); ticket detail/PDF/print call **`requireTicketDetailPageAccess()`**. See **`docs/security.md`**.

| Endpoint | SDR | Sales | Admin | Notes |
|----------|:---:|:-----:|:-----:|-------|
| `GET /api/leads/workspace/*` | ✓ | ✗ | ✓ | Requires `/leads` page permission |
| `GET /api/leads/sales/*` | ✗ | ✓ | ✓ | Requires `/sales` page permission |
| `POST /api/leads/manual` | ✓ | ✗ | ✓ | SDR/admin only + `/leads` permission |
| `GET /api/leads/[id]` | ✓ | ✓ | ✓ | `requireLeadApiPageAccess()` + `canReadLead()` |
| `PATCH /api/leads/[id]` | ✓ | ✓ | ✓ | `requireLeadApiPageAccess()` + `canMutateLead()` |
| `POST /api/leads/[id]/lock` | ✓ | ✓ | ✓ | `requireLeadApiPageAccess()` + `canAcquireLeadLock()` |
| `POST /api/leads/[id]/unlock` | ✓ (own lock) | ✓ (own lock) | ✓ (any lock) | `requireLeadApiPageAccess()` |
| `POST /api/leads/[id]/hold` | ✓ | ✓ | ✓ | `requireLeadApiPageAccess()` + scoped-tab helpers |
| `POST /api/leads/[id]/resume` | ✓ | ✓ | ✓ | `requireLeadApiPageAccess()` + scoped-tab helpers |
| `POST /api/leads/[id]/follow-up` | ✓ | ✓ | ✓ | `requireLeadApiPageAccess()` + scoped-tab helpers |
| `POST /api/leads/[id]/claim` | ✗ | ✓ | ✓ | `canClaimLead()` + `/sales` permission |
| `POST /api/leads/[id]/reassign` | ✗ | ✗ | ✓ | |
| `GET /api/crm/page-data` | ✓ | ✓ | ✓ | Requires `/crm` page permission |
| `GET /api/customers`, lookup, `[id]` | ✓ | ✓ | ✓ | Requires `/crm` page permission |
| `GET /api/customers/[id]/shipping-addresses` | ✓ | ✓ | ✓ | `/crm` or `/quotes`; **`scopeJobTicketsQuery()`** on ticket ids |
| `PATCH /api/customers/[id]` | ✓ | ✓ | ✓ | Requires `/crm` page permission |
| `POST /api/customers/[id]/merge` | ✗ | ✓ | ✓ | Requires `/crm` page permission |
| `GET /api/tickets` | ✓ (own) | ✓ (own + all routed) | ✓ (all) | Accountant: ✗ quote list (`kind=quote`) |
| `GET /api/quotes/page-data` | ✓ | ✓ | ✓ | Accountant → `403` |
| `GET /api/quotes/counts` | ✓ | ✓ | ✓ | Accountant → `403` |
| `POST /api/tickets` | ✓ | ✓ | ✓ | Accountant → `403` |
| `GET /api/tickets/[id]` | ✓ (own) | ✓ (own + routed) | ✓ (all) | `canAccessTicket()` + ticket-detail page access |
| `PATCH /api/tickets/[id]` | ✓ (own, non-order) | ✓ (own + claim routed) | ✓ (all) | `canPatchTicket()` — accountant: payment/cancel/complete/refund only |
| `PATCH … { record_payment: true }` | ✗ | ✗ | ✓ | Accountant + Admin only |
| `PATCH … { approve_tax_exempt: true }` | ✗ | ✗ | ✓ | Accountant + Admin only |
| `PATCH … { deny_tax_exempt: true }` | ✗ | ✗ | ✓ | Accountant + Admin only |
| `GET /api/tickets/[id]/sales-permit` | ✗ | ✗ | ✓ | Accountant + Admin only (signed URL) |
| `GET /api/crm/customers/[id]/tax-exempt-history` | ✓ | ✓ | ✓ | CRM page access — tax-exempt See more modal |
| `PATCH … { ticket_status: 'cancelled' }` | ✗ | ✗ | ✓ | Admin + Accountant — reason + notes required |
| `POST /api/tickets/[id]/refund` | ✗ | ✗ | ✓ | ✓ | Accountant + Admin — unified manual + Stripe |
| `GET /api/tickets/[id]/refund-evidence/[refundId]` | ✗ | ✗ | ✓ | ✓ | Accountant + Admin |
| `GET /api/payments/page-data` | ✗ | ✗ | ✓ | Pending + Tax-exempt pending + Approved + Refunded tabs (Accountant + Admin) |
| `PATCH … { send_payment_reminder: true }` | ✓ (own) | ✓ (own) | ✓ (all) | Admin any ticket; others `created_by_id` only |
| `PATCH … { resend_invoice: true }` | ✓ (own) | ✓ (own) | ✓ (all) | Same ownership rule as payment reminder |
| `PATCH … { release_production: true }` | ✓ (own) | ✓ (own) | ✓ | Legacy — stamps `production_released_at` only; ticket owners + admin via `canMutateTicket()`. Prefer `maybeAutoReleaseProduction()` on payment confirm. No UI wired (May 2026). |
| `GET /api/payments/pending` | ✗ | ✗ | ✓ | ✓ | Accountant + Admin |
| `GET /api/payments/counts` | ✗ | ✗ | ✓ | ✓ | Accountant + Admin |
| `GET /api/production/*` | ✓ (scoped) | ✓ (scoped) | ✓ | Legacy — `scopeJobTicketsQuery()` + `/orders` permission |
| `GET /api/orders/page-data` | ✓ (own) | ✓ (own + routed) | ✓ | Requires `/orders` page permission |
| `GET /api/completed/orders` | ✓ (created) | ✗ | ✓ | Legacy — scoped + page permission |
| `GET /api/completed/counts` | ✓ (created) | ✗ | ✓ | ✓ | Same scope as completed list |
| `GET /api/completed/page-data` | ✓ (created) | ✗ | ✓ | ✓ | List + counts in one request |
| `GET /api/tickets/[id]/pdf` | ✓ (own scope) | ✓ (own + routed) | ✓ | `requireTicketDetailPageAccess()` + `canAccessTicket()` |
| `GET /api/tickets/[id]/print` | ✓ (own scope) | ✓ (own + routed) | ✓ | Same as PDF |
| `GET /api/tickets/[id]/evidence` | ✗ | ✗ | ✓ | Accountant + Admin — signed URL |
| `GET /api/tickets/counts` | ✓ | ✓ | ✓ | Requires `/quotes` or `/orders`; accountant blocked |
| `GET /api/sidebar-counts` | ✓ | ✓ | ✓ | Server resolves allowed routes — no client `?routes=` forgery |
| `GET /api/lookups` | ✓ | ✓ | ✓ |
| `GET /api/lookups/products` | ✓ | ✓ | ✓ |
| `GET /api/activities` | ✓ | ✓ | ✓ | Lead/ticket scope; `requireSession()` + lead/ticket access checks |
| `GET /api/leads/[id]/activities` | ✓ | ✓ | ✓ | `requireLeadApiPageAccess()` + `canReadLead()` |
| `GET /api/dashboard/kpis` | ✓ | ✓ | ✓ | ✗ | SDR/Sales/Admin branches only; accountant → `403` (uses `/api/payments/counts`) |
| `GET /api/user/dashboard-privacy` | ✓ | ✓ | ✓ | ✓ | Own profile — read hide/show preference |
| `PATCH /api/user/dashboard-privacy` | ✓ | ✓ | ✓ | ✓ | Own profile — toggle dashboard values privacy |
| `GET /api/admin/company` | ✓ (safe fields) | ✓ (safe fields) | ✓ (full row) | Non-admin: tax rate, thresholds, idle timeout only |
| `PATCH /api/admin/company` | ✗ | ✗ | ✓ | Includes bank/Zelle remittance fields |
| `GET /api/admin/product-types` | ✓ | ✓ | ✓ | Authenticated + MFA; inactive types included |
| `POST /api/admin/product-types` | ✗ | ✗ | ✓ |
| `PATCH/DELETE /api/admin/product-types/[id]` | ✗ | ✗ | ✓ |
| `GET /api/admin/users` | ✗ | ✗ | ✓ |
| `POST /api/admin/users/create` | ✗ | ✗ | ✓ |
| `PATCH /api/admin/users/[id]` | ✗ | ✗ | ✓ |
| `GET /api/admin/lookups` | ✗ | ✗ | ✓ |
| `POST /api/admin/lookups` | ✗ | ✗ | ✓ |
| `PATCH/DELETE /api/admin/lookups/[id]` | ✗ | ✗ | ✓ |
| `GET /api/admin/leads/import/template` | ✗ | ✗ | ✓ |
| `POST /api/admin/leads/import` | ✗ | ✗ | ✓ |
| `GET/POST /api/admin/materials` | ✗ | ✗ | ✓ |
| `PATCH/DELETE /api/admin/materials/[id]` | ✗ | ✗ | ✓ |
| `GET /api/admin/activity-log` | ✗ | ✗ | ✓ |

---

## Database RLS Matrix

Migration **096** (May 2026) tightened several policies. Route Handlers remain the primary gate (service role); RLS is defence-in-depth for browser/realtime client.

| Table | SDR | Sales | Admin | Accountant |
|-------|-----|-------|-------|------------|
| `user_profiles` | Read own | Read own | Read + Write all | Read own |
| `customers` | Read + Write | Read + Write | Read + Write all | **No direct access** |
| `leads` | Read all; UPDATE scoped | Read routed + owned; UPDATE scoped | Read + UPDATE all | No direct access |
| `job_tickets` | Read + Write own | Read + Write own + routed | Read + Write all | Read via ticket policies (detail) |
| `activities` | Read + Insert | Read + Insert | Read + Insert all | Read + Insert |
| `ticket_shipping_destinations` | **No client access** | **No client access** | **No client access** | **No client access** |
| `notifications` | Read + Update own | Read + Update own | Read + Write all | Read + Update own |
| `lookup_values` | Read active | Read active | Read all + Write | Read active |
| `product_types` / `materials` | Read all | Read all | Read + Write all | Read all |
| `company_settings` | **No direct SELECT** (API safe subset) | **No direct SELECT** | SELECT + UPDATE (admin policy) | **No direct SELECT** |
| `mfa_trusted_devices` | No client access | No client access | No client access | No client access |

---

## `proxy.ts` Extension

The existing `proxy.ts` enforces on **pages** (not `/api/*`):

1. Unauthenticated → redirect to `/login`
2. No TOTP enrolled → redirect to `/setup-2fa` *(skipped when `user_profiles.mfa_required = false`)*
3. Session not AAL2 → redirect to `/verify-2fa` *(skipped when trusted-device cookie valid or `mfa_required = false`)*

**API routes** mirror steps 1–3 via `requireSession()` in every Route Handler, plus page gates (`requirePageAccess`, `requireLeadApiPageAccess`, `requireTicketDetailPageAccess`). Non-admins are hard-blocked from **`/reports`** and **`/activity-log`** even if stale `role_permissions` rows exist. See **`docs/security.md`**.

Admins can toggle **`mfa_required`** per user on **Admin → Users** (confirmation dialog). Default is `true` for all users. Admins cannot disable their own 2FA.

**Remember this device (30 days):** on the login page, users can opt in to skip the authenticator step on the same browser for 30 days after their next successful 2FA verification. Signing out revokes trust for that browser.

**New steps 4–6:**

```typescript
// Pseudo-code — actual implementation in proxy.ts

// Step 4: Load user profile
const { data: profile } = await supabase
  .from('user_profiles_with_role')   // convenience view: joins roles table
  .select('role_name, is_active, must_change_password')
  .eq('id', user.id)
  .single()

// Step 5: Deactivated user
if (!profile?.is_active) {
  return NextResponse.redirect(new URL('/login?error=deactivated', request.url))
}

// Step 6: Force password change
if (profile?.must_change_password && !pathname.startsWith('/change-password')) {
  return NextResponse.redirect(new URL('/change-password', request.url))
}

// Step 7: DB-driven route permission check
const { data: allowedPages } = await supabase
  .from('role_permissions')
  .select('pages(route)')
  .eq('role_id', profile.role_id)   // role_id from the profile

const allowedRoutes = allowedPages?.map(p => p.pages.route) ?? []

// Check if current path is allowed
const isAllowed = allowedRoutes.some(route =>
  pathname === route || pathname.startsWith(route + '/')
)

if (!isAllowed) {
  // Redirect to the first allowed page (or /dashboard as fallback)
  const firstAllowed = allowedRoutes.find(r => r !== '/profile') ?? '/dashboard'
  return NextResponse.redirect(new URL(firstAllowed, request.url))
}
```

**Key behaviors:**
- Wrong-role users are redirected to their first permitted page — not just `/dashboard`
- A Sales user typing `/leads` lands on `/sales` (because `/sales` is their first matching allowed page)
- `must_change_password = true` → intercepted before role check → forced to `/change-password`
- Custom roles get the same treatment — only the pages explicitly granted to them are accessible

**Performance note:** This hits Supabase on every request. For an internal CRM with a small number of concurrent users this is acceptable. Add Next.js request-level caching (`unstable_cache`) if latency becomes noticeable.

---

## Lead Locking Rules

A lead is **claimed** when an SDR clicks **Claim** (or an Admin assigns). Lock state is stored as `locked_by_id` + `locked_at` on the `leads` row. **Manual Add Lead** does not set a lock — new leads stay in the open pool until Claim/Assign.

### Lead Visibility (Queue Filtering)

The All Leads tab uses an **All Leads / My Leads** toggle (`owner_scope`):

| Role | Toggle | Sees |
|------|--------|------|
| SDR | **All Leads** (`owner_scope=all`) | Unclaimed pool only (`locked_by_id IS NULL`) |
| SDR | **My Leads** (`owner_scope=mine`) | Leads claimed by current user (`locked_by_id = me`) |
| SDR | *(either toggle)* | Never sees leads locked by another SDR |
| Admin | — | All leads — includes leads locked by any SDR; also returns `locked_by` profile for the Working column |
| Sales | — | Not applicable — Sales users access `/sales`, not `/leads` |

### Acquiring a Lock

When an SDR clicks **Claim**, the client calls `POST /api/leads/[id]/lock`:

| Scenario | Result |
|----------|--------|
| Lead is unlocked | Lock granted — drawer opens in edit mode |
| Lead is locked by the same user | Lock refreshed — drawer opens in edit mode |
| Lead is locked by a different SDR (race condition) | `409` returned — drawer opens in read-only mode with banner |
| Admin opens any lead | **No lock call** — drawer opens in **edit mode** directly (Edit action) |

### Read-Only Mode (Race Condition — Locked by Another)

This is a safety net for stale-page scenarios. The drawer opens read-only:
- All inputs are disabled
- A banner shows: **"[Name] is currently working this lead"**
- No action buttons (Route, Hold, Reject, Save) are shown
- History tab is still accessible
- On close or page refresh, the lead disappears from the SDR's queue (filtered out by the API)

### Releasing a Lock (Soft Lock — Permanent Ownership)

Ownership persists beyond drawer close. It is only released by a terminal action:

| Trigger | Action |
|---------|--------|
| SDR routes lead to Sales | Client calls `POST /api/leads/[id]/unlock` after successful route |
| SDR rejects lead | Client calls `POST /api/leads/[id]/unlock` after successful reject |
| Admin force-releases | Admin calls `POST /api/leads/[id]/unlock` for any lead |
| Admin reassigns to another SDR | `POST /api/leads/[id]/reassign` sets `locked_by_id` + `sdr_id` to the new user |
| Admin unassigns | `POST /api/leads/[id]/reassign` with `user_id: null` — clears all three fields |

**Ownership does NOT release** when:
- SDR closes the drawer
- SDR clicks Save
- SDR validates (Pending → Validated)
- SDR puts lead on Hold or resumes from Hold

**No auto-expiry** — the lock persists until one of the release triggers above. Only Admin can force-release an abandoned lock.

### Sales pipeline (`/sales`) — separate from SDR lock

Sales reps do **not** use `locked_by_id` for day-to-day ownership. They use **`sales_owner_id`** via **`POST /api/leads/[id]/claim`**.

| Action | `sales_owner_id` | `locked_by_id` |
|--------|------------------|----------------|
| Claim unclaimed lead | Set to current user | Unchanged |
| Open your claimed lead | Unchanged | **Not set** (May 2026) |
| Close modal | Unchanged | Cleared via unlock if a temp lock existed |
| On Hold / Follow Up Later | Unchanged | Cleared server-side on write |

Other Sales reps do not see leads where `sales_owner_id` is another user (except unclaimed rows on Pipeline/Hold). See `docs/feature-specs/lead-locking.md` and `docs/feature-specs/leads-sales.md`.

---

## Terminal State Rules

| State | Who can change it |
|-------|------------------|
| `status = 'Rejected'` (SDR-rejected) | Admin only |
| `sales_status = 'Rejected'` (Sales-rejected) | Admin only |
| `sales_status = 'Won'` | Admin only |

When a non-Admin calls `PATCH /api/leads/[id]` or any status-changing endpoint on a rejected/won lead, the server returns `403` with `code: 'LEAD_REJECTED_TERMINAL'`.

**Admin un-reject flow:** Admin opens the lead (which is read-only in the normal UI), the lead is shown with an "Admin Override" banner, and Admin can move it to any status.

---

## Role-Aware UI Rendering

Role is read directly from Supabase (`user_profiles.roles(name)`) in each component that needs it.

| UI Element | SDR | Sales | Admin |
|------------|:---:|:-----:|:-----:|
| Sidebar: Leads section | ✓ | ✗ | ✓ |
| Sidebar: Sales section | ✗ | ✓ | ✓ |
| Sidebar: Admin section | ✗ | ✗ | ✓ |
| Dashboard: personal KPIs (own leads/deals only) | ✓ | ✓ | ✗ |
| Dashboard: global KPIs + Team grid | ✗ | ✗ | ✓ |
| Leads: **Claim** button (unclaimed — acquires lock + permanent ownership) | ✓ | ✗ | ✗ |
| Leads: **View** button (SDR re-opens their own lead) | ✓ | ✗ | ✗ |
| Leads: **Edit** button (Admin — no lock, opens in edit mode) | ✗ | ✗ | ✓ |
| Leads: **Reassign** button (owned leads only) | ✗ | ✗ | ✓ |
| Leads: **Owner** column (SDR name or "Unclaimed" badge) | ✓ | ✗ | ✓ |
| Leads: My Leads / All Leads toggle filter | ✓ | ✗ | ✗ |
| Leads: sees other SDRs locked leads in queue | ✗ | ✗ | ✓ |
| Leads: scoped tabs show own leads only | ✓ | ✗ | ✗ |
| Leads: scoped tabs show ALL leads | ✗ | ✗ | ✓ |
| Route Lead / Reject buttons | ✓ | ✗ | ✓ |
| Sales: Claim Lead button | ✗ | ✓ | ✓ |
| CRM: Merge contact | ✗ | ✓ | ✓ |
| Quotes: "Routed to Sales" tab | ✗ | ✓ | ✓ |
| Quotes: Claim button (routed → draft + ownership transfer) | ✗ | ✓ | ✓ |
| Quotes/New Quote: HVT blocking modal | ✓ (triggered when total > threshold) | ✗ | ✗ |
| Quotes/New Quote: Route to Sales (Line Items or Quote, below threshold) | ✓ | ✗ | ✗ |
---

## Default Post-Login Destination

`lib/auth/resolve-default-home.ts` — role-specific first page after auth (also used when `proxy.ts` redirects unauthorized routes):

| Role | Path |
|------|------|
| SDR | `/leads` |
| Sales | `/sales` |
| Accountant | `/payments` |
| Admin (and other roles) | `/dashboard` |

After MFA setup or password change, users land on their role home — not always `/dashboard`.

---

## User Lifecycle

1. Admin creates user via **Admin → Settings → Users** → **Add User** (`POST /api/admin/users/create`) with email, role, and temporary password
2. Admin creates user with temp password; optional **Send welcome email** (Instantly, checked by default) includes login URL + credentials — or admin shares password manually if email fails
3. User logs in with temp password → `proxy.ts` redirects to `/change-password` when `must_change_password = true`
4. After password change → `/setup-2fa` if no TOTP enrolled, else role home via `resolveDefaultHomePath()`
5. Admin can deactivate user (`is_active = false`) → `proxy.ts` redirects to `/login?error=deactivated`
6. Deactivated users' Supabase Auth sessions may still exist; `proxy.ts` rejects them at the application layer
