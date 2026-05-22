# BazarCRM — API Contract

All endpoints are Next.js 16 Route Handlers under `app/api/`. Every handler uses the **admin Supabase client** (`lib/supabase/admin.ts`) for writes and the **server client** (from `@supabase/ssr`) for reads with RLS applied.

**Authentication:** All endpoints require an authenticated session. `proxy.ts` blocks unauthenticated requests before they reach Route Handlers. Handlers additionally call `supabase.auth.getUser()` and return `401` if no session.

**Base URL:** `/api` (relative, same origin).

**Content type:** `application/json` throughout.

---

## Leads

### `GET /api/leads/workspace`

Returns workspace leads (`is_inbox = false`). Visibility is **role-scoped server-side**:
- **SDR (no `status`/`statuses` param):** only leads where `locked_by_id IS NULL OR locked_by_id = currentUserId` — SDRs never see leads being worked by another SDR
- **SDR (with `status` or `statuses` param):** scoped to their own leads (`sdr_id = currentUserId`), used for Hold / Rejected / Directed-to-Sales tabs. When `statuses` is provided and `sales_status = 'Won'` is present in the set, Won leads are automatically excluded (they have a dedicated Won tab).
- **Admin:** all leads, no lock filter — also returns a `locked_by` profile join on each row
- **Sales:** only leads where `status = 'Routed to Sales'` or `sales_owner_id = currentUserId`

**Query params:**

