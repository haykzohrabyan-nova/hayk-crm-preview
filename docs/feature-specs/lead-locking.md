# Feature Spec — Lead Locking

Two fields on `leads` serve different roles. Do not conflate them.

| Field | Primary role | Who sets it | Released when |
|-------|----------------|-------------|---------------|
| **`locked_by_id`** | SDR **permanent claim** (open pool → my queue) | SDR **Claim** → `POST /lock`; also temp session on Sales edge cases | SDR route/reject → `POST /unlock`; admin reassign/unassign; Sales hold/follow-up clears temp lock |
| **`sales_owner_id`** | Sales **permanent assignment** | Sales **Claim** → `POST /claim` | Admin sales reassign; terminal reject (sales pipeline) |

**Manual Add Lead** does **not** set `locked_by_id` — new leads stay in the SDR open pool until **Claim** or Admin **Assign**.

---

## SDR (`/leads`) — `locked_by_id` as permanent ownership

When an SDR clicks **Claim** on an unclaimed lead, the lead is **permanently assigned** via `locked_by_id` (+ `sdr_id`). It stays off other SDRs' queues until route, reject, or admin reassign/unassign. Closing the Verify Drawer does **not** release the lock.

SDR **Follow Up Later** and **On Hold** retain `locked_by_id` through defer/resume cycles.

---

## Sales (`/sales`) — `sales_owner_id` + optional temp lock

Sales reps **claim** routed leads with `POST /api/leads/[id]/claim` (`sales_owner_id`, `lead_sales_claimed` activity). List queries hide other reps' claimed rows — assignment is exclusive without `locked_by_id`.

| Action | Lock behaviour |
|--------|----------------|
| **Claim** (unclaimed) | Sets `sales_owner_id` only — no `POST /lock` required |
| **Open** (your lead, `sales_owner_id = you`) | Opens modal in edit mode — **no** `POST /lock` |
| **Open** (edge case / stale row) | May call `POST /lock`; `409` → read-only banner |
| **Close** modal | `POST /unlock` if edit mode (idempotent when never locked) |
| **On Hold / Follow Up Later** (sales) | Server clears `locked_by_id` on hold/follow-up write |

`POST /lock` for Sales sets `locked_by_id` but does **not** set `sdr_id` or log `lead_claimed` (SDR-only activity).

---

## Why SDR locking is needed

With multiple SDRs working concurrently, locking serves two purposes:

1. **Permanent ownership (primary):** When an SDR clicks **Claim**, `locked_by_id` is set to their user ID and stays set (until route/reject/unassign). The lead is hidden from other SDRs' **All Leads** pool. The SDR is the sole responsible party — through Hold, Resume, and all the way to Route to Sales or Reject.

2. **Race-condition protection (safety net):** If an SDR's page is stale (loaded before another SDR claimed a lead), they may still briefly see it. When they click **Claim**, `POST /api/leads/[id]/lock` returns `409` and the drawer opens read-only with a banner — preventing a conflicting edit.

---

## SDR queue visibility (All Leads + Claimed Leads tabs)

SDR lead queues split **unclaimed** vs **claimed** into separate tabs:

| Tab | Filter | Action button |
|-----|--------|---------------|
| **All Leads** | `locked_by_id IS NULL` only — shared open pool | **Claim** |
| **Claimed Leads** | `locked_by_id = currentUserId` — leads I have claimed | **View** |

Leads locked by **another** SDR never appear in either tab. Tab badge count for **All Leads** = unclaimed pool size.

**In Progress** tab (`status = In Progress`): SDR sees own leads (`sdr_id = me`); Admin sees all and a **Working SDR** column.

**Admin** sees all leads on All Leads regardless of lock state; no Claimed Leads tab.

---

## Schema Fields

On the `leads` table:

| Field | Type | Purpose |
|-------|------|---------|
| `locked_by_id` | `uuid FK → public.user_profiles` | SDR who currently owns this lead |
| `locked_at` | `timestamptz` | When ownership was acquired |
| `sdr_id` | `uuid FK → auth.users` | Set alongside `locked_by_id` on lock; used by Hold/Routed/Rejected tab filters (`scope=mine`) |

All three fields are `null` when a lead is unowned/unlocked.

---

## Lock Lifecycle

