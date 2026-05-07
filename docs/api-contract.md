# BazarCRM — API Contract

All endpoints are Next.js 15 Route Handlers under `app/api/`. Every handler uses the **admin Supabase client** (`lib/supabase/admin.ts`) for writes and the **server client** (from `@supabase/ssr`) for reads with RLS applied.

**Authentication:** All endpoints require an authenticated session. `proxy.ts` blocks unauthenticated requests before they reach Route Handlers. Handlers additionally call `supabase.auth.getUser()` and return `401` if no session.

**Base URL:** `/api` (relative, same origin).

**Content type:** `application/json` throughout.

---

## Leads

### `GET /api/leads/inbox`

Returns all leads where `is_inbox = true`. SDR sees all; Admin sees all. Sales cannot access this route (returns `403`).

**Query params:**

| Param | Type | Description |
|-------|------|-------------|
| `assigned_to` | `uuid` | Filter by `assigned_sdr_id` (future) |
| `source` | `string` | Filter by `source` |
| `search` | `string` | Searches `first_name`, `last_name`, `email`, `company` |

**Response `200`:**
```json
{
  "leads": [Lead]
}
```

---

### `GET /api/leads/workspace`

Returns all leads where `is_inbox = false`. SDR and Admin see all workspace leads. Sales sees only leads where `status = 'Routed to Sales'` or `sales_owner_id = current_user`.

**Query params:**

| Param | Type | Description |
|-------|------|-------------|
| `status` | `string` | Filter by `status` value |
| `sales_status` | `string` | Filter by `sales_status` value |
| `sdr_id` | `uuid` | Filter by `sdr_id` |
| `search` | `string` | Full text search |

**Response `200`:**
```json
{
  "leads": [Lead]
}
```

---

### `POST /api/leads/verify`

Moves an inbox lead to the workspace. Sets `is_inbox = false`, assigns `sdr_id`, links or creates a `contact_id`, logs a `lead_verified` activity.

**Body:**
```json
{
  "lead_id": "uuid",
  "status": "Validated | Quoted | Routed to Sales | Rejected",
  "contact_id": "uuid | null",
  "create_contact": {
    "first_name": "string",
    "last_name": "string",
    "email": "string",
    "phone": "string",
    "company": "string",
    "industry": "string",
    "website": "string"
  },
  "quote_total": "number | null",
  "quote_channel": "string | null",
  "quote_destination": "string | null",
  "rejection_reason": "string | null",
  "rejection_notes": "string | null",
  "interests": "object",
  "quantities": "object"
}
```

**Business rules:**
- `contact_id` XOR `create_contact` — must provide one
- Phone is normalized to digits-only before save
- If `status = 'Routed to Sales'`, set `sales_status = 'Ongoing'`
- Logs `lead_verified` activity; also logs `lead_routed_to_sales` or `lead_rejected` if applicable
- Creates a `lead_routed` notification for all active Sales users if routed
- **Lock guard:** Caller must be the current lock holder OR Admin. Otherwise → `409`
- On success, releases the lock (`locked_by_id = null`, `locked_at = null`)

**Response `201`:**
```json
{
  "lead": Lead
}
```

---

### `POST /api/leads/manual`

Creates a new lead directly in the workspace (`is_inbox = false`). Sets `sdr_id = current_user`.

**Body:**
```json
{
  "first_name": "string",
  "last_name": "string | null",
  "email": "string | null",
  "phone": "string",
  "company": "string | null",
  "industry": "string",
  "source": "string",
  "brand": "string | null",
  "website": "string | null",
  "authority": "string | null",
  "urgency": "High | Medium | Low | null",
  "is_returning_customer": "boolean",
  "sdr_comment": "string | null",
  "interests": "object",
  "quantities": "object",
  "customer_id": "uuid | null",
  "create_customer": "boolean"
}
```

**Business rules:**
- Phone normalized to digits-only before save
- **Customer linking:** pass either `customer_id` (selected existing) OR `create_customer: true` (create new from form data) OR neither (no customer yet — can be linked later)
- If `create_customer: true`: server creates a `customers` row from the lead's contact fields, sets `customer_id` on the new lead
- Default `status = 'Pending'`
- Logs `lead_manual_created` activity

**Response `201`:**
```json
{
  "lead": Lead
}
```

---

### `POST /api/leads/[id]/hold`

Places a lead on hold. Snapshots current `status` and `sales_status` into `prev_status` / `prev_sales_status`.

