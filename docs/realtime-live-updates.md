# Realtime Live Updates — Pattern Guide

How BazaarPrinting CRM implements instant UI updates without polling.
Follow this guide when adding Realtime to any new entity (orders, customers, tickets, etc.).

---

## How It Works — Full Architecture

```
User A makes a DB change (SDR claims a lead)
  │
  ▼
API route (POST /api/leads/[id]/lock)
  │  uses createAdminClient() — service role, bypasses RLS
  │
  ▼
Supabase DB — leads table UPDATE
  │  WAL (Write-Ahead Log) detects the change
  │
  ▼
Supabase Realtime Server
  │  • reads the change from the publication
  │  • for each subscribed browser session:
  │    – runs the table's RLS SELECT policy with that user's JWT
  │    – if RLS passes → sends the event over WebSocket
  │    – if RLS fails → silently drops (no error, no log)
  │
  ▼
User B's browser (admin watching the leads page)
  └── sidebar.tsx holds the WebSocket subscription
        │
        ├── fetchBadges() → GET /api/sidebar-counts → updates sidebar badge
        └── dispatchEvent("bazaar:leads-changed")
              │
              └── leads-page.tsx (and sales-page.tsx) hear the event
                    └── silent re-fetch → table updates in place, no skeleton
```

**Total time from DB write to UI update: ~100–500ms over a normal connection.**

---

## Layer 1 — Database Setup (3 SQL steps, all required)

### Step 1 — `REPLICA IDENTITY FULL`

By default Postgres only includes the primary key in UPDATE/DELETE WAL events.
`REPLICA IDENTITY FULL` includes the entire old row — required for Supabase Realtime
to send complete payloads.

```sql
ALTER TABLE public.orders REPLICA IDENTITY FULL;
```

### Step 2 — Add to the `supabase_realtime` publication

Realtime only broadcasts tables that are in this publication.

```sql
ALTER PUBLICATION supabase_realtime ADD TABLE public.orders;
```

Also enable the **Realtime toggle** in the Supabase Dashboard:
`Table Editor → orders → Realtime: ON`
The SQL migration handles the publication but the dashboard toggle is also required.

### Step 3 — Grant `SELECT` to `authenticated` role

**This is the step most often missed.** Supabase Realtime checks RLS per-subscriber
by running a `SELECT` query with the subscriber's JWT. If the `authenticated` role
doesn't have table-level `SELECT` permission, that query fails and ALL events are
silently dropped — even when the WebSocket shows `SUBSCRIBED`.

```sql
GRANT SELECT ON public.orders TO authenticated;
```

> Tables created via raw SQL migrations do NOT automatically get this grant.
> Only tables created through the Supabase Dashboard get it by default.

### Full migration example

```sql
-- 039_enable_orders_realtime.sql

ALTER TABLE public.orders REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.orders;
GRANT SELECT ON public.orders TO authenticated;
```

---

## Layer 2 — RLS Policies (Critical: inline subqueries only)

### ⚠️ The `SECURITY DEFINER` trap — most common Realtime bug

When Supabase Realtime evaluates RLS for a subscriber, it runs in a special
PostgreSQL session context where the JWT claims are set as session variables
(`request.jwt.claims`). The `auth.uid()` function reads from these session
variables — **but only when called directly in the caller's security context.**

`SECURITY DEFINER` functions execute as the function owner (`postgres`), NOT as
the calling role. In the `postgres` context, `request.jwt.claims` is not accessible,
so `auth.uid()` returns `NULL`. Any RLS policy that calls a `SECURITY DEFINER`
function will always evaluate to `FALSE` for Realtime subscribers, silently dropping
every event.

**This project's `current_user_role()` helper is `SECURITY DEFINER` — never use it in
policies on Realtime-enabled tables.**

```sql
-- ❌ BROKEN for Realtime — current_user_role() is SECURITY DEFINER
--    auth.uid() inside it returns NULL → policy = FALSE → all events dropped
CREATE POLICY "admin_read_all_orders" ON public.orders
  FOR SELECT USING (public.current_user_role() = 'admin');

-- ✅ CORRECT for Realtime — inline EXISTS subquery
--    runs in caller's security context → auth.uid() resolves correctly
CREATE POLICY "admin_read_all_orders" ON public.orders
  FOR SELECT USING (
    EXISTS (
      SELECT 1
      FROM public.user_profiles up
      JOIN public.roles r ON r.id = up.role_id
      WHERE up.id = auth.uid()
        AND r.name = 'admin'
    )
  );
```

### Standard RLS policy templates for Realtime tables

