# BazarCRM — Security Model

**Last updated:** May 29, 2026

This document describes how the app protects data, what is stored in the browser, and how API + database layers work together.

---

## Defense in depth (two layers)

| Layer | Where | What it does |
|-------|--------|--------------|
| **1. Route Handlers** | `app/api/**/route.ts` | Primary gate — `requireSession()` / `requireAdmin()` on every app endpoint |
| **2. Supabase RLS** | Postgres policies | Secondary gate — limits what a logged-in user can read/write via direct Supabase client |

Most CRM writes use the **service-role admin client** in Route Handlers (RLS bypassed server-side). Security depends on Route Handler auth being correct on every endpoint.

**Public quote routes** (`/api/public/quotes/*`) are intentionally unauthenticated; access is gated by unguessable `public_token` (UUID).

---

## Authentication helpers

| Helper | File | Behavior |
|--------|------|----------|
| `requireSession()` | `lib/auth/require-session.ts` | Valid session + **MFA complete** (AAL2 or valid `bazaar_mfa_trust` cookie). Uses `lib/supabase/server.ts` so expired access tokens refresh via cookie `setAll` in Route Handlers. Option `{ requireMfa: false }` for sign-out flows only. |
| `requirePageAccess()` | `lib/auth/require-page-access.ts` | Mirrors `proxy.ts` page RBAC on API routes — admin bypasses; checks `role_permissions` for a required page route (e.g. `/crm`). |
| `createServerSupabase()` | `lib/supabase/server.ts` | Server-only Supabase client for Route Handlers — reads and refreshes auth cookies (never import in client components). |
| `requireAdmin()` | `lib/auth/require-admin.ts` | Calls `requireSession()` then checks `roleName === 'admin'`. Used on **all** admin-only Route Handlers — never use `requireSession()` + manual role check as a substitute. |
| `canAccessTicket()` | `lib/utils/ticket-access.ts` | Ticket read scope — owner (`created_by_id`), SDR routed hand-off (`routed_by_id`, not when `completed`), admin, accountant, or sales on `routed` tickets. |
| `canMutateTicket()` | `lib/utils/ticket-access.ts` | Ticket PATCH scope — owner, admin, or accountant. |
| `canReadLead()` | `lib/utils/lead-access.ts` | Lead GET scope by role and ownership. Used on lead GET, activities, and linked-lead merge. |
| `canMutateLead()` | `lib/utils/lead-access.ts` | Lead PATCH scope — same rules as `canReadLead()`. |
| `canClaimLead()` | `lib/utils/lead-access.ts` | Sales/admin claim — unowned lead in sales pipeline (`status = 'Routed to Sales'`). |
| `canAcquireLeadLock()` | `lib/utils/lead-access.ts` | Lock acquisition — SDR pool/owned, Sales routed/owned, admin any. |
| `requireAnyPageAccess()` | `lib/auth/require-page-access.ts` | Pass if user has **any** of the listed page routes (e.g. `/crm` or `/quotes`). |
| Session cache | `lib/auth/session-cache.ts` | ~45 s in-process memoization of successful `requireSession()` (includes `allowedRoutes`). Dev HMR cookie `__next_hmr_refresh_hash__` excluded from cache key. |
| Allowed routes cache | `lib/auth/allowed-routes-cache.ts` | ~45 s per `userId:roleName` — shared by `requireSession`, `requirePageAccess`, ticket APIs. |
| `GET /api/me` | `app/api/me/route.ts` | Layout-only identity + nav pages after `requireSession()` — **not** a substitute for per-API auth. |

Returns `401` with `{ code: "UNAUTHENTICATED" }` when not logged in. Returns `403` with `{ code: "MFA_SETUP_REQUIRED" }` or `{ code: "MFA_VERIFY_REQUIRED" }` when MFA is incomplete.

---

## `proxy.ts` vs API routes

- **`proxy.ts`** protects **pages** (`/leads`, `/dashboard`, …) — redirects to login / setup-2fa / verify-2fa.
- **`/api/*` is skipped by proxy** — each Route Handler must call `requireSession()` or `requireAdmin()` itself. `requireSession()` delegates to `createServerSupabase()` so JWT refresh cookies are written on API responses when the access token expires.
- **Public paths:** `/q/*`, `/policy`, `/api/public/*` — no staff auth.
- **Missing `NEXT_PUBLIC_SUPABASE_URL`** → `proxy.ts` returns **503** (fail closed). Previously skipped auth entirely; that behavior has been removed.

