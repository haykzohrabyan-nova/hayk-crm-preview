# BazarCRM — API Contract

All endpoints are Next.js 16 Route Handlers under `app/api/`. Most handlers use the **admin Supabase client** (`lib/supabase/admin.ts`) for database access. The server client (from `@supabase/ssr`) is used where session cookies must be read or refreshed.

**Base URL:** `/api` (relative, same origin).

**Content type:** `application/json` unless noted (PDF, HTML print, file upload).

---

## Authentication & authorization

**Important:** `proxy.ts` does **not** protect `/api/*`. Every app Route Handler must enforce auth itself.

### Helpers

| Helper | Use |
|--------|-----|
| `requireSession()` | Logged in + MFA complete (AAL2 or valid trusted-device cookie) |
| `requireAdmin()` | `requireSession()` + `roleName === 'admin'` |
| `requireSession({ requireMfa: false })` | Sign-out / session-end only |

Implemented in `lib/auth/require-session.ts` and `lib/auth/require-admin.ts`. Ticket scope: `lib/utils/ticket-access.ts` (`canAccessTicket`, `canMutateTicket`).

### Error codes

| HTTP | `code` | Meaning |
|------|--------|---------|
| `401` | `UNAUTHENTICATED` | No valid session |
| `403` | `MFA_SETUP_REQUIRED` | Must enroll TOTP at `/setup-2fa` |
| `403` | `MFA_VERIFY_REQUIRED` | Must verify TOTP at `/verify-2fa` |
| `403` | `FORBIDDEN` | Wrong role or ticket/lead scope |

Full security model: **`docs/security.md`**.

**Session cache (May 2026):** Successful `requireSession()` results are memoized in-process for ~3 s (`lib/auth/session-cache.ts`) to avoid duplicate auth + profile lookups during page load bursts.

---

## Performance — combined page-data (May 2026)

Tabbed list pages should prefer **one** request on mount instead of separate list + counts calls. Each handler runs `requireSession()` once, then `Promise.all([listQuery, countsQuery])`.

| Route | Response | Used by |
|-------|----------|---------|
| `GET /api/production/page-data` | `{ orders, counts }` | Production page |
| `GET /api/orders/page-data` | `{ orders, counts }` | Orders page |
| `GET /api/quotes/page-data` | `{ tickets, counts }` | Quotes page |
| `GET /api/payments/page-data` | `{ orders }` | Payments page |
| `GET /api/completed/page-data` | `{ orders, counts }` | Completed page — SDR: `created_by_id` only; Admin/Accountant: all |
| `GET /api/leads/workspace/page-data?…` | `{ leads, counts }` | Leads page (same query params as workspace list) |
| `GET /api/leads/sales/page-data?tab=…` | `{ leads, counts }` | Sales page |

**Slim count-only routes** (realtime refresh without full list): `GET /api/orders/counts`, `GET /api/quotes/counts`, plus existing `*/counts` routes.

**Sidebar:** `GET /api/sidebar-counts?routes=/quotes,/orders,…` — optional comma-separated nav routes; only computes badges for visible pages. SDR `/completed` badge uses `scopedCompletedTicketCount()` (`created_by_id` only).

Legacy list + count routes remain for compatibility. Shared query logic lives in `lib/utils/fetch-*-data.ts` and `lib/utils/leads-workspace-query.ts`.

---

### Public routes (no staff session)

- `/api/public/quotes/[token]/*` — customer quote portal (token-gated UUID)
- `/api/auth/change-password` — own session via `getUser()` (forced password change flow)
- `/api/auth/mfa-trust` — POST requires AAL2; DELETE clears trust cookie

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
| `statuses` | `string` | Comma-separated list of status values — server applies `status IN (...)` filter. Takes precedence over `status` when present. |
| `routed` | `"true"` | SDR **Directed to Sales** tab: all leads with a `lead_routed_to_sales` activity (scoped by `sdr_id` when `scope=mine`). Includes Won, Rejected, and Dropped — not limited to unclaimed pipeline statuses. |
| `prev_status` | `string` | Filter by `prev_status` value — used by Sales Rejected tab to restrict to `Routed to Sales` |
| `scope` | `string` | `mine` — restrict to leads where `sdr_id = current user` |
| `search` | `string` | Full-text search on name, email, phone, company |
| `won` | `"true"` | SDR **Won** tab: `sales_status = 'Won'` **and** lead was routed to Sales (`lead_routed_to_sales` activity). Production release still sets Won globally; this tab excludes SDR self-quoted wins without routing. SDR sees own leads; admin sees all. Response uses slim lead fields plus nested `tickets:job_tickets(id, reference_code, ticket_kind, ticket_status)` only — **no order totals or closer names** (Won tab matches customer Lead History). |

