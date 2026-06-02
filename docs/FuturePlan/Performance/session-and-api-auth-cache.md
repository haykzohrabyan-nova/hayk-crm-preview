# Session + API auth cache (implemented)

## What we did

- `GET /api/me` — one server-validated payload for layout (user, role, nav pages)
- `requireSession()` — caches session + `allowedRoutes` for **45s** per cookie fingerprint
- `getCachedAllowedPageRoutes()` — shared permission list for all `/api/*` handlers
- `requirePageAccess` / `requireAnyPageAccess` — one cache lookup instead of 2 DB queries per check
- `checkTicketDetailPageAccess()` — sync check when session already loaded routes

## Security unchanged

- APIs still validate Supabase session cookies on every request
- Browser `/api/me` data is UI-only; forging client state does not bypass APIs

## Further safe speed wins

| Item | Status |
|------|--------|
| Vercel + Supabase same region (`pdx1`/`sfo1`) | **Ops** — see [`vercel-supabase-region.md`](./vercel-supabase-region.md) |
| `line_preview` on list `page-data` + client seed cache | **Done** (Jun 2026) |
| Slim detail: `page-data` ticket only + `ticket-form-bootstrap` | **Done** (Jun 2026) |
| Reuse `useAppSession()` on list pages (drop duplicate `getUser`) | **Open** — P1 in [`page-loading.md`](./page-loading.md) |
| Prefetch bootstrap / detail on list hover | **Open** — P1 |
| Postgres RPC `get_ticket_line_preview(ticket_id)` | **Open** — P2 if page-data payload too large |

## Do not do (unsafe)

- Trust `roleName` / `allowedRoutes` from client headers on APIs
- Skip `requireSession` because `/api/me` succeeded
- Expose service role key to the browser
