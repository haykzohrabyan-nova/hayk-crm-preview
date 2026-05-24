# BazarCRM — RBAC (Role-Based Access Control)

Roles are **fully database-driven**. Three system roles (SDR, Sales, Admin) are seeded and cannot be deleted. Admin can create additional custom roles and assign page access to each via the Settings → Roles tab.

**Enforcement layers:**
1. **`proxy.ts`** — reads role permissions from DB on every request; redirects unauthorized roles
2. **Route Handlers** — `current_user_role()` DB function for secondary enforcement
3. **Supabase RLS** — database-level row filtering regardless of who calls the API

---

## Role Definitions

### SDR (Sales Development Representative)
- Default pages: `/dashboard`, `/leads`, `/crm`, `/quotes`, `/orders`, `/settings`
- Triage the AI inbox: validate, quote, route, reject, hold leads
- Add leads manually
- View and manage CRM contacts
- Create new quotes and orders
- **Hard-blocked when a quote total exceeds `company_settings.high_value_threshold`** — a non-dismissible modal forces the quote to be saved as `routed` (status) and handed to Sales. SDR cannot bypass this.

### Sales
- Default pages: `/dashboard`, `/sales`, `/crm`, `/quotes`, `/orders`, `/settings`
- Work leads routed to them
- Manage sales pipeline (claim, update status, hold, create orders)
- See "Routed to Sales" tab on `/quotes` page — quotes routed from SDR HVT block
- **Claim** routed quotes (transfers ownership and sets status back to `draft`)

### Admin
- Default pages: all pages including `/admin/*`, `/payments`, `/orders`, `/completed`
- All SDR and Sales capabilities
- Manage users, roles, system settings
- **Mark Completed** on any in-production order (paid or unpaid)
- **Resend invoice link** on production/completed detail

### Accountant
- Default pages: `/dashboard`, `/payments`, `/orders`, `/completed`, `/settings`
- Default home after login: `/payments`
- Review customer-submitted payment evidence on `/payments`
- **Confirm payment** via `record_payment` PATCH action
- View orders, production, and completed orders (read-only except mark complete)
- **GET any ticket** via `/api/tickets/[id]` — matches list scoping so order detail pages do not 403
- **Mark Completed** on in-production orders **only when paid in full** (`isTicketPaidInFull()`)
- Cannot edit quote line items or change ticket status otherwise

### Custom Roles (Admin-created)
- Admin gives the role a name and display label
- Admin then checks which pages from the `pages` table this role can access
- Users can be assigned to custom roles exactly like system roles
- Custom roles cannot access `/admin/*` pages unless explicitly granted

> **Note — System role permissions are locked in the UI.** The Admin panel displays the three system roles (Admin, SDR, Sales) in the Roles tab but their page-permission checkboxes are read-only. The "New Role" button is currently hidden (owner decision). Permissions for system roles are fixed and can only be changed via a database migration.

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
| `/orders` | ✓ | ✓ | ✓ | ✓ | Orders list: pending payment, in production, cancelled (includes evidence-pending for ticket owner) |
| `/orders/[id]` | ✓ | ✓ | ✓ | ✓ | Order / in-production detail via `GET /api/tickets/[id]` — sales/SDR read-only during payment review; accountant confirms on `/payments` or here |
| `/payments` | ✗ | ✗ | ✓ | ✓ | Payment review queue |
| `/payments/[id]` | ✗ | ✗ | ✓ | ✓ | Payment review detail — Confirm payment, view evidence |
| `/production` | — | — | — | — | **Removed from nav** — redirects to `/orders?tab=in_production` |
| `/production/[id]` | — | — | — | — | Redirects to `/orders/[id]` |
| `/completed` | ✗ | ✗ | ✓ | ✓ | Completed orders |
| `/completed/[id]` | ✗ | ✗ | ✓ | ✓ | Resend invoice link |
| `/q/[token]` | ✓ | ✓ | ✓ | ✓ | Public — staff preview while logged in |
| `/settings` | ✓ | ✓ | ✓ | ✓ | Personal profile only |
| `/admin` | ✗ | ✗ | ✓ | ✗ | |
| `/admin/users` | ✗ | ✗ | ✓ | ✗ | |
| `/admin/settings` | ✗ | ✗ | ✓ | ✗ | |
| `/admin/audit` | ✗ | ✗ | ✓ | ✗ | |