```
SDR loads All Leads or Claimed Leads tab
      │
      ▼
GET /api/leads/workspace/page-data
      │
      ├── All Leads (SDR)     → locked_by_id IS NULL (open pool)
      ├── Claimed Leads (SDR) → owner_scope=mine → locked_by_id = currentUserId
      ├── In Progress         → status = In Progress; SDR: sdr_id = me; Admin: all
      └── Admin (All Leads)   → no lock filter (all leads + locked_by join)

SDR clicks Claim on an unclaimed lead
      │
      ▼
POST /api/leads/[id]/lock  (also sets sdr_id = userId when role is SDR)
      │
      ├── Lead unlocked? ──────────────────────────── Atomic write: UPDATE WHERE locked_by_id IS NULL
      │                                               OR locked_by_id = user (non-admin only)
      │                                               (locked_by_id = user, locked_at = now(),
      │                                                sdr_id = user for SDR)
      │                                               → Drawer opens in EDIT mode
      │                                               (useGlobalLoading overlay while fetching)
      │
      ├── Locked by same user? ────────────────────── Same atomic write matches (IS NULL OR = user)
      │   (page refresh / reconnect)                  Refreshes locked_at → Drawer in EDIT mode
      │
      └── Locked by different user? ──────────────── 409 from pre-check (stale page) OR from
          (stale page OR race condition)              atomic write returning 0 rows (true race)
                                                      → Drawer opens in READ-ONLY mode
                                                      → Banner: "Jane is working this lead"

SDR or Admin saves via Manual Add Lead (POST /api/leads/manual)
      │
      └── status=Pending, sdr_id=creator, locked_by_id=null
          → Lead visible in All Leads pool (All toggle) for all SDRs
          → Admin sees row immediately; can Assign to an SDR

Admin clicks Edit on a lead
      │
      ▼
No lock call — drawer opens directly in EDIT mode
      │
      └── No lock acquired, active SDR is undisturbed
          Admin can save changes via "Save Changes" button

SDR routes to Sales OR rejects (terminal actions)
      │
      ▼
POST /api/leads/[id]/unlock  (client-called after route or reject)
      │
      └── locked_by_id = null, locked_at = null, sdr_id = null
          → Lead released; visible to all SDRs again (or moved to terminal state)

Admin reassigns OR unassigns lead
      │
      ▼
POST /api/leads/[id]/reassign  { user_id: newSdrId | null }
      │
      └── locked_by_id / locked_at / sdr_id updated to new owner (or null)
```

---

## Edit Mode vs Read-Only Mode

### Edit Mode (lock holder)

- All form inputs enabled
- All action buttons visible: **Validate, Quote, Route to Sales, Hold, Reject**, etc.
- Changes saved via `PATCH /api/leads/[id]` (server re-checks lock on every write)

### Read-Only Mode (locked by another user)

- All inputs: `disabled` (grayed out, not hidden — user can still read field values)
- **Lock banner** at top of drawer:
  ```
  [LockIcon] Jane Smith (SDR) is currently working this lead
  ```
  Banner uses `var(--color-badge-bg)` background, `var(--color-badge-text)` text, with a `Lock` Lucide icon.
- Action buttons: hidden entirely (not just disabled — no false affordance)
- History tab: still accessible and fully interactive

### Admin Edit Mode

Admin opens leads via an **Edit** action that does **not** call the lock endpoint. The drawer opens directly in **edit mode**. The active SDR's lock is completely undisturbed — they keep edit access.

Admin can inspect and modify all fields and save changes via the "Save Changes" button in the drawer footer. The SDR workflow buttons (Route to Sales, Hold, Reject) are replaced with just "Close" and "Save Changes" when the viewer is admin.

No lock banner is shown to the SDR while admin is editing — admin edits are silent from the SDR's perspective. If the SDR saves their own changes at the same time, the last write wins (standard Postgres row update).

---

## Client Implementation

### Lock on Claim (SDR)

`POST /api/leads/[id]/lock` is called when the SDR clicks **Claim** on the All Leads toggle (before the drawer opens). **View** on My Leads calls the same endpoint to refresh `locked_at` (already owned — no new `lead_claimed` activity). Global loading overlay + row spinner run during lock + `GET /api/leads/[id]` fetch.

### Open owned lead (Sales)

`components/sales/sales-page.tsx` — when `sales_owner_id === currentUserId`, opens the modal without `POST /lock`. See Sales section above.

```typescript
const res = await fetch(`/api/leads/${lead.id}/lock`, { method: "POST" });
const data = await res.json();
if (res.status === 409) {
  // Race condition — open read-only with banner
  setDrawerReadOnly(true);
  setDrawerLockedBy(data.locked_by?.full_name ?? "Another user");
} else {
  setDrawerReadOnly(false);
  setDrawerLockedBy(null);
}
```

