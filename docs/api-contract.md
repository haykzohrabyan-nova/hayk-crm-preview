# BazarCRM — API Contract

All endpoints are Next.js 16 Route Handlers under `app/api/`. Every handler uses the **admin Supabase client** (`lib/supabase/admin.ts`) for writes and the **server client** (from `@supabase/ssr`) for reads with RLS applied.

**Authentication:** All endpoints require an authenticated session. `proxy.ts` blocks unauthenticated requests before they reach Route Handlers. Handlers additionally call `supabase.auth.getUser()` and return `401` if no session.

**Base URL:** `/api` (relative, same origin).

**Content type:** `application/json` throughout.

---

## Leads

### `GET /api/leads/workspace`

Returns workspace leads (`is_inbox = false`). Visibility is **role-scoped server-side**:
- **SDR (no `status` param):** only leads where `locked_by_id IS NULL OR locked_by_id = currentUserId` — SDRs never see leads being worked by another SDR
- **SDR (with `status` param):** scoped to their own leads (`sdr_id = currentUserId`), used for Hold / Rejected / Directed-to-Sales tabs
- **Admin:** all leads, no lock filter — also returns a `locked_by` profile join on each row
- **Sales:** only leads where `status = 'Routed to Sales'` or `sales_owner_id = currentUserId`

**Query params:**

| Param | Type | Description |
|-------|------|-------------|
| `status` | `string` | Filter by `status` value |
| `prev_status` | `string` | Filter by `prev_status` value — used by Sales Rejected tab to restrict to `Routed to Sales` (sales-pipeline rejections only) |
| `scope` | `string` | `mine` — restrict to leads where `sdr_id = current user` (SDR scoped tabs) |
| `search` | `string` | Full-text search on name, email, phone, company |