**Body:**
```json
{
  "hold_reason": "string",
  "hold_notes": "string | null",
  "hold_until": "ISO timestamp | null",
  "role": "sdr | sales"
}
```

**Business rules:**
- Sets `status = 'On Hold'` (SDR) or `sales_status = 'On Hold'` (Sales) based on `role`
- Records `held_by_id = current_user`, `held_at = now()`
- Logs `lead_held` activity

**Response `200`:**
```json
{
  "lead": Lead
}
```

---

### `POST /api/leads/[id]/resume`

Restores a lead from hold to its previous status.

**Body:**
```json
{
  "role": "sdr | sales"
}
```

**Business rules:**
- Restores `status` from `prev_status` (SDR) or `sales_status` from `prev_sales_status` (Sales)
- Clears all hold fields (`hold_reason`, `hold_notes`, `hold_until`, `held_at`, `held_by_id`, `prev_status`, `prev_sales_status`)
- Logs `lead_resumed` activity

**Response `200`:**
```json
{
  "lead": Lead
}
```

---

### `PATCH /api/leads/[id]`

Partial update of a lead. `created_at` is always stripped from the body (immutable).

**Body:** Any subset of lead fields (except `id`, `created_at`).

**Business rules:**
- Phone and `quote_destination` are normalized to digits-only on every write
- Logs `lead_status_changed` activity if `status` or `sales_status` changes
- **Terminal state guard:** If current `status = 'Rejected'` or `sales_status = 'Rejected'`, only Admin can apply changes. Non-admin → returns `403` with `code: 'LEAD_REJECTED_TERMINAL'`
- **Lock guard:** If `locked_by_id` is set to a different user, returns `409` unless the caller is Admin

**Response `200`:**
```json
{
  "lead": Lead
}
```

---

### `POST /api/leads/[id]/lock`

Acquires a lock on a lead when a user opens it in the Verify or Sales Drawer. Sets `locked_by_id = current_user` and `locked_at = now()`.

**Business rules:**
- If `locked_by_id` is already set to a **different** user → returns `409` with the locker's name (client renders read-only mode)
- If `locked_by_id` is the **same** user (reconnect / refresh) → refreshes `locked_at` and returns `200`
- If `locked_by_id` is `null` → acquires lock and returns `200`
- Admin calling this endpoint on any lead → always acquires lock (overrides existing lock)

**Response `200`:**
```json
{
  "locked": true,
  "locked_by": null
}
```

**Response `409` (locked by another user):**
```json
{
  "locked": false,
  "locked_by": {
    "id": "uuid",
    "full_name": "Jane Smith",
    "role": "sdr"
  }
}
```

---

### `POST /api/leads/[id]/unlock`

Releases the lock on a lead when the user closes the drawer.

**Business rules:**
- Only the current lock holder OR an Admin can unlock
- Non-holder, non-Admin attempting to unlock → returns `403`
- If lead is not locked → returns `200` (idempotent)

**Response `200`:**
```json
{
  "unlocked": true
}
```

---

## Customers

### `GET /api/customers/lookup`

Smart deduplication — used by the Manual Add Lead form and Verify Drawer. Returns **all** customer profiles matching the phone or email (there may be multiple).

**Query params:**

| Param | Type | Description |
|-------|------|-------------|
| `phone` | `string` | Digits-only phone to look up (primary lookup key) |
| `email` | `string` | Email to look up (secondary — used if phone is blank) |

**Business rules:**
- Phone takes priority: if `phone` param is provided, only phone lookup runs
- Email lookup only runs if `phone` is not provided
- Returns all matching records (0, 1, or many)

**Response `200`:**
```json
{
  "customers": [Customer],
  "count": "number"
}
```

---

### `POST /api/customers`

Create a new customer profile from the Add Lead form (when SDR enters new info and no existing customer is selected).

**Body:**
```json
{
  "first_name": "string",
  "last_name": "string | null",
  "email": "string | null",
  "phone": "string",
  "company": "string | null",
  "industry": "string | null",
  "website": "string | null"
}
```

**Business rules:**
- Phone normalized to digits-only before save
- No duplicate check on save — duplicates are handled at lookup time (UI decision)

**Response `201`:**
```json
{
  "customer": Customer
}
```

---

### `PATCH /api/customers/[id]`

Update a customer profile. Called when SDR chooses "Yes, update profile" on the action prompt.

**Body:** Any subset of customer fields (except `id`, `created_at`).

**Allowed fields:** `first_name`, `last_name`, `email`, `phone`, `company`, `industry`, `website`, `heat_tag`

**Business rules:**
- Phone normalized to digits-only
- Logs `customer_updated` activity