**Response `200`:**
```json
{
  "leads": [Lead]
}
```

> **Performance (2026-05-22):** List responses use a **slim select** — table columns only. Includes `interests` and `quantities` for Product Interests column formatting. Drawers call `GET /api/leads/[id]` for the full record (comments, joins, etc.).

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
- **`website`** (optional): validated with `validateWebsite()`; stored via `normalizeWebsite()` (auto-prefix `https://` when protocol omitted; user may type `example.com` without scheme). Returns `400` if invalid.
- **Customer linking:** pass either `customer_id` (selected existing) OR `create_customer: true` (create new from form data) OR neither (no customer yet — can be linked later)
- If `create_customer: true`: server creates a `customers` row from the lead's contact fields (including **`authority`**), sets `customer_id` on the new lead
- If `customer_id` is provided and **`authority`** is set: updates `customers.authority` (not `leads.authority`)
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
- **`authority`** in the body updates **`customers.authority`** (not `leads.authority`); response includes refreshed `customer` join
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

Smart deduplication — used by the Manual Add Lead form, Verify Drawer, and **New Quote Customer tab**. Returns **all** customer profiles matching the phone or email (there may be multiple).

**Query params:**

| Param | Type | Description |
|-------|------|-------------|
| `phone` | `string` | Digits-only phone to look up (primary lookup key) |
| `email` | `string` | Email to look up (secondary — used if phone is blank) |

**Business rules:**
- Phone takes priority: if `phone` param is provided, only phone lookup runs
- Email lookup only runs if `phone` is not provided
- Returns all matching records (0, 1, or many)
- Each customer row includes **`authority`** directly; enriched with **`latest_source`** from the most recent lead or direct quote for pre-fill on New Quote

**Response `200`:**
```json
{
  "customers": [
    {
      "...Customer fields (including authority)...",
      "latest_source": "string | null"
    }
  ],
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
- **`website`** (optional): if non-empty, validated with `validateWebsite()` and stored via `normalizeWebsite()` (`https://` prefixed when omitted); `400` if invalid
- No duplicate check on save — duplicates are handled at lookup time (UI decision)

**Response `201`:**
```json
{
  "customer": Customer
}
```

---

### `GET /api/customers/[id]`

Full customer profile for `/crm/customers/[id]`. Returns customer row, `lead_count`, and `customer_status`. Lead array still returned for status computation but **Lead History UI removed** from customer profile (May 2026). Quotes & Orders loaded separately via `GET /api/tickets?customer_id=…`.

**Response `200`:**
```json
{
  "customer": Customer,
  "leads": [
    {
      "id": "uuid",
      "status": "string",
      "sales_status": "string",
      "source": "string",
      "urgency": "string",
      "created_at": "ISO",
      "updated_at": "ISO",
      "sdr_id": "uuid",
      "rejection_reason": "string | null",
      "tickets": [
        {
          "id": "uuid",
          "reference_code": "QUO-2026-001 | ORD-2026-001 | null",
          "ticket_kind": "quote | order",
          "ticket_status": "string"
        }
      ]
    }
  ],
  "lead_count": 0,
  "customer_status": "new | known"
}
```

Each lead includes nested **`tickets:job_tickets(...)`** (reference codes only — no totals). This ensures SDRs see quote/order refs on Lead History without relying on scoped `GET /api/tickets`.

---

### `PATCH /api/customers/[id]`

Update a customer profile. Called when SDR chooses "Yes, update profile" on the action prompt.

**Body:** Any subset of customer fields (except `id`, `created_at`).

**Allowed fields:** `first_name`, `last_name`, `email`, `phone`, `company`, `industry`, `website`, `authority`, `heat_tag`