Admin accessing `/leads` or `/sales` should see the full (unfiltered) view of all leads in those sections.

---

## API Endpoint Access Matrix

| Endpoint | SDR | Sales | Admin |
|----------|:---:|:-----:|:-----:|
| `GET /api/leads/workspace` | ✓ | ✓ (filtered) | ✓ (all) |
| `POST /api/leads/manual` | ✓ | ✗ | ✓ |
| `GET /api/leads/[id]` | ✓ | ✓ | ✓ |
| `PATCH /api/leads/[id]` | ✓ | ✓ | ✓ |
| `POST /api/leads/[id]/lock` | ✓ | ✓ | ✓ (no lock acquired for admin View) |
| `POST /api/leads/[id]/unlock` | ✓ (own lock) | ✓ (own lock) | ✓ (any lock) |
| `POST /api/leads/[id]/hold` | ✓ | ✓ | ✓ |
| `POST /api/leads/[id]/resume` | ✓ | ✓ | ✓ |
| `POST /api/leads/[id]/claim` | ✗ | ✓ | ✓ |
| `POST /api/leads/[id]/reassign` | ✗ | ✗ | ✓ |
| `GET /api/customers/lookup` | ✓ | ✓ | ✓ |
| `GET /api/customers/companies` | ✓ | ✓ | ✓ |
| `GET /api/customers/[id]` | ✓ | ✓ | ✓ |
| `PATCH /api/customers/[id]` | ✓ | ✓ | ✓ |
| `POST /api/customers/[id]/merge` | ✓ | ✗ | ✓ |
| `GET /api/tickets` | ✓ (own) | ✓ (own + all routed) | ✓ (all) |
| `POST /api/tickets` | ✓ | ✓ | ✓ |
| `GET /api/tickets/[id]` | ✓ (own) | ✓ (own + routed) | ✓ (all) | Accountant: evidence review OR in_production/completed |
| `PATCH /api/tickets/[id]` | ✓ (own, non-order) | ✓ (own + claim routed) | ✓ (incl. manual convert to order) | Accountant: payment fields + `record_payment`; mark `completed` when paid in full |
| `PATCH … { record_payment: true }` | ✗ | ✗ | ✓ | ✓ | Accountant + Admin only |
| `PATCH … { resend_invoice: true }` | ✗ | ✗ | ✓ | ✓ | Admin + Accountant (order/completed detail) |
| `PATCH … { release_production: true }` | ✗ | ✗ | ✓ | Admin |
| `GET /api/payments/pending` | ✗ | ✗ | ✓ | ✓ | Accountant + Admin |
| `GET /api/payments/counts` | ✗ | ✗ | ✓ | ✓ | Accountant + Admin |
| `GET /api/production/orders` | ✗ | ✗ | ✓ | ✓ | Legacy — prefer `GET /api/orders/orders` |
| `GET /api/completed/orders` | ✗ | ✗ | ✓ | ✓ | Accountant + Admin |
| `GET /api/tickets/[id]/evidence` | ✗ | ✗ | ✓ | ✓ | Accountant + Admin — signed URL; hidden from sales/SDR on order detail UI |
| `GET /api/tickets/counts` | ✓ | ✓ | ✓ |
| `GET /api/lookups` | ✓ | ✓ | ✓ |
| `GET /api/lookups/products` | ✓ | ✓ | ✓ |
| `GET /api/activities` | ✓ | ✓ | ✓ |
| `GET /api/activity` | ✓ | ✓ | ✓ |
| `POST /api/activity` | ✓ | ✓ | ✓ |
| `GET /api/dashboard/kpis` | ✓ | ✓ | ✓ |
| `POST /api/outreach/send` | ✓ | ✓ | ✓ |
| `GET /api/admin/company` | ✓ | ✓ | ✓ |
| `PATCH /api/admin/company` | ✗ | ✗ | ✓ |
| `GET /api/admin/users` | ✗ | ✗ | ✓ |
| `POST /api/admin/users/create` | ✗ | ✗ | ✓ |
| `PATCH /api/admin/users/[id]` | ✗ | ✗ | ✓ |
| `GET /api/admin/lookups` | ✗ | ✗ | ✓ |
| `POST /api/admin/lookups` | ✗ | ✗ | ✓ |
| `PATCH/DELETE /api/admin/lookups/[id]` | ✗ | ✗ | ✓ |
| `GET/POST /api/admin/product-types` | ✗ | ✗ | ✓ |
| `PATCH/DELETE /api/admin/product-types/[id]` | ✗ | ✗ | ✓ |
| `GET/POST /api/admin/materials` | ✗ | ✗ | ✓ |
| `PATCH/DELETE /api/admin/materials/[id]` | ✗ | ✗ | ✓ |
| `GET /api/admin/activity-log` | ✗ | ✗ | ✓ |