```sql
-- Admin: sees everything
CREATE POLICY "admin_read_all_orders" ON public.orders
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.user_profiles up
      JOIN public.roles r ON r.id = up.role_id
      WHERE up.id = auth.uid() AND r.name = 'admin'
    )
  );

-- SDR: sees all orders (data filtering at the API layer)
CREATE POLICY "sdr_read_all_orders" ON public.orders
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.user_profiles up
      JOIN public.roles r ON r.id = up.role_id
      WHERE up.id = auth.uid() AND r.name = 'sdr'
    )
  );

-- Sales: sees only orders assigned to them
CREATE POLICY "sales_read_own_orders" ON public.orders
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.user_profiles up
      JOIN public.roles r ON r.id = up.role_id
      WHERE up.id = auth.uid() AND r.name = 'sales'
    )
    AND assigned_to_id = auth.uid()
  );

-- UPDATE: any authenticated user (actual permission checked in API route)
CREATE POLICY "authenticated_update_orders" ON public.orders
  FOR UPDATE USING (auth.uid() IS NOT NULL);

-- INSERT: restricted roles only
CREATE POLICY "sdr_admin_insert_orders" ON public.orders
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_profiles up
      JOIN public.roles r ON r.id = up.role_id
      WHERE up.id = auth.uid() AND r.name IN ('sdr', 'admin')
    )
  );
```

> The `user_profiles` inline subquery works because the `users_read_own_profile`
> RLS policy allows `WHERE up.id = auth.uid()` — every user can read their own profile row.

---

## Layer 3 — Subscription in `sidebar.tsx`

### ⚠️ The JWT timing trap — second most common Realtime bug

The Supabase Realtime WebSocket handshake happens at the moment `.subscribe()` is called.
If no JWT is present at that exact moment, the server accepts the connection but marks
it as unauthenticated. Every subsequent RLS check evaluates `auth.uid()` → `NULL` →
all events are silently dropped. The subscription status still shows `SUBSCRIBED` —
there is no error.

**Rule: always call `.subscribe()` inside `getSession().then()`, never synchronously.**

```typescript
// ❌ BROKEN — .subscribe() fires before getSession() resolves
//    channel opens WITHOUT a JWT, Realtime marks it unauthenticated
const supabase = createClient();
supabase.auth.getSession().then(({ data: { session } }) => {
  supabase.realtime.setAuth(session!.access_token); // too late
});
const channel = supabase                            // subscribes NOW with no JWT
  .channel("orders-realtime")
  .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, handler)
  .subscribe();

// ✅ CORRECT — .subscribe() called after JWT is confirmed present
const supabase = createClient();
supabase.auth.getSession().then(({ data: { session } }) => {
  if (!session) return;
  const channel = supabase
    .channel("orders-realtime")
    .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, handler)
    .subscribe();
});
```

### Complete subscription template (sidebar.tsx pattern)

```typescript
// Inside the badge useEffect in sidebar.tsx
// Add a new channel block inside the getSession().then() callback:

supabase.auth.getSession().then(({ data: { session } }) => {
  if (cancelled || !session) return;

  // Existing leads channel is already here ...

  // Add orders channel:
  const ordersChannel = supabase
    .channel("orders-realtime")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "orders" },
      (payload) => {
        console.log("[Realtime] orders event:", payload.eventType, payload);
        fetchBadges();
        window.dispatchEvent(new Event("bazaar:orders-changed"));
      }
    )
    .subscribe((status, err) => {
      console.log("[Realtime] orders-realtime status:", status, err ?? "");
    });

  // Store ref for cleanup (follow the existing pattern in sidebar.tsx)
  (supabase as unknown as Record<string, unknown>)["_sidebarOrdersCh"] = ordersChannel;
});

// Add to the cleanup return function:
if (refs["_sidebarOrdersCh"]) {
  supabase.removeChannel(refs["_sidebarOrdersCh"] as Parameters<typeof supabase.removeChannel>[0]);
  delete refs["_sidebarOrdersCh"];
}
```

---

## Layer 4 — Page Consumer

Any page showing data from the subscribed table listens for the custom browser event
and does a **silent re-fetch** — no loading skeleton, data swaps in place.

### Pattern A — Simple (no drawer)

```typescript
useEffect(() => {
  function onOrdersChanged() {
    fetch("/api/orders")
      .then((r) => r.json())
      .then((d) => { setOrders(d.orders ?? []); })
      .catch(() => {});
  }
  window.addEventListener("bazaar:orders-changed", onOrdersChanged);
  return () => window.removeEventListener("bazaar:orders-changed", onOrdersChanged);
}, [activeTab, search]); // re-register when filter state changes
```

### Pattern B — Drawer-aware (skip refresh when user is actively editing)

