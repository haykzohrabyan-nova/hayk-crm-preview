# Performance — Any-Doer Implementation Roadmap

> **Audience:** Any developer picking up the next round of performance work.
> **Status:** Planning doc — P0/P1 items marked ✅ below were implemented 2026-05-26 (see [performance-optimization.md](./performance-optimization.md)).
> **Last updated:** 2026-05-26

---

## TL;DR — what still feels slow and why

Phase 1–2 fixed **fat payloads** and **duplicate Realtime channels**. Remaining latency on pages like `/production` (~750–900 ms per request, ~1 kB JSON) is mostly:

| Cost layer | Typical share | Fix category |
|------------|---------------|--------------|
| Vercel serverless cold/warm start | 15–25% | Infra / keep-warm |
| `requireSession()` → Auth + role lookup **per API call** | 50–70% | **Combined endpoints**, session memoization |
| Actual Postgres query (8–50 rows, head counts) | 5–15% | Indexes ✅, bigger compute (marginal at small scale) |
| Multiple parallel routes on one page load | Adds 2–3× auth tax | **Page-data bundling** |

**Storage is not the problem.** One `job_tickets` table for quotes + orders is fine. The issue is **how many authenticated HTTP round trips** each page pays on load.

---

## Already done (do not re-implement)

See [performance-optimization.md](./performance-optimization.md) for full detail.

| Item | Pages affected |
|------|----------------|
| ✅ Scoped slim list APIs | `/orders`, `/quotes`, `/production`, `/payments`, `/completed` |
| ✅ SQL `{ count: "exact", head: true }` | All tab + sidebar count routes |
| ✅ Sidebar-only Realtime for tickets | All ticket list pages |
| ✅ Debounced sidebar badges (~300 ms) | Global |
| ✅ Slim leads workspace + full lead on drawer open | `/leads`, `/sales` |
| ✅ Slim CRM list + silent realtime refresh | `/crm` |
| ✅ Coalesced mount + realtime refetch (`useCoalescedRefresh`) | All ticket + lead list pages |
| ✅ Combined `page-data` endpoints | Production, Orders, Quotes, Payments, Completed, Leads, Sales |
| ✅ Session memoization (~3 s) | `lib/auth/session-cache.ts` |
| ✅ Role-scoped sidebar counts (`?routes=`) | Global sidebar |
| ✅ Lazy modal bootstrap (lookups, admin users) | Leads, Sales |
| ✅ Migration `073_performance_indexes.sql` | Orders, production, leads counts |

---

## Cross-cutting optimizations (apply everywhere)

These benefit **all** list pages. Implement once in `lib/`, wire per page.

### P0 — Combined page-data endpoints (highest impact) ✅ Done 2026-05-26

**Problem:** Tabbed pages call `list` + `counts` as **two separate routes**. Each runs full `requireSession()` (~300–500 ms).

**Pattern:**

```
GET /api/{feature}/page-data
→ { items: [...], counts: { ... } }
```

One auth pass, one serverless invocation, parallel DB queries inside the handler.

| Proposed route | Replaces | Component |
|----------------|----------|-----------|
| `GET /api/production/page-data` | `/production/orders` + `/production/counts` | `production-page.tsx` |
| `GET /api/orders/page-data` | `/orders/orders` + `/tickets/counts` (orders slice) | `orders-page.tsx` |
| `GET /api/quotes/page-data` | `/tickets?kind=quote` + `/tickets/counts` (quote slice) | `quotes-page.tsx` |
| `GET /api/payments/page-data` | `/payments/pending` + `/payments/counts` | `payments-page.tsx` |
| `GET /api/completed/page-data` | `/completed/orders` + `/completed/counts` | `completed-page.tsx` |
| `GET /api/leads/workspace/page-data?tab=...` | `/leads/workspace?...` + `/leads/workspace/counts` | `leads-page.tsx` |
| `GET /api/leads/sales/page-data?tab=...` | `/leads/workspace?...` + `/leads/sales-counts` | `sales-page.tsx` |

**Keep existing routes** for backward compatibility or Realtime-only count refresh; page components switch to `page-data` on mount.

**Estimated savings:** ~300–450 ms per page load (one fewer auth round trip).

---

### P0 — Coalesced refetch on all ticket list pages ✅ Done 2026-05-26

**Problem:** React Strict Mode double-mounts effects in dev → duplicate list + counts fetches.

**Status:** ✅ All tabbed list pages via `hooks/use-coalesced-refresh.ts`.

