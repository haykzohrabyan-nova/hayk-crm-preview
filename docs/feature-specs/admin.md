# Feature Spec — Admin Module

Access: Admin role only. `proxy.ts` blocks non-admins and redirects to `/dashboard`.

---

## `/admin` — Overview (Card Grid)

A landing page showing all admin sections as clickable cards in a responsive 3-column grid (2 on tablet, 1 on mobile). Each card contains an icon, title, short description, and an "Open →" link that navigates to the section's settings tab.

The page lives at `app/(app)/admin/page.tsx`. A sub-nav strip (Overview / Settings) is rendered by `components/admin/admin-sub-nav.tsx` inside `app/(app)/admin/layout.tsx`.

### Cards (current)

| Title | Route | Description |
|---|---|---|
| Users | `/admin/settings/users` | Create, edit, and deactivate team members. Assign roles and reset passwords. |
| Roles & Permissions | `/admin/settings/roles` | Role definitions and allowed pages per role. |
| Dropdown Options | `/admin/settings/dropdowns` | Edit sources, industries, hold reasons, reject reasons, and other dropdown lists. |
| Notifications | `/admin/settings/notifications` | Send a system broadcast message to all users or a specific role. |

All four cards are clickable. "Roles & Permissions", "Dropdown Options", and "Notifications" navigate to their respective tab which shows a "Coming soon" placeholder until the feature is built.

### Deferred cards (not yet on overview)

| Title | Planned Route | Notes |
|---|---|---|
| Audit Log | `/admin/settings/audit-log` | Full history of all changes. |
| Company Info | `/admin/settings/company` | Company name, address, logo for PDF headers. Future. |
| Products | `/admin/settings/products` | Product types, materials, finishes for ticket builder. |

---

## `/admin/settings/users` — User Management

### User Table

**Data:** `GET /api/admin/users`

| Column | Notes |
|--------|-------|
| Name | `full_name` |
| Email | From `auth.users` (joined) |
| Role | Role display name pill (from `roles.display_name`) |
| Status | Active / Inactive badge |
| Must Change Password | Warning icon if `must_change_password = true` |
| Joined | `created_at` relative |
| Actions | **Edit**, **Deactivate / Reactivate** |

### Filters

- Search by name or email
- Filter by role (shows all roles including custom)
- Toggle: Show inactive users (hidden by default)

### Create User — No Email Required

**+ Add User** button → opens a modal:

| Field | Notes |
|-------|-------|
| Full Name | Required |
| Email | Required |
| Role | Dropdown: all roles from `roles` table (system + custom) |
| Temporary Password | Required — Admin sets this, tells the user directly |

**Submit** → `POST /api/admin/users/create`

Behind the scenes:
1. `supabase.auth.admin.createUser({ email, password: tempPassword, email_confirm: true })` — creates user without sending any email
2. A `user_profiles` row is created with `role_id`, `must_change_password: true`, `is_active: true`
3. Success toast: "User [name] created — share their temporary password with them"

**First-login flow for the new user:**
1. Logs in with temp password + email
2. `proxy.ts` detects `must_change_password = true` → redirects to `/change-password`
3. User sets a new permanent password → `must_change_password = false`
4. `proxy.ts` detects no TOTP → redirects to `/setup-2fa`
5. After 2FA setup → lands on their first permitted page

### Edit User

**Edit** button → opens a modal dialog (same style as Add User) pre-filled with the user's current data:

- **Full Name** — editable
- **Email** — shown read-only (cannot be changed here)
- **Role** — dropdown, all roles; only sent in the PATCH payload if it actually changed (prevents false self-modify errors)
- **Reset Temporary Password** — optional; leave blank to keep current password; if set, marks `must_change_password = true` on save

**Safety rules (enforced on the API):**
- Admin cannot change their own role
- Admin cannot deactivate their own account
- The last active Admin account cannot be deactivated (guard: count of active Admins > 1)
- If nothing changed (name, role, password all unchanged), the dialog closes without making an API call

### Deactivate / Reactivate

**Deactivate** → `PATCH /api/admin/users/[id]` with `{ is_active: false }`.
- `proxy.ts` checks `is_active` on each request → deactivated users are redirected to `/login?error=deactivated`

**Reactivate** → `PATCH /api/admin/users/[id]` with `{ is_active: true }`.

---

## `/admin/settings/roles` — Roles & Permissions

The role permission manager. Admin can see all roles, create new custom roles, and control which pages each role can access.

### Layout

Two-column layout:
- **Left panel (sidebar):** List of all roles
- **Right panel:** Permission matrix for the selected role

### Role List (Left Panel)

Shows all roles from the `roles` table:
- System roles (SDR, Sales, Admin) — marked with a lock icon, cannot be deleted or renamed
- Custom roles — created by Admin, can be deleted if no users are assigned to them

**+ New Role** button at the top of the list.

#### New Role Form