```typescript
const pendingRefresh = useRef(false);

useEffect(() => {
  function onOrdersChanged() {
    if (drawerOrder) {
      // User has a drawer open — don't interrupt them, refresh later
      pendingRefresh.current = true;
      return;
    }
    fetch("/api/orders")
      .then((r) => r.json())
      .then((d) => { setOrders(d.orders ?? []); })
      .catch(() => {});
  }
  window.addEventListener("bazaar:orders-changed", onOrdersChanged);
  return () => window.removeEventListener("bazaar:orders-changed", onOrdersChanged);
}, [drawerOrder, activeTab, search]); // drawerOrder in deps — re-registers when drawer state changes

// Flush deferred refresh when drawer closes
function handleDrawerClose() {
  setDrawerOrder(null);
  if (pendingRefresh.current) {
    pendingRefresh.current = false;
    fetchOrders(); // full re-fetch now that it's safe
  }
}
```

### Rules for the silent re-fetch
- **Do NOT call `setLoading(true)`** — that shows the full skeleton, which is jarring for a background refresh
- **Do NOT call the main `fetchX()` function** if it sets loading state — do an inline fetch instead
- Dispatch `window.dispatchEvent(new Event("bazaar:refresh-counts"))` after any action that changes count-relevant data

---

## Sidebar Badge Integration

If the new entity needs a badge count in the sidebar, add it to `app/api/sidebar-counts/route.ts`:

```typescript
// Count of orders waiting for action — shown on /orders nav item
roleName === "admin" || roleName === "sales"
  ? admin
      .from("orders")
      .select("*", { count: "exact", head: true })
      .eq("status", "Processing")
      .then(({ count }) => { counts["/orders"] = count ?? 0; })
  : Promise.resolve(),
```

The sidebar already renders `badge={badgeCounts[page.route]}` on every nav item —
no changes needed to the sidebar UI.

---

## Step-by-Step Checklist for a New Entity

Copy this checklist when adding Realtime to a new table:

```
[ ] 1. Create migration NNN_enable_ENTITY_realtime.sql:
         ALTER TABLE public.ENTITY REPLICA IDENTITY FULL;
         ALTER PUBLICATION supabase_realtime ADD TABLE public.ENTITY;
         GRANT SELECT ON public.ENTITY TO authenticated;

[ ] 2. Enable the Realtime toggle in Supabase Dashboard:
         Table Editor → ENTITY table → Realtime: ON

[ ] 3. Write RLS SELECT policies using inline EXISTS subqueries.
         NEVER use current_user_role() or any SECURITY DEFINER function.
         Use the templates in Layer 2 above.

[ ] 4. In sidebar.tsx, add a new channel INSIDE the getSession().then() block.
         Follow the template in Layer 3 above.
         Add the cleanup ref pattern for the new channel.

[ ] 5. In the entity list page, add a window event listener:
         - Use Pattern A (simple) if no drawer
         - Use Pattern B (drawer-aware) if the page has a drawer/modal
         Include activeTab and search in the useEffect deps array.

[ ] 6. If the entity needs a sidebar badge:
         Add a count query to app/api/sidebar-counts/route.ts

[ ] 7. Update docs/CHANGELOG.md with all changed files.

[ ] 8. Update this document if the pattern evolved.
```

---

## Debugging Checklist

If Realtime is SUBSCRIBED but no events arrive, work through these in order:

### DB checks (run in Supabase SQL editor)

```sql
-- 1. Is the table in the publication?
SELECT tablename FROM pg_publication_tables
WHERE pubname = 'supabase_realtime';
-- Expected: your table name appears

-- 2. Is REPLICA IDENTITY set to FULL?
SELECT relname, relreplident FROM pg_class WHERE relname = 'your_table';
-- Expected: relreplident = 'f'  (f = FULL, d = DEFAULT = broken)

-- 3. Does authenticated have SELECT?
SELECT grantee, privilege_type FROM information_schema.role_table_grants
WHERE table_name = 'your_table' AND grantee = 'authenticated';
-- Expected: a row with privilege_type = 'SELECT'

-- 4. Check the RLS policies
SELECT policyname, cmd, qual FROM pg_policies
WHERE tablename = 'your_table' ORDER BY policyname;
-- Expected: SELECT policies that use auth.uid() directly (no SECURITY DEFINER calls)
```

### Browser checks

Open DevTools → Console on the page that should receive events.

```
[Realtime] session ready, opening channels uid=...   ← session was present before subscribe
[Realtime] leads-realtime status: SUBSCRIBED         ← channel is connected
[Realtime] leads event: UPDATE { ... }               ← event is being delivered
```