| Page | File |
|------|------|
| `/production` | `components/orders/production-page.tsx` |
| `/orders` | `components/orders/orders-page.tsx` |
| `/quotes` | `components/quotes/quotes-page.tsx` |
| `/completed` | `components/orders/completed-page.tsx` |
| `/payments` | `components/orders/payments-page.tsx` |
| `/leads` | `components/leads/leads-page.tsx` |
| `/sales` | `components/sales/sales-page.tsx` |

**Caveat:** Pass a stable refresh callback — unstable inline functions caused an infinite reload on `/leads` (fixed May 2026).

**Estimated savings:** Dev UX + half the requests on mount; production build already single-mount.

---

### P1 — Session memoization in `requireSession()` ✅ Done 2026-05-26

**Problem:** Burst of API calls (page load + sidebar) each call `auth.getUser()` + `user_profiles` role query.

**Approach:** Short-lived in-memory cache keyed by session cookie hash (TTL ~1–5 s, same Node process only). Invalidate on 401.

**File:** `lib/auth/require-session.ts`

**Estimated savings:** ~200–400 ms on pages firing 3+ routes within the same warm function instance (variable on serverless).

---

### P1 — Slim dedicated orders tab counts ✅ Done 2026-05-26 (`GET /api/orders/counts`, `GET /api/quotes/counts`)

**Problem:** `/orders` calls `GET /api/tickets/counts` which computes **all** ticket count buckets (drafts, sent, routed, in_production, …) but the page only needs `orders`, `cancelled`.

**Approach:** Add `GET /api/orders/counts` (or include in `page-data`) with only:

```json
{ "counts": { "all": 0, "pending": 0, "cancelled": 0 } }
```

**Estimated savings:** ~50–150 ms on orders page count half (fewer DB head queries).

---

### P2 — Client fetch deduplication (SWR / React Query)

**Problem:** No shared cache — navigating away and back re-fetches everything.

**Approach:** Optional `@tanstack/react-query` or `swr` for list + count keys:

- `['production', 'page-data']`
- `['leads', 'workspace', tab, search]`

**Rules:** Keep silent Realtime refresh; stale-while-revalidate for tab switches.

**Estimated savings:** Instant back-navigation; fewer redundant calls during session.

---

### P2 — Pagination / cursor limits

**When:** Any list exceeds ~500 rows (not needed yet).

**Pattern:**

```
GET /api/.../orders?limit=50&cursor=2026-05-22T...
```

**Pages to paginate first:** `/crm` (all customers), `/completed`, `/quotes`, `/leads` (admin all-leads view).

---

### P2 — Sidebar counts: lazy or scoped

**Problem:** `GET /api/sidebar-counts` runs **6–10 head counts** for every Realtime burst (debounced 300 ms). Still one full auth + many DB calls.

**Options:**

1. **Role-scoped counts only** — accountant skips `/quotes` quote-stage counts; SDR skips `/production`.
2. **Split sidebar API** — badges for visible nav items only (derive from `pages` RBAC).
3. **Include nav badge in page-data** — sidebar reads last-known from a lightweight client cache updated by active page.

**Estimated savings:** ~100–300 ms on sidebar refresh under load.

---

### P3 — Infrastructure (no code)

| Change | When it helps |
|--------|----------------|
| Supabase **Pro** (no pause, better consistency) | First load after idle; fewer spikes |
| Supabase **compute upgrade** | Large tables, complex KPI queries — **not** 8-row lists |
| Vercel **Pro** / reduced cold starts | All API routes |
| Supabase **connection pooler** (PgBouncer) | High concurrent users |

Do **not** expect RAM upgrade alone to fix ~750 ms on 1 kB responses.

---

## Page-by-page audit

### Global — `components/layout/sidebar.tsx`

| On load / Realtime | Endpoint | Notes |
|--------------------|----------|-------|
| Mount + Realtime (debounced) | `GET /api/sidebar-counts?routes=…` | Role-scoped subset of visible nav routes only |

**Any-doer tasks:**

- [x] Role-scoped sidebar counts (P2) — `?routes=` param (2026-05-26)
- [ ] Consider reading production/orders badge from page-data cache when on that route

---

### `/production` — `components/orders/production-page.tsx`

| Mount fetch (2026-05-26) | Notes |
|--------------------------|-------|
| `GET /api/production/page-data` | List + counts in one auth pass |

**Any-doer tasks:**

- [x] **P0** `GET /api/production/page-data` → `{ orders, counts }`
- [x] Coalesced refetch (`useCoalescedRefresh`)

---

### `/orders` — `components/orders/orders-page.tsx`

