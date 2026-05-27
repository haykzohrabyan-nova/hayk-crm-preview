# BazarCRM — Security Model

**Last updated:** May 26, 2026

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
| `requireSession()` | `lib/auth/require-session.ts` | Valid session + **MFA complete** (AAL2 or valid `bazaar_mfa_trust` cookie). Option `{ requireMfa: false }` for sign-out flows only. |
| `requireAdmin()` | `lib/auth/require-admin.ts` | Calls `requireSession()` then checks `roleName === 'admin'`. Used on **all** admin-only Route Handlers — never use `requireSession()` + manual role check as a substitute. |
| `canAccessTicket()` | `lib/utils/ticket-access.ts` | Ticket read scope — owner, admin, accountant, or sales on `routed` tickets. |
| `canMutateTicket()` | `lib/utils/ticket-access.ts` | Ticket PATCH scope — owner, admin, or accountant. |
| `canReadLead()` | `lib/utils/lead-access.ts` | Lead GET scope by role and ownership. Also used in `GET /api/leads/[id]/activities` and `GET /api/activities?lead_id=` to prevent IDOR. |

Returns `401` with `{ code: "UNAUTHENTICATED" }` when not logged in. Returns `403` with `{ code: "MFA_SETUP_REQUIRED" }` or `{ code: "MFA_VERIFY_REQUIRED" }` when MFA is incomplete.

---

## `proxy.ts` vs API routes

- **`proxy.ts`** protects **pages** (`/leads`, `/dashboard`, …) — redirects to login / setup-2fa / verify-2fa.
- **`/api/*` is skipped by proxy** — each Route Handler must call `requireSession()` or `requireAdmin()` itself.
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
| `Content-Security-Policy` | Scoped to `self`, Supabase, Vercel live, Google Fonts |

Configured in `next.config.ts` `headers()` export — applies to all routes.

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

Bank / Zelle remittance fields are **admin-only** on `GET /api/admin/company`. Non-admin roles receive a filtered subset.

---

## Object-level authorization (IDOR protection)

These endpoints verify the caller has access to the specific object before returning data:

| Endpoint | Check |
|----------|-------|
| `GET /api/leads/[id]` | `canReadLead()` |
| `GET /api/leads/[id]/activities` | `canReadLead()` on the lead before returning its timeline |
| `GET /api/activities?lead_id=` | `canReadLead()` on the referenced lead |
| `GET /api/activities?ticket_id=` | `canAccessTicket()` on the referenced ticket |
| `GET /api/tickets/[id]` | `canAccessTicket()` |
| `GET /api/tickets/[id]/pdf` | `canAccessTicket()` |
| `GET /api/tickets/[id]/print` | `canAccessTicket()` |

---

## Ticket PDF / print / merge

| Endpoint | Auth |
|----------|------|
| `GET /api/tickets/[id]/pdf` | MFA session + `canAccessTicket()` — `renderToBuffer` in try/catch |
| `GET /api/tickets/[id]/print` | MFA session + `canAccessTicket()` |
| `POST /api/customers/[id]/merge` | Admin or Sales only (destructive — deletes source customer) |

---

## Public payment file upload

`POST /api/public/quotes/[token]/submit-payment` accepts an optional evidence file with these guards:

- **Size limit:** 10 MB — checked before `arrayBuffer()` is called (prevents memory exhaustion on serverless)
- **MIME allowlist:** `image/jpeg`, `image/png`, `image/webp`, `application/pdf` — client-supplied `Content-Type` is validated against this set

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
| `company_settings` | **Migration 080:** old permissive `authenticated_read_company_settings` policy dropped; replaced with `authenticated_read_company_settings_public` which grants read access to all authenticated users. Remittance fields (bank account, routing, Zelle) are only accessible via the service-role admin client used by API routes — not directly via the browser client. |
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

Not required for normal operation; documented for future defense-in-depth:

- Rate limits on `/api/public/quotes/*` and auth endpoints (no rate limiting currently deployed)
- Treat customer quote links (`/q/{uuid}`) like passwords — do not forward
- Role-scoped `PATCH /api/customers/[id]` at API layer

See also: `docs/rbac.md`, `docs/api-contract.md`, `docs/schema.md` (RLS sections).