**Business rules:**
- Phone normalized to digits-only
- **`website`:** if non-empty, validated and normalized (`https://` prefixed when protocol omitted; user may submit `example.com` without scheme); empty string clears to `null`
- Logs `customer_updated` activity

**Response `200`:**
```json
{
  "customer": Customer
}
```

---

### `POST /api/customers/[id]/merge`

Merge duplicate customer **source** (`id` in path) into **target** (`target_id` in body). Moves all leads and activities to the target, logs a merge activity, then **deletes** the source customer.

**Auth:** Admin or Sales only (`403` for SDR, Accountant, etc.).

**Body:**
```json
{
  "target_id": "uuid"
}
```

**Response `200`:**
```json
{
  "success": true,
  "surviving_id": "uuid"
}
```

**Errors:** `404` if either customer missing; `400` if `target_id === id`.

---

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
  "industry": "string | null",
  "website": "string | null",
  "from_quote_page": "boolean",
  "quote_source": "string | null",
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
  "quote_channel": "string | null",
  "quote_destination": "string | null",
  "quote_reminder_date": "ISO date | null",
  "follow_up_cycles": "number | null",
  "follow_up_frequency": "string | null",
  "ticket_payment_strategy": "partial | full | net | null",
  "ticket_deposit_type": "percent | fixed | null",
  "ticket_deposit_value": "number | null",
  "ticket_dep_handling": "cash | gateway | null",
  "ticket_receipt_id": "string | null",
  "ticket_partial_channels": "string[] | null",
  "ticket_full_channels": "string[] | null",
  "ticket_require_client_confirm": "boolean | null",
  "ticket_net_terms_label": "string | null",
  "ticket_quote_channel": "sms | email | both | null",
  "ticket_dest_phone": "string | null",
  "ticket_dest_email": "string | null",
  "ticket_follow_up_enabled": "boolean | null",
  "ticket_follow_up_count": "number | null",
  "ticket_follow_up_freq": "daily | every-3-days | weekly | null"
}
```

**Business rules:**
- `created_by_id = current_user`
- `ticket_status` defaults to `'draft'` if not provided; `'routed'` is accepted for HVT saves from SDRs
- **`website`** (optional on customer upsert): if non-empty, validated with `validateWebsite()` and stored via `normalizeWebsite()`; `400` if invalid
- **Customer upsert:** when contact fields are provided and `customer_id` is null, the server matches on email/phone, creates or updates the `customers` row (industry/website), and sets `customer_id`. When `customer_id` is passed (existing customer from lookup), industry/website are updated on that row if provided.
- **Source handling:**
  - **`from_quote_page: true`** (Quotes page, no linked lead): requires `quote_source` + `industry`; stores `quote_source` on `job_tickets`; **does not** auto-create a linked lead
  - **Lead / CRM flows** (`linked_lead_id` or `source` without `from_quote_page`): may auto-create a linked lead with `source` when no lead exists yet
- For `ticket_kind = 'quote'`: auto-generates `QUO-YYYY-NNNN` reference code via `increment_quote_sequence(year)`
- For `ticket_kind = 'order'`: auto-generates `ORD-YYYY-NNN` reference code via `increment_order_sequence(year)` PL/pgSQL function
- Sets `design_required = true` if any SKU has `design_required = true`; same for `die_cut`
- If `linked_lead_id` is provided, updates the linked lead's `status` to `'Quoted'` or `'Validated'`
- Sets `routed_by_id = userId` when `ticket_status = 'routed'`
- Logs `order_ticket_created` activity
- If `ticket_status = 'sent'` on create (Save & Send): logs `ticket_sent` and triggers `sendQuoteToCustomer()` — same activity shape as PATCH send
- May auto-record cash deposit/full payment when configured — logs `ticket_payment_recorded` via `lib/utils/log-ticket-payment-recorded.ts` (counts in Reports/dashboard cash); **does not** set `client_confirmed` when `ticket_require_client_confirm = true`

**Response `201`:**
```json
{
  "ticket": Ticket
}
```

---

### `GET /api/tickets/[id]`

Returns a single ticket with full detail (line items, payment config, linked lead/customer joins).

**Auth:** Requires authenticated session.

**URL segment:** UUID or human reference code (`QUO-YYYY-NNNN`, `ORD-YYYY-NNN`).

**Access scoping:**
- **Admin** — any ticket
- **Accountant** — any ticket (matches `scopeJobTicketsQuery` on list routes; fixes 403 on `/orders/[id]`)
- **Sales / Admin** — may also read `routed` tickets they do not own (SDR hand-offs awaiting claim)
- **SDR / Sales** — own tickets (`created_by_id = currentUser`) only, plus routed exception above

**Response `200`:**
```json
{ "ticket": Ticket }
```

**Response `403`:** Ticket exists but caller lacks read access.

**Response `404`:** Ticket not found.

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

**Mode 3 — Record payment (Accountant + Admin only):**
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
- Runs `maybeConvertQuoteToOrder()` then `maybeAutoReleaseProduction()` when gates pass
- When confirming customer-submitted evidence: sends **payment confirmed** email/SMS (balance on in-production orders: **paid in full** messaging); logs `ticket_payment_confirmed_sent`
- Logs `ticket_payment_recorded` activity via `lib/utils/log-ticket-payment-recorded.ts`

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
- If `ticket_status` transitions to `"completed"` from `"in_production"`: sends pickup-ready notification via `sendOrderReadyToCustomer()` (same `/q/{public_token}` URL); logs `ticket_order_ready_sent` or `ticket_order_ready_failed`
- **Accountant** may set `ticket_status = "completed"` only on in-production orders that are **paid in full** (`isTicketPaidInFull()`)
- **Admin** may mark completed with outstanding balance only when body includes `acknowledge_outstanding_balance: true` (UI shows confirmation modal); see **TODO-009**
- If `ticket_status` transitions to `"order"` (manual "Convert to Order"):
  - **Admin only** — non-admin receives `403`
  - Auto-generates `ORD-YYYY-NNN` reference code via `increment_order_sequence()`; sets `ticket_kind = "order"`
  - Logs `ticket_converted` activity with `require_client_confirm`, `client_confirmed`, `converted_by_role`
  - **Does not** set `leads.sales_status = 'Won'` — Won is deferred until production release (`markLeadWonOnProduction()`)
- If `ticket_status` is set to `"sent"` → triggers `sendQuoteToCustomer()` (email/SMS/WhatsApp delivery); logs `ticket_sent` with `{ channel, destination }`. If status was already `"sent"` (resend), adds `resend: true` to payload.
- If `ticket_status` transitions to `"in_production"` (manual release, payment confirm, net terms auto-release, etc.):
  - Sets `production_released_at`
  - If ticket has `linked_lead_id`: calls `markLeadWonOnProduction()` → `leads.sales_status = 'Won'`
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

**Auth:** `requireSession()` (MFA) + `canAccessTicket()` — same scope as `GET /api/tickets/[id]`. Returns `401`/`403` if unauthorized, `404` if ticket not found.

**Response `200`:**
- `Content-Type: application/pdf`
- `Content-Disposition: attachment; filename="Quote-REF.pdf"` (or `Invoice-REF.pdf` for orders where `ticket_status` is `order`, `in_production`, or `completed`)
- Body: raw PDF binary rendered server-side by `@react-pdf/renderer`

PDF sections: company header (logo or name, address, contact), Bill To, Prepared By, line items table, pricing summary (subtotal → shipping → discount → pre-tax → tax → total), payment methods, special requirements, gold footer.

The "Save PDF" button in `quote-detail.tsx` is an `<a href="/api/tickets/[id]/pdf" download>` link — clicking it triggers a direct file download with no new tab or print dialog.

---

### `GET /api/tickets/[id]/print`

Returns a complete, fully-styled HTML document of the invoice. Used for browser print / Save as PDF via the system print dialog.

**Auth:** `requireSession()` (MFA) + `canAccessTicket()`. Returns `401`/`403` if unauthorized, `404` if ticket not found.

**Response `200`:**
- `Content-Type: text/html; charset=utf-8`
- Body: standalone HTML with all styles inline and `@media print` rules. Includes a "Print / Save PDF" button visible on screen. When loaded inside a hidden iframe, a script auto-triggers `window.print()`.

---

### `GET /api/tickets/[id]/evidence`

Returns a short-lived signed URL for the customer-uploaded payment evidence file.

**Auth:** `requireSession()` + Accountant or Admin role.

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

**Filter:** `payment_evidence_url IS NOT NULL`, evidence not yet cleared, `ticket_status IN ('sent', 'order', 'in_production', 'completed')`

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

Scoped list for the `/orders` page — **`ticket_status IN ('order', 'in_production', 'cancelled')`**, slim payload (no `quote_skus`).

**Includes** evidence-pending `order` rows for the ticket owner (sales/SDR scoped via `scopeJobTicketsQuery()`). Accountants still confirm on `/payments`; owners see those orders on `/orders` with status **Awaiting payment confirmation**.

**Role scope:** Same as `GET /api/tickets` via `scopeJobTicketsQuery()` — SDR own tickets, Sales own + routed-by, Admin all.

Each row is enriched server-side with **`status_label`** and **`status_tone`** from `lib/utils/order-list-status.ts`:

| Condition | `status_label` | `status_tone` |
|-----------|----------------|---------------|
| `cancelled` | Cancelled | `cancelled` |
| Evidence pending (any status) | Awaiting payment confirmation | `awaiting_confirmation` |
| `in_production` | In Production | `in_production` |
| `order` + customer confirmed | Confirmed by Customer | `confirmed` |
| `order` + admin convert, confirm/payment missing | Admin converted — … | `admin_override` |
| `order` + converted, not confirmed | Converted by {name} | `converted` |
| `order` (fallback) | Converted | `converted` |

**Response `200`:**
```json
{
  "orders": [
    {
      "id": "uuid",
      "ticket_kind": "order",
      "ticket_status": "order | in_production | cancelled",
      "payment_status": "unpaid | partial | paid",
      "payment_evidence_url": "string | null",
      "payment_evidence_submitted_at": "ISO | null",
      "payment_paid_at": "ISO | null",
      "client_confirmed": false,
      "title": "string",
      "reference_code": "string | null",
      "quote_final_total": 0,
      "priority": "string | null",
      "due_date": "ISO date | null",
      "rush": false,
      "created_at": "ISO",
      "status_label": "Confirmed by Customer",
      "status_tone": "confirmed",
      "customer": { "id": "uuid", "first_name": "string", "last_name": "string", "company": "string | null" }
    }
  ]
}
```

---

## Production (legacy APIs)

> **UI (2026-05-23):** In-production orders live on **`/orders?tab=in_production`**. `/production` redirects to that tab; `/production/[id]` redirects to `/orders/[id]`. Sidebar nav entry removed (migration `079_remove_production_page.sql`). The endpoints below remain for backward compatibility and may be removed later.

### `GET /api/production/orders`

Returns all tickets with `ticket_status = 'in_production'`.

**Auth:** Any authenticated role (legacy — prefer `GET /api/orders/orders` + client tab filter).

**Response `200`:**
```json
{ "orders": [Ticket] }
```

---

### `GET /api/production/counts`

Legacy production tab badge counts. Orders page tab counts now come from `GET /api/tickets/counts` (`orders`, `in_production`, `cancelled`).

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

Returns tickets with `ticket_status = 'completed'`. **SDR:** only tickets where `created_by_id` matches the session user (self-created quote/order through completion). Routed hand-offs that Sales completed are excluded. **Admin / Accountant:** all completed tickets.

**Response `200`:**
```json
{ "orders": [Ticket] }
```

---

### `GET /api/completed/counts`

Returns tab badge counts for the Completed page and sidebar. **Same role scope as** `GET /api/completed/orders`.

**Response `200`:**
```json
{
  "counts": {
    "completed": 0
  }
}
```

---

### `GET /api/completed/page-data`

Combined list + counts in one auth pass. **Same role scope as** `GET /api/completed/orders`.

**Response `200`:**
```json
{
  "orders": [Ticket],
  "counts": { "completed": 0 }
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

Customer confirms a quote on the public portal.

**Auth:** None — public route.

**Request body:** Empty `{}`.

**Business rules:**
- Ticket must have `ticket_status = "sent"` (returns `409` if already confirmed or wrong status)
- Sets `client_confirmed = true` only — **does not** always convert to `order` immediately
- **Quote-until-payment:** ticket stays on `/quotes` until payment is recorded (except net terms — may convert + auto-release on confirm via `maybeConvertQuoteToOrder` + `maybeAutoReleaseProduction`)
- If already `client_confirmed`, returns `{ ok: true, already_confirmed: true }`
- If production auto-release succeeds: `markLeadWonOnProduction()` sets linked lead `sales_status = 'Won'`
- Logs `ticket_client_confirmed` activity with `by_user_id = null` (customer action)

**Response `200`:**
```json
{ "ok": true, "reference_code": "ORD-2026-042", "in_production": false, "converted_to_order": false }
```

**Response `409`:** Already confirmed or wrong status.

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
| `receiptId` | Conditional | Receipt reference for cash-in-person — **digits only**; required when quote send validation requires it |

**Business rules:**
- Allowed when `ticket_status IN ('sent', 'order', 'in_production', 'completed')`
- When `ticket_require_client_confirm = true`: returns `409 CONFIRM_REQUIRED` if not yet `client_confirmed`
- Wire/ACH/Zelle/check/card: stores file in `payment-evidence` bucket; sets evidence fields + `payment_evidence_amount`; **does not** update `payment_amount_received` — queues for accountant on `/payments`
- Cash: records payment immediately; may convert + auto-release via `maybeConvertQuoteToOrder` / `maybeAutoReleaseProduction` when gates pass
- Balance/follow-up payments: allowed when partially paid or `in_production`; cash balance does **not** overwrite `deposit_amount`
- `sent` → `order` conversion on first payment only when approval gate satisfied (`maybeConvertQuoteToOrder`)
- Logs `ticket_payment_evidence_submitted` or `ticket_payment_recorded` in History

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
| `ticket_id` | `uuid` **or** reference code | Activities for this job ticket. Accepts ticket UUID or `QUO-YYYY-NNN` / `ORD-YYYY-NNN` — resolved via `resolveTicketId()` (same as `GET /api/tickets/[id]`). |
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
- **Sidebar badge counts** are fetched via `GET /api/sidebar-counts?routes=…` (scoped to visible nav items; debounced ~300 ms on Realtime). Count queries use SQL `{ count: "exact", head: true }` via `lib/utils/sidebar-counts-query.ts`.
- **Activity log** (admin `/activity-log` page) is fetched via `GET /api/admin/activity-log` and auto-refreshes when `bazaar:activities-changed` fires
- **`/notifications`** — legacy redirect to `/activity-log`; reserved for future V2 bell (no REST endpoints yet)

See `docs/realtime-live-updates.md` for the full architecture and pattern guide.

---

## Dashboard

### `GET /api/dashboard/kpis`

Returns KPI metrics scoped to the current user's role and period.

**Query params:**

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `period` | `'week' \| 'month' \| 'quarter'` | `'month'` | Start of period → end of today (same as Reports presets) |

**Response for SDR `200`:**
```json
{
  "role": "sdr",
  "inbox_count": "number",
  "handled": "number",
  "routed": "number",
  "on_hold": "number",
  "rejected": "number",
  "quote_value": "number",
  "sourced_cash": "number",
  "share_pct": "number"
}
```

**Response for Sales `200`:**
```json
{
  "role": "sales",
  "new_in_pipeline": "number",
  "active_deals": "number",
  "on_hold": "number",
  "won": "number",
  "won_value": "number",
  "cash_collected": "number",
  "pipeline_value": "number"
}
```

**Response for Admin `200`:**
```json
{
  "role": "admin",
  "total_leads": "number",
  "open_leads": "number",
  "claimed_leads": "number",
  "pipeline_leads": "number",
  "quoted_leads": "number",
  "ordered_leads": "number",
  "inbox_leads": "number",
  "routed_leads": "number",
  "won_leads": "number",
  "cash_collected": "number",
  "pipeline_value": "number",
  "team_member_metrics": "Record<userId, TeamMemberMetrics>"
}
```

**TeamMemberMetrics:**
```json
{
  "handled": "number",
  "routed": "number",
  "rejected": "number",
  "sourced_cash": "number",
  "cash_collected": "number",
  "released_order_value": "number",
  "awaiting_collection": "number",
  "pipeline_value": "number"
}
```

**Field notes (Admin):**
- `cash_collected` — sum of `ticket_payment_recorded` amounts in period (matches Reports)
- `pipeline_value` — sum of `quote_final_total` on draft/sent tickets (live snapshot)
- `won_leads` — count of production releases in period (`production_released_at`)
- `team_member_metrics` — per-user work stats for Team cards (SDR activity + sales money metrics)
- Sub-counts on Total Leads card: `open_leads`, `claimed_leads`, `pipeline_leads`, `quoted_leads`, `ordered_leads`

**Field notes (Sales):**
- `won` / `won_value` — production releases in period for this rep
- `cash_collected` — payments credited to this rep in period

---

### `GET /api/admin/team`

Admin only. Active non-admin user roster for dashboard Team section.

**Response `200`:**
```json
{
  "members": [
    {
      "id": "uuid",
      "full_name": "string | null",
      "role_name": "sdr | sales | accountant",
      "role_display_name": "string",
      "claimed_leads": "number",
      "last_sign_in_at": "ISO | null"
    }
  ]
}
```

Members sorted: **SDR → Sales → Accountant**, then alphabetical by name.

---

### `GET /api/reports/summary`

Admin only. Full reporting payload — see [`feature-specs/reports.md`](feature-specs/reports.md).

**Cash collected contract:** Only `ticket_payment_recorded` activities count toward `cash_collected` (staff cash auto-record, accountant confirm, immediate public cash). `ticket_payment_evidence_submitted` is pending review and excluded until confirmed.

**Query:** `period`, `date_from`, `date_to`, `user_id` (optional)

**Key response fields:**
- `cash_collected.total` — payments in period (2 decimal places)
- `released_order_value.total` / `order_count` — production releases in period
- `awaiting_collection` — live balance-due snapshot (not period-filtered)
- `sales_scorecard`, `sdr_scorecard`, `payment_ledger`, `win_rate`, `funnel`

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

## Cron (scheduled jobs)

### `GET /api/cron/follow-ups`

**Auth:** `Authorization: Bearer ${CRON_SECRET}` — not a user session. Intended for **Vercel Cron** (see `vercel.json`) or **manual / external** HTTP trigger.

**Deployment status (May 2026):** Code is live. **Automatic schedule requires Vercel Pro.** On **Hobby (free)**, the schedule in `vercel.json` does not run — trigger this endpoint manually or via an external cron service. Setting `CRON_SECRET` on Hobby does **not** break the rest of the app.

**Schedule (when Pro is enabled):** `0 14 * * *` (daily 2pm UTC) unless changed in `vercel.json`.

**Behavior:**
- Finds sent quotes with follow-up enabled, not client-confirmed, due (`follow_up_at <= now`)
- Backfills `follow_up_at` from `quote_reminder_date` when missing (legacy sent quotes)
- Sends reminder via Instantly (email) or Twilio (SMS) using ticket delivery fields
- Decrements `follow_up_cycles`, advances `follow_up_at` by `ticket_follow_up_freq`
- Sets `follow_up_completed = true` when cycles exhausted
- Logs `quote_approval_requested` activity with `via: "cron"`

**Response `200`:**
```json
{
  "ok": true,
  "scanned": 3,
  "sent": 2,
  "failed": 0,
  "completed": 1,
  "initialized": 1,
  "errors": [],
  "ran_at": "ISO timestamp"
}
```

**Errors:** `401` bad/missing bearer token · `500` missing `CRON_SECRET` or processing error

**Setup:** `docs/cron-follow-ups.md`

---

## Auth — Session & MFA trust

### `POST /api/auth/session`

Logs login sessions to `user_sessions` for admin reporting.

**Body `{ action: "start" }`:** Requires `requireSession()` (MFA-complete). Inserts a new open session row; closes any stale open row first.

**Body `{ action: "end", reason, user_id? }`:** Closes open session rows for the user. Prefers cookie identity from `requireSession({ requireMfa: false })`. If `user_id` is sent in the body, it **must match** the session cookie or the request returns `403` (anti-spoof).

**Response `200`:** `{ "ok": true }`

---

### `POST /api/auth/mfa-trust`

Issues the `bazaar_mfa_trust` httpOnly cookie (30 days) after successful 2FA. Called from client after verify when user checked "Remember this device" at login.

**Auth:** Valid session with `aal2`.

**Response `200`:** `{ "ok": true, "expires_in_days": 30 }`

---

### `DELETE /api/auth/mfa-trust`

Revokes the trusted device in the DB and clears the cookie. Called on sign-out.

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
- If `new_temp_password` is provided: calls `supabase.auth.admin.updateUserById` to set the new password, sets `must_change_password = true` on `user_profiles`, then **awaits** a branded password-reset email via Instantly AI. Email includes their new temp password and a login CTA. Response includes delivery status so the admin UI can confirm or surface failures.
- Cannot change own role or deactivate own account
- Cannot deactivate the last active Admin (guard: count of active Admins > 1)

**Response `200`:**
```json
{
  "user": UserProfile,
  "email_delivery": {
    "attempted": true,
    "ok": true
  }
}
```

When Instantly is not configured or delivery fails, `email_delivery.ok` is `false` and `error` explains why (e.g. `"Instantly credentials not configured."`). Omitted when no password was reset.

---

### `GET /api/admin/activity-log`

Paginated activity log across all users. Admin only. Powers the `/activity-log` page.

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

Each activity is enriched with:
- `actor` — `{ id, full_name, role_name }`
- `customer` — `{ first_name, last_name, company }`
- `ticket_ref` — display ref from `lib/utils/activity-ticket-ref.ts` (`activityDisplayRef`): payload `reference_code` → linked ticket `reference_code` → last 8 chars of ticket UUID → last 8 chars of lead UUID (lead-only events)

Powers the **Quote / Order** column on `/activity-log`.

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

Returns the full product catalog for new-quote-form SKU dropdowns.

**Auth:** `requireSession()` (MFA). Returns `401`/`403` without a complete staff session.

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

### Admin catalog routes (admin mutations)

**`GET /api/admin/product-types`** — any MFA-complete staff user (SDR lead form, quote forms). All other admin catalog routes (`materials`, `material-groups`, `lookups`, product-type mutations) require **`requireAdmin()`**.

| Route | Auth |
|-------|------|
| `GET /api/admin/product-types` | `requireSession()` — all roles |
| `POST/PATCH/DELETE /api/admin/product-types/*` | `requireAdmin()` |
| `GET/POST/PATCH/DELETE /api/admin/materials/*` | `requireAdmin()` |
| `POST/PATCH/DELETE /api/admin/material-groups/*` | `requireAdmin()` |
| `POST/DELETE /api/admin/product-types/[id]/materials/[matId]` | `requireAdmin()` |

---

## Company Settings

### `GET /api/admin/company`

Returns company settings for quote forms, idle timer, and admin UI.

**Auth:** `requireSession()` (MFA).

**Field scoping:**
- **Admin:** full `company_settings` row (including bank / Zelle remittance fields)
- **Non-admin:** safe subset only — `default_tax_rate`, `high_value_threshold`, `rush_surcharge_percent`, `session_idle_timeout_minutes`

**Response `200` (admin — full row):**
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
    "session_idle_timeout_minutes": "number",
    "bank_name": "string | null",
    "bank_account_name": "string | null",
    "bank_account_number": "string | null",
    "bank_routing_number": "string | null",
    "zelle_phone": "string | null",
    "zelle_email": "string | null",
    "updated_at": "string"
  }
}
```

Non-admin responses omit bank / Zelle / branding address fields.

---

### `PATCH /api/admin/company`

Update company settings. **Admin only** (`requireAdmin()`).

**Body:** Any subset of company_settings fields (except `id`).

**Response `200`:** `{ "settings": CompanySettings }`

---

---

## Admin — Integrations

### `GET /api/dev/quote-email-preview`

Renders sample quote email HTML for local design inspection.

**Auth:** None required locally. **Returns `404` in production** (`NODE_ENV === 'production'`).

---

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
| `403` | Wrong role, MFA incomplete (`MFA_SETUP_REQUIRED` / `MFA_VERIFY_REQUIRED`), or out-of-scope resource |
| `404` | Resource not found |
| `409` | Conflict (e.g. duplicate email on invite) |
| `500` | Unexpected server error |