**Response `200`:**
```json
{
  "leads": [Lead]
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

Returns job tickets. Visibility is role-scoped:
- **SDR:** own tickets only (`created_by_id = userId`)
- **Sales/Admin:** own tickets + ALL tickets with `ticket_status = 'routed'` (from any SDR). Routed tickets are enriched with `created_by_name` (SDR's full name from `user_profiles`).
- **Admin:** all tickets

**Query params:**

| Param | Type | Description |
|-------|------|-------------|
| `kind` | `'quote' \| 'order'` | Filter by `ticket_kind` |
| `status` | `string` | Filter by `ticket_status` |
| `lead_id` | `uuid` | Filter by `linked_lead_id` |
| `search` | `string` | Search on contact name, company, title, reference code |

**Response `200`:**
```json
{
  "tickets": [Ticket]   // routed tickets include created_by_name: string
}
```

---

### `POST /api/tickets`

Create a new ticket.

**Body:**
```json
{
  "ticket_kind": "quote | order",
  "ticket_status": "draft | sent | routed",
  "customer_id": "uuid | null",
  "linked_lead_id": "uuid | null",
  "contact_email": "string",
  "contact_name": "string",
  "contact_company": "string",
  "contact_phone": "string | null",
  "title": "string",
  "priority": "string | null",
  "due_date": "ISO date | null",
  "order_source": "string | null",
  "rush": "boolean",
  "special_requirements": "string | null",
  "notes": "string | null",
  "quote_skus": "QuoteSku[]",
  "quote_subtotal": "number | null",
  "quote_shipping": "number | null",
  "discount_type": "percent | fixed | null",
  "discount_value": "string | null",
  "discount_reason": "string | null",
  "quote_pre_tax_total": "number | null",
  "quote_tax_rate_percent": "number | null",
  "quote_tax_amount": "number | null",
  "quote_final_total": "number | null",
  "tax_exempt": "boolean",
  "sales_permit_number": "string | null",
  "quote_payment_types": "string[]",
  "prepayment_type": "full | percent | fixed | null",
  "prepayment_value": "string | null",
  "prepayment_status": "pending | paid",
  "payment_status": "unpaid | partial | paid",
  "public_token": "uuid",
  "quote_channel": "string | null",
  "quote_destination": "string | null",
  "quote_reminder_date": "ISO date | null",
  "follow_up_cycles": "number | null",
  "follow_up_frequency": "string | null",
  "customer_data": {
    "first_name": "string",
    "last_name": "string | null",
    "email": "string | null",
    "phone": "string | null",
    "company": "string | null"
  }
}
```

**Business rules:**
- `created_by_id = current_user`
- `ticket_status` defaults to `'draft'` if not provided; `'routed'` is accepted for HVT saves from SDRs
- **Customer upsert:** if `customer_data` is provided and `customer_id` is null, the server upserts a `customers` row (matches on email/phone; creates new if no match) and sets `customer_id`
- For `ticket_kind = 'order'`: auto-generates `ORD-YYYY-NNN` reference code via `increment_order_sequence(year)` PL/pgSQL function
- Sets `design_required = true` if any SKU has `design_required = true`; same for `die_cut`
- If `linked_lead_id` is provided, updates the linked lead's `status` to `'Quoted'` or `'Validated'`
- Logs `order_ticket_created` activity

**Response `201`:**
```json
{
  "ticket": Ticket
}
```

---

### `PATCH /api/tickets/[id]`

Partial ticket update. Two distinct operation modes:

**Mode 1 — Claim (Sales/Admin only):**
```json
{
  "ticket_status": "draft",
  "claim_ownership": true
}
```
- Ticket must currently have `ticket_status = 'routed'`
- Caller must be `sales` or `admin`
- Sets `ticket_status = 'draft'` and `created_by_id = callerUserId`
- Logs `order_ticket_status_changed` activity with `payload: { from: "routed", to: "draft", action: "claimed" }`
- Bypasses the normal ownership check (`created_by_id = userId`)

**Mode 2 — Normal update:**

Body: Any subset of ticket fields plus optional:
```json
{
  "activity_by_role": "sdr | sales"
}
```

`activity_by_role` is stripped from the stored record but used to attribute the activity log entry.

**Business rules (Mode 2):**
- If `ticket_status` is set to `"sent"` → triggers `sendQuoteToCustomer()` (email/SMS/WhatsApp delivery via Twilio / Instantly AI)
- If `quote_approval_last_requested_at` is set → logs `quote_approval_requested`
- If `follow_up_completed` transitions to `true` → logs `quote_follow_up_completed`
- If `follow_up_at` is reset → logs `quote_follow_up_reset`
- If `client_confirmed` transitions to `true` → logs `ticket_client_confirmed`; creates `follow_up_due` notification
- Otherwise → logs `order_ticket_updated` with `payload.fields`
- `payment_status` and `prepayment_status` can be updated on `order` status tickets even by non-admins (special relaxed guard)

**Response `200`:**
```json
{
  "ticket": Ticket
}
```

---

### `GET /api/tickets/[id]/pdf`

Renders the ticket as a PDF binary and returns it for direct download.

**Auth:** Requires authenticated session. Returns `401` if no session, `404` if ticket not found.

**Response `200`:**
- `Content-Type: application/pdf`
- `Content-Disposition: attachment; filename="Quote-REF.pdf"` (or `Invoice-REF.pdf` for orders where `ticket_status` is `order`, `in_production`, or `completed`)
- Body: raw PDF binary rendered server-side by `@react-pdf/renderer`

PDF sections: company header (logo or name, address, contact), Bill To, Prepared By, line items table, pricing summary (subtotal → shipping → discount → pre-tax → tax → total), payment methods, special requirements, gold footer.

The "Save PDF" button in `quote-detail.tsx` is an `<a href="/api/tickets/[id]/pdf" download>` link — clicking it triggers a direct file download with no new tab or print dialog.

---

### `GET /api/tickets/[id]/print`

Returns a complete, fully-styled HTML document of the invoice. Used for browser print / Save as PDF via the system print dialog.

**Auth:** Requires authenticated session. Returns `401` if no session, `404` if ticket not found.

**Response `200`:**
- `Content-Type: text/html; charset=utf-8`
- Body: standalone HTML with all styles inline and `@media print` rules. Includes a "Print / Save PDF" button visible on screen. When loaded inside a hidden iframe, a script auto-triggers `window.print()`.

---

### `GET /api/tickets/counts`

Returns lightweight tab badge counts. Scoped per role.

**Response `200`:**
```json
{
  "counts": {
    "drafts": 0,
    "sent": 0,
    "approved": 0,
    "orders": 0,
    "routed": 0,
    "total": 0
  }
}
```

- **SDR:** `routed` = count of their own routed tickets (subtracted from `all` on the Quotes page)
- **Sales/Admin:** `routed` = count of ALL routed tickets from any SDR

---

## Public Quote Routes (no auth required)

These routes are accessible without a session. `proxy.ts` allows `/q/` and `/api/public/` paths without authentication.

### `GET /api/public/quotes/[token]`

Fetches a ticket by its `public_token` for the customer-facing quote page.

**Auth:** None — public route.

**Response `200`:**
```json
{
  "ticket": {
    "id": "uuid",
    "ticket_kind": "quote | order",
    "ticket_status": "sent | approved | order | cancelled",
    "title": "string | null",
    "reference_code": "string | null",
    "quote_skus": "QuoteSku[]",
    "quote_subtotal": "number | null",
    "quote_shipping": "number | null",
    "discount_type": "string | null",
    "discount_value": "string | null",
    "quote_pre_tax_total": "number | null",
    "quote_tax_rate_percent": "number | null",
    "quote_tax_amount": "number | null",
    "quote_final_total": "number | null",
    "tax_exempt": "boolean",
    "quote_payment_types": "string[]",
    "prepayment_type": "full | percent | fixed | null",
    "prepayment_value": "string | null",
    "order_source": "string | null",
    "special_requirements": "string | null",
    "rush": "boolean",
    "client_confirmed": "boolean",
    "contact_name": "string | null",
    "contact_email": "string | null",
    "contact_company": "string | null",
    "customer": { "first_name": "string | null", "last_name": "string | null", "company": "string | null", "email": "string | null" }
  },
  "company": {
    "company_name": "string | null",
    "logo_url": "string | null",
    "address_line1": "string | null",
    "city": "string | null",
    "state": "string | null",
    "zip": "string | null",
    "phone": "string | null",
    "email": "string | null",
    "website": "string | null"
  }
}
```

**Response `404`:** Token not found or ticket in `draft` status.

---

### `POST /api/public/quotes/[token]/confirm`

Customer confirms a quote, converting it to an order.

**Auth:** None — public route.

**Request body:** Empty `{}`.

**Business rules:**
- Ticket must have `ticket_status = "sent"`; returns `400` if already confirmed or not in sent state
- Sets `client_confirmed = true`, `ticket_status = "order"`, `ticket_kind = "order"`
- Generates `ORD-YYYY-NNN` reference code via `increment_order_sequence()`
- Logs `order_ticket_status_changed` activity with `by_user_id = null` (customer action)

**Response `200`:**
```json
{ "ok": true, "reference_code": "ORD-2026-042" }
```

**Response `400`:** Already confirmed or wrong status.

---

## Activity

### `GET /api/activities`

Unified activity endpoint. Supports both lead-scoped and ticket-scoped queries.

**Query params (at least one required):**

| Param | Type | Description |
|-------|------|-------------|
| `lead_id` | `uuid` | Activities for this lead |
| `ticket_id` | `uuid` | Activities for this job ticket |
| `include_linked_lead` | `"true"` | When used with `ticket_id`: also fetches the ticket's linked lead activities, merges them chronologically (oldest first), adds `_source: "lead" | "ticket"` to each row |

**Response `200`:**
```json
{
  "activities": [Activity]
}
```

---

### `GET /api/leads/[id]/activities`

Returns the full activity timeline for a single lead, newest first. Joins `user_profiles` so `by_user.full_name` is always populated.

**Response `200`:**
```json
{
  "activities": [Activity]
}
```

This is what the **Sales Drawer History tab** uses. Each entry includes `by_user.full_name` and `payload` (event-specific data — e.g. `{ from, reason, notes }` for `lead_rejected`).

---

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

Notifications in BazaarCRM are delivered via **Supabase Realtime**, not HTTP polling endpoints.

### How it works

- `components/sidebar.tsx` maintains three persistent Supabase Realtime subscriptions:
  - **`leads-realtime`** — watches any INSERT/UPDATE/DELETE on `public.leads` → refreshes sidebar badge counts + dispatches `bazaar:leads-changed` browser event
  - **`activities-realtime`** — watches any INSERT on `public.activities` → dispatches `bazaar:activities-changed` browser event
  - **`tickets-realtime`** — watches any INSERT/UPDATE/DELETE on `public.job_tickets` → refreshes sidebar badge counts + dispatches `bazaar:tickets-changed` browser event
- **Sidebar badge counts** are fetched via `GET /api/sidebar-counts` (triggered on mount and on any Realtime event)
- **Activity log** (admin `/notifications` page) is fetched via `GET /api/admin/activity-log` and auto-refreshes when `bazaar:activities-changed` fires

There are **no** REST notification endpoints (`/api/notifications`, `/api/notifications/read`, etc.) — those are planned for a future V2 bell-based notification system.

See `docs/realtime-live-updates.md` for the full architecture and pattern guide.

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
  "role": "admin",
  "total_leads": "number",
  "open_leads": "number",
  "claimed_leads": "number",
  "inbox_leads": "number",
  "routed_leads": "number",
  "won_leads": "number",
  "total_revenue": "number",
  "pipeline_value": "number",
  "sdr_performance": "SdrPerformanceRow[]",
  "rejection_reasons": "BreakdownItem[]",
  "source_breakdown": "BreakdownItem[]"
}
```

