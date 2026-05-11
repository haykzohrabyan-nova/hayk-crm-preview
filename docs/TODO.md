# BazarCRM — Deferred TODO Items

Items that are intentionally deferred and require careful planning before building.
Each entry explains the current behaviour, the problem, the intended fix, and any future considerations.

---

## [TODO-002] Auto-set `Validated` and `Quoted` status on ticket creation

**Status:** Deferred — build during Tickets phase  
**Files affected:** `app/api/leads/[id]/route.ts` (or a new ticket creation route), `docs/schema.md`

---

### The Rule

`status` on a lead is **never set to `Validated` or `Quoted` manually**. These are system-set based on ticket creation:

| Action | `status` result |
|--------|----------------|
| SDR or Sales creates a ticket with a quote linked to this lead | `Quoted` |
| SDR or Sales creates a ticket (order only, no quote) linked to this lead | `Validated` |

### Where to implement

When the Tickets module's create-ticket endpoint (`POST /api/tickets`) is built, after inserting the `job_tickets` row, add a step:

```typescript
// Determine new lead status from ticket kind
const newLeadStatus = ticket.quote_skus?.length > 0 ? "Quoted" : "Validated";

await admin.from("leads")
  .update({ status: newLeadStatus, updated_at: now })
  .eq("id", ticket.linked_lead_id);
```

Log a `lead_status_changed` activity for the transition.

### What NOT to do
- Never add a `Validate` or `Quote` button to any SDR/Sales UI — status changes from ticket creation only.
- Do not restore a held lead to `Validated` on resume — resume always goes back to `Pending` (already fixed in `app/api/leads/[id]/resume/route.ts`).

---

## [TODO-001] Admin Override for Terminal Leads

**Status:** Deferred — build during Admin Enhancements phase  
**Files affected:** `components/sales-drawer.tsx`, `components/verify-drawer.tsx`, `app/api/leads/[id]/route.ts`

---

### The Problem

When a lead reaches a **terminal state**, the drawer becomes fully read-only for **everyone** — including admins. Terminal states are:

| State | Set by | Where checked |
|-------|--------|---------------|
| `status = "Rejected"` | SDR or Sales | Both drawers |
| `sales_status = "Won"` | Sales (future — Tickets phase) | Sales Drawer only |
| `sales_status = "Dropped"` | Sales (future — Tickets phase) | Sales Drawer only |

In `sales-drawer.tsx`:
```typescript
const isTerminal = lead.status === "Rejected" || lead.sales_status === "Won" || lead.sales_status === "Dropped";
const isReadOnly = readOnly || isTerminal;
```

In `verify-drawer.tsx`:
```typescript
const isRejected = lead.status === "Rejected";
const isReadOnly = readOnly || isRejected;
```

The `isReadOnly` flag disables every input and hides all action buttons. There is no role check — even an admin hits the same wall. This means:
- An SDR who accidentally rejected a lead cannot be helped without direct DB access
- A mistakenly closed/dropped deal in the Sales pipeline cannot be recovered from the UI

---

### The Fix

When the viewing user is an **admin**, `isTerminal` should NOT force `isReadOnly`. Instead:

1. **Show an amber "Admin Override" banner** instead of the red "terminal state" banner:
   > "This lead is in a terminal state. As an admin you can override — proceed carefully."

2. **Re-enable all action buttons** for admin users (Save, Hold, Route, Reject, etc.)

3. **The API already supports admin edits** — `app/api/leads/[id]/route.ts` line 53 already has:
   ```typescript
   if (current.status === "Rejected" && roleName !== "admin") {
     return 403;
   }
   ```
   So the server side is already correct. Only the client UI needs updating.

4. **Implementation sketch (sales-drawer.tsx):**
   ```typescript
   // isAdmin prop passed from sales-page.tsx (already available there)
   const isTerminal = lead.status === "Rejected" || lead.sales_status === "Won" || lead.sales_status === "Dropped";
   const isReadOnly = readOnly || (isTerminal && !isAdmin);
   ```

---

### Future Consideration — Won and Dropped need separate handling

When the Tickets phase is built, `Won` and `Dropped` will have richer semantics:

- **`Won`** — a job ticket (order) was created and confirmed. Reversing it should also void or cancel the linked ticket. An admin override should prompt: "This lead has an associated order. Reversing Won status will not automatically cancel the order — do this manually in Tickets."

- **`Dropped`** — the sales rep gave up on a lead. May have a `sales_drop_reason`. Reversing it is simpler but should still clear the `sales_drop_reason` and reset `sales_status = "Ongoing"`.

**Do not build admin override for Won/Dropped until the Tickets module is complete.** At that point, the override logic needs to be aware of linked `job_tickets`.

For now, if needed, the admin override banner for Won/Dropped can show a more restrictive message:
> "This lead is Won/Dropped and linked to the Tickets system. Contact the dev team to reverse this state."

---

### Testing checklist (when built)
- [ ] Admin opens a Rejected lead in Sales Drawer — sees amber banner, action buttons visible
- [ ] Admin opens a Rejected lead in Verify Drawer — same
- [ ] Non-admin opens a Rejected lead — sees red terminal banner, no actions
- [ ] Admin saves changes on a Rejected lead — PATCH succeeds (API already allows it)
- [ ] Admin re-routes a Rejected lead → appears in Sales Pipeline
- [ ] Activity log shows the override action (status_changed from Rejected → Routed to Sales)
- [ ] Won/Dropped leads show read-only even for admin (until Tickets phase)

---
