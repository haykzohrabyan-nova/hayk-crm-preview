# BazarCRM — API Contract

All endpoints are Next.js 16 Route Handlers under `app/api/`. Most handlers use the **admin Supabase client** (`lib/supabase/admin.ts`) for database access. **`requireSession()`** uses **`lib/supabase/server.ts`** (`createServerSupabase`) so Route Handlers can read and refresh auth cookies on API responses.

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
| `requirePageAccess(route)` | Mirrors `proxy.ts` page RBAC — admin bypasses; checks `role_permissions` |
| `requireAnyPageAccess(routes[])` | Pass if user has any listed page route |
| `requireSession({ requireMfa: false })` | Sign-out / session-end only |

Lead scope: `canReadLead`, `canMutateLead`, `canClaimLead`, `canAcquireLeadLock` in `lib/utils/lead-access.ts`. Ticket scope: `canAccessTicket`, `canMutateTicket` in `lib/utils/ticket-access.ts`.

### Error codes

| HTTP | `code` | Meaning |
|------|--------|---------|
| `401` | `UNAUTHENTICATED` | No valid session |
| `403` | `MFA_SETUP_REQUIRED` | Must enroll TOTP at `/setup-2fa` |
| `403` | `MFA_VERIFY_REQUIRED` | Must verify TOTP at `/verify-2fa` |
| `403` | `FORBIDDEN` | Wrong role, page permission, or ticket/lead scope |
| `429` | `RATE_LIMITED` | Public quote or auth endpoint rate limit exceeded |

Full security model: **`docs/security.md`**.

**Session cache (Jun 2026):** Successful `requireSession()` results are memoized in-process for ~45 s (`lib/auth/session-cache.ts`) and include `userId`, `roleName`, `roleId`, `fullName`, `allowedRoutes`. Allowed routes are also cached per user in `lib/auth/allowed-routes-cache.ts` for `requirePageAccess` / ticket APIs. Dev HMR cookie `__next_hmr_refresh_hash__` is excluded from the session cache key.

**Layout bootstrap:** `GET /api/me` — after `requireSession()`, returns `{ userId, roleName, fullName, allowedRoutes, pages }` for sidebar/mobile nav. **Does not replace** per-route `requireSession()` on other APIs.

---

## Performance — combined page-data (May 2026)

Tabbed list pages should prefer **one** request on mount instead of separate list + counts calls. Each handler runs `requireSession()` once, then `Promise.all([listQuery, countsQuery])`.

| Route | Response | Used by |
|-------|----------|---------|
| `GET /api/orders/page-data` | `{ orders, counts, pagination }` — each order includes `line_preview: { line_items, ticket_ref }` for list expand | Orders page |
| `GET /api/quotes/page-data` | `{ tickets, counts, pagination }` — each ticket includes `line_preview` | Quotes page |
| `GET /api/payments/page-data` | Active tab list + `counts` + `pagination` — rows on active tab include `line_preview` | Payments tabs |
| `GET /api/completed/page-data` | `{ orders, counts, pagination }` — each order includes `line_preview` | Completed page |
| `GET /api/leads/sales/page-data` | `{ leads, counts, pagination }` | Sales pipeline — `?tab=`, `limit`, `offset`, optional `search` |
| `GET /api/completed/page-data` | `{ orders, counts, pagination }` | Completed — server-side search, date on `updated_at`, admin user + pagination |
| `GET /api/production/page-data` | `{ orders, counts, pagination }` | Production — server-side tab, search + pagination |
| `GET /api/crm/page-data` | `{ customers, pagination }` | CRM page — server-side search, status, heat, duplicates filter + DB-level pagination; every row includes `is_duplicate_phone` |
| `GET /api/leads/workspace/page-data?…` | `{ leads, counts, pagination, routedSubCounts? }` | Leads page — server-side tab, search, owner scope, routed sub-filter, sort + pagination |

**Slim count-only routes** (realtime refresh without full list): `GET /api/orders/counts`, `GET /api/quotes/counts`, plus existing `*/counts` routes.

**List pagination (May 2026):** Paginated page-data routes return `pagination: { limit, offset, total, hasMore }`. Default **25** rows; allowed **25 / 50 / 100** (`lib/utils/pagination.ts`). Page size persists in browser `localStorage` key `bazaar-list-page-size`. Tab badge `counts` reflect all tabs under the same filters but **exclude** `limit`/`offset`. Shared UI: `components/ui/list-pagination.tsx`.

**Paginated list pages:** Orders, Quotes, Payments, Sales pipeline, Completed, Production, CRM, Leads workspace — all use `limit`/`offset` on page-data (default **25**).

**Detail / form bootstrap (Jun 2026)** — one auth pass instead of multiple parallel GETs on mount:

| Route | Response | Used by |
|-------|----------|---------|
| `GET /api/tickets/[id]/page-data` | `{ ticket }` only | `QuoteDetail` initial load (`/quotes/[id]`, `/orders/[id]`, …) |
| `GET /api/ticket-form-bootstrap` | `{ company, lookups_edit, lookups_actions, products }` (server cache 5 min; client 30 min) | `QuoteDetail` in parallel with page-data |
| `GET /api/tickets/[id]/line-preview` | `{ line_items, ticket_ref }` | List expand cache miss; legacy path when row has no `line_preview` |
| `GET /api/quotes/form-bootstrap` | `{ company, lookups, products }` | `NewQuoteForm` (`/quotes/new`); seeds ticket-form bootstrap cache |

Silent ticket refresh after save still uses lighter `GET /api/tickets/[id]` only.

**Client list cache (Jun 2026):** Tabbed list pages use `hooks/use-list-page-data.ts` → in-memory cache per full page-data URL (`lib/client/list-page-cache.ts`, 5 min TTL). Realtime window events refetch with **no** intentional delay (`lib/constants/realtime-refetch.ts`). Post-mutation helper: `lib/client/notify-list-data-changed.ts` (optional `cachePrefix` clear + `bazaar:tickets-changed`).

Shared helpers:

| Module | Purpose |
|--------|---------|
| `lib/utils/pagination.ts` | Parse `limit`/`offset`, meta, localStorage page size |
| `lib/utils/ticket-list-filters.ts` | Tab, search, date, admin user filters for ticket lists |
| `lib/utils/fetch-orders-data.ts` | Orders list + counts + sort (`ticket_kind = 'order'`; cancelled orders only) |
| `lib/utils/fetch-quotes-data.ts` | Quotes list + counts (`cancelled` tab = quote-stage only) |
| `lib/utils/fetch-completed-data.ts` | Completed list + counts |
| `lib/utils/fetch-production-data.ts` | Production list + counts |
| `lib/utils/fetch-crm-data.ts` | CRM aggregation + filters + slice |
| `lib/utils/leads-workspace-query.ts` | Leads workspace list + tab counts + pagination slice; `applyExcludeSalesStatusWon`, SDR `owner_scope` filters |
| `lib/utils/validate-lead-product-interests.ts` | Product + quantity validation for manual create and PATCH lead |
| `lib/utils/orders-list-sort.ts` | Orders column sort rules |
| `lib/utils/fetch-ticket-line-previews-batch.ts` | Batch `line_preview` for list page-data (3 queries/page) |
| `lib/utils/fetch-ticket-line-preview.ts` | Single-ticket line preview API |
| `lib/utils/ticket-form-bootstrap-server-cache.ts` | Shared company + lookups + products (5 min server cache) |
| `lib/client/ticket-form-bootstrap-cache.ts` | Client bootstrap cache (30 min); seed from quotes form-bootstrap |
| `lib/client/seed-line-preview-from-page-data.ts` | Hydrate line-preview component cache from page-data rows |

**Page-load guide:** `docs/FuturePlan/Performance/page-loading.md` — measurement, architecture, prioritized backlog.

**Common pagination params** (all paginated page-data routes):

| Param | Default | Description |
|-------|---------|-------------|
| `limit` | `25` | `25` \| `50` \| `100` |
| `offset` | `0` | Row offset for current page |

**Orders query params** (`GET /api/orders/page-data`, `GET /api/orders/counts`):

| Param | Default | Description |
|-------|---------|-------------|
| `tab` | `all` | `all` \| `pending` \| `in_production` \| `cancelled` — list only; counts return all tabs. **Scope:** `ticket_kind = 'order'` only (cancelled **orders**, not cancelled quotes). |
| `search` | — | Matches reference, title, customer name/company |
| `date_from` / `date_to` | — | ISO timestamps; filters `created_at` (inclusive) |
| `user_id` | — | Admin only — filter by `created_by_id` |
| `limit` | `25` | `25` \| `50` \| `100` |
| `offset` | `0` | Row offset for current page |
| `sort` | — | `created_by` \| `balance_due` \| `due_date` \| `status` \| `payment` — click same header again to reset default sort |

**Quotes query params** (`GET /api/quotes/page-data`, `GET /api/quotes/counts`):

| Param | Default | Description |
|-------|---------|-------------|
| `tab` | `all` | `all` \| `draft` \| `sent` \| `approved` \| `cancelled` \| `routed`. **Cancelled tab:** `ticket_kind = 'quote'` + `ticket_status = 'cancelled'`. **All tab:** `draft` + `sent` + `approved` (excludes cancelled). |
| `search` | — | Reference, title, customer name/company |
| `date_from` / `date_to` | — | ISO timestamps; filters `created_at` (inclusive) |
| `user_id` | — | Admin only — filter by `created_by_id` |
| `limit` / `offset` | `25` / `0` | Pagination |

**Completed query params** (`GET /api/completed/page-data`, `GET /api/completed/counts`):

| Param | Default | Description |
|-------|---------|-------------|
| `search` | — | Reference, title, customer |
| `date_from` / `date_to` | — | ISO timestamps; filters `updated_at` (completion window) |
| `user_id` | — | Admin only — filter by `created_by_id` |
| `limit` / `offset` | `25` / `0` | Pagination |

**Production query params** (`GET /api/production/page-data`, `GET /api/production/counts`):

| Param | Default | Description |
|-------|---------|-------------|
| `tab` | `all` | Production tab filter |
| `search` | — | Reference, title, customer |
| `limit` / `offset` | `25` / `0` | Pagination |

**CRM query params** (`GET /api/crm/page-data`):

| Param | Default | Description |
|-------|---------|-------------|
| `search` | — | Name, email, phone, company |
| `status` | `all` | `all` \| `new` \| `known` |
| `heat` | `all` | `all` \| `hot` \| `warm` \| `cold` |
| `duplicates` | — | `1` = show only customers with duplicate phone numbers |
| `limit` / `offset` | `25` / `0` | Pagination |

**Leads workspace query params** (`GET /api/leads/workspace/page-data`):

| Param | Default | Description |
|-------|---------|-------------|
| `status` / `statuses` | — | Tab filter (same as `GET /api/leads/workspace`) |
| `routed` | — | `"true"` for Directed to Sales tab |
| `won` | — | `"true"` for Won tab |
| `scope` | — | `mine` for SDR-scoped tabs |
| `search` | — | Name, email, phone, company, status fields |
| `owner_scope` | — | SDR **Claimed Leads** tab only: `mine` → `locked_by_id = current user` |
| `routed_filter` | `all` | Routed tab pipeline stage sub-filter |
| `sort` / `sort_dir` | `created` / `desc` | `created` \| `urgency`; `asc` \| `desc` |
| `user_id` | — | Admin only — team member filter |
| `limit` / `offset` | `25` / `0` | Pagination |

Response also includes `routedSubCounts` when `routed=true` (badge counts per pipeline stage pill).