- `total_leads` — leads created in the selected period
- `open_leads` — current snapshot: unclaimed `Pending/Validated` workspace leads (`locked_by_id IS NULL`)
- `claimed_leads` — current snapshot: `Pending/Validated` workspace leads owned by an SDR
- `inbox_leads` — current snapshot: leads still in inbox (`is_inbox = true`)
- `routed_leads` — current snapshot: leads with `status = 'Routed to Sales'`
- `won_leads` — leads with `sales_status = 'Won'` in the selected period
- `total_revenue` — sum of `quote_total` for won leads in the selected period
- `pipeline_value` — sum of `quote_total` for all `Routed to Sales` leads (live snapshot)
- `sdr_performance` — per-SDR breakdown: `{ id, full_name, handled, routed, rejected, quote_value, share_pct }`
- `rejection_reasons` — top rejection reasons: `{ reason, count }[]` sorted by count desc
- `source_breakdown` — lead source counts: `{ source, count }[]` sorted by count desc

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

### `GET /api/admin/activity-log`

Paginated activity log across all users. Admin only. Powers the `/notifications` page.

**Query params:**

| Param | Type | Description |
|-------|------|-------------|
| `type` | `string` | Filter by activity type |
| `limit` | `number` | Default `50`, max `100` |
| `offset` | `number` | Default `0` |