| Mount fetch (2026-05-26) | Notes |
|--------------------------|-------|
| `GET /api/orders/page-data` | Slim list + tab counts; dedicated `GET /api/orders/counts` for counts-only refresh |

**Any-doer tasks:**

- [x] **P0** `GET /api/orders/page-data`
- [x] **P0** Coalesced refetch pattern
- [x] **P1** Dedicated `GET /api/orders/counts`

---

### `/quotes` — `components/quotes/quotes-page.tsx`

| Mount fetch (2026-05-26) | Notes |
|--------------------------|-------|
| `GET /api/quotes/page-data` | Slim list + quote-stage counts only |

**Any-doer tasks:**

- [x] **P0** `GET /api/quotes/page-data` with quote-stage counts only
- [x] **P0** Coalesced refetch
- [x] Split `GET /api/quotes/counts` (quote-stage counts only)

---

### `/payments` — `components/orders/payments-page.tsx`

| Mount fetch (2026-05-26) | Notes |
|--------------------------|-------|
| `GET /api/payments/page-data` | Pending evidence list (single tab) |

**Any-doer tasks:**

- [x] **P0** `page-data` endpoint
- [x] Coalesced refetch
- [ ] **P2** Share cache key with accountant dashboard if using SWR

---

### `/completed` — `components/orders/completed-page.tsx`

| Mount fetch (2026-05-26) | Notes |
|--------------------------|-------|
| `GET /api/completed/page-data` | Slim list + counts |

**Any-doer tasks:**

- [x] **P0** Coalesced refetch
- [x] `GET /api/completed/page-data`
- [ ] **P2** Pagination when completed volume grows

---

### `/leads` — `components/leads/leads-page.tsx`

| Mount fetch (2026-05-26) | Notes |
|--------------------------|-------|
| `GET /api/leads/workspace/page-data?…` | Slim list + all tab counts |
| Lookups / product-types / SDR list | Lazy on modal/reassign open ✅ |
| `fetchLeadById()` on drawer | Full record only when needed ✅ |

**Any-doer tasks:**

- [x] **P0** `GET /api/leads/workspace/page-data?tab=...` → `{ leads, counts }`
- [x] **P1** Lazy-fetch lookups / product-types / SDR list when modal opens
- [ ] **P2** Pagination for admin "All Leads" at scale
- [x] Won tab: slim `?won=true` query

---

### `/sales` — `components/sales/sales-page.tsx`

| Mount fetch (2026-05-26) | Notes |
|--------------------------|-------|
| `GET /api/leads/sales/page-data?tab=…` | Slim list + tab counts |
| Hold/Rejected tab data | Lazy on first tab open ✅ |
| Lookups + admin users | Lazy on drawer/modal open ✅ |

**Any-doer tasks:**

- [x] **P0** `GET /api/leads/sales/page-data?tab=...`
- [x] **P1** Lazy-load lookups / sales user list
- [x] Drawer deferral on Realtime — keep behavior

---

### `/crm` — `components/crm/crm-page.tsx`

| Current fetches | Issue |
|-----------------|-------|
| `GET /api/customers` | ✅ Slim + aggregates; loads **all** customers every time |
| Server-side search is client filter after full fetch | Won't scale |

**Any-doer tasks:**

- [ ] **P2** Server-side `?search=` + pagination on `GET /api/customers`
- [ ] **P2** Materialized or cached aggregates if customer count > 1000
- [ ] Silent Realtime refresh ✅ — keep

---

### `/dashboard` — role dashboards

| Component | Fetches |
|-----------|---------|
| `sdr-dashboard.tsx` | `GET /api/dashboard/kpis?period=` |
| `sales-dashboard.tsx` | Same |
| `admin-dashboard.tsx` | KPIs + `GET /api/admin/team` + Realtime silent refresh |
| `accountant-dashboard.tsx` | `GET /api/payments/counts` |

**Any-doer tasks:**

- [ ] **P2** Audit KPI handler — ensure activity-scoped queries use indexes, not full table scans
- [ ] **P2** Combine accountant dashboard into single endpoint if more widgets added
- [ ] **P1** Cache KPI response client-side per `period` for 60 s

---

### Detail pages — `/quotes/[id]`, `/orders/[id]`, etc.

| Component | Fetches on mount |
|-----------|------------------|
| `quote-detail.tsx` | Ticket, lookups (2 routes), company settings |
| Drawers | Full lead via `GET /api/leads/[id]` |

**Any-doer tasks:**

- [ ] **P2** Lazy-load lookups only when entering edit mode
- [ ] **P2** Bundle ticket + company into `GET /api/tickets/[id]/detail-bundle` for first paint
- [ ] Keep History tab lazy (`/activities`) ✅

