# Capability-Based RBAC — Migration Plan

**Status:** Slice 0 complete (2026-06-09) — foundation shipped. Slice 1+ (behavior enforcement) deferred until workflows stabilize.

**Related docs:** [`../rbac.md`](../rbac.md) (current behavior) · [Folder index](README.md) · Phase 0 deliverables (not started): [`application-logic-map.md`](application-logic-map.md), [`scenario-matrix.md`](scenario-matrix.md)

---

## Revisit checklist

- [x] Confirm core workflows stable 2–4 weeks (leads, sales pipeline, quotes, orders, payments)
- [x] Complete Phase 0: application logic map
- [x] Complete Phase 0: scenario matrix (~120–150 rows)
- [x] Complete Phase 0: staging baseline for SDR / Sales / Admin / Accountant
- [x] Owner sign-off on key catalog + timing (Slice 0 approved 2026-06-09)
- [x] Slice 0: foundation (DB + auth helpers, no behavior change) — **complete 2026-06-09**
- [ ] Slice 1: Leads page-by-page migration
- [ ] Slices 2–6: Sales → Quotes → Orders/Payments → CRM/Admin UI → cleanup

### Slice 0 deliverables (shipped 2026-06-09)

| Deliverable | File(s) |
|---|---|
| DB patch — `permissions` catalog + `role_action_grants` + system seeds | `supabase/patches/2026-06-09-action-permissions.sql` |
| Action grants cache (45 s TTL, same pattern as allowed-routes-cache) | `lib/auth/action-grants-cache.ts`, `lib/auth/resolve-action-grants.ts` |
| Session type extended with `actionGrants: string[]` | `lib/auth/require-session.ts` |
| Server helpers — `hasPermission()`, `hasAllPermissions()`, `hasAnyPermission()` | `lib/auth/has-permission.ts` |
| Server guard — `requirePermission(key)` (returns 403 if key missing) | `lib/auth/require-permission.ts` |
| Client hook — `usePermissions()` with `can()`, `canAll()`, `canAny()` helpers | `hooks/use-permissions.ts` |
| `GET /api/me` returns `actionGrants[]` | `app/api/me/route.ts` |
| Admin API — permissions catalog | `GET /api/admin/permissions` |
| Admin API — role action grants CRUD | `GET/POST /api/admin/roles/[id]/action-grants`, `DELETE /api/admin/roles/[id]/action-grants/[permissionId]` |
| Admin UI — Actions tab in Roles section | `components/admin/roles-section.tsx` |

**Rule while deferred:** Avoid new hardcoded `roleName === "sdr"|"sales"` checks in new code; note intended permission keys in PRs.

---

## Summary

High-risk migration from hardcoded role slugs (`sdr`, `sales`, `admin`, `accountant`) to a **three-tier permission model**:

1. **Page access** — can open nav route
2. **Data scope** — all / own / routed / inbox pool (page access ≠ see everything)
3. **Actions** — granular keys per button/API (e.g. add lead, edit lead, route to sales)

Implement **page-by-page slices** with dual enforcement and staging tests — not one big bang.

**Do Phase 0 docs when ready. Defer implementation until workflow logic is stable** (unless custom roles needed in production urgently).

---

## When to start — recommendation

**Short answer:** Do **Phase 0 documentation** when revisiting. Defer **implementation slices** until core workflow logic is stable — unless you need custom roles in production soon.

| Approach | Do now? | Risk | Reward |
|----------|---------|------|--------|
| **Phase 0 only** (logic map, matrix, baseline, key catalog) | **Yes, when revisiting** | Very low — docs only | Captures rules before more code lands |
| **Slice 0** (DB tables + auth helpers, no behavior change) | Optional | Low if nothing reads grants yet | Foundation ready when you flip |
| **Slice 1+** (Leads, Quotes, … — real behavior change) | **Wait** | High while logic still moving | Wrong grants if rules change next week |

### Why not implement the full migration while features are in flux

Active work (tickets, line items, public quotes, realtime, security) can add more slug checks or change workflows. Migrating before logic settles means repeated seed rewrites and re-testing.

### Why not wait until the entire app is 100% done

- More hardcoded slug checks accumulate (~174 sites today)
- Custom roles stay broken (pages in DB, behavior in code)
- Migration grows larger over time

### Practical middle path

