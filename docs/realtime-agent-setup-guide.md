# Supabase Realtime — Setup & How It Works

**Purpose:** General guide for implementing **live multi-user UI updates** with **Next.js App Router + Supabase**. Hand this to another developer or an AI agent on a **different** project.

**Core idea:** When User A saves to Postgres, User B’s screen updates automatically — without polling — using Supabase Realtime (WebSocket) plus a silent data refetch.

---

## ⚠️ For AI agents — read this first

**Do not put Realtime subscriptions in a sidebar, navigation bar, or menu component** unless the user’s project **explicitly** asks for that and already has such a component.

This guide’s recommended approaches are:

1. **Pattern A** — subscribe on the **list/detail page** that shows the data (simplest default).
2. **Pattern B** — a dedicated **`RealtimeProvider`** mounted in the **root authenticated layout** (`app/(app)/layout.tsx` or equivalent).

Some codebases (including BazaarPrinting CRM) happen to wire Realtime through a sidebar. That is **legacy project-specific wiring**, not a pattern to copy. If you see `sidebar.tsx` in a reference repo, **ignore it** unless the target project has the same structure and the user requested it.

**Also do not assume:** nav badge counts, custom `bazaar:*` event prefixes, or any folder paths from a reference repo.

---

## How it works (plain English)

```
┌─────────────┐     POST/PATCH      ┌──────────────┐
│   User A    │ ──────────────────► │  API route   │
│  (browser)  │                     │  (Next.js)   │
└─────────────┘                     └──────┬───────┘
                                           │ writes
                                           ▼
                                    ┌──────────────┐
                                    │   Postgres   │
                                    │  (Supabase)  │
                                    └──────┬───────┘
                                           │ WAL change
                                           ▼
                                    ┌──────────────┐
                                    │   Realtime   │
                                    │   server     │
                                    └──────┬───────┘
                                           │ WebSocket
                                           │ (per subscribed browser)
                                           ▼
┌─────────────┐   silent refetch    ┌──────────────┐
│   User B    │ ◄────────────────── │ List / detail│
│  (browser)  │   GET /api/...      │    page      │
└─────────────┘                     └──────────────┘
```

**Step by step:**

1. **User A** triggers a mutation (form save, button click). Your **Route Handler** writes to Postgres (often with the service role; RLS may be bypassed on the server).
2. Postgres records the change in its **write-ahead log (WAL)**.
3. Supabase **Realtime** reads tables in the `supabase_realtime` **publication** and pushes `postgres_changes` events over a **WebSocket**.
4. For **each connected browser**, Realtime runs that user’s **RLS SELECT policies** with their JWT. If they’re allowed to see the row → event delivered. If not → **silently dropped** (no error in the UI).
5. **User B’s** client receives the event and **refetches data from your API** (recommended) or updates local state. The UI refreshes in ~100–500 ms.

**Important:** Realtime tells you *something changed*; your API still owns *what to show* (joins, filters, permissions, business rules).

---

## What you need (tech stack)

| Piece | Role |
|-------|------|
| **Next.js App Router** | Route Handlers for mutations + data reads |
| **Supabase Postgres** | Source of truth |
| **Supabase Auth** | JWT per user (required for Realtime + RLS) |
| **`@supabase/ssr`** | `createBrowserClient` in client components |
| **Client components** | WebSocket subscriptions (`"use client"`) |

**Env vars (typical):**

- Browser: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- Server only: `SUPABASE_SECRET_KEY` (never in client code)

---

## Part 1 — Database setup (every Realtime table)

Three SQL steps. **All are required.** Missing any one causes `SUBSCRIBED` with zero events.

```sql
-- supabase/migrations/NNN_enable_YOUR_TABLE_realtime.sql

ALTER TABLE public.your_table REPLICA IDENTITY FULL;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.your_table;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

GRANT SELECT ON public.your_table TO authenticated;
```

| Step | What it does |
|------|----------------|
| **`REPLICA IDENTITY FULL`** | UPDATE/DELETE events include the full old row (not just the primary key). |
| **Add to `supabase_realtime` publication** | Realtime only broadcasts published tables. |
| **`GRANT SELECT TO authenticated`** | Realtime evaluates RLS as the `authenticated` role. Without table-level SELECT, **every event is dropped**. |

Also turn on **Realtime** in Supabase Dashboard: Table Editor → your table → Realtime **ON**.

**Verify:**

```sql
-- In publication?
SELECT tablename FROM pg_publication_tables WHERE pubname = 'supabase_realtime';

-- Replica identity FULL?  ('f' = full)
SELECT relname, relreplident FROM pg_class WHERE relname = 'your_table';

-- Grant present?
SELECT grantee, privilege_type FROM information_schema.role_table_grants
WHERE table_name = 'your_table' AND grantee = 'authenticated';
```

