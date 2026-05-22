# Performance — Any-Doer Implementation Roadmap

> **Audience:** Any developer picking up the next round of performance work.
> **Status:** Planning doc — nothing here is implemented unless marked ✅ in [performance-optimization.md](./performance-optimization.md).
> **Last updated:** 2026-05-22

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
| ✅ Coalesced mount + realtime refetch | `/production` only |
| ✅ Migration `073_performance_indexes.sql` | Orders, production, leads counts |

---

## Cross-cutting optimizations (apply everywhere)

These benefit **all** list pages. Implement once in `lib/`, wire per page.

### P0 — Combined page-data endpoints (highest impact)

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

### P0 — Coalesced refetch on all ticket list pages

**Problem:** React Strict Mode double-mounts effects in dev → duplicate `list` + `counts` fetches.

**Status:** ✅ `/production` only.

**Apply same pattern to:**

| Page | File |
|------|------|
| `/orders` | `components/orders/orders-page.tsx` |
| `/quotes` | `components/quotes/quotes-page.tsx` |
| `/completed` | `components/orders/completed-page.tsx` |
| `/payments` | `components/orders/payments-page.tsx` |

Reference: `production-page.tsx` — `scheduleRefresh(50)` on mount, `scheduleRefresh(300)` on `bazaar:tickets-changed`.

**Estimated savings:** Dev UX + half the requests on mount; production build already single-mount.

---

### P1 — Session memoization in `requireSession()`

**Problem:** Burst of API calls (page load + sidebar) each call `auth.getUser()` + `user_profiles` role query.

**Approach:** Short-lived in-memory cache keyed by session cookie hash (TTL ~1–5 s, same Node process only). Invalidate on 401.

**File:** `lib/auth/require-session.ts`

**Estimated savings:** ~200–400 ms on pages firing 3+ routes within the same warm function instance (variable on serverless).

---

### P1 — Slim dedicated orders tab counts

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
| Mount + Realtime (debounced) | `GET /api/sidebar-counts` | Many parallel counts; see P2 sidebar optimization |

**Any-doer tasks:**

- [ ] Role-scoped sidebar counts (P2)
- [ ] Consider reading production/orders badge from page-data cache when on that route

---

### `/production` — `components/orders/production-page.tsx`

| Current fetches | Size (typical) | Issue |
|-----------------|----------------|-------|
| `GET /api/production/orders` | ~1 kB | Separate auth |
| `GET /api/production/counts` | ~0.2 kB | Separate auth |
| + sidebar-counts | pending | Third auth |

**Any-doer tasks:**

- [ ] **P0** `GET /api/production/page-data` → `{ orders, counts }`
- [ ] ✅ Coalesced refetch (done)

---

### `/orders` — `components/orders/orders-page.tsx`

| Current fetches | Issue |
|-----------------|-------|
| `GET /api/orders/orders` | ✅ Slim list |
| `GET /api/tickets/counts` | Over-fetches all ticket buckets |
| Twin `useEffect` (mount + realtime) | Duplicate fetches in dev |

**Any-doer tasks:**

- [ ] **P0** `GET /api/orders/page-data` or `orders/counts`
- [ ] **P0** Coalesced refetch pattern
- [ ] **P1** Dedicated `GET /api/orders/counts`

---

### `/quotes` — `components/quotes/quotes-page.tsx`

| Current fetches | Issue |
|-----------------|-------|
| `GET /api/tickets?kind=quote` | ✅ Slim list |
| `GET /api/tickets/counts` | Computes orders/production/cancelled buckets unused on this page |
| Twin effects | Duplicate fetches in dev |

**Any-doer tasks:**

- [ ] **P0** `GET /api/quotes/page-data` with quote-stage counts only
- [ ] **P0** Coalesced refetch
- [ ] Optional: split `GET /api/tickets/counts` into per-page count routes

---

### `/payments` — `components/orders/payments-page.tsx`

| Current fetches | Issue |
|-----------------|-------|
| `GET /api/payments/pending` | ✅ Scoped list |
| No page-level tab counts fetch | Single tab; sidebar uses `/payments/counts` |
| No coalesced refetch | Minor |

**Any-doer tasks:**

- [ ] **P2** Coalesced refetch if counts added later
- [ ] **P0** `page-data` if tab badges expand beyond one tab
- [ ] Accountant dashboard also hits `/payments/counts` — share cache key if using SWR

---

### `/completed` — `components/orders/completed-page.tsx`