**Response `200`:**
```json
{
  "activities": [Activity],
  "total": "number"
}
```

Each activity is enriched with `actor` (`{ id, full_name, role_name }`) and `customer` (`{ first_name, last_name, company }`) via server-side joins.

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
  "sales_drop_reason": [LookupValue],
  "lamination": [LookupValue],
  "finishing": [LookupValue],
  "color_mode": [LookupValue],
  "sides": [LookupValue],
  "roll_direction": [LookupValue],
  "quote_channel": [LookupValue],
  "follow_up_freq": [LookupValue],
  "ticket_priority": [LookupValue],
  "order_source": [LookupValue],
  "ticket_payment": [LookupValue]
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

## Products Catalog

### `GET /api/lookups/products`

Returns the full product catalog for the new-quote-form SKU dropdowns. Open to all authenticated users.

**Response `200`:**
```json
{
  "products": [
    {
      "id": "string",
      "name": "string",
      "is_roll": "boolean",
      "is_active": "boolean",
      "materials": [
        {
          "id": "string",
          "name": "string",
          "is_active": "boolean"
        }
      ]
    }
  ]
}
```

Products and materials with `is_active = false` are excluded. Managed via **Admin → Products** tab.

---

## Company Settings

### `GET /api/admin/company`

Returns the single `company_settings` row. Accessible to all authenticated users (OrderDrawer needs tax rate + threshold at runtime).

**Response `200`:**
```json
{
  "settings": {
    "id": 1,
    "company_name": "string",
    "address_line1": "string | null",
    "address_line2": "string | null",
    "city": "string | null",
    "state": "string | null",
    "zip": "string | null",
    "phone": "string | null",
    "email": "string | null",
    "website": "string | null",
    "logo_url": "string | null",
    "default_tax_rate": "number",
    "high_value_threshold": "number",
    "rush_surcharge_percent": "number | null",
    "updated_at": "string"
  }
}
```

---

### `PATCH /api/admin/company`

Update company settings. Admin only.

**Body:** Any subset of company_settings fields (except `id`).

**Response `200`:** `{ "settings": CompanySettings }`

---

---

## Admin — Integrations

### `POST /api/admin/integrations/twilio/test`

Send a test SMS or WhatsApp message. Admin only.

**Body:**
```json
{ "to": "+1XXXXXXXXXX", "channel": "sms" | "whatsapp" }
```

**Response `200`:** `{ "ok": true, "sid": "SMxxx", "status": "queued" }`
**Response `500`:** `{ "ok": false, "error": "..." }` — missing env vars or Twilio error.

**Notes:**
- SMS sends from `TWILIO_PHONE_NUMBER` (toll-free recommended to avoid A2P 10DLC blocks)
- WhatsApp sends from `TWILIO_WHATSAPP_FROM` (requires Twilio WhatsApp Sandbox join or Meta Business approval)

---

### `POST /api/admin/integrations/instantly/test`

Send a test email via Instantly AI. Admin only.

**Body:**
```json
{ "to_email": "recipient@example.com" }
```

**Response `200`:** `{ "ok": true, "data": { "status": "success" } }`
**Response `500`:** `{ "ok": false, "error": "..." }` — missing env vars or Instantly API error.

**Notes:**
- Uses Instantly AI v2 API (`POST /api/v2/emails/test`)
- Requires `INSTANTLY_API_KEY` (Bearer token, `all:all` scope) and `INSTANTLY_SENDING_ACCOUNT` (email account connected to Instantly workspace)

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