---

## Part 2 — RLS (why events disappear)

Realtime delivery is **per subscriber** and uses your table’s **SELECT** policies.

- User can `SELECT` the row → they get the WebSocket event.
- User cannot `SELECT` the row → event is **dropped silently**.
- WebSocket status still shows **`SUBSCRIBED`** — that only means the channel connected, not that events will arrive.

### Critical rule: no `SECURITY DEFINER` helpers in SELECT policies

Supabase Realtime sets JWT claims in a special session context. Functions marked `SECURITY DEFINER` run as `postgres`, where `auth.uid()` is often **NULL** → policy always false → no events.

```sql
-- ❌ Often broken for Realtime
CREATE POLICY "admin_read" ON public.orders
  FOR SELECT USING (public.get_user_role() = 'admin');  -- SECURITY DEFINER

-- ✅ Realtime-safe
CREATE POLICY "admin_read" ON public.orders
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'admin'
    )
  );
```

Use **inline** `auth.uid()` and `EXISTS` subqueries in policies on Realtime-enabled tables.

### Scoped visibility example

If sales users should only see their own rows:

```sql
CREATE POLICY "sales_read_own" ON public.orders
  FOR SELECT USING (
    assigned_to = auth.uid()
  );
```

Other users editing “shared queue” rows may stop receiving updates after a row moves out of their SELECT scope. Common fix: also subscribe to an **audit/activity** table (`INSERT` on `activities`) and treat that as a refresh signal.

---

## Part 3 — Browser Supabase client

```typescript
// lib/supabase/client.ts
import { createBrowserClient } from "@supabase/ssr";

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
  );
}
```

Use only in **client components**. Server mutations use a separate admin/service client in Route Handlers.

---

## Part 4 — Subscribe to Postgres changes

### Minimal subscription

```typescript
"use client";

import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";

export function OrdersRealtimeListener({ onChange }: { onChange: () => void }) {
  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;

    // ⚠️ MUST wait for session before .subscribe()
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (cancelled || !session) return;

      const channel = supabase
        .channel("orders-changes")
        .on(
          "postgres_changes",
          {
            event: "*",              // or "INSERT" | "UPDATE" | "DELETE"
            schema: "public",
            table: "orders",
          },
          (payload) => {
            console.log("[Realtime]", payload.eventType, payload);
            onChange();              // trigger refetch (debounced — see Part 5)
          }
        )
        .subscribe((status, err) => {
          console.log("[Realtime] status:", status, err ?? "");
        });

      (supabase as unknown as Record<string, unknown>)["_ch"] = channel;
    });

    return () => {
      cancelled = true;
      const refs = supabase as unknown as Record<string, unknown>;
      if (refs["_ch"]) {
        supabase.removeChannel(
          refs["_ch"] as Parameters<typeof supabase.removeChannel>[0]
        );
      }
    };
  }, [onChange]);

  return null;
}
```

### JWT timing (most common frontend bug)

| When you call `.subscribe()` | What happens |
|------------------------------|--------------|
| Before `getSession()` returns a JWT | Channel opens **unauthenticated** → RLS fails → no events |
| Inside `getSession().then()` when `session` exists | Correct |

With `createBrowserClient`, you usually **do not** need manual `realtime.setAuth()`.

### Filter options (optional)

```typescript
.on("postgres_changes", {
  event: "UPDATE",
  schema: "public",
  table: "orders",
  filter: "status=eq.pending",   // only this subset
}, handler)
```

---

## Part 5 — Update the UI when an event arrives

You have **three valid patterns**. Pick based on app structure.

### Pattern A — Subscribe on the same page (simplest)

Best for: one list page, no global layout, small apps.

The page that displays data also holds the Realtime subscription. On event → call `fetchData(true)` (silent, no loading spinner).

```typescript
// Inside orders-page.tsx
const fetchOrders = useCallback(async (silent = false) => {
  if (!silent) setLoading(true);
  const r = await fetch("/api/orders");
  const d = await r.json();
  setOrders(d.orders);
  if (!silent) setLoading(false);
}, []);

useEffect(() => {
  const supabase = createClient();
  let cancelled = false;

  supabase.auth.getSession().then(({ data: { session } }) => {
    if (cancelled || !session) return;

    const channel = supabase
      .channel("orders-page")
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, () => {
        fetchOrders(true);
      })
      .subscribe();

    (supabase as unknown as Record<string, unknown>)["_ch"] = channel;
  });

  return () => { /* removeChannel */ };
}, [fetchOrders]);
```

**Pros:** Easy to reason about, no global wiring.  
**Cons:** New subscription per page visit; duplicate channels if many pages watch the same table.

---

### Pattern B — Central provider in layout (recommended for medium/large apps)