Never add `middleware.ts` alongside `proxy.ts` (Next.js 16 build failure).

---

## Browser storage (nothing sensitive)

| Storage | Key | Contents |
|---------|-----|----------|
| `localStorage` | `bazaar-theme` | Light / dark / system |
| `localStorage` | `bazaar-sidebar-collapsed` | Sidebar UI state |
| `sessionStorage` | `bazaar_remember_mfa` | `"1"` flag only — not a secret; cleared after 2FA verify |

**Not stored in browser storage:** passwords, API keys, service role key, MFA secrets, quote tokens.

**httpOnly cookies (JS cannot read):**

- Supabase auth session (`sb-*`)
- `bazaar_mfa_trust` — 30-day trusted device; token hashed in `mfa_trusted_devices` table

---

## Public JS bundle (expected exposure)

These are compiled into the client bundle by design:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (anon key)

Alone they **cannot** admin the database. They identify the Supabase project for auth + RLS-scoped reads. The dangerous key is **`SUPABASE_SECRET_KEY`** — server Route Handlers only (`lib/supabase/admin.ts`).

`lib/supabase/admin.ts` includes `import "server-only"` — a mistaken client import will fail at build time rather than silently bundling the secret key.

---

## HTTP security headers

All responses from `next.config.ts` include:

