# BazarCRM — Security Model

**Last updated:** May 24, 2026

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
| `requireAdmin()` | `lib/auth/require-admin.ts` | Calls `requireSession()` then checks `roleName === 'admin'`. |
| `canAccessTicket()` | `lib/utils/ticket-access.ts` | Ticket read scope — owner, admin, accountant, or sales on `routed` tickets. |
| `canMutateTicket()` | `lib/utils/ticket-access.ts` | Ticket PATCH scope — owner, admin, or accountant. |
| `canReadLead()` | `lib/utils/lead-access.ts` | Lead GET scope by role and ownership. |

Returns `401` with `{ code: "UNAUTHENTICATED" }` when not logged in. Returns `403` with `{ code: "MFA_SETUP_REQUIRED" }` or `{ code: "MFA_VERIFY_REQUIRED" }` when MFA is incomplete.

---

## `proxy.ts` vs API routes

- **`proxy.ts`** protects **pages** (`/leads`, `/dashboard`, …) — redirects to login / setup-2fa / verify-2fa.
- **`/api/*` is skipped by proxy** — each Route Handler must call `requireSession()` or `requireAdmin()` itself.
- **Public paths:** `/q/*`, `/policy`, `/api/public/*` — no staff auth.

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

---

## Admin API auth (May 2026 hardening)

| Route group | GET | POST/PATCH/DELETE |
|-------------|-----|-------------------|
| `/api/admin/company` | Any authenticated user — **non-admin gets safe fields only** (tax rate, thresholds, idle timeout) | Admin only |
| `/api/admin/lookups`, materials, material-groups, product-types (mutations) | Admin only | Admin only |
| `/api/admin/product-types` GET | Any authenticated user (SDR lead form, quote forms) | Admin only |
| `/api/lookups/products` | Authenticated + MFA | — |

Bank / Zelle remittance fields are **admin-only** on `GET /api/admin/company`. Non-admin roles receive a filtered subset.

---

## Ticket PDF / print / merge

| Endpoint | Auth |
|----------|------|
| `GET /api/tickets/[id]/pdf` | MFA session + `canAccessTicket()` |
| `GET /api/tickets/[id]/print` | MFA session + `canAccessTicket()` |
| `POST /api/customers/[id]/merge` | Admin or Sales only (destructive — deletes source customer) |

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

## Supabase RLS dashboard notes

In the Supabase UI, policies show **Applied to: public** — this is the PostgreSQL schema role for all API requests, **not** “open to the internet.” Actual rules live in policy SQL (`auth.uid()`, `current_user_role() = 'admin'`, etc.).

| Table | Intentional setup |
|-------|-------------------|
| `mfa_trusted_devices` | RLS enabled, **no policies** — service role only |
| `company_settings` | Authenticated SELECT at DB level; API filters bank fields for non-admin |
| Product catalog | `SELECT using (true)` — product names readable with anon key (low sensitivity) |

Do **not** disable RLS or edit policies manually in the dashboard — update **`supabase/schema.sql`** and apply targeted SQL on existing projects (see `supabase/README.md`). Do not re-run the full schema on production.

---

## Environment secrets (server only)

| Variable | Exposure |
|----------|----------|
| `SUPABASE_SECRET_KEY` | Server only — never in client |
| `TWILIO_*`, `INSTANTLY_*`, `STRIPE_SECRET_KEY` | Server only |
| `.env.local` | Gitignored — never commit |

Copy from `.env.local.example` only as a template (no real keys).

---

## Supabase dashboard checklist

1. **Authentication → Providers:** disable public sign-up (invite-only staff)
2. **Authentication → MFA:** TOTP enabled
3. **Production env:** `NEXT_PUBLIC_SUPABASE_URL` must be set (empty skips all auth in `proxy.ts` — dev only)
4. Rotate any keys that were accidentally committed to git history

---

## Optional future hardening

Not required for normal operation; documented for defense-in-depth:

- RLS split for `company_settings` bank columns (admin-only at DB level)
- Role-scoped `PATCH /api/customers/[id]` at API layer
- Rate limits on `/api/public/quotes/*` and auth endpoints
- Treat customer quote links (`/q/{uuid}`) like passwords — do not forward

See also: `docs/rbac.md`, `docs/api-contract.md`, `docs/schema.md` (RLS sections).