| Param | Type | Description |
|-------|------|-------------|
| `status` | `string` | Filter by a single `status` value (e.g. `?status=On+Hold`) |
| `statuses` | `string` | Comma-separated list of status values — server applies `status IN (...)` filter. Used by SDR "Directed to Sales" tab: `?statuses=Routed+to+Sales,Quoted,Validated`. Takes precedence over `status` when present. |
| `prev_status` | `string` | Filter by `prev_status` value — used by Sales Rejected tab to restrict to `Routed to Sales` |
| `scope` | `string` | `mine` — restrict to leads where `sdr_id = current user` |
| `search` | `string` | Full-text search on name, email, phone, company |
| `won` | `"true"` | Return leads where `sales_status = 'Won'`. SDR sees own won leads; admin sees all. Response rows include joined order fields: `reference_code`, `quote_final_total`, and `created_by` (closer's full name from `user_profiles`). |

**Response `200`:**
```json
{
  "leads": [Lead]
}
```

> **Performance (2026-05-22):** List responses use a **slim select** — table columns only. Drawers call `GET /api/leads/[id]` for the full record (interests, quantities, comments, joins).

---

### `GET /api/leads/workspace/counts`

Returns tab badge counts for the SDR leads workspace. Scoped per role same as the workspace endpoint. Uses SQL `{ count: "exact", head: true }` via `lib/utils/db-counts.ts`.

**Response `200`:**
```json
{
  "counts": {
    "all": 0,
    "hold": 0,
    "routed": 0,
    "rejected": 0,
    "won": 0
  }
}
```

- `won` — count of leads where `sales_status = 'Won'` (SDR sees own; admin sees all)
- All counts refresh when `bazaar:refresh-counts` fires

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
  "has_design": "object",
  "customer_id": "uuid | null",
  "create_customer": "boolean"
}
```

**Field shapes:**
- `interests` — `Record<string, boolean>` keyed by product type name, e.g. `{ "Labels": true, "Boxes": true }`
- `quantities` — `Record<string, string>` keyed by product type name, e.g. `{ "Labels": "500", "Boxes": "200" }`
- `has_design` — `Record<string, boolean>` keyed by product type name, e.g. `{ "Labels": true, "Boxes": false }`

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

### `GET /api/leads/[id]`

Returns a **full lead record** for drawer/detail UIs. Authorization via `canReadLead()` in `lib/utils/lead-access.ts`.

**Read access:**
- **Admin:** any lead
- **SDR:** own leads (`sdr_id`), locked leads (`locked_by_id`), or unclaimed workspace leads (`locked_by_id IS NULL`)
- **Sales:** routed leads, own pipeline leads (`sales_owner_id`), sales-rejected leads (`status=Rejected` + `prev_status=Routed to Sales`)

**Response `200`:**
```json
{
  "lead": Lead
}
```

Includes joins: `customer`, `sales_owner` (`user_profiles`), `locked_by` (`user_profiles`).

**Response `404`:** lead not found · **Response `403`:** caller cannot read this lead

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

### `GET /api/customers`

Returns the CRM customer registry with lightweight per-customer aggregates. Used by `components/crm/crm-page.tsx`.

**Query params:**

| Param | Type | Description |
|-------|------|-------------|
| `search` | `string` | Client-side filter on name, email, phone, company (applied after fetch) |

**Response `200`:**
```json
{
  "customers": [
    {
      "id": "uuid",
      "first_name": "string",
      "last_name": "string | null",
      "email": "string | null",
      "phone": "string",
      "company": "string | null",
      "industry": "string | null",
      "heat_tag": "string | null",
      "created_at": "ISO",
      "updated_at": "ISO",
      "lead_count": 0,
      "ticket_count": 0,
      "last_activity": "ISO",
      "qualifies": true
    }
  ]
}
```

> **Performance (2026-05-22):** Slim customer fields plus separate lead/ticket aggregate queries — no nested `customers(*)` on leads. Rows with `qualifies=false` are filtered out (customer must have a qualifying lead or any ticket).

---

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
| `kind` | `'quote' \| 'order'` | Filter by `ticket_kind`. When `kind=quote` (list use), response uses **slim select** and auto-filters to quote-stage statuses (`draft`, `sent`, `approved`, `routed`) — no `quote_skus`, notes, or payment-config blobs. |
| `status` | `string` | Filter by `ticket_status` |
| `lead_id` | `uuid` | Filter by `linked_lead_id` |
| `search` | `string` | Search on contact name, company, title, reference code |

**Slim quote list fields** (when `kind=quote`): `id`, `ticket_kind`, `ticket_status`, `title`, `reference_code`, `quote_channel`, `quote_final_total`, `quote_reminder_date`, `created_at`, `updated_at`, `created_by_id`, `routed_by_id`, slim `customer` join.

> For orders list, use **`GET /api/orders/orders`** instead — do not use `kind=order` on this endpoint for the `/orders` page.

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

Partial ticket update. Six distinct operation modes:

**Mode 1 — Payment Reminder:**
```json
{
  "send_payment_reminder": true,
  "reminder_channel": "email | sms | whatsapp",
  "reminder_destination": "string"
}
```
- Ticket must be `client_confirmed = true` (confirmed order)
- Fetches full ticket + company settings, calls `sendPaymentReminder()` from `lib/integrations/send-quote.ts`
- Uses `lib/integrations/payment-reminder-template.ts` for email channel; short SMS body for SMS/WhatsApp
- Phone numbers are auto-normalised to E.164 format via `toE164()` (e.g. `3233413620` → `+13233413620`)
- Delivery is fire-and-forget — errors logged to console, never block the API response
- Logs `ticket_payment_reminder_sent` activity with `{ channel, destination }` in payload
- Returns `200` immediately; `ok: true` in body

**Mode 2 — Resend invoice link:**
```json
{
  "resend_invoice": true,
  "invoice_channel": "email | sms | whatsapp",
  "invoice_destination": "string"
}
```
- Sends customer the permanent `/q/{public_token}` portal link via `sendInvoiceLinkToCustomer()`
- Works for paid, unpaid, in-production, and completed orders
- Optional `invoice_channel` / `invoice_destination` override quote defaults
- Logs `ticket_invoice_resent` with `{ channel, destination }`
- Returns `{ ok: true, channel }` or `502` on send failure

**Mode 3 — Record payment (Accountant + Admin):**
```json
{
  "record_payment": true,
  "payment_mode": "deposit | balance | full",
  "payment_method": "cash | wire | ach | zelle | check | card",
  "payment_amount": 1234.56,
  "receipt_id": "string | null"
}
```
- Records deposit / balance / full payment; updates running `payment_amount_received`
- Sets `payment_status` to `partial` or `paid`; clears `payment_evidence_*` fields when confirming submitted proof
- Runs `computeCheckout` after recording — may auto-release to `in_production` when gates pass
- When confirming customer-submitted evidence: sends **payment confirmed** email/SMS; logs `ticket_payment_confirmed_sent`
- Logs `ticket_payment_recorded` activity

**Mode 4 — Claim (Sales/Admin only):**
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

**Mode 5 — Normal update:**

Body: Any subset of ticket fields plus optional:
```json
{
  "activity_by_role": "sdr | sales"
}
```

`activity_by_role` is stripped from the stored record but used to attribute the activity log entry.

**Business rules (Mode 5):**
- If `ticket_status` transitions to `"completed"` from `"in_production"`: sends pickup-ready notification via `sendOrderReadyToCustomer()`; logs `ticket_order_ready_sent` or `ticket_order_ready_failed`
- **Accountant** may set `ticket_status = "completed"` only on in-production orders that are **paid in full** (`isTicketPaidInFull()`)
- If `ticket_status` is set to `"sent"` → triggers `sendQuoteToCustomer()` (email/SMS/WhatsApp delivery); logs `ticket_sent` with `{ channel, destination }`. If status was already `"sent"` (resend), adds `resend: true` to payload.
- If `ticket_status` transitions to `"order"` (manual "Convert to Order"):
  - Auto-generates `ORD-YYYY-NNN` reference code via `increment_order_sequence()`
  - Sets `ticket_kind = "order"`
  - Logs `ticket_converted` activity
  - If ticket has `linked_lead_id`: updates `leads.sales_status = 'Won'` on the linked lead
- If `quote_approval_last_requested_at` is set → logs `quote_approval_requested`
- If `follow_up_completed` transitions to `true` → logs `quote_follow_up_completed`
- If `follow_up_at` is reset → logs `quote_follow_up_reset`
- If `client_confirmed` transitions to `true` → logs `ticket_client_confirmed`; creates `follow_up_due` notification
- Otherwise → logs `order_ticket_updated` with `payload.fields`
- `payment_status` and `prepayment_status` can be updated on `order` status tickets even by non-admins (special relaxed guard)
- **Accountants** may update payment fields on any ticket; non-admins on locked `order` tickets may only update payment-related fields

**Mode 6 — Field guard notes:**
- Once `ticket_status = 'order'`, non-admins (except accountant payment updates) cannot edit non-payment fields
- Customer-confirmed orders are locked for SDR/Sales in the UI; admin may still edit/cancel

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

### `GET /api/tickets/[id]/evidence`

Returns a short-lived signed URL for the customer-uploaded payment evidence file.

**Auth:** Requires authenticated session with access to the ticket.

**Response `200`:**
```json
{ "url": "https://..." }
```

**Response `404`:** No evidence on file.

---

### `GET /api/tickets/counts`

Returns lightweight tab badge counts. Scoped per role. Uses parallel SQL `{ count: "exact", head: true }` via `lib/utils/db-counts.ts` (no row fetch into Node.js).

**Response `200`:**
```json
{
  "counts": {
    "drafts": 0,
    "sent": 0,
    "approved": 0,
    "orders": 0,
    "routed": 0,
    "cancelled": 0,
    "total": 0
  }
}
```

- **SDR:** `routed` = count of their own routed tickets (subtracted from `all` on the Quotes page)
- **Sales/Admin:** `routed` = count of ALL routed tickets from any SDR
- `cancelled` = count of cancelled tickets (used by Orders page "Cancelled" tab badge)
- Orders tab counts exclude tickets with pending payment evidence (`payment_evidence_url` set, `payment_paid_at` null)

---

## Payments (Accountant + Admin)

### `GET /api/payments/pending`

Returns orders with customer-submitted payment evidence awaiting accountant confirmation.

**Auth:** Accountant or Admin only.

**Filter:** `payment_evidence_url IS NOT NULL`, `payment_paid_at IS NULL`, `ticket_status IN ('order', 'in_production')`

**Response `200`:**
```json
{
  "orders": [
    {
      "id": "uuid",
      "reference_code": "ORD-2026-042",
      "title": "string",
      "quote_final_total": 1234.56,
      "payment_evidence_url": "path/in/storage",
      "payment_evidence_submitted_at": "ISO",
      "payment_evidence_amount": 500.00,
      "customer": { "first_name": "string", "last_name": "string", "company": "string" }
    }
  ]
}
```

---

### `GET /api/payments/counts`

Returns tab badge counts for the Payments page.

**Auth:** Accountant or Admin only.

**Response `200`:**
```json
{
  "counts": {
    "pending": 0
  }
}
```

---

## Orders

### `GET /api/orders/orders`

Scoped list for the `/orders` page — **`ticket_status IN ('order', 'cancelled')`**, slim payload (no `quote_skus`).

**Excludes** tickets with pending payment evidence (those appear on `/payments` only). Filter constant: `ORDERS_VISIBLE_PAYMENT_FILTER` in `lib/utils/db-counts.ts`.

**Role scope:** Same as `GET /api/tickets` via `scopeJobTicketsQuery()` — SDR own tickets, Sales own + routed-by, Admin all.

**Response `200`:**
```json
{
  "orders": [
    {
      "id": "uuid",
      "ticket_kind": "order",
      "ticket_status": "order | cancelled",
      "payment_status": "unpaid | partial | paid",
      "title": "string",
      "reference_code": "string | null",
      "quote_final_total": 0,
      "priority": "string | null",
      "due_date": "ISO date | null",
      "rush": false,
      "created_at": "ISO",
      "customer": { "id": "uuid", "first_name": "string", "last_name": "string", "company": "string | null" }
    }
  ]
}
```

---

## Production

### `GET /api/production/orders`

Returns all tickets with `ticket_status = 'in_production'`.

**Auth:** Any authenticated role (page access is RBAC-gated in UI).

**Response `200`:**
```json
{ "orders": [Ticket] }
```

---

### `GET /api/production/counts`

Returns tab badge counts for the Production page. SQL head counts via `lib/utils/db-counts.ts`.

**Response `200`:**
```json
{
  "counts": {
    "all": 0,
    "balance_due": 0
  }
}
```

---

## Completed

### `GET /api/completed/orders`

Returns all tickets with `ticket_status = 'completed'`.

**Response `200`:**
```json
{ "orders": [Ticket] }
```

---

### `GET /api/completed/counts`

Returns tab badge counts for the Completed page.

**Response `200`:**
```json
{
  "counts": {
    "all": 0
  }
}
```

---

## Public Quote Routes (no auth required)

These routes are accessible without a session. `proxy.ts` allows `/q/` and `/api/public/` paths without authentication. Logged-in staff visiting `/q/{token}` also bypass RBAC/MFA redirects so they can preview the customer portal.

### `GET /api/public/quotes/[token]`

Fetches a ticket by its `public_token` for the customer-facing quote page.

**Auth:** None — public route.

**Response `200`:** Returns safe public ticket fields including payment config columns, evidence state (`payment_evidence_url`, `payment_evidence_submitted_at`, `payment_evidence_amount`), and `production_released_at`. Draft tickets return `404`.

```json
{
  "ticket": {
    "ticket_kind": "quote | order",
    "ticket_status": "sent | order | in_production | completed | cancelled",
    "reference_code": "string | null",
    "quote_final_total": "number | null",
    "client_confirmed": "boolean",
    "payment_amount_received": "number | null",
    "payment_evidence_url": "string | null",
    "payment_evidence_submitted_at": "ISO | null",
    "payment_evidence_amount": "number | null",
    "production_released_at": "ISO | null",
    "ticket_payment_strategy": "full | partial | net",
    "ticket_require_client_confirm": "boolean"
  },
  "company": { "company_name": "string", "phone": "string", "address_line1": "string" }
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
- May auto-release to `in_production` when net terms / payment gates pass (`maybeAutoReleaseProduction`)
- Logs `order_ticket_status_changed` and `ticket_client_confirmed` activities with `by_user_id = null` (customer action)
- If ticket has `linked_lead_id`: updates `leads.sales_status = 'Won'` on the linked lead (SDR/Sales Won tracking)

**Response `200`:**
```json
{ "ok": true, "reference_code": "ORD-2026-042" }
```

**Response `400`:** Already confirmed or wrong status.

---

### `POST /api/public/quotes/[token]/submit-payment`

Customer submits payment proof or records an in-person payment from the public portal.

**Auth:** None — public route.

**Content-Type:** `multipart/form-data`

| Field | Required | Description |
|-------|----------|-------------|
| `method` | Yes | `wire` \| `ach` \| `zelle` \| `check` \| `card` \| `cash` |
| `amount` | Yes | Payment amount (numeric string) |
| `file` | Conditional | Evidence file — required for wire/ACH/zelle/check/card |
| `receiptId` | No | Receipt reference for cash-in-person |

**Business rules:**
- Allowed when `ticket_status IN ('sent', 'order', 'in_production')`
- Wire/ACH/Zelle/check/card: stores file in `payment-evidence` bucket; sets evidence fields + `payment_evidence_amount`; **does not** update `payment_amount_received` or mark paid — queues for accountant on `/payments`
- Cash: records payment immediately; may auto-release to `in_production` when gates pass
- `sent` → `order` conversion on first payment (generates ORD reference)
- Follow-up balance payments allowed when already partially paid or `in_production`
- Logs `ticket_payment_evidence_submitted` and status-change activities in History

**Response `200`:**
```json
{
  "ok": true,
  "autoReleased": false,
  "reference_code": "ORD-2026-042"
}
```

**Response `409`:** Evidence already submitted (first payment only).

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

- `components/layout/sidebar.tsx` maintains three persistent Supabase Realtime subscriptions:
  - **`leads-realtime`** — watches any INSERT/UPDATE/DELETE on `public.leads` → refreshes sidebar badge counts + dispatches `bazaar:leads-changed` browser event
  - **`activities-realtime`** — watches any INSERT on `public.activities` → dispatches `bazaar:activities-changed` browser event
  - **`tickets-realtime`** — watches any INSERT/UPDATE/DELETE on `public.job_tickets` → refreshes sidebar badge counts + dispatches `bazaar:tickets-changed` browser event
- **Sidebar badge counts** are fetched via `GET /api/sidebar-counts` (on mount and on Realtime events, **debounced ~300 ms** in `sidebar.tsx` to coalesce bursts). Count queries use SQL `{ count: "exact", head: true }` via `lib/utils/db-counts.ts`.
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

Creates a new user with a temp password and optionally sends a branded welcome email.

**Body:**
```json
{
  "email": "string",
  "full_name": "string",
  "role_id": "uuid",
  "temp_password": "string",
  "send_welcome_email": true
}
```

**Business rules:**
1. Calls `supabase.auth.admin.createUser({ email, password: temp_password, email_confirm: true })`
2. Creates `user_profiles` with `role_id`, `must_change_password: true`, `is_active: true`
3. If `send_welcome_email: true` — fires a branded HTML welcome email via **Instantly AI** (fire-and-forget) containing the user's email, temp password, and a login CTA. Requires `INSTANTLY_API_KEY` and `INSTANTLY_SENDING_ACCOUNT` env vars. Silently skips if Instantly is not configured.

**Response `201`:**
```json
{
  "user": UserProfile
}
```

---

### `PATCH /api/admin/users/[id]`

Update a user's role, active status, full name, or reset their temp password.

**Body:**
```json
{
  "role_id": "uuid | null",
  "is_active": "boolean | null",
  "full_name": "string | null",
  "new_temp_password": "string | null"
}
```

**Business rules:**
- If `new_temp_password` is provided: calls `supabase.auth.admin.updateUserById` to set the new password, sets `must_change_password = true` on `user_profiles`, then **automatically sends a branded password-reset email** to the user via Instantly AI (fire-and-forget). Email includes their new temp password and a login CTA. Silently skips if Instantly is not configured.
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

Returns the single `company_settings` row. Accessible to all authenticated users (quote forms and public page need tax rate + threshold at runtime).

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