Best for: many pages care about the same tables; you want one WebSocket per table per tab.

1. Create a **`RealtimeProvider`** client component (see below).
2. Mount it **once** in your authenticated layout — e.g. `app/(app)/layout.tsx` wrapping `{children}`. It must stay mounted while the user is logged in.
3. Provider opens channels and notifies pages via **window events**, **React context**, or a small event emitter.
4. List pages listen and silently refetch.

**Where to mount (pick one that fits the project):**

```tsx
// app/(app)/layout.tsx — typical Next.js App Router
import { RealtimeProvider } from "@/components/realtime-provider";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <RealtimeProvider>
      {children}
    </RealtimeProvider>
  );
}
```

Do **not** default to sidebar/nav — use layout or the page itself (Pattern A).

```typescript
// components/realtime-provider.tsx
"use client";

import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";

export function RealtimeProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (cancelled || !session) return;

      supabase
        .channel("orders-realtime")
        .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, () => {
          window.dispatchEvent(new Event("app:orders-changed"));
        })
        .subscribe();
    });

    return () => { cancelled = true; /* removeChannel per channel */ };
  }, []);

  return <>{children}</>;
}
```

```typescript
// On any list page
useEffect(() => {
  function refresh() { fetchOrders(true); }
  window.addEventListener("app:orders-changed", refresh);
  return () => window.removeEventListener("app:orders-changed", refresh);
}, [fetchOrders]);
```

**Pros:** One subscription hub; pages stay decoupled.  
**Cons:** Slightly more plumbing (event names or context).

---

### Pattern C — Refetch only; no global bus

Best for: detail views, dashboards with one data source.

Subscribe in the component that owns the data; call refetch directly in the handler (Pattern A without sharing). No window events needed.

---

### Debouncing burst events

One save can fire multiple WAL events. Debounce refetches (~300 ms):

```typescript
function useDebouncedCallback(fn: () => void, delayMs = 300) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  return useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(fn, delayMs);
  }, [fn, delayMs]);
}

// In Realtime handler:
debouncedRefetch();  // not fetchOrders() directly
```

A reusable hook (e.g. `useListPageData` / stale-while-revalidate) can combine: mount fetch + in-memory cache + window event listeners + **separate delays** for navigation cache (e.g. 300ms) vs realtime (0ms) + optional “pause while user is editing a modal”. Implement one in your project or copy the logic — do not depend on a reference repo’s file paths.

---

## Part 6 — Silent refetch rules

When Realtime triggers an update, **do not** flash the full-page skeleton.

```typescript
async function fetchData(silent = false) {
  if (!silent) setLoading(true);   // only on first load / filter change
  try {
    const data = await fetch("/api/orders").then(r => r.json());
    setRows(data.orders);
  } finally {
    if (!silent) setLoading(false);
  }
}
```

**Pause refresh while the user edits** (optional but good UX): skip Realtime refetch while a drawer/modal is open in edit mode; refetch silently when they close it.

**After the current user’s own mutation:** you can refetch immediately in the success handler — you don’t have to wait for Realtime. Realtime is mainly for **other users’** changes.

---

## Part 7 — API layer (unchanged)

Realtime does **not** replace your API.

- **Writes:** `POST` / `PATCH` / `DELETE` Route Handlers → Supabase admin or user client.
- **Reads:** `GET` Route Handlers → return list/detail JSON the UI already uses.
- Realtime handler → call the same `GET` again with `silent: true`.

Using service role in API routes is fine; Realtime still respects **each browser user’s** RLS when fanning out events.

---

## End-to-end checklist

```
Database
[ ] REPLICA IDENTITY FULL on table
[ ] Table added to supabase_realtime publication
[ ] GRANT SELECT TO authenticated
[ ] Dashboard Realtime toggle ON
[ ] SELECT RLS policies use inline auth.uid() (no SECURITY DEFINER in policies)

Frontend
[ ] createBrowserClient in lib/supabase/client.ts
[ ] .subscribe() only after getSession() confirms JWT
[ ] removeChannel in useEffect cleanup
[ ] Pattern A (page-level) OR Pattern B (RealtimeProvider in layout) — NOT sidebar unless explicitly requested
[ ] Silent refetch on event (no setLoading(true))
[ ] Debounce ~300ms if many events per action

Verification
[ ] Two browsers, two users: A saves, B updates without F5
[ ] Console: SUBSCRIBED + payload logs on change
[ ] If SUBSCRIBED but no events → check DB grants + RLS (not React)
```

---

## Debugging

### Symptom → likely cause