1. **When revisiting:** Phase 0 — document Leads / Sales / Quotes / Orders / Payments **as they work that day**
2. **While building:** No new `roleName ===` checks; note intended permission keys
3. **Start Slice 0 + Slice 1 when:** core lead → quote → order → payment flow stable 2–4 weeks, **or** custom role needed in prod, **or** feature freeze on RBAC pages for one sprint
4. **Do not start slices during** heavy refactors of the same pages

### Workflow stability gate (before Slice 1)

- [ ] Leads inbox, lock, route, reject, hold
- [ ] Sales claim pipeline
- [ ] Quote create, send, HVT route, claim
- [ ] Order convert, payment confirm, production release, complete, cancel
  *(last changed 2026-06-17 — sales granted cancel + complete + edit-locked tickets; stability clock starts today)*
- [ ] CRM customer edit/merge scope agreed

---

## Role name vs application logic

| Concept | What it is | Example |
|---------|------------|---------|
| **Display name** | Label in UI / admin | “Inbound Rep”, “Closer” |
| **System slug** | Stable DB id | `sdr`, `sales`, … — internal only |
| **Workflow persona** | Bundle of business behavior | Inbox triage, Sales pipeline, Payment review |
| **Permission grants** | Matrix checkboxes | `leads.scope.own`, `leads.create`, … |

Today the app uses **`roleName === "sdr"` vs `"sales"`** for list filters, tabs, columns, buttons, and API scope — not just page access.

---

## Three permission tiers

| Tier | Question | Example keys (Leads) |
|------|----------|----------------------|
| **1 — Page** | Can user open this section? | `/leads` in `role_permissions` |
| **2 — Scope** | Which rows appear? | `leads.scope.all`, `.own`, `.inbox_pool`, `.routed` |
| **3 — Action** | Which mutations work? | `leads.create`, `.edit`, `.lock`, `.route_to_sales`, … |

If user has page but **no scope key**, list is empty (safe default).

### Example: “Lead Entry Only” custom role

| Tier | Grant | Deny |
|------|-------|------|
| Page | `/leads` | `/sales`, `/quotes`, `/crm`, … |
| Scope | `leads.scope.own` | `leads.scope.all`, `leads.scope.inbox_pool` |
| Actions | `leads.create` only | edit, lock, route, reject, hold, claim, … |

### Granular Leads permission keys (draft)

| Key | Meaning |
|-----|---------|
| `leads.scope.all` | See all leads |
| `leads.scope.inbox_pool` | Unclaimed inbox pool |
| `leads.scope.own` | Own / assigned / locked-by-me |
| `leads.scope.routed` | Routed to Sales pipeline |
| `leads.create` | Manual add lead |
| `leads.edit` | PATCH lead fields |
| `leads.lock` | Acquire lock |
| `leads.unlock_own` / `leads.unlock_any` | Release lock |
| `leads.route_to_sales` | Route to sales pipeline |
| `leads.reject` | Reject lead |
| `leads.hold` / `leads.resume` | Hold / resume |
| `leads.claim` | Sales claim routed lead |
| `leads.reassign` | Admin reassign |
| `leads.follow_up` | Follow-up later |
| `leads.override_terminal` | Edit rejected leads (admin) |

Tickets/CRM/Payments follow the same `{area}.scope.*` + `{area}.{action}` pattern.

---

## How pages behave today (Phase 0 seed)

| Page | SDR | Sales | Admin | Accountant |
|------|-----|-------|-------|------------|
| Default home | `/leads` | `/sales` | `/dashboard` | `/payments` |
| `/leads` | Inbox; read-only Routed/Won tabs | No access | All + reassign | No access |
| `/sales` | No access | Claim pipeline | Full + filter | No access |
| `/quotes` | Own list + Routed tab | Own + routed; claim | All + filter | No access |
| `/quotes/new` | HVT + Route to Sales | Normal | Admin convert | No access |
| `/quotes/[id]` | Edit own; read-only if routed hand-off | Claim routed; edit/cancel/complete own tickets at any non-cancelled status | Full control | Read / payment |
| `/orders` | Own | Own | All | Read |
| `/completed` | Created by me | No access | All | All |
| `/payments` | No access | No access | Queue | Queue |
| `/crm` | Full | Full | Full | No access |

