# Feature Spec — Lead Locking

Ensures that when a user is actively working a lead (drawer open), other users cannot make conflicting edits.

---

## Why Locking Is Needed

With multiple SDRs working concurrently, locking serves two purposes:

1. **Queue filtering (primary):** Leads locked by another SDR are hidden from other SDRs' All Leads queue entirely. SDRs only see leads they can actually work. This prevents two SDRs from picking up the same lead under normal page-load conditions.

2. **Race-condition protection (safety net):** If an SDR's page is stale (loaded before another SDR claimed a lead), they may still see it. When they click Verify, `POST /api/leads/[id]/lock` returns `409` and the drawer opens read-only with a banner — preventing a conflicting edit.

---

## Schema Fields

On the `leads` table:

| Field | Type | Purpose |
|-------|------|---------|
| `locked_by_id` | `uuid FK → auth.users` | User currently holding the lock |
| `locked_at` | `timestamptz` | When the lock was acquired |

Both fields are `null` when a lead is unlocked.

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
POST /api/leads/[id]/lock
      │
      ├── Lead unlocked? ──────────────────────────── Grant lock
      │                                               (locked_by_id = user, locked_at = now())
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

User completes action OR closes drawer
      │
      ▼
POST /api/leads/[id]/unlock  (or auto-release on verify/hold/route/reject)
      │
      └── locked_by_id = null, locked_at = null
          → Lead becomes visible in other SDRs' queues on next refresh
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

In the drawer component's `useEffect` on mount:

```typescript
// Lock immediately when drawer opens
useEffect(() => {
  if (!leadId) return
  lockLead(leadId).then((result) => {
    if (result.locked) {
      setIsEditable(true)
    } else {
      setIsEditable(false)
      setLockedBy(result.locked_by)
    }
  })
  // Unlock on cleanup (drawer close)
  return () => {
    unlockLead(leadId)
  }
}, [leadId])
```

### Unlock on Close

When the drawer is dismissed (user clicks X, presses Escape, or navigates away):

```typescript
unlockLead(leadId)
```

### Auto-release on Action

After a successful `POST /api/leads/verify`, `POST /api/leads/[id]/hold`, etc., the server clears the lock. The client does not need to call unlock separately — but the cleanup `useEffect` will still run harmlessly (idempotent unlock).

### Heartbeat (Optional — v2)

In v1, there is **no heartbeat**. The lock persists until released. If a user's browser crashes, the lock remains until:
- Admin force-releases it, or
- The same user reopens the lead (refreshes `locked_at`)

A background heartbeat (`PATCH locked_at every N minutes`) is a v2 enhancement.

---

## Server Implementation

Every write endpoint (`PATCH /api/leads/[id]`, `POST /api/leads/verify`, etc.) performs a **lock check** before writing:

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

From `/admin/audit` or `/admin/users`, Admin can see all currently locked leads (query: `SELECT * FROM leads WHERE locked_by_id IS NOT NULL`). An **Unlock** button calls `POST /api/leads/[id]/unlock` with admin authority.

This should be surfaced as a small table or indicator on the Admin Dashboard too ("X leads currently locked").

---

## Activity Logging

Locking is **not** logged in the `activities` table — it is an operational concern, not a business event. Only substantive actions (status changes, edits, holds, etc.) are logged.

---

## Concurrency Edge Case

If User A and User B both call `POST /api/leads/[id]/lock` at the exact same millisecond, the first write wins due to Postgres row-level locking (`SELECT ... FOR UPDATE` in the lock handler). The loser receives a `409`.