**Response `200`:**
```json
{
  "customer": Customer
}
```

---

### `GET /api/customers/companies`

Company name autocomplete for the Company Name field in forms.

**Query params:** `q` (string, min 1 char)

**Response `200`:**
```json
{
  "companies": ["string"]
}
```

Max 8 results. `SELECT DISTINCT company FROM customers WHERE company ILIKE '%q%' LIMIT 8`.

---

## Tickets

### `GET /api/tickets`

Returns all job tickets. Filtered via query params.

**Query params:**

| Param | Type | Description |
|-------|------|-------------|
| `kind` | `'quote' \| 'order'` | Filter by `ticket_kind` |
| `status` | `string` | Filter by `ticket_status` |
| `contact_id` | `uuid` | Filter by `contact_id` |
| `lead_id` | `uuid` | Filter by `linked_lead_id` |
| `from` | `ISO date` | `created_at >= from` |
| `to` | `ISO date` | `created_at <= to` |

**Response `200`:**
```json
{
  "tickets": [Ticket]
}
```

---

### `POST /api/tickets`

Create a new ticket.

**Body:**
```json
{
  "ticket_kind": "quote | order",
  "contact_id": "uuid | null",
  "linked_lead_id": "uuid | null",
  "contact_email": "string",
  "contact_name": "string",
  "contact_company": "string",
  "subtotal": "number",
  "discount_percent": "number | null",
  "discount_amount": "number | null",
  "total": "number",
  "payment_type": "string | null",
  "prepay_amount": "number | null",
  "product_lines": "array",
  "quote_skus": "array",
  "rush": "boolean",
  "follow_up_at": "ISO timestamp | null",
  "notes": "string | null"
}
```

**Business rules:**
- `created_by_id = current_user`
- `ticket_status = 'draft'` on creation
- Logs `order_ticket_created` activity

**Response `201`:**
```json
{
  "ticket": Ticket
}
```

---

### `PATCH /api/tickets/[id]`

Partial ticket update.

**Body:** Any subset of ticket fields plus optional:
```json
{
  "activity_by_role": "sdr | sales"
}
```

`activity_by_role` is stripped from the stored record but used to attribute the activity log entry.

**Business rules:**
- If `quote_approval_last_requested_at` is set → logs `quote_approval_requested` activity
- If `follow_up_completed` transitions to `true` → logs `quote_follow_up_completed`
- If `follow_up_at` is reset (set to null after being set) → logs `quote_follow_up_reset`
- If `client_confirmed` transitions to `true` → logs `ticket_client_confirmed`; creates `follow_up_due` notification for ticket owner
- Otherwise → logs `order_ticket_updated` with `payload.fields` listing changed keys
- Resolves `contact_id` and `lead_id` from `linked_lead_id` if not provided directly

**Response `200`:**
```json
{
  "ticket": Ticket
}
```

---

## Activity

### `GET /api/activity`

Query the unified timeline. Returns activities matching any of the provided identifiers, ordered by `created_at DESC`.

**Query params (at least one required):**

| Param | Type | Description |
|-------|------|-------------|
| `contact_id` | `uuid` | Activities for this contact |
| `lead_id` | `uuid` | Activities for this lead |
| `phone` | `string` | Resolves contact by phone, returns all their activities |
| `email` | `string` | Resolves contact by email |

**Cross-lead resolution:** When `phone` or `email` is provided, the server looks up all leads sharing that identifier and returns activities across all of them.

**Response `200`:**
```json
{
  "activities": [Activity]
}
```

---

### `POST /api/activity`

Append a client-side activity event. Used when the browser knows the context (e.g. user logs a manual call).

**Body:**
```json
{
  "type": "string",
  "contact_id": "uuid | null",
  "lead_id": "uuid | null",
  "ticket_id": "uuid | null",
  "channel": "string | null",
  "payload": "object"
}
```

**Response `201`:**
```json
{
  "activity": Activity
}
```

---

## Notifications

### `GET /api/notifications`

Returns notifications for the current authenticated user, ordered by `created_at DESC`.

**Query params:**

| Param | Type | Default |
|-------|------|---------|
| `unread_only` | `boolean` | `false` |
| `limit` | `number` | `20` |
| `offset` | `number` | `0` |

**Response `200`:**
```json
{
  "notifications": [Notification],
  "unread_count": "number"
}
```

---

### `PATCH /api/notifications/[id]/read`

Marks a single notification as read.

**Response `200`:**
```json
{
  "notification": Notification
}
```

---

