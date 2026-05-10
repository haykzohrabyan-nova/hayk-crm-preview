# Feature Spec — Lead Locking (Soft Lock / Permanent Ownership)

When an SDR clicks Verify, the lead is **permanently assigned** to them. It stays off other SDRs' queues until the SDR routes it to Sales, rejects it, or an admin force-releases it. Closing the drawer no longer releases the lead.

---

## Why Locking Is Needed

With multiple SDRs working concurrently, locking serves two purposes:

1. **Permanent ownership (primary):** When an SDR clicks Verify, `locked_by_id` is set to their user ID and stays set. The lead is hidden from all other SDRs' queues. The SDR is the sole responsible party for the lead — through Hold, Resume, Validate, and all the way to Route to Sales or Reject.

2. **Race-condition protection (safety net):** If an SDR's page is stale (loaded before another SDR claimed a lead), they may still see it. When they click Verify, `POST /api/leads/[id]/lock` returns `409` and the drawer opens read-only with a banner — preventing a conflicting edit.

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
SDR loads All Leads tab
      │
      ▼
GET /api/leads/workspace
      │
      └── Server filters: locked_by_id IS NULL OR locked_by_id = currentUserId
          (Admin skips this filter — sees all leads + locked_by name in each row)

SDR clicks Verify on a lead
      │
      ▼
POST /api/leads/[id]/lock  (also sets sdr_id = userId)
      │
      ├── Lead unlocked? ──────────────────────────── Grant ownership
      │                                               (locked_by_id = user, locked_at = now(),
      │                                                sdr_id = user)
      │                                               → Drawer opens in EDIT mode
      │
      ├── Locked by same user? ────────────────────── Refresh locked_at
      │   (page refresh / reconnect)                  → Drawer opens in EDIT mode
      │
      └── Locked by different user? ──────────────── Return 409 with locker info
          (race condition — stale page)               → Drawer opens in READ-ONLY mode
                                                      → Banner: "Jane is working this lead"
                                                      → On close/refresh: lead disappears from queue

Admin clicks View on a lead
      │
      ▼
No lock call — drawer opens directly in READ-ONLY mode
      │
      └── No lock acquired, active SDR is undisturbed

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

### Admin View Mode

Admin opens leads via a **View** action that does **not** call the lock endpoint. The drawer opens directly in read-only mode. The active SDR's lock is completely undisturbed — they keep edit access.

Admin can inspect all fields and the lead history without interfering with the SDR's work.

> **Future — Admin Edit Override:** If admin needs to edit a locked lead, a dedicated "Edit" action would call `POST /api/leads/[id]/lock` (which always grants admin the lock), take over the lock, and show a banner: `[ShieldIcon] This lead is locked by Jane Smith — you are overriding as Admin`. The original holder's next save attempt would receive a `409`. This is deferred to a future build.

---

## Client Implementation

### Lock on Open

`POST /api/leads/[id]/lock` is called immediately when the SDR clicks Verify (before the drawer opens):

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
| SDR closes drawer | Ownership stays — lead remains hidden from others |
| SDR clicks Save | Ownership stays |
| SDR validates (Pending → Validated) | Ownership stays — lead updates in place in SDR's queue |
| SDR puts lead on Hold | Ownership stays — lead visible in SDR's Hold tab |
| SDR resumes from Hold | Ownership stays |

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

Lock acquisition (`lead_claimed`) and reassignment (`lead_reassigned`) **are** logged in the `activities` table — see `docs/feature-specs/activity.md`. The unlock operation itself (route/reject already has its own activity entry) is not logged separately.

---

## Concurrency Edge Case

If User A and User B both call `POST /api/leads/[id]/lock` at the exact same millisecond, the first write wins due to Postgres's row-level serialization. The loser receives a `409`.