**Sidebar:** `GET /api/sidebar-counts?routes=/quotes,/orders,…` — optional comma-separated nav routes; only computes badges for visible pages. SDR `/completed` badge uses `scopedCompletedTicketCount()` (`created_by_id` only).

Legacy list + count routes remain for compatibility. Shared query logic lives in `lib/utils/fetch-*-data.ts` and `lib/utils/leads-workspace-query.ts`.

---

### Public routes (no staff session)

- `/api/public/quotes/[token]/*` — customer quote/order portal (token-gated UUID)
- `/api/public/evidence/[token]/*` — payment proof resubmit (dedicated token + OTP)
- `/api/public/permit/[token]/*` — tax-exempt permit resubmit (token + OTP)
- `/api/auth/change-password` — own session via `getUser()` (forced password change flow)
- `/api/auth/mfa-trust` — POST requires AAL2; DELETE clears trust cookie

---

## Leads

### `GET /api/leads/workspace`

Returns workspace leads (`is_inbox = false`). Visibility is **role-scoped server-side**:
- **SDR — All Leads tab:** only unclaimed leads (`locked_by_id IS NULL`) — open pool
- **SDR — Claimed Leads tab (`owner_scope=mine`):** only leads claimed by current user (`locked_by_id = currentUserId`)
- **SDR — In Progress tab (`status=In Progress`, `scope=mine`):** own in-progress leads (`sdr_id = currentUserId`)
- **SDR (with `status` or `statuses` param):** scoped to their own leads (`sdr_id = currentUserId`), used for Hold / Rejected / Directed-to-Sales tabs. When `statuses` is provided, Won leads are excluded via `applyExcludeSalesStatusWon()` (`sales_status IS NULL OR sales_status <> 'Won'`) — PostgREST `not.eq Won` alone would drop NULL rows.
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

### `GET /api/leads/workspace/page-data`

Paginated workspace list + all tab badge counts in one auth pass. Used by `components/leads/leads-page.tsx`.

**Query params:** Same filters as `GET /api/leads/workspace` plus pagination and list controls:

| Param | Type | Description |
|-------|------|-------------|
| *(tab filters)* | — | `status`, `statuses`, `routed`, `won`, `scope`, `search`, `prev_status` — see workspace route above |
| `owner_scope` | `mine` | SDR **Claimed Leads** tab only — locked by current user |
| `routed_filter` | string | Routed tab pipeline stage (`all`, `awaiting`, `in_progress`, `quote_sent`, `on_hold`, `dropped`) |
| `sort` | `created` \| `urgency` | Column sort (default `created`) |
| `sort_dir` | `asc` \| `desc` | Sort direction (default `desc`) |
| `user_id` | uuid | Admin only — filter by team member |
| `limit` | `25` \| `50` \| `100` | Page size (default 25) |
| `offset` | number | Row offset (default 0) |

**Response `200`:**
```json
{
  "leads": [ "…Lead[]…" ],
  "counts": { "all": 0, "claimed": 0, "in_progress": 0, "follow_up": 0, "hold": 0, "routed": 0, "rejected": 0, "won": 0 },
  "routedSubCounts": { "all": 0, "awaiting": 0, "in_progress": 0, "quote_sent": 0, "on_hold": 0, "dropped": 0 },
  "pagination": { "limit": 25, "offset": 0, "total": 200, "hasMore": true }
}
```

`routedSubCounts` is present when `routed=true`. Tab `counts.all` = unclaimed pool size for SDR. `counts.claimed` = SDR-only (0 for admin). Other tab counts exclude `limit`/`offset`.

---

### `GET /api/leads/workspace/counts`

Returns tab badge counts for the SDR leads workspace. Scoped per role same as the workspace endpoint. Uses SQL `{ count: "exact", head: true }` via `lib/utils/db-counts.ts`.

**Response `200`:**
```json
{
  "counts": {
    "all": 0,
    "claimed": 0,
    "in_progress": 0,
    "follow_up": 0,
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

### `GET /api/leads/sales/page-data`

Combined list + tab badge counts for `/sales`. One `requireSession()` pass.

**Query params:**

| Param | Values | Description |
|-------|--------|-------------|
| `tab` | `pipeline` \| `claimed` \| `in_progress` \| `follow_up` \| `hold` \| `rejected` | Active tab (default `pipeline`) |
| `limit` | `25` \| `50` \| `100` | Page size (default 25) |
| `offset` | number | Row offset (default 0) |
| `search` | string | Server-side filter — all roles on pipeline/follow_up/hold/rejected; **admin only** on claimed/in_progress |
| `user_id` | uuid | **Admin only** on claimed/in_progress — filters `sales_owner_id` |

**Response `200`:** `{ leads, counts: { pipeline, claimed, in_progress, follow_up, hold, rejected }, pagination }`

**Tab filters (server-side via `lib/utils/leads-workspace-query.ts`):**

| Tab | Filter |
|-----|--------|
| `pipeline` | `status = Routed to Sales`, `sales_owner_id IS NULL`, `sales_status IS NULL` |
| `claimed` | `sales_status = Claimed` — Sales: own; Admin: all (+ optional `user_id`) |
| `in_progress` | `sales_status = In Progress` — same ownership rules |
| `follow_up` | `sales_status = Follow Up Later` — Sales: own; Admin: all |
| `hold` | `sales_status = On Hold` — Sales: own; Admin: all |
| `rejected` | `status = Rejected` AND `prev_status = Routed to Sales` |

**Related:** `GET /api/leads/sales-counts` — counts-only refresh (same `counts` shape).

---

### `POST /api/leads/manual`

Creates a new lead directly in the workspace (`is_inbox = false`). Sets `sdr_id = current_user` for attribution. Does **not** set `locked_by_id` / `locked_at` — lead enters the **open pool** until someone claims it (SDR **Claim** or Admin **Assign**).

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
- **Product interests:** validated via `validateLeadProductInterests()` — each row with a selected product requires **quantity > 0**; product required when quantity is set; returns `400` with field errors on mismatch
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

> **`role` in body is a workflow hint for admins only.** For Sales and SDR callers, the workflow branch (`isSales`) is derived exclusively from the verified session `roleName` — the body value is ignored. Admins may pass `role: "sales"` to operate in the sales pipeline on a lead they don't own; they pass `role: "sdr"` (or omit) to act in the SDR workflow. This prevents privilege escalation (an SDR sending `role: "sales"` is blocked).

**Business rules:**
- Sets `status = 'On Hold'` (SDR) or `sales_status = 'On Hold'` (Sales) based on derived workflow branch
- Records `held_by_id = current_user`, `held_at = now()`
- Logs `lead_held` activity

**Response `200`:**
```json
{
  "lead": Lead
}
```

---

### `POST /api/leads/[id]/follow-up`

Marks an SDR lead for follow-up later (separate from On Hold). Snapshots current `status` into `prev_status`.

**Body:**
```json
{
  "follow_up_reason": "string",
  "follow_up_notes": "string | null",
  "follow_up_until": "ISO date string | null"
}
```

**Business rules:**
- Sets `status = 'Follow Up Later'`
- Records `follow_up_by_id = current_user`, `follow_up_at = now()`
- SDR retains `locked_by_id` (same soft-lock behaviour as SDR hold)
- Sets `sdr_id = current_user` for SDR callers so the lead appears only on that SDR's **Follow Up Later** tab
- Logs `lead_follow_up_later` activity
- When `follow_up_reason` is **Other** (case-insensitive), `follow_up_notes` is required — `400` if empty

**With `role: "sales"` in body** (Sales pipeline or Admin acting in sales view): sets `sales_status = 'Follow Up Later'`, snapshots `prev_sales_status`, clears temp lock; `status` stays `Routed to Sales`. Requires `sales_owner_id = current_user` (or Admin).

> **`role` in body is a workflow hint for admins only.** For Sales and SDR callers, the workflow branch is derived from the verified session `roleName`. See `POST /api/leads/[id]/hold` for the full explanation.

**Response `200`:** `{ "lead": Lead }`  
**Response `403`:** SDR — lead owned/locked by another SDR; Sales — lead not assigned to current rep

---

### `POST /api/leads/[id]/resume`

Restores a lead from hold or follow-up later to its previous status. Clears hold and follow-up fields.

**Body:**
```json
{
  "role": "sdr | sales"
}
```

**Body (sales):** `{ "role": "sales" }` — workflow hint for admins acting in the sales pipeline. For Sales and SDR callers, the workflow branch is derived from session `roleName` and the body value is ignored. See `POST /api/leads/[id]/hold` for the full explanation.

**Business rules:**
- Restores `status` from `prev_status` (SDR) or `sales_status` from `prev_sales_status` (Sales, default **`Claimed`** when null)
- Clears hold fields and follow-up fields (`follow_up_reason`, `follow_up_notes`, `follow_up_until`, `follow_up_at`, `follow_up_by_id`)
- SDR: `403` if lead is another SDR's hold/follow-up (`sdr_id` scope)
- Sales: `403` if `sales_owner_id` is not current user (except Admin)
- Logs `lead_resumed` with `payload.from` = prior state (`On Hold` or `Follow Up Later`)

**Response `200`:**
```json
{
  "lead": Lead
}
```

---

### `PATCH /api/leads/[id]`

Partial update of a lead. Only the following fields are accepted — all other keys are silently dropped (field whitelist, prevents mass-assignment of privileged columns like `sales_owner_id`, `locked_by_id`, `sdr_id`, hold/follow-up fields, etc.):

**Allowed fields:** `urgency`, `interests`, `quantities`, `has_design`, `sdr_comment`, `is_returning_customer`, `brand`, `source`, `quote_destination`, `sales_notes`, `sales_status`, `status`, `rejection_reason`, `rejection_notes`

**Special field:** `authority` — routed to `customers.authority` (different table), not the leads table. Response includes refreshed `customer` join.

**Business rules:**
- `quote_destination` is normalized to digits-only on every write
- **Product interests:** when `interests` / `quantities` / `has_design` are sent, validated via `validateLeadProductInterests()` (product required; quantity **> 0** when product selected)
- Logs `lead_status_changed` activity if `status` or `sales_status` changes
- **Terminal state guard:** If current `status = 'Rejected'`, only Admin can apply changes → `403` `LEAD_REJECTED_TERMINAL`
- **Scope guard:** `canMutateLead()` — same rules as `GET /api/leads/[id]` (`canReadLead()`). Out-of-scope → `403` `FORBIDDEN`
- **Lock guard:** If `locked_by_id` is set to a different user, returns `409` unless the caller is Admin

**Response `200`:**
```json
{
  "lead": Lead
}
```

---

### `POST /api/leads/[id]/claim`

Sales rep claims an unclaimed routed lead. Sets `sales_owner_id = current_user`, **`sales_status = 'Claimed'`**. Logs `lead_sales_claimed`.

**Auth:** Sales or admin only. Requires `/sales` page permission. `canClaimLead()` — lead must be unowned and `status = 'Routed to Sales'` (admin may claim any unowned sales-pipeline lead).

**Concurrency:** The claim write uses a conditional `UPDATE … WHERE sales_owner_id IS NULL`. Two reps clicking Claim simultaneously will not both succeed — one gets `200`, the other gets `409 ALREADY_CLAIMED` deterministically (no silent double-claim).

**Response `200`:** `{ "lead": Lead }`  
**Response `403`:** `FORBIDDEN` — wrong role, page permission, or lead not claimable  
**Response `409`:** `ALREADY_CLAIMED` if `sales_owner_id` is already set (including concurrent claim race)

---

### `POST /api/leads/[id]/in-progress`

Marks a lead as actively in progress. **Dual workflow** — SDR workspace vs Sales pipeline (same endpoint, different body/role rules).

**Body:**
```json
{
  "role": "sdr | sales"
}
```

**Sales branch** (`roleName = sales`, or admin with `{ "role": "sales" }`):
- Requires `/sales` page permission
- Lead must be `status = 'Routed to Sales'` and **`sales_status = 'Claimed'`**
- Sets `sales_status = 'In Progress'`, saves `prev_sales_status`
- Logs `lead_in_progress` with `payload.role = "sales"`

**SDR branch** (default for SDR callers; admin may pass `{ "role": "sdr" }`):
- Sets `status = 'In Progress'`, saves `prev_status`, attributes `sdr_id`
- Logs `lead_in_progress` with `payload.role = "sdr"`

**Response `200`:** `{ "lead": Lead }`  
**Response `403`:** Wrong role, page permission, scope, or lead not in correct prior status (sales: not Claimed)

---

### `POST /api/leads/[id]/lock`

Acquires or refreshes `locked_by_id` on a lead.

**Primary callers:**
- **SDR Claim** (All Leads) — permanent ownership; sets `sdr_id = current_user`; logs **`lead_claimed`** only on first claim (`isNewClaim`)
- **SDR View** (My Leads) — refreshes `locked_at` for owned lead; no new `lead_claimed`
- **Sales Open** (edge case only) — normal Open on `sales_owner_id = you` skips this endpoint in `sales-page.tsx`

**Business rules:**
- **Auth:** SDR, Sales, or Admin only. `canAcquireLeadLock()` — SDR: pool/owned scope; Sales: routed unclaimed or owned; Admin: any lead
- If `locked_by_id` is already set to a **different** user → returns `409` with the locker's name (client renders read-only mode)
- If `locked_by_id` is the **same** user (reconnect / refresh) → refreshes `locked_at` and returns `200`
- If `locked_by_id` is `null` → acquires lock and returns `200`
- **Sales** caller: sets `locked_by_id` only — does **not** overwrite `sdr_id` or log `lead_claimed`
- Admin calling this endpoint on any lead → always acquires lock (overrides existing lock)

**Concurrency:** For non-admin callers, the lock write is conditional: `UPDATE … WHERE locked_by_id IS NULL OR locked_by_id = current_user`. Two SDRs clicking Claim simultaneously cannot both acquire the lock — the loser receives `409` with the winner's name, identical to the stale-page case.

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

Clears `locked_by_id` and `locked_at`. Also clears `sdr_id` when used after SDR route/reject (client-called).

**Callers:**
- **SDR** — after Route to Sales or Reject (releases permanent SDR ownership)
- **Sales** — on modal close when a temp lock may exist (idempotent when already null)
- **Admin** — force-release

**Business rules:**
- Only the current lock holder OR an Admin can unlock when `locked_by_id` is set
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

### `GET /api/crm/page-data`

Paginated CRM customer list. Used by `components/crm/crm-page.tsx`.

**Auth:** `requireSession()` + `requirePageAccess('/crm')`. Accountant and roles without CRM page permission → `403`.

**Pagination:** DB-level `LIMIT`/`OFFSET` — only requested page rows are fetched. Total count via a separate `SELECT COUNT(*)` with `head: true`. Implemented in `lib/utils/fetch-crm-data.ts → fetchCrmCustomers`.

**Duplicate detection:** On every request, `fetchDuplicatePhoneIds` fetches all `(id, phone)` pairs and identifies IDs whose phone appears on 2+ records. Each row in the response includes `is_duplicate_phone: boolean`.

**Query params:**

| Param | Type | Description |
|-------|------|-------------|
| `search` | `string` | Filter name, email, phone, company |
| `status` | `all` \| `new` \| `known` | Customer status filter |
| `heat` | `all` \| `hot` \| `warm` \| `cold` | Heat tag filter |
| `duplicates` | `1` | When present, returns only customers with `is_duplicate_phone = true` |
| `limit` | `25` \| `50` \| `100` | Page size (default 25) |
| `offset` | `number` | Row offset (default 0) |

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
      "last_activity": "ISO | null",
      "customer_status": "new | known",
      "is_duplicate_phone": false
    }
  ],
  "pagination": { "limit": 25, "offset": 0, "total": 200, "hasMore": true }
}
```