### `POST /api/notifications/read-all`

Marks all of the current user's notifications as read.

**Response `200`:**
```json
{
  "updated_count": "number"
}
```

---

## Dashboard

### `GET /api/dashboard/kpis`

Returns KPI metrics scoped to the current user's role and optional date range.

**Query params:**

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `period` | `'today' \| 'week' \| 'month' \| 'quarter' \| 'all'` | `'month'` | Time window |
| `from` | `ISO date` | — | Custom range start (overrides `period`) |
| `to` | `ISO date` | — | Custom range end |

**Response for SDR `200`:**
```json
{
  "period": "string",
  "leads_handled": "number",
  "leads_verified": "number",
  "leads_routed": "number",
  "leads_rejected": "number",
  "leads_on_hold": "number",
  "quote_value": "number",
  "handled_share_percent": "number"
}
```

**Response for Sales `200`:**
```json
{
  "period": "string",
  "leads_in_pipeline": "number",
  "leads_won": "number",
  "leads_dropped": "number",
  "pipeline_value": "number",
  "won_value": "number",
  "order_count": "number"
}
```

**Response for Admin `200`:**
```json
{
  "period": "string",
  "total_leads": "number",
  "inbox_leads": "number",
  "routed_leads": "number",
  "won_leads": "number",
  "total_revenue": "number",
  "pipeline_value": "number",
  "active_sdr_count": "number",
  "active_sales_count": "number"
}
```

---

## Outreach

### `POST /api/outreach/send`

Provider-agnostic outreach endpoint. The concrete email/SMS provider is resolved at runtime from env vars.

**Body:**
```json
{
  "channel": "email | sms | whatsapp",
  "to": "string",
  "subject": "string | null",
  "body": "string",
  "lead_id": "uuid | null",
  "contact_id": "uuid | null"
}
```

**Business rules:**
- In dev (`OUTREACH_EMAIL_PROVIDER=console`, `OUTREACH_SMS_PROVIDER=console`): logs to server console, returns success
- Logs `outreach_sent` activity with channel and recipient in payload

**Response `200`:**
```json
{
  "sent": true,
  "provider": "string"
}
```

---

## Auth — Change Password

### `POST /api/auth/change-password`

Changes the current user's password and clears `must_change_password`. Called from `/change-password` page.

**Body:**
```json
{
  "new_password": "string",
  "confirm_password": "string"
}
```

**Business rules:**
- `new_password` and `confirm_password` must match
- Min 8 characters
- Calls `supabase.auth.updateUser({ password: newPassword })`
- Sets `must_change_password = false` on `user_profiles` via admin client
- On success, redirects client to `/setup-2fa` (if not enrolled) or `/dashboard`

**Response `200`:**
```json
{
  "changed": true
}
```

---

## Admin — Roles & Permissions

All `/api/admin/roles/*` endpoints require `role_name = 'admin'`.

### `GET /api/admin/roles`

List all roles with their page permissions.

**Response `200`:**
```json
{
  "roles": [
    {
      "id": "uuid",
      "name": "sdr",
      "display_name": "SDR",
      "is_system": true,
      "pages": [Page]
    }
  ]
}
```

---

### `POST /api/admin/roles`

Create a new custom role.

**Body:**
```json
{
  "name": "manager",
  "display_name": "Manager"
}
```

**Business rules:**
- `name` must be lowercase, no spaces, unique
- `is_system = false` on all admin-created roles
- No permissions granted by default — Admin assigns them via the permissions endpoints

**Response `201`:**
```json
{
  "role": Role
}
```

---

### `PATCH /api/admin/roles/[id]`

Update a custom role's display name. System roles (`is_system = true`) cannot be renamed — returns `403`.

**Body:**
```json
{
  "display_name": "string"
}
```

**Response `200`:**
```json
{
  "role": Role
}
```

---

### `DELETE /api/admin/roles/[id]`

Delete a custom role. System roles cannot be deleted. Returns `409` if users are assigned to this role.

**Response `200`:**
```json
{
  "deleted": true
}
```

---

### `POST /api/admin/roles/[id]/permissions`

Grant a page permission to a role.

**Body:**
```json
{
  "page_id": "uuid"
}
```

**Response `201`:**
```json
{
  "permission": RolePermission
}
```

---

### `DELETE /api/admin/roles/[id]/permissions/[page_id]`

Revoke a page permission from a role. Cannot revoke any permission from the `admin` system role — returns `403`.

**Response `200`:**
```json
{
  "deleted": true
}
```

---

## Admin — Users

