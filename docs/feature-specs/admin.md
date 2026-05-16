# Feature Spec — Admin Module

Access: Admin role only. `proxy.ts` blocks non-admins and redirects to `/dashboard`.

---

## `/admin` — Overview (Card Grid) ✅ Built

A landing page showing all admin sections as clickable cards in a responsive 3-column grid (2 on tablet, 1 on mobile). Each card contains an icon, title, short description, and an "Open →" or "Coming soon" label.

The page lives at `app/(app)/admin/page.tsx`. A sub-nav strip (Overview / Settings) is rendered by `components/admin/admin-sub-nav.tsx` inside `app/(app)/admin/layout.tsx`.

### Cards

| Title | Route | Built? | Notes |
|---|---|---|---|
| Users | `/admin/settings/users` | ✅ Built | Full user management |
| Roles & Permissions | `/admin/settings/roles` | ✅ Built | Role list + permission matrix toggle |
| Dropdown Options | `/admin/settings/dropdowns` | ✅ Built | All lead + order/quote lookup categories |
| Company Info | `/admin/settings/company` | ✅ Built | Branding, address, tax rate, HVT, rush surcharge |
| Products | `/admin/settings/products` | ✅ Built | Product types, materials, material–product links |
| Integrations | `/admin/settings/integrations` | ✅ Built | Twilio SMS + Instantly AI live; Stripe + Zelle placeholder |
Built cards show an accent-colored icon + "Open →".

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
| Email | Required — uses `EmailInput` component (format validation, mail-action icon) |
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
☑ Quoted Requests              /quotes
☑ Orders                       /orders
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

## `/admin/settings/dropdowns` — Dropdown Options ✅ Built

Admin-managed lists for all `<select>` fields in lead forms and the OrderDrawer. Reads from / writes to the `lookup_values` table. Changes reflect immediately — no code deploy needed.

### Layout

Left sidebar with categories grouped into **Lead Forms** and **Order / Quote**. Right panel shows options for the selected category.

### Category List (Left Panel)

**Lead Forms group:**

| Category | `lookup_values` key | Used in |
|---|---|---|
| Lead Sources | `source` | Add Lead, Verify Drawer, Sales Drawer |
| Industries | `industry` | Add Lead, Verify Drawer, Sales Drawer, CRM |
| Urgency Levels | `urgency` | Add Lead, Verify Drawer, Sales Drawer |
| Hold Reasons | `hold_reason` | Hold sub-form (SDR + Sales) |
| Reject Reasons | `reject_reason` | Reject sub-form (SDR + Sales) |
| Route Reasons | `route_reason` | Route to Sales sub-form (SDR) |
| Drop Reasons | `sales_drop_reason` | Drop deal sub-form (Sales) |

**Order / Quote group:**

| Category | `lookup_values` key | Used in |
|---|---|---|
| Lamination Options | `lamination` | Line Items tab — Lamination select (Row 5 left) |
| Add-on Finishings | `finishing` | Line Items tab — UV Coating / Foil / Perforation checkboxes |
| Color Mode | `color_mode` | Line Items tab — Color Mode select (Row 3 left) |
| Sides | `sides` | Line Items tab — Sides select (Row 3 right) |
| Roll Direction | `roll_direction` | Line Items tab — Roll Direction select (Row 5 right) |
| Quote Channels | `quote_channel` | Quote tab — Send Via select |
| Follow-up Frequency | `follow_up_freq` | Quote tab — Frequency select |
| Ticket Priority | `ticket_priority` | Info tab — Priority select |
| Order Source | `order_source` | Info tab — Order Source (hardcoded, admin-managed) |
| Payment Methods | `ticket_payment` | Quote tab — Payment Methods checkboxes |

### Options Table (Right Panel)

| Column | Notes |
|--------|-------|
| Label | Editable inline |
| Value | Machine key — shown grayed out — cannot change after creation |
| Sort Order | Numeric input — reflected immediately in dropdowns |
| Active | Toggle — inactive options hidden from new leads/tickets; historical data unaffected |
| Actions | **Delete** (blocked if value is in use on any lead or ticket — deactivate instead) |

**+ Add Option** button → inline row with Label field (value auto-generated from label).

**Business rules:**
- `value` is auto-slugified on creation (e.g. `"TikTok Ads"` → `tiktok_ads`) and cannot be changed afterward
- Deactivating hides the option from new entries; existing records keep their stored value

**API calls:**
- Load: `GET /api/admin/lookups`
- Add: `POST /api/admin/lookups`
- Edit label / sort / active: `PATCH /api/admin/lookups/[id]`
- Delete: `DELETE /api/admin/lookups/[id]` (returns `409` if value is in use)

---

## `/admin/settings/products` — Products ✅ Built

Admin-managed product catalog for the OrderDrawer. Backed by `product_types`, `materials`, `material_groups`, `product_material_links` tables (migration 041).

### Layout

Two-panel: product list on the left, materials for the selected product on the right.

**Left panel — product list:** Add Product (name + Roll/Sheet), active toggle, rename, delete (blocked if in any quote).

**Right panel — materials for selected product:** Link existing or create new material; active toggle, rename, unlink, delete from library (blocked if in any quote).

**API calls:**
- `GET/POST /api/admin/product-types` · `PATCH/DELETE /api/admin/product-types/[id]`
- `GET/POST /api/admin/materials` · `PATCH/DELETE /api/admin/materials/[id]`
- `POST/DELETE /api/admin/product-types/[id]/materials/[matId]`
- `GET /api/lookups/products` — anon-safe read used by OrderDrawer

---

## `/admin/settings/company` — Company Info ✅ Built

Single-row `company_settings` table. Used for invoice/PDF headers and OrderDrawer defaults.

**Branding:** Company Name, Logo URL

**Contact:** Phone (uses `PhoneInput` — digit-only with call-action icon), Email (uses `EmailInput` — format-validated with mailto-action icon), Website

**Address:** Address Line 1, Address Line 2, City, State, ZIP

**Order / Quote Defaults:**

| Field | Notes |
|---|---|
| Default Tax Rate (%) | Pre-filled in OrderDrawer; rep can override per quote |
| High-Value Threshold ($) | SDR hard-blocked from sending quote if total exceeds this — must route to Sales |
| Rush Surcharge (%) | Applied when `rush` toggle is on in a ticket |

**Input validation (client-side):** Email must be valid format; Website must start with `http://` or `https://`; ZIP must be digits only (max 10 chars); Phone is digits-only via `PhoneInput`. The **Save Changes** button is disabled while any validation error is active; all fields are re-validated on save attempt.

**API calls:** `GET /api/admin/company` · `PATCH /api/admin/company` (admin only)
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

## `/admin/settings/notifications` — Not Needed

Broadcast Notifications was removed from scope. The `/notifications` page (Activity Log) covers all current notification needs. No tab for this route will be built.