Key files: `lib/utils/lead-access.ts`, `ticket-access.ts`, `leads-workspace-query.ts`, `fetch-quotes-data.ts`, `components/leads/leads-page.tsx`, `quotes-page.tsx`, `quote-detail.tsx`.

---

## Workflow personas (templates for custom roles)

| Persona | Today’s slug | Core job |
|---------|--------------|----------|
| **InboxTriage** | `sdr` | Triage inbox, quote, route HVT |
| **SalesPipeline** | `sales` | Claim routed work, close deals |
| **PaymentReview** | `accountant` | Confirm payments, mark complete when paid |
| **Superuser** | `admin` | Everything + settings |

---

## Failure modes if rushed

- Scope regression (page granted, wrong scope → empty lists)
- Action without page / page without actions
- UI/API drift (hidden button but API allows)
- List vs detail mismatch (SDR routed hand-off)
- Seed drift on deploy
- RLS lag vs API grants

---

## Known gaps (resolved in Slice 0 seed — 2026-06-09)

All items below were identified and fixed in the SQL patch review:

1. ~~`resend_invoice` / `send_payment_reminder`~~ — confirmed `canResendTicketNotifications` = admin OR creator only; seeds corrected (accountant excluded, SDR/Sales added)
2. ~~`release_production`~~ — confirmed `canAccountantMutateTicket` allows `production_released_at`; accountant seed corrected
3. ~~Custom roles~~ — pages in DB since launch; action grants now also in DB via `role_action_grants`; UI toggle available

---

## Page-by-page implementation slices

| Slice | Scope | Notes |
|-------|--------|-------|
| **0** | Foundation | `permissions`, `role_action_grants`, `requirePermission`, `usePermissions()` — no behavior change |
| **1** | Leads | First real slice; test “Lead entry only” role |
| **2** | Sales | Claim, hold, pipeline |
| **3** | Quotes | Largest slice; HVT, claim, detail |
| **4** | Orders / Payments / Completed | record_payment, mark_completed |
| **5** | CRM + Admin matrix UI | Page + scope + action columns; New Role |
| **6** | Cleanup | Dashboard, sidebar, default home, remove slugs |

Per slice: replace legacy slug check → test staging with all 4 system roles → deploy → monitor 3–7 days → next slice.

---

## Admin UI (Slice 5)

| Page area | Page access | Data scope | Actions |
|-----------|:-----------:|------------|------------|
| Leads | `/leads` | All / Own / Inbox / Routed | Add, Edit, Lock, Route, Reject, … |
| Sales | `/sales` | All / Own / Routed | Claim, Hold, … |
| Quotes | `/quotes` | All / Own / Routed | Create, Edit, Send, Route, … |

Templates: Full SDR, Full Sales, Lead entry only, Payment reviewer, Custom blank.

---

## Phase 0 deliverables

1. [`application-logic-map.md`](application-logic-map.md) — per-page behavior today
2. [`scenario-matrix.md`](scenario-matrix.md) — ~120–150 testable rows
3. Staging baseline — pass/fail for 4 system roles before any code change

---

## How to wire up a slice (step-by-step)

This is the exact process to follow when ready to enforce a permission key in a route handler.
Slice 0 must already be deployed and the SQL patch run.

### Step 1 — Check for custom roles

Go to **Admin → Settings → Roles** and look at the left panel.

- **Only SDR, Sales, Accountant, Admin visible** → safe to proceed immediately
- **Any custom roles visible** → before touching code, open each custom role → **Actions tab** → toggle on every permission they need. No SQL required — the UI writes directly to `role_action_grants`.

### Step 2 — Replace the hardcoded check in the route handler

Import `hasPermission` from `lib/auth/has-permission.ts`:

```typescript
import { hasPermission } from "@/lib/auth/has-permission";

// Old — hardcoded role slug
if (roleName !== "sales" && roleName !== "admin") {
  return NextResponse.json({ error: "Forbidden.", code: "FORBIDDEN" }, { status: 403 });
}

// New — reads from role_action_grants
if (!hasPermission(session, "leads.claim")) {
  return NextResponse.json({ error: "Forbidden.", code: "FORBIDDEN" }, { status: 403 });
}
```

`session` is the object returned by `requireSession()` — it already has `actionGrants[]` loaded and cached.

For routes that call `requireAdmin()` today (admin-only actions), no change is needed — `requireAdmin()` stays and admin always has all grants.

### Step 3 — Test all 4 system roles