All `/api/admin/*` endpoints require `role_name = 'admin'`. Non-admins receive `403`.

### `GET /api/admin/users`

List all user profiles with auth metadata.

**Query params:** `search`, `role`, `is_active`

**Response `200`:**
```json
{
  "users": [UserProfile]
}
```

---

### `POST /api/admin/users/create`

Creates a new user with a temp password. **No email is sent** unless `send_invite_email: true` is passed.

**Body:**
```json
{
  "email": "string",
  "full_name": "string",
  "role_id": "uuid",
  "temp_password": "string",
  "send_invite_email": false
}
```

**Business rules:**
1. Calls `supabase.auth.admin.createUser({ email, password: temp_password, email_confirm: true })`
2. Creates `user_profiles` with `role_id`, `must_change_password: true`, `is_active: true`
3. If `send_invite_email: true` — also calls `supabase.auth.admin.inviteUserByEmail(email)` (sends Supabase magic link email)

**Response `201`:**
```json
{
  "user": UserProfile
}
```

---

### `PATCH /api/admin/users/[id]`

Update a user's role, active status, or reset their temp password.

**Body:**
```json
{
  "role_id": "uuid | null",
  "is_active": "boolean | null",
  "full_name": "string | null",
  "new_temp_password": "string | null",
  "must_change_password": "boolean | null"
}
```

**Business rules:**
- If `new_temp_password` is provided: calls `supabase.auth.admin.updateUserById` to set the new password, sets `must_change_password = true` on `user_profiles`
- Cannot change own role or deactivate own account
- Cannot deactivate the last active Admin (guard: count of active Admins > 1)

**Response `200`:**
```json
{
  "user": UserProfile
}
```

---

### `GET /api/admin/audit`

Paginated activity log across all users. Admin only.

**Query params:**

| Param | Type | Description |
|-------|------|-------------|
| `user_id` | `uuid` | Filter by actor |
| `type` | `string` | Filter by activity type |
| `from` | `ISO date` | Start date |
| `to` | `ISO date` | End date |
| `limit` | `number` | Default `50` |
| `offset` | `number` | Default `0` |

**Response `200`:**
```json
{
  "activities": [Activity],
  "total": "number"
}
```

---

## Lookup Values

### `GET /api/lookups`

Returns active dropdown options for one or more categories. Used to populate all `<select>` inputs in lead forms. All authenticated users can call this.

**Query params:**

| Param | Type | Description |
|-------|------|-------------|
| `categories` | `string` | Comma-separated list, e.g. `source,industry,urgency` |

**Response `200`:**
```json
{
  "source": [{ "value": "facebook", "label": "Facebook", "sort_order": 6 }],
  "industry": [{ "value": "cosmetics_beauty", "label": "Cosmetics & Beauty", "sort_order": 1 }],
  "urgency": [{ "value": "high", "label": "High", "sort_order": 1 }]
}
```

Each category array is sorted by `sort_order` ascending. Inactive values (`is_active = false`) are excluded.

---

### `GET /api/admin/lookups`

Returns all values (including inactive) for all categories. Admin only — used by Settings → Dropdown Options page.

**Response `200`:**
```json
{
  "source": [LookupValue],
  "industry": [LookupValue],
  "urgency": [LookupValue],
  "hold_reason": [LookupValue],
  "reject_reason": [LookupValue],
  "route_reason": [LookupValue],
  "sales_drop_reason": [LookupValue]
}
```

---

### `POST /api/admin/lookups`

Create a new option. Admin only.

**Body:**
```json
{
  "category": "source",
  "value": "tiktok",
  "label": "TikTok",
  "sort_order": 16
}
```

**Response `201`:** `{ "item": LookupValue }`

---

### `PATCH /api/admin/lookups/[id]`

Update label, sort_order, or is_active. Admin only.

**Body** (all fields optional):
```json
{
  "label": "TikTok Ads",
  "sort_order": 5,
  "is_active": false
}
```

**Business rules:**
- `value` and `category` cannot be changed after creation (they may be stored in historical lead records)

**Response `200`:** `{ "item": LookupValue }`

---

## Error Responses

All endpoints return consistent error shapes:

```json
{
  "error": "Human-readable message",
  "code": "MACHINE_READABLE_CODE"
}
```

| HTTP Status | When |
|-------------|------|
| `400` | Validation error, missing required field |
| `401` | No valid session |
| `403` | Authenticated but wrong role |
| `404` | Resource not found |
| `409` | Conflict (e.g. duplicate email on invite) |
| `500` | Unexpected server error |