---

## Database RLS Matrix

| Table | SDR | Sales | Admin |
|-------|-----|-------|-------|
| `user_profiles` | Read own | Read own | Read + Write all |
| `customers` | Read + Write | Read + Write | Read + Write all |
| `leads` | Read + Write all | Read routed + owned | Read + Write all |
| `job_tickets` | Read + Write own | Read + Write own | Read + Write all |
| `activities` | Read + Insert | Read + Insert | Read + Insert all |
| `notifications` | Read + Update own | Read + Update own | Read + Write all (admin broadcasts) |
| `lookup_values` | Read active | Read active | Read all + Write |
| `product_types` / `materials` | Read all | Read all | Read + Write all |
| `company_settings` | Read | Read | Read + Write |

---

## `proxy.ts` Extension

The existing `proxy.ts` enforces:
1. Unauthenticated → redirect to `/login`
2. No TOTP enrolled → redirect to `/setup-2fa` *(skipped when `user_profiles.mfa_required = false`)*
3. Session not AAL2 → redirect to `/verify-2fa` *(skipped when `mfa_required = false`)*

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
  const firstAllowed = allowedRoutes.find(r => r !== '/settings') ?? '/dashboard'
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

A lead is "locked" when an SDR has its drawer open. Lock state is stored as `locked_by_id` + `locked_at` on the `leads` row.

### Lead Visibility (Queue Filtering)

Before a lock is ever acquired, the API filters which leads each role can see on the All Leads tab:

| Role | Sees |
|------|------|
| SDR | Unlocked leads (`locked_by_id IS NULL`) + leads they themselves have open |
| Admin | All leads — includes leads locked by any SDR; also returns `locked_by` profile for the Working column |
| Sales | Not applicable — Sales users access `/sales`, not `/leads` |

### Acquiring a Lock

When an SDR clicks Verify, the client calls `POST /api/leads/[id]/lock`:

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
- No action buttons (Verify, Hold, Route, Reject) are shown
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
| CRM: Merge contact | ✓ | ✗ | ✓ |
| Quotes: "Routed to Sales" tab | ✗ | ✓ | ✓ |
| Quotes: Claim button (routed → draft + ownership transfer) | ✗ | ✓ | ✓ |
| Quotes/New Quote: HVT blocking modal | ✓ (triggered when total > threshold) | ✗ | ✗ |
---

## Default Post-Login Destination

`lib/auth/resolve-default-home.ts` — currently hardcoded to `/dashboard`. No change needed; all roles land on `/dashboard` after auth.

---

## User Lifecycle

1. Admin invites user via `/admin/users` → Supabase sends invite email
2. User clicks invite link → sets password (Supabase magic link flow)
3. On first login, `proxy.ts` detects no TOTP → redirects to `/setup-2fa`
4. After TOTP setup, redirected to `/dashboard`
5. Admin can deactivate user (`is_active = false`) → `proxy.ts` checks `is_active` and redirects to `/login` with error message
6. Deactivated users' sessions remain valid in Supabase Auth but `proxy.ts` rejects them at the application level