Log in as each role and confirm:
- Action **works** for roles that should have it (matches the seed matrix in the SQL patch)
- Action **returns 403** for roles that should not
- Admin can always perform the action regardless

### Step 4 — Deploy and monitor

Deploy to production. Watch for any unexpected 403 errors in logs for 3–7 days. If a role gets blocked unexpectedly, go to Admin → Roles → Actions tab and toggle the permission on — no redeploy needed.

### Step 5 — Repeat for the next route

Wire routes one at a time within a slice, or wire an entire slice together if you're confident in the seed.

### Reference: which key maps to which route

| Route / action | Permission key |
|---|---|
| `POST /api/leads/manual` | `leads.create` |
| `POST /api/leads/[id]/lock` | `leads.lock` |
| `POST /api/leads/[id]/unlock` (own) | `leads.unlock_own` |
| `POST /api/leads/[id]/unlock` (any, admin) | `leads.unlock_any` |
| `POST /api/leads/[id]/claim` | `leads.claim` |
| `POST /api/leads/[id]/hold` (SDR path) | `leads.hold` |
| `POST /api/leads/[id]/hold` (Sales path) | `sales.hold` |
| `POST /api/leads/[id]/resume` (SDR path) | `leads.resume` |
| `POST /api/leads/[id]/resume` (Sales path) | `sales.resume` |
| `POST /api/leads/[id]/follow-up` (SDR path) | `leads.follow_up` |
| `POST /api/leads/[id]/follow-up` (Sales path) | `sales.follow_up` |
| `POST /api/leads/[id]/reassign` | `leads.reassign` |
| `PATCH /api/leads/[id]` status=Rejected | `leads.reject` |
| `PATCH /api/leads/[id]` status=Routed | `leads.route_to_sales` |
| `PATCH /api/leads/[id]` (rejected lead) | `leads.override_terminal` |
| `POST /api/customers/[id]/merge` | `crm.merge` |
| `PATCH /api/tickets/[id]` claim_ownership | `quotes.claim` |
| `PATCH /api/tickets/[id]` ticket_status=cancelled | `quotes.cancel` / `orders.cancel` |
| `PATCH /api/tickets/[id]` ticket_status=completed | `orders.mark_complete` |
| `PATCH /api/tickets/[id]` release_production | `orders.release_production` |
| `PATCH /api/tickets/[id]` ticket_status=order | `orders.convert_manual` |
| `PATCH /api/tickets/[id]` record_payment | `payments.record_payment` |
| `PATCH /api/tickets/[id]` approve_tax_exempt | `payments.approve_tax_exempt` |
| `PATCH /api/tickets/[id]` deny_tax_exempt | `payments.deny_tax_exempt` |
| `PATCH /api/tickets/[id]` request_*_resubmit | `payments.request_resubmit` |
| `PATCH /api/tickets/[id]` resend_invoice | `payments.resend_invoice` |
| `PATCH /api/tickets/[id]` send_payment_reminder | `payments.send_reminder` |
| `GET /api/tickets/[id]/evidence` | `payments.view_evidence` |
| `GET /api/tickets/[id]/sales-permit` | `payments.view_sales_permit` |
| `POST /api/tickets/[id]/refund` | `payments.refund` |

---

## Success criteria

- [x] Three-tier model + Lead Entry Only example documented
- [x] Slice 0 shipped — DB tables, seeds, helpers, Admin UI Actions tab (2026-06-09)
- [x] SQL patch reviewed against full codebase scan — all 50 keys verified (2026-06-09)
- [ ] Slice 1 (Leads) deployed and tested — wire when core workflows stable
- [ ] Slice 2 (Sales + CRM) deployed and tested
- [ ] Slice 3 (Quotes) deployed and tested
- [ ] Slice 4 (Orders / Payments) deployed and tested
- [ ] Slice 5 (Admin matrix UI — scope column) deployed and tested
- [ ] Slice 6 (Cleanup — remove all hardcoded `roleName ===` slugs)
- [ ] UI hidden button = API 403 verified for all slices
- [ ] System roles unchanged until intentionally changed via Actions tab

**Estimated effort:** Phase 0 ~3–5 days. Full slices ~4–6 weeks incremental after sign-off.

---

*Last captured: May 2026 — from planning session before deferring implementation. Seed updated 2026-06-17 for sales cancel/complete grants.*