---

### `GET /api/crm/customers/[id]/tax-exempt-history`

Tax-exempt permit history for CRM **See more** (`components/crm/customer-tax-exempt-modal.tsx`).

**Auth:** `requireSession()` + `requirePageAccess('/crm')`.

**Response `200`:**
```json
{
  "customer_last": {
    "permit_number": "string | null",
    "file_name": "string | null",
    "reviewed_at": "ISO | null",
    "reviewed_by_name": "string | null",
    "has_file": true
  },
  "rows": [
    {
      "id": "uuid",
      "reference_code": "QUO-2026-001",
      "has_file": true,
      "sales_permit_file_name": "permit.pdf",
      "sales_permit_reviewed_at": "ISO | null",
      "approval_status": "approved | pending",
      "reviewed_by_name": "string | null",
      "created_at": "ISO"
    }
  ]
}
```

Staff permit download uses `GET /api/tickets/{reference_code}/sales-permit` (accountant/admin only).

---

### `GET /api/customers`

Returns the CRM customer registry with lightweight per-customer aggregates. Used by merge UI search (`?search=`) and **Add Customer** flows — **not** the main CRM list page (see `GET /api/crm/page-data`).

**Auth:** `requireSession()` + `requirePageAccess('/crm')`.

**Query params:**

| Param | Type | Description |
|-------|------|-------------|
| `search` | `string` | Server-side filter on name, email, phone, company |

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
      "customer_status": "new"
    }
  ]
}
```

> **Performance (2026-05-22):** Slim customer fields plus separate lead/ticket aggregate queries — no nested `customers(*)` on leads.

**Inclusion rules (2026-05-26):**
- Includes customers with **any qualifying lead** (`sales_status` set or status `Routed to Sales`) **or any ticket**
- Also includes **standalone customers** with no leads/tickets yet (e.g. created via CRM **Add Customer**)

**Computed fields:**
- `customer_status`: `"new"` when `lead_count === 0 && ticket_count === 0`, else `"known"`
- `last_activity`: max of linked lead/ticket timestamps vs `customers.updated_at`

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

Create a new customer profile. Used by:
- **CRM → Add Customer** modal (`components/crm/add-customer-modal.tsx`) — customer only, no lead
- Add Lead form (when SDR enters new info and no existing customer is selected)

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

**Auth:** `requireSession()` + `requirePageAccess('/crm')`.

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

### `GET /api/customers/[id]/shipping-addresses`

Distinct past **ship-to** addresses for a customer, derived from:
- `job_tickets` where `requires_shipping = true` and `ship_to_line1 IS NOT NULL`
- **`ticket_shipping_destinations`** on that customer’s tickets (migration **093**)

Used by the New Quote / quote detail **Ship to customer** picker — **one Previous addresses dropdown per shipping destination block** (not a global picker). No separate address book table; addresses are deduped from this customer’s past shipped tickets.

**Auth:** `requireSession()` + `requireAnyPageAccess(['/crm', '/quotes'])`.

**Response `200`:**
```json
{
  "addresses": [
    {
      "ship_to_line1": "123 Main St",
      "ship_to_line2": "Suite 4",
      "ship_to_city": "Los Angeles",
      "ship_to_state": "CA",
      "ship_to_zip": "90001",
      "last_used_at": "ISO"
    }
  ]
}
```

Deduped by normalized `(line1, city, state, zip)`; sorted newest first (max 50 rows scanned).

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

Merge duplicate customer **source** (`id` in path) into **target** (`target_id` in body). Optionally applies field overrides to the surviving record first. Moves all leads, **job tickets**, and activities to the target, logs a merge activity, then **deletes** the source customer.

**Auth:** Admin or Sales only (`403` for SDR, Accountant, etc.).

**Body:**

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `target_id` | `string` (UUID) | ✅ | The surviving customer. Must differ from path `id`. |
| `overrides` | `Record<string, unknown>` | ❌ | Field values to apply to the target before moving child rows. Allowed keys: `first_name`, `last_name`, `company`, `email`, `industry`, `heat_tag`. All other keys are silently dropped. |

```json
{
  "target_id": "uuid",
  "overrides": {
    "first_name": "Jane",
    "company": "Acme Print Co"
  }
}
```

**Server steps (in order):**
1. `UPDATE customers SET {overrides}, updated_at = now() WHERE id = target_id` (if overrides present)
2. `UPDATE leads SET customer_id = target_id WHERE customer_id = source_id`
3. `UPDATE job_tickets SET customer_id = target_id WHERE customer_id = source_id`
4. `UPDATE activities SET customer_id = target_id WHERE customer_id = source_id`
5. Insert `contact_edited` activity on target (`action: "merge"`, `overrides_applied: [...]`)
6. `DELETE FROM customers WHERE id = source_id`

**Response `200`:**
```json
{
  "success": true,
  "surviving_id": "uuid"
}
```

**Errors:** `404` if either customer missing; `400` if `target_id === id`; `500` if any DB step fails.

> **UI:** Called sequentially once per non-keeper when the 3-step `MergeCustomerModal` confirms. Overrides are only sent on the first call (applied once to the surviving record). See `docs/feature-specs/crm.md — Merge Duplicate Customers`.

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

Returns job tickets. Visibility is role-scoped (service role in Route Handlers; browser Realtime uses RLS — see migration **086**):
- **SDR:** own tickets only (`created_by_id = userId`) — same scope as `/orders` and `/completed`
- **Sales:** own tickets + **all** `ticket_status = 'routed'` (any SDR). Routed rows include `created_by_name` (SDR `user_profiles.full_name`)
- **Admin:** all tickets

**Query params:**

| Param | Type | Description |
|-------|------|-------------|
| `kind` | `'quote' \| 'order'` | Filter by `ticket_kind`. When `kind=quote` (list use), response uses **slim select** and auto-filters to quote-stage statuses (`draft`, `sent`, `approved`, `routed`) — no `line_items`, notes, or payment-config blobs. |
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
  "notes": "string | null",
  "line_items": "LineItemInput[] — catalog lines with optional variants[] (name, quantity required)",
  "quote_subtotal": "number | null",
  "quote_shipping": "number | null — server sets to sum of shipping_destinations[].shipping_amount when provided; forced to 0 when pickup",
  "requires_shipping": "boolean — default false (pickup at shop)",
  "shipping_destinations": "ShippingDestinationInput[] — optional; each row: shipping_amount (≥ 0), ship_to_line1 … ship_to_zip (address optional)",
  "ship_to_line1": "string | null — legacy mirror of primary destination (also written on save)",
  "ship_to_line2": "string | null",
  "ship_to_city": "string | null",
  "ship_to_state": "string | null",
  "ship_to_zip": "string | null — validated format if provided",
  "discount_type": "percent | fixed | null",
  "discount_value": "string | null",
  "discount_reason": "string | null",
  "quote_pre_tax_total": "number | null",
  "quote_tax_rate_percent": "number | null",
  "quote_tax_amount": "number | null",
  "quote_final_total": "number | null",
  "tax_exempt": "boolean",
  "sales_permit_number": "string | null — required when tax_exempt = true",
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
  "ticket_quote_channel": "sms | email | both | none | null — 'none' skips customer delivery; public page token still created",
  "ticket_dest_phone": "string | null",
  "ticket_dest_email": "string | null",
  "ticket_follow_up_enabled": "boolean | null",
  "ticket_follow_up_count": "number | null",
  "ticket_follow_up_freq": "daily | every-3-days | weekly | null",
  "routed_reason": "string | null — admin-managed route_reason lookup value; required when ticket_status = routed (except HVT auto-route may omit)",
  "routed_notes": "string | null — optional detail; required when routed_reason is Other"
}
```

