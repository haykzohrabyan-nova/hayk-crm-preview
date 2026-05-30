# Capability-Based RBAC — Migration Plan

**Status:** Deferred — revisit when core workflows are stable (see [When to start](#when-to-start--recommendation)).

**Related docs:** [`../rbac.md`](../rbac.md) (current behavior) · [Folder index](README.md) · Phase 0 deliverables (not started): [`application-logic-map.md`](application-logic-map.md), [`scenario-matrix.md`](scenario-matrix.md)

---

## Revisit checklist (todo)

Use this when picking the migration back up:

- [ ] Confirm core workflows stable 2–4 weeks (leads, sales pipeline, quotes, orders, payments)
- [ ] Complete Phase 0: application logic map
- [ ] Complete Phase 0: scenario matrix (~120–150 rows)
- [ ] Complete Phase 0: staging baseline for SDR / Sales / Admin / Accountant
- [ ] Owner sign-off on key catalog + timing (Slice 0 vs keep building)
- [ ] Slice 0: foundation (DB + auth helpers, no behavior change)
- [ ] Slice 1: Leads page-by-page migration
- [ ] Slices 2–6: Sales → Quotes → Orders/Payments → CRM/Admin UI → cleanup

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
| `/quotes/[id]` | Edit own; read-only if routed hand-off | Claim routed | Full control | Read / payment |
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

## Known gaps to resolve in Phase 0

1. `resend_invoice` / `release_production` / `send_payment_reminder` — weak role checks in `app/api/tickets/[id]/route.ts`
2. Accountant `canMutateTicket` = true globally — field/status guards must hold
3. HVT route — verify API enforces, not UI-only
4. Custom roles — pages in DB, behavior slug-based today

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

Per slice: dual enforce (permission **and** legacy slug) → test staging → flip slice → monitor 3–7 days → next slice.

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

## Success criteria

- [ ] Three-tier model + Lead Entry Only example documented
- [ ] Phase 0 signed off
- [ ] Each slice deployed and tested independently
- [ ] Admin matrix: page + scope + actions
- [ ] UI hidden button = API 403
- [ ] System roles unchanged until intentionally changed via matrix

**Estimated effort:** Phase 0 ~3–5 days. Full slices ~4–6 weeks incremental after sign-off.

---

*Last captured: May 2026 — from planning session before deferring implementation.*