---

### `/quotes/new` — `components/quotes/new-quote-form.tsx`

| Fetches | Issue |
|---------|-------|
| Lookups (2 routes), company, optional lead | Heavy first paint for a form |

**Any-doer tasks:**

- [ ] **P2** Single `GET /api/quotes/form-bootstrap` → lookups + company + SKU catalog
- [ ] **P3** Server Component pass initial lookups (if moving away from pure client fetch)

---

### Admin — `/admin/settings/*`

Multiple sections each fetch independently on tab open. Lower priority (admin-only, low traffic).

**Any-doer tasks:**

- [ ] **P3** Prefetch adjacent admin tab data
- [ ] **P3** Skeleton + parallel fetch already acceptable here

---

## Priority matrix

| Priority | Work | Impact | Effort | Pages |
|----------|------|--------|--------|-------|
| Priority | Item | Impact | Effort | Status |
|----------|------|--------|--------|--------|
| **P0** | Combined `page-data` endpoints | High (~40% load time) | Medium | ✅ Done |
| **P0** | Coalesced refetch | Medium (dev + mount) | Low | ✅ Done |
| **P1** | Dedicated per-page count routes | Medium | Low | ✅ Done (orders, quotes) |
| **P1** | Lazy-load modal/drawer bootstrap data | Medium | Low | ✅ Done (leads, sales) |
| **P1** | Session memoization | Medium–High (burst) | Medium | ✅ Done |
| **P2** | SWR / React Query | Medium (navigation) | Medium | Open |
| **P2** | CRM pagination + server search | High at scale | Medium | Open |
| **P2** | Sidebar page-data cache for badges | Medium | Medium | Open |
| **P2** | List pagination | High at scale | Medium | Open |
| **P3** | Infra upgrades | Variable | $ | Open |
| **P3** | Quote form bootstrap bundle | Low–Medium | Medium | Open |

---

## Implementation checklist (per page-data route)

All seven page-data routes shipped 2026-05-26. Use this checklist for **future** page-data routes or pagination splits:

1. [x] Route handler: single `requireSession()`, then `Promise.all([listQuery, countsQuery])`
2. [x] Reuse existing select strings — DRY via `lib/utils/fetch-*-data.ts`
3. [x] Page component calls one URL on mount
4. [x] Realtime handler: counts-only or full page-data with `silent=true`
5. [x] Document in `docs/api-contract.md`
6. [x] Entry in `docs/CHANGELOG.md`
7. [ ] Smoke test in production build after each deploy

---

## Testing checklist

Run in **production build** (`npm run build && npm start`) — dev Strict Mode exaggerates duplicate fetches.

| Test | Pass criteria |
|------|---------------|
| Cold load | Network tab: ≤2 API calls for list page initial paint (ideally 1 `page-data` + sidebar) |
| Warm reload | List + counts < 500 ms combined on warm instance |
| Realtime | Edit in tab A → tab B updates ≤1 s, no skeleton flash |
| Tab badges | All tabs show correct count before click |
| Drawer | Full lead fields present after open |
| Auth | 401 still works; memo cache doesn't leak across users |

---

## Files to touch (reference)

| Area | Paths |
|------|-------|
| New page-data routes | `app/api/{feature}/page-data/route.ts` |
| Count helpers | `lib/utils/db-counts.ts` |
| Session | `lib/auth/require-session.ts` |
| List pages | `components/{feature}/*-page.tsx` |
| Docs | `docs/api-contract.md`, `docs/CHANGELOG.md`, this file |
| Optional ORM cache | New `lib/utils/fetch-cache.ts` or React Query provider in `app/(app)/layout.tsx` |

---

## Related docs

- [performance-optimization.md](./performance-optimization.md) — Phase 1–3 core (complete)
- [../../architecture.md](../../architecture.md) — Scoped list + page-data table
- [../../realtime-live-updates.md](../../realtime-live-updates.md) — Event bus + `useCoalescedRefresh`
- [../../TODO.md](../../TODO.md) — [TODO-007 Phase 3 core DONE](../../TODO.md#todo-007--performance-phase-3-optional-remainder)

---

## Suggested implementation order (remaining work)

1. **SWR / React Query** — cache list page-data for back-navigation
2. **Pagination** — when any tab exceeds ~500 rows (quotes, completed, leads admin view)
3. **CRM server search** — `?search=` + pagination on `GET /api/customers`
4. **Detail bootstrap bundle** — ticket + company in one request for first paint
5. **Infra** — Vercel Pro, Supabase pooler if concurrent load grows