**Business rules:**
- `created_by_id = current_user`
- `ticket_status` defaults to `'draft'` if not provided; `'routed'` is accepted for HVT saves and SDR manual Route to Sales from Line Items
- When `ticket_status = 'routed'` with `routed_reason`: validates lookup value; **Other** requires non-empty `routed_notes` (`400` if missing)
- **`website`** (optional on customer upsert): if non-empty, validated with `validateWebsite()` and stored via `normalizeWebsite()`; `400` if invalid
- **Customer upsert:** when contact fields are provided and `customer_id` is null, the server matches on email/phone, creates or updates the `customers` row (industry/website), and sets `customer_id`. When `customer_id` is passed (existing customer from lookup), industry/website are updated on that row if provided.
- **Source handling:**
  - **`from_quote_page: true`** (Quotes page, no linked lead): requires `quote_source` + `industry`; stores `quote_source` on `job_tickets`; **does not** auto-create a linked lead
  - **Lead / CRM flows** (`linked_lead_id` or `source` without `from_quote_page`): may auto-create a linked lead with `source` when no lead exists yet
- For `ticket_kind = 'quote'`: auto-generates `QUO-YYYY-NNNN` reference code via `increment_quote_sequence(year)`
- For `ticket_kind = 'order'`: auto-generates `ORD-YYYY-NNNN` reference code via `increment_order_sequence(year)` PL/pgSQL function
- After reference assignment, **`ticketKindForReference()`** forces `ticket_kind: quote` for `QUO-*` and `order` for `ORD-*` (reference is authoritative)
- Logs `order_ticket_created` activity (legacy type name) with payload `{ ticket_kind, title, reference_code }` using the resolved kind
- Sets `design_required = true` if any SKU has `design_required = true`; same for `die_cut`
- If `linked_lead_id` is provided, updates the linked lead's `status` to `'Quoted'` or `'Validated'`
- Sets `routed_by_id = userId` when `ticket_status = 'routed'`; persists `routed_reason` / `routed_notes` when provided (migration **095**)
- Client may prefill `ticket_dest_phone` / `ticket_dest_email` / `ticket_quote_channel` from customer contact when Quote tab was skipped (`resolveQuoteDeliveryFromContact()`)
- If `ticket_status = 'sent'` on create (Save & Send): logs `ticket_sent` and triggers `sendQuoteToCustomer()` — same activity shape as PATCH send — **unless** `ticket_quote_channel = 'none'`, in which case the public token is still created but no SMS/email is sent. Also fire-and-forgets `sendQuoteSentStaffNotification()` to the quote creator (`created_by_id` auth email).
- May auto-record cash deposit/full payment when configured — logs `ticket_payment_recorded` via `lib/utils/log-ticket-payment-recorded.ts` (counts in Reports/dashboard cash); **does not** set `client_confirmed` when `ticket_require_client_confirm = true`
- **Fulfillment:** when `requires_shipping = false`, server clears `ship_to_*`, deletes `ticket_shipping_destinations`, and sets `quote_shipping = 0`. When `requires_shipping = true`, accepts **`shipping_destinations[]`** (synced via `syncTicketShippingDestinations()`); per-destination **Shipping ($)** is optional (may be `0`); address fields optional; ZIP validated when non-empty. Legacy `ship_to_*` on `job_tickets` mirrors the primary destination. See `lib/utils/ticket-shipping-destinations.ts` and `lib/utils/address.ts`.
- **Tax-exempt permit file:** not in this body. After create, client uploads via `POST /api/tickets/{reference_code}/sales-permit` (multipart `file`). Send/readiness on the client also requires the file when `tax_exempt = true` (`validate-quote-send.ts`).

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

**URL segment:** UUID or human reference code (`QUO-YYYY-NNNN`, `ORD-YYYY-NNNN`, or legacy `ORD-YYYY-NNN`).

**Access scoping:**
- **Admin / Accountant** — any ticket
- **Sales** — own tickets (`created_by_id`) + any `ticket_status = routed` (claim queue)
- **SDR** — own tickets (`created_by_id`) on list routes; **detail GET** also allowed when `routed_by_id = currentUser` and status is not `completed` (read-only HVT hand-off tracking)

**Response `200`:**
```json
{ "ticket": Ticket }
```

`ticket.line_items` — array of line rows with nested `variants[]` (each variant may include `file` metadata). **`lineFile`** is set when the line has a line-level attachment (`variant_id` null in DB) — may coexist with `variants[]` after first SKU is removed. See `lineItemsToDisplayRows()` and `syncTicketLines()` in `lib/utils/ticket-line-items.ts`.

`ticket.shipping_destinations` — array from `ticket_shipping_destinations` (empty when pickup).

**Response `403`:** Ticket exists but caller lacks read access.

**Response `404`:** Ticket not found.

---

### `POST /api/tickets/[id]/files`

Upload an attachment for a line item or additional SKU (staff only).

**Auth:** `requireSession()` + `canMutateTicket()`.

**Body:** `multipart/form-data` — exactly one of:
- `line_item_id` (uuid) — line-level attachment (`variant_id` null; migration **092**). Used when no SKUs exist or when the shared line file sits on the line after first SKU removal.
- `variant_id` (uuid) — file for one additional SKU (one file per variant; non-first SKUs only for *extra* attachments beyond the shared line file)

Plus `file` (JPEG, PNG, WebP, or PDF; limits in `lib/utils/ticket-line-files.ts`).

**Replace:** Uploads to a new Storage path, deletes the previous object, updates the existing `ticket_files` row.

**Sync side effects (`PATCH` ticket with line items):** `syncTicketLines()` — line file moves to first SKU only on **0 → 1+** SKU transition; deleting first SKU returns file to line level; deleting non-first SKU file removes Storage; deleting a line item removes all its files from Storage. See `docs/schema.md`.

**Response `201` / `200`:** `{ file: TicketFileMeta }`

---

### `GET /api/tickets/[id]/files/[fileId]`

**Auth:** `canAccessTicket()`. **Response `302`:** redirect to short-lived signed Storage URL.

---

### `DELETE /api/tickets/[id]/files/[fileId]`

**Auth:** `canMutateTicket()`. Deletes the Storage object in bucket `ticket-attachments`, then the `ticket_files` row. Calls `notifyPublicQuoteUpdatedByTicketId()` when the ticket is customer-portal visible.

---

### `POST /api/tickets/[id]/sales-permit`

Upload or replace the tax-exempt **sales permit document**. Stored on `job_tickets` columns, not `ticket_files`.

**Auth (either path):**

| Caller | Gate |
|--------|------|
| **Payment staff** (accountant/admin) | `/payments` page access + `canAccessTicket()` — used from `/payments` **Replace** modal |
| **Ticket owner / admin** | `requireTicketDetailPageAccess()` + `canMutateTicket()` — quote/order detail save |

**URL segment:** UUID or reference code (`QUO-*`, `ORD-*`).

**Body:** `multipart/form-data`:

| Field | Required | Notes |
|-------|----------|-------|
| `file` | Yes | JPEG, PNG, WebP, or PDF (same validation as line attachments) |
| `sales_permit_number` | **Yes for payment-staff replace** | Updates `sales_permit_number` on ticket when provided |

**Storage:** bucket `ticket-attachments`, path `{ticketId}/sales-permit/{uuid}-{sanitizedFileName}`.

**Replace:** Deletes previous object if present, then updates `sales_permit_storage_path`, `sales_permit_file_name`, `sales_permit_mime_type`, `sales_permit_submitted_at` (and clears `sales_permit_reviewed_*` when replacing an already-reviewed permit). Clears active tax-exempt resubmit token/OTP when staff replaces during a resubmit cycle. Logs `ticket_tax_exempt_permit_replaced` when payment staff replaces from `/payments`.

**Response `200`:** `{ ok: true, file_name, mime_type }`

---

### `GET /api/tickets/[id]/sales-permit`

**Auth:** `isPaymentStaffRole()` (accountant or admin only — same policy as payment evidence file). **Response `302`:** redirect to 60-second signed Storage URL. **404** when no file on ticket.

---

### `POST /api/tickets/[id]/sales-permit/reuse-from-customer`

Copy the customer’s last approved tax-exempt permit (`customers.tax_exempt_last_*`) onto this ticket.

**Auth:** `requireSession()` + `requireTicketDetailPageAccess()` + `canMutateTicket()`.

**Preconditions:** Ticket has `customer_id`; customer has stored last permit path.

**Side effects:** Sets ticket `sales_permit_*`, `sales_permit_reused_from_customer = true`, `sales_permit_submitted_at`; clears `sales_permit_reviewed_*`; `notifyPublicQuoteUpdated`.

**Response `200`:** `{ ok: true }`

---

### `DELETE /api/tickets/[id]/sales-permit`

**Auth:** `canMutateTicket()`. Removes Storage object and clears `sales_permit_*` columns. Idempotent when already absent.

**Response `200`:** `{ ok: true }`

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
- Email uses admin template `payment_reminder`; SMS uses admin `sms_templates` key `payment_reminder`
- Phone numbers are auto-normalised to E.164 format via `toE164()` (e.g. `3233413620` → `+13233413620`)
- Delivery is fire-and-forget — errors logged to console, never block the API response
- Logs `ticket_payment_reminder_sent` activity with `{ channel, destination }` in payload
- Returns `200` immediately; `ok: true` in body

**Mode 2 — Resend invoice link:**
```json
{
  "resend_invoice": true,
  "invoice_channel": "email | sms | whatsapp",
  "invoice_destination": "string",
  "notify_revision": "admin"
}
```
- Sends customer the permanent `/q/{public_token}` portal link via `sendInvoiceLinkToCustomer()`
- Works for paid, unpaid, in-production, and completed orders
- Optional `invoice_channel` / `invoice_destination` override quote defaults
- Optional `notify_revision: "admin"` — email/SMS includes “order revised by our team” banner (post-save update flow)
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
- Sets `payment_status` to `partial` or `paid`; when confirming customer-submitted proof, sets `payment_evidence_reviewed_at` and **retains** `payment_evidence_url`, `payment_evidence_submitted_at`, and `payment_evidence_amount` for audit
- Runs `maybeConvertQuoteToOrder()` then `maybeAutoReleaseProduction()` when gates pass
- When confirming customer-submitted evidence: sends **payment confirmed** email/SMS (balance on in-production orders: **paid in full** messaging); logs `ticket_payment_confirmed_sent`
- Logs `ticket_payment_recorded` activity via `lib/utils/log-ticket-payment-recorded.ts`
- **Blocked** while tax-exempt permit review is pending (`isTaxExemptApprovalPending`) — `400` `TAX_EXEMPT_APPROVAL_REQUIRED` (“Approve tax-exempt documentation before confirming payment.”)

