# BazarCRM — RBAC (Role-Based Access Control)

Roles are **fully database-driven**. Three system roles (SDR, Sales, Admin) are seeded and cannot be deleted. Admin can create additional custom roles and assign page access to each via the Settings → Roles tab.

**Enforcement layers:**
1. **`proxy.ts`** — reads role permissions from DB on every request; redirects unauthorized roles
2. **Route Handlers** — `current_user_role()` DB function for secondary enforcement
3. **Supabase RLS** — database-level row filtering regardless of who calls the API

---

## Role Definitions

### SDR (Sales Development Representative)
- Default pages: `/dashboard`, `/leads`, `/crm`, `/tickets`, `/statistics`, `/settings`
- Triage the AI inbox: validate, quote, route, reject, hold leads
- Add leads manually
- View and manage CRM contacts

### Sales
- Default pages: `/dashboard`, `/sales`, `/crm`, `/tickets`, `/statistics`, `/settings`
- Work leads routed to them
- Manage sales pipeline (claim, update status, hold, create orders)

### Admin
- Default pages: all pages including `/admin/*`
- All SDR and Sales capabilities
- Manage users (create with temp password, assign roles, deactivate)
- Create and configure custom roles
- System settings, audit log

### Custom Roles (Admin-created)
- Admin gives the role a name and display label
- Admin then checks which pages from the `pages` table this role can access
- Users can be assigned to custom roles exactly like system roles
- Custom roles cannot access `/admin/*` pages unless explicitly granted

---

## Route Access Matrix

| Route | SDR | Sales | Admin | Notes |
|-------|:---:|:-----:|:-----:|-------|
| `/dashboard` | ✓ | ✓ | ✓ | Role-scoped KPIs |
| `/leads` | ✓ | ✗ | ✓ | Inbox + SDR pipeline |
| `/sales` | ✗ | ✓ | ✓ | Sales pipeline |
| `/crm` | ✓ | ✓ | ✓ | |
| `/tickets` | ✓ | ✓ | ✓ | |
| `/statistics` | ✓ | ✓ | ✓ | |
| `/settings` | ✓ | ✓ | ✓ | Personal profile only |
| `/admin` | ✗ | ✗ | ✓ | |
| `/admin/users` | ✗ | ✗ | ✓ | |
| `/admin/settings` | ✗ | ✗ | ✓ | |
| `/admin/audit` | ✗ | ✗ | ✓ | |

Admin accessing `/leads` or `/sales` should see the full (unfiltered) view of all leads in those sections.

---

## API Endpoint Access Matrix

| Endpoint | SDR | Sales | Admin |
|----------|:---:|:-----:|:-----:|
| `GET /api/leads/inbox` | ✓ | ✗ | ✓ |
| `GET /api/leads/workspace` | ✓ | ✓ (filtered) | ✓ (all) |
| `POST /api/leads/verify` | ✓ | ✗ | ✓ |
| `POST /api/leads/manual` | ✓ | ✗ | ✓ |
| `POST /api/leads/[id]/hold` | ✓ | ✓ | ✓ |
| `POST /api/leads/[id]/resume` | ✓ | ✓ | ✓ |
| `PATCH /api/leads/[id]` | ✓ | ✓ | ✓ |
| `GET /api/contacts/lookup` | ✓ | ✓ | ✓ |
| `PATCH /api/contacts/merge` | ✓ | ✗ | ✓ |
| `GET /api/contacts/companies` | ✓ | ✓ | ✓ |
| `PATCH /api/contacts/[id]` | ✓ | ✓ | ✓ |
| `GET /api/tickets` | ✓ | ✓ | ✓ |
| `POST /api/tickets` | ✓ | ✓ | ✓ |
| `PATCH /api/tickets/[id]` | ✓ | ✓ | ✓ |
| `GET /api/activity` | ✓ | ✓ | ✓ |
| `POST /api/activity` | ✓ | ✓ | ✓ |
| `GET /api/notifications` | ✓ | ✓ | ✓ |
| `PATCH /api/notifications/[id]/read` | ✓ | ✓ | ✓ |
| `POST /api/notifications/read-all` | ✓ | ✓ | ✓ |
| `GET /api/dashboard/kpis` | ✓ | ✓ | ✓ |
| `POST /api/outreach/send` | ✓ | ✓ | ✓ |
| `GET /api/admin/users` | ✗ | ✗ | ✓ |
| `POST /api/admin/users/invite` | ✗ | ✗ | ✓ |
| `PATCH /api/admin/users/[id]` | ✗ | ✗ | ✓ |
| `GET /api/admin/audit` | ✗ | ✗ | ✓ |