| Field | Notes |
|-------|-------|
| Role Name (slug) | Lowercase, no spaces — e.g. `manager` — used internally |
| Display Name | Human label — e.g. `Manager` — shown in dropdowns and pills |

**Save** → `POST /api/admin/roles`

### Permission Matrix (Right Panel)

When a role is selected, the right panel shows a checklist of all pages from the `pages` table:

```
Pages                           [Role: Manager]
────────────────────────────────────────────────
☑ Dashboard                    /dashboard
☑ CRM                          /crm
☑ Tickets                      /tickets
☑ Statistics                   /statistics
☐ Leads (SDR)                  /leads
☐ Sales Pipeline               /sales
☐ Users (Admin)                /admin/settings/users
☐ Roles & Permissions (Admin)  /admin/settings/roles
☐ Dropdown Options (Admin)     /admin/settings/dropdowns
☐ Notifications (Admin)        /admin/settings/notifications
☑ Settings (Personal)          /settings
```

- Checking a box → `POST /api/admin/roles/[id]/permissions` with `{ page_id }`
- Unchecking → `DELETE /api/admin/roles/[id]/permissions/[page_id]`
- Changes take effect **immediately** — next request by any user with that role reflects the new permissions (proxy.ts reads DB on every request)
- System role `admin` shows all boxes checked and disabled — Admin access cannot be restricted

### Delete Custom Role

**Delete** button visible only for non-system roles.
- Disabled with tooltip "N users assigned — reassign first" if any users have this role
- Confirm dialog → `DELETE /api/admin/roles/[id]` → all `role_permissions` rows cascade-delete

---

## `/admin/settings/dropdowns` — Dropdown Options

Admin-managed lists for all `<select>` fields in lead forms. Reads from / writes to the `lookup_values` table.

### Layout

Left sidebar with the list of categories. Right panel shows the options for the selected category.

### Category List (Left Panel)

| Category | Used in |
|---|---|
| Lead Sources | Add Lead, Verify Drawer, Sales Drawer |
| Industries | Add Lead, Verify Drawer, Sales Drawer, CRM |
| Urgency Levels | Add Lead, Verify Drawer, Sales Drawer |
| Hold Reasons | Hold sub-form (SDR + Sales) |
| Reject Reasons | Reject sub-form (SDR) |
| Route Reasons | Route to Sales sub-form (SDR) |
| Drop Reasons | Drop deal sub-form (Sales) |

### Options Table (Right Panel)

For the selected category:

| Column | Notes |
|--------|-------|
| Label | Editable inline |
| Value | Machine key — shown grayed out — cannot change after creation |
| Sort Order | Drag-to-reorder handle OR numeric input |
| Active | Toggle — inactive options are hidden from dropdowns in lead forms |
| Actions | **Delete** (only if no leads use this value — otherwise deactivate only) |

**+ Add Option** button at the top right → inline row append with Label + Value fields.

**Business rules:**
- `value` is auto-generated from `label` on creation (slugified, e.g. `"TikTok Ads"` → `tiktok_ads`) and cannot be changed afterward (historical lead records store the value)
- Deactivating a value hides it from new leads; existing leads keep their saved value
- Sort order is reflected immediately in dropdowns

**API calls:**
- Load: `GET /api/admin/lookups`
- Add: `POST /api/admin/lookups`
- Edit label / sort / active: `PATCH /api/admin/lookups/[id]`

---

## `/admin/settings/notifications` — Broadcast Notifications

Admin can send a `system` notification to all users or to a specific role. Creates rows in the `notifications` table for all matching active users.

### Form

| Field | Notes |
|-------|-------|
| Title | Required — short heading shown in the notification bell |
| Message | Required — detail text |
| Send to | All users / SDR / Sales (dropdown of all active roles) |

**Send** button → `POST /api/admin/notifications/broadcast`

Behind the scenes:
1. Fetch all `user_profiles` where `is_active = true` matching the selected role (or all)
2. Bulk-insert rows into `notifications` with `type = 'system'`
3. Supabase Realtime triggers the notification bell for online users

**Success toast:** "Notification sent to N users"

**Recent broadcasts** — a simple read-only table below the form showing the last 10 system broadcasts:

| Column | Notes |
|--------|-------|
| Sent | Relative time |
| Title | Truncated |
| Sent to | Role or "All" |
| Recipients | Count of users it was sent to |

---

## `/admin/settings/audit-log` — Audit Log (Deferred from MVP)

Not linked from the `/admin` overview card grid yet. Will be added as a card and a settings tab in a later phase.

### Audit Table

**Data:** `GET /api/admin/audit`

| Column | Notes |
|--------|-------|
| Actor | User full name + role badge |
| Action | Human-readable description (derived from `type`) |
| Entity | Customer name / Lead ID (from payload) |
| Timestamp | Full datetime |
| Details | Expandable payload preview |

### Filters

- Search by actor name
- Filter by activity `type`
- Date range picker (`from` / `to`)

### Pagination

50 rows per page. "Load more" button fetches next 50. Total count shown in header.