| Header | Value |
|--------|-------|
| `X-Content-Type-Options` | `nosniff` |
| `X-Frame-Options` | `DENY` |
| `X-XSS-Protection` | `1; mode=block` |
| `Referrer-Policy` | `strict-origin-when-cross-origin` |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=()` |
| `Content-Security-Policy` | Built in `lib/security/content-security-policy.ts` — Supabase, Google Fonts, Vercel Live, Speed Insights (dev), Next HMR (dev) |

Configured in `next.config.ts` `headers()` export.

### CSP route exceptions (May 2026)

| Route pattern | Notes |
|---------------|--------|
| `/((?!api/public/quotes/).*)` | App pages — full CSP including `frame-ancestors 'none'`, `object-src 'self' blob:` |
| `/api/public/quotes/:token/files/:fileId` | Minimal CSP: `frame-ancestors 'self'`; streamed file responses also set CSP in the route handler |
| `/q/:path*` | Public quote portal — same as app CSP but listed **last** so it wins over the catch-all (includes `frame-src 'self' blob:` and `object-src 'self' blob:` for PDF previews) |

**Public quote PDF previews** load file bytes with `fetch`, then display via a `blob:` URL in `<object type="application/pdf">`. Without `blob:` in `frame-src` / `object-src`, the browser blocks the embed (not a localhost-specific issue).

**Staff file download** (`GET /api/tickets/[id]/files/[fileId]`) uses a **302** to signed Storage for direct download. **Staff in-page preview** (`LineItemFilePreviewModal`) fetches the same URL client-side and builds a `blob:` URL for `<img>` / `<object>` (same pattern as public PDF embed). Public customer files use **200** streamed body for same-origin preview.

**Line attachment Storage:** Upload/replace/delete via file API removes objects from bucket `ticket-attachments`. Orphan line-item delete in `syncTicketLines()` calls `deleteOrphanLineFiles()` before FK cascade. See `docs/schema.md`.

---

## Admin API auth

| Route group | GET | POST/PATCH/DELETE |
|-------------|-----|-------------------|
| `/api/admin/company` | Any authenticated user — **non-admin gets safe fields only** (tax rate, thresholds, idle timeout) | Admin only |
| `/api/admin/lookups`, materials, material-groups, product-types (mutations) | Admin only | Admin only |
| `/api/admin/product-types` GET | Any authenticated user (SDR lead form, quote forms) | Admin only |
| `/api/admin/sessions` | Admin only (`requireAdmin()`) | — |
| `/api/admin/sessions/health` | Admin only (`requireAdmin()`) | — |
| `/api/admin/team` | Admin only (`requireAdmin()`) | — |
| `/api/lookups/products` | Authenticated + MFA | — |

Bank / Zelle remittance fields are **admin-only** on `GET /api/admin/company` and `PATCH /api/admin/company`. Non-admin roles receive a filtered subset on GET. Admin **Payment Settings** UI (`PaymentSection`) loads and saves remittance via this API — not the browser Supabase client.

---

## Object-level authorization (IDOR protection)

These endpoints verify the caller has access to the specific object before returning data:

| Endpoint | Check |
|----------|-------|
| `GET /api/leads/[id]` | `canReadLead()` |
| `PATCH /api/leads/[id]` | `canMutateLead()` (same scope as read) + lock/rejected guards |
| `POST /api/leads/[id]/claim` | Sales or admin only; `canClaimLead()` |
| `POST /api/leads/[id]/lock` | SDR/Sales/Admin only; `canAcquireLeadLock()` |
| `POST /api/leads/[id]/hold` | Scoped-tab helpers (SDR/Sales) |
| `GET /api/customers/[id]`, CRM list/lookup | `requirePageAccess(..., '/crm')` |
| `GET /api/customers/[id]/shipping-addresses` | `requireAnyPageAccess(..., ['/crm', '/quotes'])` |
| `GET /api/leads/[id]/activities` | `canReadLead()` on the lead before returning its timeline |
| `GET /api/activities?lead_id=` | `canReadLead()` on the referenced lead |
| `GET /api/activities?ticket_id=` | `canAccessTicket()` on the referenced ticket |
| `GET /api/tickets/[id]` | `canAccessTicket()` |
| `GET /api/tickets/[id]/pdf` | `canAccessTicket()` |
| `GET /api/public/quotes/[token]/pdf` | Unguessable `public_token` only (no session) |
| `GET /api/tickets/[id]/print` | `canAccessTicket()` |
| `GET /api/completed/orders` | Role-scoped list — SDR: `created_by_id` only via `scopeCompletedTicketsQuery()` |
| `GET /api/completed/page-data` | Same scope as completed list |
| `GET /api/leads/workspace/*`, `POST /api/leads/manual` | `requirePageAccess(..., '/leads')` |
| `GET /api/leads/sales/*` | `requirePageAccess(..., '/sales')` |
| `GET /api/activities?ticket_id=&include_linked_lead=true` | `canAccessTicket()` on ticket + `canReadLead()` on linked lead |

---

## Ticket PDF / print / merge

| Endpoint | Auth |
|----------|------|
| `GET /api/tickets/[id]/pdf` | MFA session + `canAccessTicket()` — `renderToBuffer` in try/catch |
| `GET /api/public/quotes/[token]/pdf` | Token only — same renderer; no session |
| `GET /api/tickets/[id]/print` | MFA session + `canAccessTicket()` |
| `POST /api/customers/[id]/merge` | Admin or Sales only (destructive — deletes source customer) |

---

## Public payment and confirm guards

Staff-authenticated routes are unchanged. **Public** write routes gate on `public_token` only (no session):

| Route | Blocked when |
|-------|----------------|
| `POST /api/public/quotes/[token]/confirm` | `refund_status` partial/full (`409 REFUNDED`); `ticket_status !== sent` (`409 INVALID_STATUS`) — includes **cancelled** |
| `POST /api/public/quotes/[token]/submit-payment` | Not in `sent`/`order`/`in_production`/`completed` (`400 INVALID_STATUS`) — includes **cancelled**; partial/full refund (`409 REFUNDED`) |
| `POST /api/public/quotes/[token]/stripe/create-session` | Same as submit-payment (`publicQuotePaymentBlockedResponse`) |

`GET /api/public/quotes/[token]` remains available for read-only invoice view when cancelled or refunded. Response may include `tax_exempt_review_pending` only when a permit **file** exists on the ticket and is not yet reviewed (not for legacy permit-#-only rows). Pricing fields remain in JSON but portal/PDF hide full breakdown per `lib/utils/public-invoice-document.ts`.

### Staff refund routes (authenticated)

| Route | Auth |
|-------|------|
| `POST /api/tickets/[id]/refund` | MFA session; `roleName` accountant or admin; ticket resolved by id/reference |
| `GET /api/tickets/[id]/refund-evidence/[refundId]` | Same; evidence row must belong to ticket |

No public unauthenticated refund endpoint.

---

## Public payment file upload

`POST /api/public/quotes/[token]/submit-payment` accepts an optional evidence file with these guards:

- **Size limit:** 10 MB — checked before `arrayBuffer()` is called (prevents memory exhaustion on serverless)
- **MIME allowlist:** `image/jpeg`, `image/png`, `image/webp`, `application/pdf` — client-supplied `Content-Type` is validated against this set
- **Rate limit:** 120 requests/minute per IP (`429` + `Retry-After`)

---

## Rate limiting (May 2026)

In-process sliding-window limits (`lib/security/rate-limit.ts`). Best-effort on serverless (per-instance counters); use edge/WAF for production-grade protection.

| Route group | Limit | Key |
|-------------|-------|-----|
| `/api/public/quotes/*` | 120/min per IP | `public-quote:{action}:{ip}` |
| `POST /api/auth/change-password` | 20/min per IP | `auth:change-password:{ip}` |
| `POST /api/auth/mfa-trust` | 20/min per IP | `auth:mfa-trust-post:{ip}` |

Returns `429` with `{ code: "RATE_LIMITED" }` and `Retry-After` header.

---

## Session logging

| Endpoint | Notes |
|----------|-------|
| `POST /api/auth/session` `{ action: "start" }` | After MFA verify; requires full session |
| `POST /api/auth/session` `{ action: "end" }` | `user_id` in body must match session cookie (anti-spoof) |
| `POST /api/auth/mfa-trust` | Issues trusted-device cookie after AAL2 |
| `DELETE /api/auth/mfa-trust` | Revokes trust on sign-out |

---

## Dev-only routes

| Route | Production |
|-------|------------|
| `GET /api/dev/quote-email-preview` | Returns `404` |

---

## Supabase RLS

In the Supabase UI, policies show **Applied to: public** — this is the PostgreSQL schema role for all API requests, **not** "open to the internet." Actual rules live in policy SQL (`auth.uid()`, role checks, etc.).

| Table | Setup |
|-------|-------|
| `mfa_trusted_devices` | RLS enabled, **no policies** — service role only |
| `ticket_shipping_destinations` | **Migration 096:** RLS enabled, **no policies** — service role / Route Handlers only |
| `company_settings` | **Migration 096:** admin-only SELECT policy; remittance via `GET/PATCH /api/admin/company` |
| `customers` | **Migration 096:** SELECT/WRITE for SDR, Sales, Admin only (not accountant) |
| `leads` | **Migration 096:** scoped UPDATE policies per role (replaces any-auth UPDATE) |
| `activities` | **Migration 096:** SELECT for staff roles only (SDR, Sales, Admin, Accountant) |
| `increment_*_sequence` RPCs | **Migration 096:** `service_role` execute only |
| `user_profiles_with_role` view | **Migration 096:** `security_invoker = true` |
| Product catalog | `SELECT using (true)` — product names readable with anon key (low sensitivity) |

Do **not** disable RLS or edit policies manually in the dashboard — update **`supabase/schema.sql`** and apply targeted SQL on existing projects (see `supabase/README.md`). Do not re-run the full schema on production.

---

## Environment secrets (server only)

| Variable | Exposure |
|----------|----------|
| `SUPABASE_SECRET_KEY` | Server only — `import "server-only"` in `lib/supabase/admin.ts` prevents accidental client import |
| `TWILIO_*`, `INSTANTLY_*` | Server only — integration senders |
| `STRIPE_SECRET_KEY` | Server only — **future** (Stripe not yet implemented) |
| `.env.local` | Gitignored — never commit |

Copy from `.env.local.example` only as a template (no real keys). Stripe variables are commented out in the example file until the integration is built.

---

## Supabase dashboard checklist

1. **Authentication → Providers:** disable public sign-up (invite-only staff)
2. **Authentication → MFA:** TOTP enabled
3. **Production env:** `NEXT_PUBLIC_SUPABASE_URL` must be set — if missing, `proxy.ts` returns **503** (fail closed, not bypass)
4. Rotate any keys that were accidentally committed to git history

---

## Remaining optional hardening

- Edge/WAF rate limits (in-process limits are best-effort on serverless; see `lib/security/rate-limit.ts`)
- Treat customer quote links (`/q/{uuid}`) like passwords — do not forward

See also: `docs/rbac.md`, `docs/api-contract.md`, `docs/schema.md` (RLS sections).