---

## Database RLS Matrix

| Table | SDR | Sales | Admin |
|-------|-----|-------|-------|
| `user_profiles` | Read own | Read own | Read + Write all |
| `contacts` | Read + Write | Read + Write | Read + Write all |
| `leads` | Read + Write all | Read routed + owned | Read + Write all |
| `job_tickets` | Read + Write own | Read + Write own | Read + Write all |
| `activities` | Read + Insert | Read + Insert | Read + Insert all |
| `notifications` | Read + Update own | Read + Update own | — (service role inserts) |

---

## `proxy.ts` Extension

The existing `proxy.ts` enforces:
1. Unauthenticated → redirect to `/login`
2. No TOTP enrolled → redirect to `/setup-2fa`
3. Session not AAL2 → redirect to `/verify-2fa`

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

A lead is "locked" when a user has its drawer open. Lock state is stored as `locked_by_id` + `locked_at` on the `leads` row.

### Acquiring a Lock

When any user opens a lead drawer, the client immediately calls `POST /api/leads/[id]/lock`:

| Scenario | Result |
|----------|--------|
| Lead is unlocked | Lock granted — user can edit |
| Lead is locked by the same user | Lock refreshed — user can edit |
| Lead is locked by a different user | `409` returned — client renders **read-only** mode |
| Admin opens any lead | Lock always granted (overrides existing lock) |

### Read-Only Mode (Locked by Another)

When a lead is locked by someone else, the drawer opens in read-only mode:
- All inputs are disabled
- A banner shows: **"[Name] is currently working this lead"**
- No action buttons (Verify, Hold, Route, Reject) are shown
- History tab is still accessible

### Releasing a Lock

| Trigger | Action |
|---------|--------|
| User closes the drawer | Client calls `POST /api/leads/[id]/unlock` |
| User completes an action (Verify, Hold, Route, Reject) | Server auto-releases lock on success |
| Admin force-unlock from `/admin/users` or `/admin/audit` | Admin calls `POST /api/leads/[id]/unlock` for any lead |
| User logs out | Client calls unlock on all leads locked by their session |

**No auto-expiry** — the lock persists until one of the above triggers. Only Admin can force-release a lock that the original holder abandoned.

### Lock API Access

| Endpoint | SDR | Sales | Admin |
|----------|:---:|:-----:|:-----:|
| `POST /api/leads/[id]/lock` | ✓ (own leads scope) | ✓ (routed leads only) | ✓ (any lead) |
| `POST /api/leads/[id]/unlock` | ✓ (own lock only) | ✓ (own lock only) | ✓ (any lock) |

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

Components read role from a context provider (`lib/auth/use-role.ts`) that fetches `user_profiles.role` once on app shell mount.

| UI Element | SDR | Sales | Admin |
|------------|:---:|:-----:|:-----:|
| Sidebar: Leads section | ✓ | ✗ | ✓ |
| Sidebar: Sales section | ✗ | ✓ | ✓ |
| Sidebar: Admin section | ✗ | ✗ | ✓ |
| Verify button in inbox | ✓ | ✗ | ✓ |
| Route Lead / Reject buttons | ✓ | ✗ | ✓ |
| Claim Lead button | ✗ | ✓ | ✓ |
| CRM: Merge contact | ✓ | ✗ | ✓ |
| CRM: Add order (toolbar) | ✓ | ✓ | ✓ |
| Stats: SDR Handled Share | ✓ | ✗ | ✓ |
| Stats: Pipeline Value | ✗ | ✓ | ✓ |

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