**Mode 3b — Approve tax-exempt (Accountant + Admin only):**
```json
{
  "approve_tax_exempt": true,
  "quote_final_total": 1234.56,
  "quote_pre_tax_total": "optional",
  "quote_tax_rate_percent": "optional",
  "quote_tax_amount": "optional",
  "quote_subtotal": "optional",
  "quote_shipping": "optional",
  "discount_type": "optional",
  "discount_value": "optional"
}
```
- Ticket must have `tax_exempt = true` and `sales_permit_storage_path` set, with no prior `sales_permit_reviewed_at` (legacy permit-#-only tickets must upload via `POST …/sales-permit` first)
- Sets `sales_permit_reviewed_at` / `sales_permit_reviewed_by_id`; updates totals when provided
- Syncs `customers.tax_exempt_last_*` when customer linked; `sendTaxExemptApproved` + activities `ticket_tax_exempt_approved`, `ticket_tax_exempt_confirmed_sent`
- Returns `{ ticket }` with customer embed

**Mode 3c — Deny tax-exempt (Accountant + Admin only):**
```json
{
  "deny_tax_exempt": true,
  "sales_permit_denial_notes": "Internal audit note — required"
}
```
- `sales_permit_denial_notes` — **required** non-empty string; stored on `job_tickets`; **not** exposed on public `/q`
- Sets `tax_exempt: false`, recomputes tax on current `quote_pre_tax_total` via `computeTotalsIfTaxExemptDenied`, stamps `sales_permit_reviewed_*`
- Activity `ticket_tax_exempt_denied` with `denial_notes` in payload (History + CRM)
- Returns `{ ticket }`

**Mode 3d — Request payment evidence resubmit (Accountant + Admin only):**
```json
{
  "request_payment_evidence_resubmit": true,
  "outreach_channel": "email | sms | both",
  "outreach_email": "string",
  "outreach_phone": "string"
}
```
- Ticket must have pending payment evidence (`payment_evidence_url` set, not yet reviewed)
- Message copy from admin **Email** / **SMS** templates (`payment_evidence_resubmit_requested`) — staff do not type a custom message; copy is **not** shown on `/q` or `/evidence`
- Generates `payment_evidence_resubmit_token` + OTP (`payment_evidence_otp_hash` / `payment_evidence_otp_expires_at`); sets `payment_evidence_resubmit_requested_at`; clears `payment_evidence_resubmit_received_at`
- Customer flow: `/evidence/{token}` → `POST /api/public/evidence/[token]/verify-otp` → `POST …/upload` (read-only `payment_method_used`; proof file + optional receipt #)
- Activities: `ticket_payment_evidence_resubmit_requested`, `ticket_payment_evidence_resubmitted`
- No staff email/SMS when customer submits — list column + realtime refresh only
- **Existing DB:** run §1b DDL in `supabase/schema.sql` if columns `payment_evidence_otp_*` / `payment_evidence_resubmit_token` are missing

**Mode 3e — Request tax-exempt permit resubmit (Accountant + Admin only):**
```json
{
  "request_tax_exempt_resubmit": true,
  "outreach_channel": "email | sms | both",
  "outreach_email": "string",
  "outreach_phone": "string"
}
```
- Ticket must be in tax-exempt review queue (`requiresTaxExemptAccountantReview`)
- Generates `sales_permit_resubmit_token` + OTP; email/SMS from admin templates (`tax_exempt_resubmit_requested`, `{otpCode}` in body)
- Customer flow: `/permit/{token}` → `POST /api/public/permit/[token]/verify-otp` → `POST …/upload`
- Activities: `ticket_tax_exempt_resubmit_requested`, `ticket_tax_exempt_resubmit_received`

**Normal PATCH invalidation:** Changing fields in `TAX_EXEMPT_APPROVAL_INVALIDATING_FIELDS` clears `sales_permit_reviewed_at` / `sales_permit_reviewed_by_id` when a review existed.

**Legacy — `release_production` (prefer auto-release on payment confirm):**
```json
{ "release_production": true }
```
- Stamps `production_released_at` and logs `ticket_production_released` — does **not** set `ticket_status = in_production` or run full `maybeAutoReleaseProduction()` gates
- Auth: after `canMutateTicket()` — admin, accountant, or ticket owner (`created_by_id`)
- **No UI button wired** (May 2026); production release in practice happens via `record_payment` / public cash / net terms → `maybeAutoReleaseProduction()`

**Mode 4 — Claim (Sales/Admin only):**
```json
{
  "ticket_status": "draft",
  "claim_ownership": true
}
```
- Ticket must currently have `ticket_status = 'routed'` (checked on read **and** `UPDATE … WHERE ticket_status = 'routed'`)
- Caller must be `sales` or `admin`
- Sets `ticket_status = 'draft'` and `created_by_id = callerUserId`
- **`409` `ALREADY_CLAIMED`** if another rep claimed first (no row updated)
- Logs `order_ticket_status_changed` activity with `payload: { from: "routed", to: "draft", action: "claimed" }` — triggers **live refresh** for other Sales on `/quotes` (Routed tab) via `activities` Realtime → `bazaar:tickets-changed`
- Bypasses the normal ownership check (`created_by_id = userId`); uses admin client for the update
- Successful claimant client: `notifyListDataChanged({ cachePrefix: "quotes" })` or equivalent `bazaar:tickets-changed` + `bazaar:refresh-counts`

**Mode 5 — Normal update:**

Body: Any subset of ticket fields plus optional:
```json
{
  "activity_by_role": "sdr | sales"
}
```

`activity_by_role` is stripped from the stored record but used to attribute the activity log entry.

**Business rules (Mode 5):**
- If `ticket_status` transitions to `"completed"` from `"in_production"`: sends order-ready notification via `sendOrderReadyToCustomer()` (pickup copy or **shipped to [address]** when `requires_shipping`; same `/q/{public_token}` URL); logs `ticket_order_ready_sent` or `ticket_order_ready_failed`
- **Accountant** may set `ticket_status = "completed"` only on in-production orders that are **paid in full** (`isTicketPaidInFull()`)
- **Tax-exempt pending** blocks completion unless **Admin or Sales** passes `acknowledge_tax_exempt_unapproved: true` (same pattern as outstanding balance)
- **Admin or Sales** may mark completed with outstanding balance only when body includes `acknowledge_outstanding_balance: true` (UI shows confirmation modal); **accountant blocked** — owner policy **Option B** (open-questions **B7**)
- If `ticket_status` transitions to `"order"` (manual "Convert to Order"):
  - **Admin only** — non-admin receives `403`
  - Auto-generates `ORD-YYYY-NNNN` reference code (reuses quote number when converting from `QUO-*`; draws from `increment_order_sequence()` for direct order creation); sets `ticket_kind = "order"`
  - Logs `ticket_converted` activity with `require_client_confirm`, `client_confirmed`, `converted_by_role`
  - **Does not** set `leads.sales_status = 'Won'` — Won is deferred until production release (`markLeadWonOnProduction()`)
- On every PATCH, **`ticketKindForReference()`** reconciles `ticket_kind` with the merged `reference_code` (prevents `QUO-*` + `ticket_kind: order` drift)
- Auto convert via `maybeConvertQuoteToOrder()` (payment / net terms / release paths): requires successful `ORD-*` assignment — convert is skipped if sequence fails
- If `ticket_status` is set to `"sent"` → triggers `sendQuoteToCustomer()` (email/SMS delivery) **unless** `ticket_quote_channel = 'none'`; logs `ticket_sent` with `{ channel, destination }`. If status was already `"sent"` (resend), adds `resend: true` to payload. Also fire-and-forgets `sendQuoteSentStaffNotification()` to the quote creator on every send and resend. When `ticket_quote_channel = 'none'` the public quote page is still accessible; only customer outbound delivery is suppressed.
- Optional `notify_revision`: `"standard"` (SDR/Sales resend after edit) or `"admin"` — revision banner in quote email / SMS prefix; use with resend (`ticket_status: "sent"`) or `resend_invoice: true`.
- **`line_items`** in body: upserts `ticket_line_items` + `ticket_line_variants` via `syncTicketLines()`; orphan variants delete Storage files. Variant files uploaded separately via `POST /api/tickets/[id]/files`.
- **Fulfillment fields** (`requires_shipping`, `shipping_destinations[]`, `ship_to_*`, `quote_shipping`): same validation as POST — optional per-destination charges; ZIP validation when ship-to-customer; pickup clears destinations and zeroes `quote_shipping`.
- **Save without resend:** Editing a sent quote updates DB + `/q/{token}` only; UI prompts SDR/Sales (sent, unconfirmed) or Admin (`sent`, `order`, `in_production`, **completed**) to resend after **Save Changes** (`components/quotes/quote-detail/resend-after-save-modal.tsx`; `lib/utils/should-offer-resend-after-save.ts`).
- If `ticket_status` transitions to `"in_production"` (manual release, payment confirm, net terms auto-release, etc.):
  - Sets `production_released_at`
  - If ticket has `linked_lead_id`: calls `markLeadWonOnProduction()` → `leads.sales_status = 'Won'`
- If `quote_approval_last_requested_at` is set → logs `quote_approval_requested`
- If `follow_up_completed` transitions to `true` → logs `quote_follow_up_completed`
- If `follow_up_at` is reset → logs `quote_follow_up_reset`
- If `client_confirmed` transitions to `true` → logs `ticket_client_confirmed`; creates `follow_up_due` notification
- Otherwise → logs `order_ticket_updated` with `payload.fields`
- `payment_status` and `prepayment_status` can be updated on `order` status tickets even by non-admins (special relaxed guard)
- **Accountants** may update payment fields on any ticket; non-admins (except Sales on own tickets) on locked `order` tickets may only update payment-related fields

**Mode 6 — Cancel ticket (Admin + Accountant + Sales):**
```json
{
  "ticket_status": "cancelled",
  "cancel_reason": "<lookup uuid>",
  "cancel_notes": "string | null"
}
```
- Caller must have `roleName === 'admin'`, `roleName === 'accountant'`, or `roleName === 'sales'` (own tickets only) — others receive `403`
- Sets `cancelled_at` on the ticket; GET resolves `cancelled_at` from column or `ticket_cancelled` activity
- Allowed from any status except already **`cancelled`** (includes **draft**, **sent**, **order**, **in_production**, **completed** — paid or unpaid)
- `cancel_reason` must be an active lookup in **Quote Cancellation Reasons** (draft/sent) or **Order Cancellation Reasons** (order / in_production / completed); label snapshotted to `cancel_reason_label`
- **Other** reason requires non-empty `cancel_notes`
- Logs `ticket_cancelled` activity with reason metadata
- Gate helper: `lib/utils/can-admin-cancel-ticket.ts`; reason category: `lib/utils/cancel-reason-category.ts`

**Mode 7 — Field guard notes:**
- Once `ticket_status = 'order'`, non-admins (except Sales on own tickets) cannot edit non-payment fields
- Customer-confirmed orders are locked for **SDR** in the UI; **Admin and Sales** (owner) may still edit/cancel

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

PDF sections: company header (logo or name, address, contact), Bill To, **Ship To** (single destination) or **Shipping addresses** (2-column 50/50 card grid when multiple), Prepared By, line items table (catalog specs, **`SKU{n}.`** additional SKUs, line/variant **file names**, addon **Need a design**), pricing summary (subtotal → shipping → discount → pre-tax → tax → total), payment schedule when partial, payment methods, delivery channel, gold footer. Evidence-pending banner when applicable.

Data: `fetchTicketLinesBundle()` → `lineItemsToDisplayRows()`; `fetchTicketShippingDestinations()` → `resolveTicketShippingDestinationsForDisplay()`.

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

**Auth:** `requireSession()` + `isPaymentStaffRole()` + `canAccessTicket()`.

**Response `302`:** Redirect to 60-second signed URL in `payment-evidence` bucket.

**Response `404`:** No evidence on file.

---

### `POST /api/tickets/[id]/evidence`

Staff replace customer-submitted payment proof while awaiting accountant review (or when proof exists on a pending row).

**Auth:** `isPaymentStaffRole()` + `canAccessTicket()` — `/payments` **Replace** modal.

**Body:** `multipart/form-data` — field `file` (image or PDF; same rules as public submit-payment).

**Preconditions:** Ticket has unreviewed evidence (`payment_evidence_submitted_at` set, `payment_evidence_reviewed_at` null) **or** existing `payment_evidence_url`.

**Side effects:** Replaces object in `payment-evidence` bucket; resets review timestamps; clears active payment resubmit token/OTP when applicable; activity `ticket_payment_evidence_replaced`; `notifyPublicQuoteUpdated`.

**Response `200`:** `{ ok: true, file_name }`

---

### `GET /api/tickets/counts`

Returns lightweight tab badge counts. Scoped per role. Uses parallel SQL `{ count: "exact", head: true }` via `lib/utils/db-counts.ts` (no row fetch into Node.js).

> **Quotes & Orders pages (May 2026):** Tab badges on `/quotes` and `/orders` come from **`GET /api/quotes/page-data`** / **`GET /api/orders/page-data`** `counts` (same search/date/admin filters as the list, excluding pagination). Dedicated counts routes remain for counts-only realtime refresh. Sidebar badges use all-time scoped totals.

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

- **SDR:** `routed` = count of own routed tickets (`created_by_id`; shown on SDR Routed tab). Quotes/Orders/Completed lists all use `created_by_id` only.
- **Sales/Admin:** `routed` = count of ALL routed tickets from any SDR
- `cancelled` = count of cancelled **quote-stage** tickets (`ticket_kind = 'quote'`, `ticket_status = 'cancelled'`) — legacy `/api/tickets/counts` bucket; **Orders** page Cancelled badge comes from `GET /api/orders/page-data` `counts.cancelled` (order-stage only)
- Orders tab counts exclude tickets with pending payment evidence (`payment_evidence_url` set, `payment_evidence_reviewed_at` null)

---

## Payments (Accountant + Admin)

### `GET /api/payments/page-data`

Preferred mount endpoint for `/payments`. Returns **one active tab list** + **all tab counts** per request.

**Auth:** Accountant or Admin only (`isPaymentStaffRole` + `/payments` page access).

**Query params:**

| Param | Values | Description |
|-------|--------|-------------|
| `tab` | `pending` \| `tax_exempt` \| `approved` \| `refunded` | Active tab (default `pending`) |
| `limit` | `25` \| `50` \| `100` | Page size (default 25) |
| `offset` | number | Row offset (default 0) |
| `search` | string | Optional — filters active tab rows (client haystack parity with list UI) |

**Response `200`:** One of `orders`, `taxExemptOrders`, `approvedOrders`, or `refundedOrders` (matching `tab`), plus `counts` and `pagination`. Tab badge counts use SQL head counts (`fetchPaymentsTabCounts`), not loaded row length.

**Pending filter (`orders`):** Offline payment evidence submitted, not yet reviewed (`payment_evidence_reviewed_at` null); `refund_status` none/null; ordered by `payment_evidence_submitted_at` asc. **Stripe card payments are auto-approved** in the webhook and do not appear here.

**Tax-exempt pending filter (`taxExemptOrders`):** `tax_exempt = true`, `sales_permit_reviewed_at` null, `ticket_status IN ('sent', 'order', 'in_production', 'completed')`. `fetchPendingTaxExemptOrders` merges:

1. **With file** — `sales_permit_storage_path` not null; ordered by `sales_permit_submitted_at` asc.
2. **Legacy (pre–migration 103)** — no `sales_permit_storage_path`, `sales_permit_number` not null; ordered by `created_at` asc.

Deduped by ticket id. Same row shape as pending evidence. UI: Submitted column; **View file** when file present; **File required** + **Upload file** (link to `/orders/[ref]`) for legacy; inline **Confirm** disabled until file uploaded → `ApproveTaxExemptModal`.

**Approved filter (`approvedOrders`):** Merged list — tickets with reviewed offline/Stripe evidence **or** reviewed tax-exempt permit (deduped by ticket id, sorted by max of `payment_evidence_reviewed_at` and `sales_permit_reviewed_at` desc).

**Refunded filter (`refundedOrders`):** `refund_status IN ('partial', 'full')`; includes latest ledger row fields (`last_refund_method`, `last_refund_source`, `last_refund_payment_mode`) for list labels.

**UI columns (evidence tabs):** Order, Customer, Claimed (`payment_evidence_amount` or remainder), **Payment For** (`inferPaymentEvidenceMode`), Method, Submitted, Resubmit status (when any row on page has activity), Actions/Approved.

**Row actions (Pending + Tax-exempt tabs):** Icon buttons with hover labels — **View file**, **Replace** (`ReplaceTicketDocumentModal` → `POST …/evidence` or `POST …/sales-permit` + required permit #), **Request updated proof/permit**, primary **Confirm** / **Review**.

**Row navigation:** `/payments/{id}?from=/payments` (payment detail uses `QuoteDetail` with `context="payment"`).

**Example (`?tab=pending&limit=25&offset=0`):**
```json
{
  "orders": [ /* pending payment evidence — current page */ ],
  "counts": { "pending": 2, "tax_exempt": 1, "approved": 15, "refunded": 1 },
  "pagination": { "limit": 25, "offset": 0, "total": 2, "hasMore": false },
  "tab": "pending"
}
```

**Customer embed:** List selects use `customers!job_tickets_customer_id_fkey` via `jobTicketCustomerEmbed()` (migration **105** added a second `job_tickets` FK on `customers.tax_exempt_last_source_ticket_id`).

---

### `POST /api/tickets/[id]/refund`

Unified refund (manual + Stripe). **Auth:** Accountant or Admin only.

**Body:** `multipart/form-data` or JSON:

| Field | Required | Notes |
|-------|----------|-------|
| `payment_mode` | yes | `deposit` \| `balance` \| `full` — which recorded payment slot |
| `refund_reason` | yes | Lookup `payment_refund_reason` |
| `refund_notes` | no | |
| `refund_method` | manual slots | `cash`, `wire`, `zelle`, etc. — ignored for Stripe (forced `card`) |
| `amount_mode` | yes | `full` \| `partial` |
| `amount` | partial only | Dollars, capped per slot |
| `evidence` | no | Image/PDF → `refund-evidence` storage |

**Stripe balance/full slots:** calls `stripe.refunds.create` on `stripe_payment_intent_id`, then `applyTicketRefund` with `source: stripe`.

**Manual deposit slots:** `applyTicketRefund` only (`source: manual`).

**Response `200`:** `{ ok: true, refund_id, amount_cents }`

**Evidence download:** `GET /api/tickets/[id]/refund-evidence/[refundId]` — signed URL for ledger row.

**Ticket GET:** Accountant/Admin responses include `payment_refunds[]` on the ticket payload.

---

### `POST /api/payments/stripe/webhook`

Stripe Checkout webhook (Phase C). **No staff session** — authenticated via Stripe signature.

**Auth:** `Stripe-Signature` header verified with `STRIPE_WEBHOOK_SECRET`.

**Events handled:** `checkout.session.completed` — `lib/stripe/apply-checkout-session.ts` auto-approves payment (`payment_evidence_reviewed_at` set immediately), updates `payment_amount_received` / status / deposit-balance timestamps, logs `ticket_payment_recorded`, runs `maybeConvertQuoteToOrder` + `maybeAutoReleaseProduction`, sends `sendPaymentConfirmed` to customer. Does **not** queue on `/payments` pending.

**Response `200`:** `{ "received": true }` on success.

See `lib/stripe/apply-checkout-session.ts` and `app/api/payments/stripe/webhook/route.ts`.

---

### `GET /api/payments/pending`

Legacy — returns **pending approval** queue only (same rows as `page-data.orders`).

**Auth:** Accountant or Admin only.

**Filter:** `payment_evidence_url IS NOT NULL`, `payment_evidence_reviewed_at IS NULL`, `ticket_status IN ('sent', 'order', 'in_production', 'completed')`

---

### `GET /api/payments/counts`

Accountant dashboard KPIs (sidebar `/payments` badge uses `sidebar-counts` with the same pending filter).

**Auth:** Accountant or Admin only.

**Response `200` (values visible):**
```json
{
  "values_hidden": false,
  "counts": {
    "pending_evidence": 2,
    "orders_in_production": 5,
    "completed_this_month": 12
  }
}
```

**Response `200` (values hidden):**
```json
{
  "values_hidden": true,
  "counts": null
}
```

When `values_hidden` is `true`, count queries are skipped. Reads `user_profiles.dashboard_values_hidden` for the session user.

`pending_evidence` = unreviewed evidence only (`payment_evidence_reviewed_at` null). Approved history is not included in this KPI.

---

## Orders

### `GET /api/orders/page-data`

Combined paginated list + tab counts for `/orders` (preferred over legacy list + client filter).

**Scope:** `ticket_kind = 'order'` and `ticket_status IN ('order', 'in_production', 'cancelled')`. Cancelled **quotes** (`ticket_kind = 'quote'`) appear on `/quotes` → **Cancelled** tab instead.

**Query params:** See [List pagination](#performance--combined-page-data-may-2026) table (`tab`, `search`, `date_from`, `date_to`, `user_id`, `limit`, `offset`, `sort`).

**Column sort (`sort=`):** Applied server-side across the full filtered set, then paginated.

| `sort` value | Order |
|--------------|--------|
| `created_by` | Creator name A → Z |
| `balance_due` | Highest balance due first |
| `due_date` | Overdue first, then soonest due date, then later dates; no due date last |
| `status` | In Production → Pending Payment (`order`) → Cancelled |
| `payment` | Unpaid → Partial → Paid |
| *(omit)* | Default: `production_released_at` desc, then `created_at` desc |

**Response `200`:**
```json
{
  "orders": [ "…same row shape as GET /api/orders/orders…" ],
  "counts": {
    "all": 42,
    "pending": 10,
    "in_production": 30,
    "cancelled": 2
  },
  "pagination": {
    "limit": 25,
    "offset": 0,
    "total": 10,
    "hasMore": false
  }
}
```

`pagination.total` = rows matching **current tab** + search + date + user. `counts` = all tabs under the same search/date/user (no tab filter).

---

### `GET /api/orders/orders`

Scoped list for the `/orders` page — **`ticket_kind = 'order'`** and **`ticket_status IN ('order', 'in_production', 'cancelled')`**, slim payload (no `line_items`). Cancelled quote-stage tickets are listed on `/quotes` only.

**Includes** evidence-pending `order` rows for the ticket owner (sales/SDR scoped via `scopeJobTicketsQuery()`). Accountants still confirm on `/payments`; owners see those orders on `/orders` with status **Awaiting payment confirmation**.

**Role scope:** Same as `GET /api/tickets` via `scopeJobTicketsQuery()` — SDR **`created_by_id` only** (matches Completed), Sales own + routed queue, Admin all.

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

Legacy production tab badge counts. **Orders** and **Production** list pages use page-data `counts` under current filters; sidebar uses all-time scoped totals.

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

These routes are accessible without a session. `proxy.ts` allows `/q/`, `/permit/`, and `/api/public/` paths without authentication. Logged-in staff visiting `/q/{token}` or `/permit/{token}` also bypass RBAC/MFA redirects so they can preview customer portals.

### `GET /api/public/quotes/[token]`

Fetches a ticket by its `public_token` for the customer-facing quote page.

**Auth:** None — public route.

**Response `200`:** Returns safe public ticket fields including pricing (`quote_subtotal`, `quote_shipping`, `requires_shipping`, `ship_to_*`, **`shipping_destinations[]`**), payment config columns, evidence state (`payment_evidence_url`, `payment_evidence_submitted_at`, `payment_evidence_reviewed_at`, `payment_evidence_amount`), `production_released_at`, and refund summary (`refund_status`, `total_refunded_amount`). Draft tickets return `404`.

**Portal blocks (server + client):** When `ticket_status = cancelled` or `refund_status` is `partial`/`full`, confirm, submit-payment, and Stripe session creation are rejected; UI shows cancellation or refund banner (read-only invoice). See `lib/utils/public-quote-payment-blocked.ts`, `public-quote-refund-state.ts`, and [`feature-specs/payment-refunds.md`](feature-specs/payment-refunds.md).

```json
{
  "ticket": {
    "ticket_kind": "quote | order",
    "ticket_status": "sent | order | in_production | completed | cancelled",
    "reference_code": "string | null",
    "quote_final_total": "number | null",
    "client_confirmed": "boolean",
    "payment_amount_received": "number | null",
    "refund_status": "none | partial | full",
    "total_refunded_amount": "number",
    "payment_evidence_url": "string | null",
    "payment_evidence_submitted_at": "ISO | null",
    "payment_evidence_reviewed_at": "ISO | null",
    "payment_evidence_amount": "number | null",
    "production_released_at": "ISO | null",
    "ticket_payment_strategy": "full | partial | net",
    "ticket_require_client_confirm": "boolean",
    "tax_exempt": "boolean",
    "tax_exempt_review_pending": "boolean — true when tax_exempt, sales_permit_storage_path set, and sales_permit_reviewed_at null (not set for legacy permit-#-only tickets)",
    "payment_evidence_resubmit_required": "boolean — accountant requested new proof; customer should use /evidence link from email",
    "payment_evidence_resubmit_received": "boolean — customer submitted replacement; awaiting review",
    "payment_evidence_resubmit_path": "string | null — internal path only; not exposed on UI while resubmit active (Jun 2026)"
  },
  "company": { "company_name": "string", "phone": "string", "address_line1": "string" }
}
```

Permit file is **not** exposed on the public API. Customer may still confirm and pay while review is pending (when flag is true). **Display:** cancelled tickets hide full pricing; partial/full refund shows refund amount only (`total_refunded_amount`) — see `lib/utils/public-invoice-document.ts`. Public PDF (`GET …/pdf`) uses the same `tax_exempt_review_pending` and document-banner rules.

**Response `404`:** Token not found or ticket in `draft` status.

`ticket.line_items[]` includes `variants[]` (name, quantity, `file` metadata) and optional **`lineFile`** when a line-level attachment exists (may appear alongside variants). Live updates via Realtime broadcast — see `docs/realtime-live-updates.md`.

`ticket.shipping_destinations[]` — resolved display rows for the public page (one → **Ship To** column; multiple → `PublicShippingAddressesList` 2-column grid).

---

### `GET /api/public/quotes/[token]/pdf`

Renders the same `InvoicePDF` document as staff download — no auth; looked up by `public_token`.

**Response `200`:** `application/pdf` attachment (`Quote-REF.pdf` or `Invoice-REF.pdf` for order-stage statuses).

**Content parity with staff PDF (May 2026):** multi-destination shipping grid, `SKU{n}.` labels, attachment file names, **Need a design** addon label, payment/evidence banners when applicable.

**Client:** `PublicQuoteDocument` — **Save PDF** / download link on `/q/[token]`.

---

### `GET /api/public/quotes/[token]/files/[fileId]`

Serves a line-item or additional-SKU attachment for the public quote page (image or PDF).

**Auth:** None — `public_token` must match the file’s ticket.

**Query:** `download=1` — `Content-Disposition: attachment` (save file). Default — `inline` stream for preview.

**Response `200`:** file bytes proxied from Storage (`Content-Type` from `ticket_files.mime_type`). Response headers include `Content-Security-Policy: frame-ancestors 'self'` and `X-Frame-Options: SAMEORIGIN`.

**Client preview:** `PublicLineItemSkusGrid` fetches this URL, builds a `blob:` URL, and embeds with `<object type="application/pdf">` (parent page CSP must allow `object-src blob:` and `frame-src blob:` — see `docs/security.md`).

**Response `404`:** Invalid token or file not on that ticket.

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
| `file` | Conditional | Evidence file — required for wire/ACH/zelle/check/card |
| `receiptId` | Conditional | Receipt reference for cash-in-person — **digits only**; required when quote send validation requires it |

> **`amount` is not accepted from the client (2026-05-26).** Server computes the due amount via `computePublicPaymentDueAmount()` (deposit or balance from ticket state). Public UI shows the fixed amount at the top only.

**Business rules:**
- Allowed when `ticket_status IN ('sent', 'order', 'in_production', 'completed')`
- When `ticket_require_client_confirm = true`: returns `409 CONFIRM_REQUIRED` if not yet `client_confirmed`
- Wire/ACH/Zelle/check/card: stores file in `payment-evidence` bucket; sets evidence fields + `payment_evidence_amount`; clears `payment_evidence_reviewed_at` on new upload; **does not** update `payment_amount_received` — queues on `/payments` → **Pending approval**
- When accountant requested resubmit: customer must use `/evidence/{resubmitToken}` (not this endpoint); `submit-payment` resubmit path is legacy — prefer evidence portal
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

**Response `409`:** Evidence already submitted (first payment only), or `ALREADY_SUBMITTED` when resubmit upload already received.

---

## Public Permit Routes (tax-exempt resubmit, no auth)

Token = `sales_permit_resubmit_token` on `job_tickets`. Page: `/permit/{token}`.

### `GET /api/public/permit/[token]/status`

Returns whether OTP is required, token validity, and reference code for display.

### `POST /api/public/permit/[token]/verify-otp`

**Body:** `{ "code": "123456" }` — validates against `sales_permit_otp_hash` / `sales_permit_otp_expires_at`.

### `POST /api/public/permit/[token]/upload`

**Content-Type:** `multipart/form-data` — new permit file after OTP verified. Updates `sales_permit_*` file columns and `sales_permit_resubmit_received_at`. Does not notify staff by email/SMS.

---

## Public Evidence Routes (payment proof resubmit, no auth)

Token = `payment_evidence_resubmit_token` on `job_tickets` (not `public_token`). Page: `/evidence/{token}`.

### `GET /api/public/evidence/[token]/status`

Returns `otp_required` | `upload` | `already_submitted`, `reference_code`, `company_name`, `amount_due`, `submitted_payment_method` (read-only — from `payment_method_used`, wire/ach/zelle/check only).

**Response `400` `NO_SUBMITTED_METHOD`:** No recorded proof method on ticket — customer must contact shop.

### `POST /api/public/evidence/[token]/verify-otp`

**Body:** `{ "code": "123456" }` — validates against `payment_evidence_otp_hash` / `payment_evidence_otp_expires_at` (purpose `payment_evidence`). Sets httpOnly cookie (`path: /`) for upload.

### `POST /api/public/evidence/[token]/upload`

**Auth:** OTP cookie required (`401` `OTP_REQUIRED` if missing).

**Content-Type:** `multipart/form-data`

| Field | Required | Description |
|-------|----------|-------------|
| `method` | Yes | Must match `payment_method_used` on ticket |
| `file` | Yes | JPEG, PNG, WebP, or PDF (max 10 MB) |
| `receiptId` | No | Wire/check reference |

Replaces prior proof in `payment-evidence` bucket; clears resubmit + OTP fields; sets `payment_evidence_resubmit_received_at`; activity `ticket_payment_evidence_resubmitted`.

---

## Activity

### `GET /api/activities`

Unified activity endpoint. Supports both lead-scoped and ticket-scoped queries.

**Query params (at least one required):**

| Param | Type | Description |
|-------|------|-------------|
| `lead_id` | `uuid` | Activities for this lead |
| `ticket_id` | `uuid` **or** reference code | Activities for this job ticket. Accepts ticket UUID or `QUO-YYYY-NNNN` / `ORD-YYYY-NNNN` (or legacy `ORD-YYYY-NNN`) — resolved via `resolveTicketId()` (same as `GET /api/tickets/[id]`). |
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

> **Not implemented:** `GET /api/activity` and `POST /api/activity` (legacy spec — no Route Handler). Use **`GET /api/activities`** (`lead_id` / `ticket_id`) or **`GET /api/leads/[id]/activities`**. Manual “Log Call” UI is not built.

---

## Notifications

Notifications in BazaarCRM are delivered via **Supabase Realtime**, not HTTP polling endpoints.

### How it works

- `components/layout/sidebar.tsx` maintains four persistent Supabase Realtime subscriptions:
  - **`leads-realtime`** — watches any INSERT/UPDATE/DELETE on `public.leads` → refreshes sidebar badge counts + dispatches `bazaar:leads-changed` browser event
  - **`activities-realtime`** — watches any INSERT on `public.activities` → dispatches `bazaar:activities-changed` browser event
  - **`tickets-realtime`** — watches any INSERT/UPDATE/DELETE on `public.job_tickets` → refreshes sidebar badge counts + dispatches `bazaar:tickets-changed` browser event
  - **`customers-realtime`** — watches any INSERT/UPDATE/DELETE on `public.customers` → dispatches `bazaar:customers-changed` browser event (migration `083_enable_customers_realtime.sql`)
- **Sidebar badge counts** are fetched via `GET /api/sidebar-counts?routes=…` (scoped to visible nav items; refetches **immediately** on `bazaar:refresh-counts`). Count queries use SQL `{ count: "exact", head: true }` via `lib/utils/sidebar-counts-query.ts`.
- **Activity log** (admin `/activity-log` page) is fetched via `GET /api/admin/activity-log` and auto-refreshes when `bazaar:activities-changed` fires
- **`/notifications`** — legacy redirect to `/activity-log`; reserved for future V2 bell (no REST endpoints yet)

See `docs/realtime-live-updates.md` for the full architecture and pattern guide.

---

## Dashboard

### `GET /api/user/dashboard-privacy`

Read the current user's dashboard values privacy preference.

**Auth:** Any authenticated user (SDR, Sales, Admin, Accountant).

**Response `200`:**
```json
{
  "dashboard_values_hidden": false
}
```

---

### `PATCH /api/user/dashboard-privacy`

Update dashboard values privacy for the session user. Called after the user confirms the Hide / Show modal on a dashboard.

**Auth:** Any authenticated user.

**Body:**
```json
{
  "dashboard_values_hidden": true
}
```

**Response `200`:**
```json
{
  "dashboard_values_hidden": true
}
```

**Errors:** `400` if `dashboard_values_hidden` is not a boolean.

---

### `GET /api/dashboard/kpis`

Returns KPI metrics scoped to the current user's role and date range. **SDR**, **Sales**, and **Admin** each use a role-specific preset query param; **Accountant** does not call this route (uses `GET /api/payments/counts`). Other roles → `403 FORBIDDEN`.

When `user_profiles.dashboard_values_hidden` is `true` for the session user, the handler returns early with **`values_hidden: true`** and **no numeric metric fields** (SDR/Sales/Admin skip metric DB work).

**Shared preset semantics** (`resolveSdrDashboardDateRange`):

| UI label | API key | Range |
|----------|---------|--------|
| Today | `today` | Today 00:00 – end of today |
| Yesterday | `yesterday` | Prior calendar day |
| Last 7 Days | `last_week` | Rolling 7 days including today |
| Last 30 Days | `last_month` | Rolling 30 days including today |
| Custom | `custom` | Requires `date_from` + `date_to` (`YYYY-MM-DD`) |

**Query params by role:**

| Role | Preset param | Default | Custom dates |
|------|--------------|---------|--------------|
| SDR | `sdr_preset` | `last_month` | `date_from`, `date_to` |
| Sales | `sales_preset` | `last_month` | `date_from`, `date_to` |
| Admin | `admin_preset` | `last_month` | `date_from`, `date_to` |

**Admin list filter (Leads / Quotes / Orders / Completed only):** optional `user_id=<uuid>` on page-data and counts routes. Ignored unless session role is `admin`. Filters by lead `sdr_id` (+ `locked_by_id` on All Leads tab) or ticket `created_by_id`.

**Response for SDR `200` (values visible).** Trend metrics include `value`, `prior`, `pct_change` vs prior equivalent period. **UI card labels (May 2026):** Closed Order Value, Paid From Closed Orders, Remaining Balance for Closed Orders, Qty of Claimed Leads, Manually Created Leads, Unclaimed/Pending Leads, Rejected / Not Qualified, Pending Follow-Up, Qty of Leads Routed to Sales Team. Lead counts render as `N leads`. Help text in `lib/utils/kpi-help-text.ts`. API field names unchanged (`order_value_breakdown`, `lead_claimed`, etc.).

```json
{
  "values_hidden": false,
  "role": "sdr",
  "range": { "preset": "string", "label": "string", "prior_label": "string", "start_iso": "ISO", "end_iso": "ISO" },
  "lead_claimed": { "value": "number", "prior": "number", "pct_change": "number | null" },
  "lead_created": { "value": "number", "prior": "number", "pct_change": "number | null" },
  "order_value": { "value": "number", "prior": "number", "pct_change": "number | null" },
  "order_value_breakdown": { "total": "number", "received": "number", "balance": "number" },
  "order_created": { "value": "number", "prior": "number", "pct_change": "number | null" },
  "inbox": { "value": "number" },
  "rejected": { "value": "number", "prior": "number", "pct_change": "number | null" },
  "on_hold": { "value": "number", "prior": "number", "pct_change": "number | null" },
  "routed_to_sales": { "value": "number", "prior": "number", "pct_change": "number | null" }
}
```

**Response for SDR `200` (values hidden):**
```json
{
  "values_hidden": true,
  "role": "sdr",
  "range": { "preset": "string", "label": "string", "prior_label": "string", "start_iso": "ISO", "end_iso": "ISO" }
}
```

**Response for Sales `200` (values visible):** Same metric fields as computed server-side; the **Sales dashboard UI** does not render `lead_created` (only SDRs create workspace leads). Displayed cards: **Orders** (`order_value_breakdown` + `order_created` count in subtext), Received, Balance, Lead Claimed, Inbox, Rejected, On Hold.

```json
{
  "values_hidden": false,
  "role": "sales",
  "range": { "preset": "string", "label": "string", "prior_label": "string", "start_iso": "ISO", "end_iso": "ISO" },
  "lead_claimed": { "value": "number", "prior": "number", "pct_change": "number | null" },
  "lead_created": { "value": "number", "prior": "number", "pct_change": "number | null" },
  "order_value": { "value": "number", "prior": "number", "pct_change": "number | null" },
  "order_value_breakdown": { "total": "number", "received": "number", "balance": "number" },
  "order_created": { "value": "number", "prior": "number", "pct_change": "number | null" },
  "inbox": { "value": "number" },
  "rejected": { "value": "number", "prior": "number", "pct_change": "number | null" },
  "on_hold": { "value": "number", "prior": "number", "pct_change": "number | null" }
}
```

**Response for Sales `200` (values hidden):** `{ values_hidden: true, role: "sales", range: { … } }` — same shape as SDR hidden response.

**Response for Admin `200` (values visible):**
```json
{
  "values_hidden": false,
  "role": "admin",
  "range": { "preset": "string", "label": "string", "start_iso": "ISO", "end_iso": "ISO" },
  "total_leads": "number",
  "open_leads": "number",
  "claimed_leads": "number",
  "pipeline_leads": "number",
  "quoted_leads": "number",
  "ordered_leads": "number",
  "rejected_leads": "number",
  "cancelled_leads": "number",
  "refunded_leads": "number",
  "inbox_leads_period": "number",
  "inbox_leads": "number",
  "routed_leads": "number",
  "won_leads": "number",
  "cash_collected": "number",
  "pipeline_value": "number",
  "team_member_metrics": "Record<userId, TeamMemberMetrics>"
}
```

**Response for Admin `200` (values hidden):**
```json
{
  "values_hidden": true,
  "role": "admin",
  "range": { "preset": "string", "label": "string", "start_iso": "ISO", "end_iso": "ISO" }
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
- `range.label` — human-readable period for KPI card subtexts (e.g. "Last 7 Days")
- `cash_collected` — sum of `ticket_payment_recorded` amounts in period (matches Reports)
- `pipeline_value` — sum of `quote_final_total` on draft/sent tickets (live snapshot, not date-filtered)
- `won_leads` — count of production releases in period (`production_released_at`)
- `inbox_leads`, `routed_leads` — live snapshots (not date-filtered)
- `total_leads` and all Total Leads sub-badges — filtered by `created_at` in period; buckets are **mutually exclusive** and sum to `total_leads`
- Sub-counts: `open_leads`, `claimed_leads`, `pipeline_leads`, `quoted_leads`, `ordered_leads`, `rejected_leads`, `cancelled_leads`, `refunded_leads`; `inbox_leads_period` when leads created in period are still in inbox
- `inbox_leads` (separate card) — live snapshot of all inbox leads, not period-scoped
- `team_member_metrics` — per-user work stats for Team cards (SDR activity + sales money metrics)

**Field notes (SDR / Sales):**
- Period-scoped metrics use `range.start_iso` / `range.end_iso`; trend cards compare to `prior_label` period
- `order_value_breakdown` — total / received / balance for orders in period (Sales/SDR)
- `inbox` — workspace leads awaiting claim (SDR: unclaimed Pending/Validated; Sales: routed inbox semantics per role)

---

### `GET /api/admin/team`

Admin only. Active non-admin user roster for dashboard Team section.

**Response `200` (values visible):**
```json
{
  "values_hidden": false,
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

**Response `200` (values hidden):** Same member list (names/roles preserved); `values_hidden: true`; numeric fields such as `claimed_leads` redacted to `0` — UI shows masked placeholders, not zeros.

Members sorted: **SDR → Sales → Accountant**, then alphabetical by name.

---

### `GET /api/admin/sessions`

Admin only. Session activity for dashboard Team section (last 7 days by default).

**Query params:** `from`, `to`, `user_id`, `limit`, `offset`

**Response `200` (values visible):**
```json
{
  "values_hidden": false,
  "summary": [
    {
      "user_id": "uuid",
      "total_sessions": "number",
      "auto_signouts": "number",
      "total_minutes": "number",
      "last_signed_in_at": "ISO | null",
      "currently_active": "boolean"
    }
  ],
  "sessions": [],
  "total": "number"
}
```

**Response `200` (values hidden):** `values_hidden: true`; `summary` / `sessions` numeric fields redacted; `total: 0`.

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
- `team_members` — active users available in the filter dropdown; includes sales, SDR, and admin roles; excludes accountants

---

## Outreach (server-side only — no REST endpoint)

Quote/order email and SMS/WhatsApp are sent from ticket and lead Route Handlers via **`lib/integrations/send-quote.ts`** (Twilio, Instantly). There is **no** `POST /api/outreach/send` Route Handler.

Activity type **`outreach_sent`** may appear in timelines when integrations log sends.

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
2. Creates `user_profiles` with `role_id`, `must_change_password: true`, `is_active: true`, `dashboard_values_hidden: false`
3. If `send_welcome_email: true` — **awaits** a branded HTML welcome email via **Instantly AI** (same `/api/v2/emails/test` endpoint as customer outreach) containing email, temp password, and login CTA (`resolveLoginUrl`). Requires `INSTANTLY_API_KEY` and `INSTANTLY_SENDING_ACCOUNT`. UI checkbox on Add User form defaults to **on** (`components/admin/users-section.tsx`).

**Response `201`:**
```json
{
  "user": UserProfile,
  "email_delivery": {
    "attempted": true,
    "ok": true,
    "login_url": "https://…/login"
  }
}
```

When `send_welcome_email` is false, `email_delivery` is omitted. When Instantly fails, `email_delivery.ok` is `false` with `error`; user account is still created — admin shares credentials manually.

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
  "follow_up_reason": [LookupValue],
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

### `GET /api/admin/leads/import/template`

Download a live JSON template for bulk lead import. Admin only.

**Response `200`:** `application/json` attachment with:

- `_documentation` — AI-friendly field guide (required/optional, example values, instructions)
- `_lookups` — current `source`, `industry`, `urgency`, and product option tables (`value` + `label`)
- `leads` — one example row

Keys starting with `_` are ignored on import.

---

### `POST /api/admin/leads/import`

Bulk import leads from JSON. Admin only. **Validate before commit** — always dry-run first in UI.

**Query:** `dry_run=true` — parse + validate only; no DB writes.

**Body:**
```json
{
  "leads": [ /* up to 500 row objects */ ],
  "create_missing_lookups": false
}
```

| Field | Notes |
|-------|-------|
| `leads[]` | Required. Each row: customer fields + lead fields (see `docs/feature-specs/lead-import.md`) |
| `create_missing_lookups` | When `true` on **commit**, auto-creates unknown `source` / `industry` slugs in Dropdown Options |

**Dry-run response `200`:** `{ valid, invalid, preview, errors[] }` — no mutations.

**Commit response `200`:** `{ imported, skipped, created_lookups, results[] }`; logs `leads_bulk_imported` activity.

**Validation:** Unknown `source` / `industry` rejected by default (error lists valid slugs). Duplicate phone skips row. Max 500 leads per request.

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

`POST /api/admin/product-types` body: `{ id, name, default_print_type, sort_order?, notes?, facility? }`. `default_print_type` must be `"Roll"`, `"Sheet"`, or `"Unit"`. `PATCH /api/admin/product-types/[id]` accepts the same fields. Both bust the ticket-form bootstrap server cache on success.

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

**Body:** Any subset of allowed fields (except `id`), including bank / Zelle remittance columns. Used by Admin → Settings → Payment (`PaymentSection`).

**Response `200`:** `{ "settings": CompanySettings }`

---

---

## Admin — Email templates

### `GET /api/admin/email-templates`

Returns all template definitions with current `subject`, `body`, `ctaLabel`, metadata (label, description, placeholders, group), and `isCustom` flag. **Admin only.**

When migration `109_email_templates.sql` is not applied: `{ templates, dbAvailable: false, migrationHint }` — UI shows coded defaults; Save disabled.

### `PATCH /api/admin/email-templates`

Upsert one or more templates. **Admin only.**

**Body:**
```json
{
  "templates": {
    "quote_sent": {
      "subject": "Your Quote from {companyName} is Ready",
      "body": "Your quote from {companyName} is ready…",
      "ctaLabel": "View & Confirm Quote"
    }
  }
}
```

**Validation:** Unknown keys rejected; empty subject/body/cta rejected; reasonable max lengths per field.

**Response `200`:** `{ "ok": true }` or `{ "ok": true, "dbAvailable": false }` when table missing (no-op save).

**Outbound:** Customer emails: `load-email-templates.ts` + `customer-email-builders.ts`. Staff notifications (e.g. `quote_sent_staff_notification`): `send-quote-sent-notification.ts` + `wrap-transactional-email.ts`. See `docs/email-template-guide.md`.

---

## Admin — SMS templates

### `GET /api/admin/sms-templates`

Returns all template definitions with current `body`, metadata (label, description, placeholders), and `isCustom` flag. **Admin only.**

### `PATCH /api/admin/sms-templates`

Upsert one or more template bodies. **Admin only.**

**Body:**
```json
{
  "templates": {
    "quote_sent": "Hi {firstName}, your quote from {companyName}…",
    "payment_reminder": "…"
  }
}
```

**Validation:** Unknown keys rejected; empty bodies rejected; max 1600 characters per body.

**Response `200`:** `{ "ok": true }`

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