| Symptom | Likely cause | Fix |
|---------|-------------|-----|
| `TIMED_OUT` or `CHANNEL_ERROR` | WebSocket can't connect | Check Supabase project Realtime is enabled |
| `SUBSCRIBED` but no events | RLS dropping events | Check all 4 DB queries above |
| `SUBSCRIBED` + events in console but page doesn't update | Event listener issue | Check `window.addEventListener` is set up and the event name matches |
| "session ready" log missing | `.subscribe()` called before `getSession()` resolved | Move channel setup inside `getSession().then()` |
| Events fire once then stop | JWT expired, channel not refreshed | Verify `createBrowserClient` singleton is used (not `createClient` from raw `@supabase/supabase-js`) |

---

## What NOT to do

```typescript
// ❌ Don't call setAuth manually — createBrowserClient handles JWT automatically
supabase.realtime.setAuth(token);

// ❌ Don't subscribe synchronously at module level — session not loaded yet
const channel = supabase.channel("x").on(...).subscribe();

// ❌ Don't use current_user_role() in RLS policies on Realtime tables
CREATE POLICY ... USING (current_user_role() = 'admin');

// ❌ Don't call setLoading(true) in the Realtime handler — shows skeleton
function onLeadsChanged() { setLoading(true); fetchLeads(); }

// ❌ Don't forget to clean up channels — causes WebSocket leaks
// (missing removeChannel in useEffect cleanup)
```

---

## Existing Implementations

| Entity | Migration(s) | Channel name | Browser event | Page consumers |
|--------|-------------|-------------|---------------|----------------|
| `leads` | `035_enable_leads_realtime.sql`<br>`037_grant_realtime_select.sql`<br>`038_fix_leads_rls_for_realtime.sql` | `leads-realtime` | `bazaar:leads-changed` | `leads-page.tsx`, `sales-page.tsx` |
| `activities` | `036_enable_activities_realtime.sql`<br>`037_grant_realtime_select.sql` | `activities-realtime` | `bazaar:activities-changed` | `activity-log-section.tsx` |
| `job_tickets` | `047_enable_job_tickets_realtime.sql` | `tickets-realtime` (sidebar) + `quotes-page-tickets` (quotes-page direct) | `bazaar:tickets-changed` | `quotes-page.tsx` (also has own direct channel), `orders-page.tsx`, `quote-detail.tsx` |

---

---

## Direct-Channel Pattern (page-level subscription)

For pages where cross-session updates are critical (e.g. multi-user coordination), a page component can open its **own** Supabase channel directly instead of relying on sidebar → window event dispatch. This is used in `quotes-page.tsx` so that when a Sales user claims a routed quote, other Sales users see it disappear immediately without needing the sidebar to relay the event.

```typescript
// Inside a page component
useEffect(() => {
  const supabase = createClient();
  const channel = supabase
    .channel("quotes-page-tickets")          // unique channel name per page
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "job_tickets" },
      () => {
        fetchQuotes(true);   // silent re-fetch (no skeleton)
        fetchCounts();
      }
    )
    .subscribe();
  return () => { supabase.removeChannel(channel); };
}, [fetchQuotes, fetchCounts]);
```

**When to use this pattern:** When the sidebar relay is insufficient — e.g. the page needs to react to changes made by *other users* in near-real-time and there is no intermediate event dispatcher available in the same session.

---

## Lessons Learned (from leads Realtime debugging, May 2026)

Two separate bugs were discovered when implementing Realtime on the `leads` table.
Both caused the same symptom: subscription shows `SUBSCRIBED` but zero events arrive.

### Bug 1 — RLS policies used `SECURITY DEFINER` functions

The `admin_read_all_leads`, `sdr_read_all_leads`, and `sales_read_routed_leads`
policies all called `current_user_role()`, which is a `SECURITY DEFINER` function.
In the Supabase Realtime evaluation context, this caused `auth.uid()` to return `NULL`,
making every policy evaluate to `FALSE`. All events were silently dropped.

**Fix:** `038_fix_leads_rls_for_realtime.sql` — replaced all three policies with
inline `EXISTS` subqueries that call `auth.uid()` directly.

### Bug 2 — Channels subscribed before JWT was present

The sidebar's `useEffect` called `.subscribe()` synchronously while
`supabase.auth.getSession()` was still pending. The channels opened without a JWT,
and the explicit `supabase.realtime.setAuth()` call that followed was too late —
the handshake had already happened without auth.

**Fix:** `components/sidebar.tsx` — moved all `.channel().subscribe()` calls inside
the `getSession().then()` callback. Removed the manual `setAuth` and `onAuthStateChange`
calls since `createBrowserClient` handles JWT lifecycle automatically.