| Current fetches | Issue |
|-----------------|-------|
| `GET /api/completed/orders` | ✅ Slim list |
| No page tab counts | Only "All" tab — OK |
| Twin effects | Duplicate list fetch in dev |

**Any-doer tasks:**

- [ ] **P0** Coalesced refetch
- [ ] **P2** Pagination when completed volume grows
- [ ] Optional `page-data` if second tab added

---

### `/leads` — `components/leads/leads-page.tsx`

| Current fetches on mount | Issue |
|--------------------------|-------|
| Per-tab `GET /api/leads/workspace?...` | ✅ Slim list |
| `GET /api/leads/workspace/counts` | Separate auth |
| `GET /api/lookups?categories=...` | Once per mount — OK |
| `GET /api/admin/product-types` | For Add Lead modal — could lazy-load on modal open |
| `GET /api/admin/users?role=sdr` | Admin reassign only — could lazy-load on reassign open |
| `fetchLeadById()` on drawer | ✅ Full record only when needed |

**Any-doer tasks:**

- [ ] **P0** `GET /api/leads/workspace/page-data?tab=...` → `{ leads, counts }`
- [ ] **P1** Lazy-fetch lookups / product-types / SDR list when modal opens (not on page mount)
- [ ] **P2** Pagination for admin "All Leads" at scale
- [ ] Won tab: ensure won query stays slim (already uses `?won=true`)

---

### `/sales` — `components/sales/sales-page.tsx`

| Current fetches | Issue |
|-----------------|-------|
| `GET /api/leads/workspace?status=...` per tab | Hold/Rejected lazy-loaded ✅ |
| `GET /api/leads/sales-counts` | Separate auth |
| Lookups + admin users on mount | Same lazy-load opportunity as leads |

**Any-doer tasks:**

- [ ] **P0** `GET /api/leads/sales/page-data?tab=...`
- [ ] **P1** Lazy-load lookups / sales user list
- [ ] Drawer deferral on Realtime ✅ — keep behavior

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
| **P0** | Combined `page-data` endpoints | High (~40% load time) | Medium | production, orders, quotes, leads, sales |
| **P0** | Coalesced refetch | Medium (dev + mount) | Low | orders, quotes, completed, payments |
| **P1** | Dedicated per-page count routes | Medium | Low | orders, quotes |
| **P1** | Lazy-load modal/drawer bootstrap data | Medium | Low | leads, sales |
| **P1** | Session memoization | Medium–High (burst) | Medium | Global |
| **P2** | SWR / React Query | Medium (navigation) | Medium | All lists |
| **P2** | CRM pagination + server search | High at scale | Medium | crm |
| **P2** | Sidebar count scoping | Medium | Medium | Global |
| **P2** | List pagination | High at scale | Medium | quotes, completed, leads |
| **P3** | Infra upgrades | Variable | $ | All |
| **P3** | Quote form bootstrap bundle | Low–Medium | Medium | quotes/new |

---

## Implementation checklist (per page-data route)

When adding e.g. `GET /api/production/page-data`:

1. [ ] Route handler: single `requireSession()`, then `Promise.all([ordersQuery, countsQuery])`
2. [ ] Reuse existing select strings from `production/orders` and `production/counts` — DRY via shared functions in `lib/utils/`
3. [ ] Update page component to call one URL on mount
4. [ ] Realtime handler: still call counts-only or full page-data with `silent=true`
5. [ ] Document in `docs/api-contract.md`
6. [ ] Entry in `docs/CHANGELOG.md`
7. [ ] Smoke test: tab badges match rows; Realtime still updates table

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

- [performance-optimization.md](./performance-optimization.md) — Phase 1–2 (complete)
- [../../architecture.md](../../architecture.md) — Scoped list API table
- [../../realtime-live-updates.md](../../realtime-live-updates.md) — Event bus; do not break silent refresh
- [../../TODO.md](../../TODO.md) — [TODO-007 Phase 1–2 DONE](../../TODO.md#done-performance-optimization-phase-12-todo-007); [Phase 3+ open](../../TODO.md#open-performance-phase-3-todo-007-continuation)

---

## Suggested implementation order

1. **`/production/page-data`** — smallest tab set, coalesce already done; easy to measure (~750 ms → ~400 ms expected)
2. **`/orders/page-data`** + dedicated orders counts
3. **`/quotes/page-data`**
4. Coalesced refetch on orders + quotes + completed
5. **`/leads` + `/sales` page-data**
6. Session memoization
7. SWR / pagination when data volume justifies it