### Close Drawer — No Unlock

Closing the drawer **does not** call unlock. The ownership persists. The cleanup `useEffect` has been removed from `verify-drawer.tsx`.

```typescript
function handleClose() {
  // Soft lock: ownership stays — no unlock call
  onClose();
}
```

### When Ownership IS Released

| Trigger | How |
|---------|-----|
| SDR routes lead to Sales | Client calls `POST /api/leads/[id]/unlock` after successful PATCH |
| SDR rejects lead | Client calls `POST /api/leads/[id]/unlock` after successful PATCH |
| Admin force-releases | Admin calls `POST /api/leads/[id]/unlock` for any lead |
| Admin reassigns to another SDR | `POST /api/leads/[id]/reassign` sets `locked_by_id` to new user |

### When Ownership is NOT Released

| Trigger | Result |
|---------|--------|
| SDR closes drawer (✕ or programmatic close) | Ownership stays — lead remains hidden from others; SDR can reopen the same lead while lock is held |
| SDR clicks Save | Ownership stays |
| SDR validates (Pending → Validated) | Ownership stays — lead updates in place in SDR's queue |
| SDR puts lead on Hold or Follow Up Later | Ownership stays — lead visible on that SDR's tab only |
| SDR resumes from Hold or Follow Up Later | Ownership stays |
| Sales puts lead on Hold or Follow Up Later | `locked_by_id` cleared server-side; `sales_owner_id` unchanged |
| Sales closes modal after temp lock | Client `POST /unlock` — only when lock was acquired |

### Heartbeat (Optional — v2)

In v1, there is **no heartbeat**. If a user's browser crashes, the lock remains until:
- Admin force-releases it via `/admin`, or
- The same user reopens the lead (refreshes `locked_at`)

A background heartbeat (`PATCH locked_at every N minutes`) is a v2 enhancement.

---

## Server Implementation

Every write endpoint (`PATCH /api/leads/[id]`, `POST /api/leads/[id]/hold`, `POST /api/leads/[id]/resume`, etc.) performs a **lock check** before writing:

```typescript
// Pseudocode in Route Handler
const lead = await getLead(id)

if (lead.locked_by_id && lead.locked_by_id !== currentUserId) {
  if (currentUserRole !== 'admin') {
    return Response.json(
      { error: 'Lead is locked by another user', code: 'LEAD_LOCKED' },
      { status: 409 }
    )
  }
}
// Proceed with write...
```

---

## Admin Force-Unlock

Admin can force-release a lock from the **All Leads tab** on the `/leads` page using the **Reassign** action (shown on any lead where `locked_by_id IS NOT NULL`). Choosing "Unassign" clears `locked_by_id`, `locked_at`, and `sdr_id`, releasing the lead back to the general queue.

Alternatively, Admin can call `POST /api/leads/[id]/unlock` directly.

> **Not yet built:** A dedicated "currently locked leads" indicator on the Admin Dashboard ("X leads currently locked") is a future enhancement.

---

## Activity Logging

- **`lead_claimed`** — logged only when an **SDR** acquires lock for the **first** time (`POST /lock`, `isNewClaim`). Sales temp lock and SDR self-refresh do not log.
- **`lead_sales_claimed`** — logged on `POST /claim`.
- **`lead_reassigned`** — admin/SDR reassign.

The unlock operation itself is not logged separately (route/reject/resume have their own activity types). See `docs/feature-specs/activity.md`.

---

## Concurrency

Both `POST /api/leads/[id]/lock` and `POST /api/leads/[id]/claim` use **atomic conditional writes** to prevent race conditions.

### Lock race (two SDRs clicking Claim simultaneously)

The UPDATE is: `WHERE locked_by_id IS NULL OR locked_by_id = current_user` (non-admin callers only). Two concurrent requests both see `locked_by_id = null` at read time — but the DB serializes writes at the row level. The winner's update matches 1 row; the loser's matches 0 rows and receives `409` with the winner's name, identical to the stale-page case.

### Claim race (two sales reps clicking Claim simultaneously)

The UPDATE is: `WHERE sales_owner_id IS NULL`. Same principle — one write matches, the other gets 0 rows and returns `409 ALREADY_CLAIMED`.

Both endpoints use `.maybeSingle()` to detect the 0-row case rather than relying on a separate read before the write.