| Symptom | Check |
|---------|--------|
| `SUBSCRIBED`, never fires | Missing `GRANT SELECT`, table not in publication, or RLS blocks SELECT |
| Fires for admin, not for role X | That role’s SELECT policy too narrow or uses SECURITY DEFINER |
| Worked until row “moved” (claim, assign) | Row left user’s SELECT scope — add audit-table subscription |
| Console events, UI stale | Refetch not wired or wrong event name |
| Never “session ready” | Subscribed before JWT loaded |
| Events stop after a while | Channel leak — missing cleanup |

### Console logs to add temporarily

```typescript
.subscribe((status, err) => console.log("[Realtime]", status, err));
// in handler:
console.log("[Realtime] event", payload.eventType, payload.new);
```

---

## What not to do

```typescript
// ❌ Poll instead of Realtime
setInterval(fetchOrders, 5000);

// ❌ Subscribe at import time (no auth yet)
const ch = supabase.channel("x").on(...).subscribe();

// ❌ Push Realtime payload straight into complex list state
setOrders(prev => mergeRow(prev, payload.new));  // fragile vs API joins/filters

// ❌ Full loading skeleton on every Realtime event
onRealtime(() => { setLoading(true); fetchOrders(); });

// ❌ SECURITY DEFINER in SELECT policies on Realtime tables

// ❌ Put subscriptions in sidebar/nav by default (use layout provider or page-level instead)
```

---

## Optional appendix — one reference codebase (do not copy blindly)

BazaarPrinting CRM uses the same Supabase Realtime stack. **Its wiring is not the template for other projects.**

| What | BazarCRM did (example only — do not assume) |
|------|---------------------------------------------|
| Where subscriptions live | Inside `sidebar.tsx` (nav component) — **not recommended** for new projects; use `RealtimeProvider` in layout or page-level Pattern A instead |
| Custom events | `bazaar:leads-changed`, `bazaar:refresh-counts`, etc. — use your own prefix, e.g. `app:` |
| Nav badges | Refreshes sidebar counts on Realtime — optional product feature, unrelated to Realtime setup |

If you need SQL/RLS examples only (database layer is universal):

| Topic | File in BazarCRM repo |
|-------|------------------------|
| Example migration | `supabase/migrations/083_enable_customers_realtime.sql` |
| RLS + Realtime fix | `supabase/migrations/086_job_tickets_routed_realtime_rls.sql` |
| Internal notes (BazarCRM-specific) | `docs/realtime-live-updates.md` |

**Do not copy** `components/layout/sidebar.tsx` into another project unless that project already uses the same sidebar pattern and the user asked for it.

---

## Appendix — unauthenticated pages (Broadcast, not `postgres_changes`)

Customer-facing pages (e.g. `/q/[token]`) have **no Supabase session**, so they cannot subscribe to `postgres_changes` on protected tables.

| Step | Pattern |
|------|---------|
| Server mutation | After successful write, call a helper that `channel.send({ type: 'broadcast', event: 'updated', payload: {} })` on a token-scoped channel name |
| Client page | `supabase.channel('scope:{id}').on('broadcast', { event: 'updated' }, handler).subscribe()` |
| Handler | Debounced silent `fetch` to your existing public GET API — **no polling** |
| Guard | Only broadcast when the record is in customer-visible statuses |

**BazarCRM reference:** `lib/constants/public-quote-realtime.ts`, `lib/integrations/notify-public-quote-updated.ts`, `app/(public)/q/[token]/page.tsx`, `docs/realtime-live-updates.md` (public portal section).

When adding a new staff mutation that changes customer-visible data, wire the broadcast at the end of the route handler.

---

## Copy-paste prompt for an AI agent

> Set up Supabase Realtime for `{TABLE}` in our Next.js + Supabase app using `docs/realtime-agent-setup-guide.md`:
> 1. SQL migration: REPLICA IDENTITY FULL, publication, GRANT SELECT
> 2. Fix SELECT RLS policies (inline `auth.uid()`, no SECURITY DEFINER)
> 3. Add `postgres_changes` subscription after `getSession()` — **Pattern A (on the list page) or Pattern B (`RealtimeProvider` in `app/(app)/layout.tsx`)**. Do **not** use sidebar/navigation unless this project already has that pattern and I asked for it.
> 4. On event, debounced silent refetch via existing `GET /api/...` endpoint
> 5. Test with two browser sessions
>
> Do not add polling. Do not merge Realtime payloads into list state; refetch from the API. Do not copy sidebar.tsx from other repos.

---

## Summary

| Layer | Responsibility |
|-------|----------------|
| **Postgres** | Publication, replica identity, grants |
| **RLS** | Decides which users receive which WebSocket events |
| **WebSocket client** | `postgres_changes` subscription on the **page** or in a **layout `RealtimeProvider`** — not in sidebar by default |
| **UI** | Silent API refetch when something changed |
| **API** | Still owns all reads and writes |

Realtime is the **notification layer**. Your API remains the **source of truth for what the UI displays**.
