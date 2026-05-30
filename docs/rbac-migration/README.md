# RBAC Migration — Planning Docs

**Status:** Deferred — revisit when core workflows (leads → quote → order → payment) are stable.

Production RBAC behavior today is documented in **[`../rbac.md`](../rbac.md)**. Nothing in this folder changes the running app until implementation slices are explicitly started and signed off.

---

## Documents in this folder

| File | Status | Purpose |
|------|--------|---------|
| [`plan.md`](plan.md) | Complete | Master migration plan: three-tier permissions, page-by-page slices, timing, revisit checklist |
| [`application-logic-map.md`](application-logic-map.md) | Not started | Phase 0 — how each page filters and behaves today (independent of role names) |
| [`scenario-matrix.md`](scenario-matrix.md) | Not started | Phase 0 — testable rows: page × scope × action × API × UI |

---

## Revisit checklist

- [ ] Confirm core workflows stable 2–4 weeks
- [ ] Complete `application-logic-map.md`
- [ ] Complete `scenario-matrix.md`
- [ ] Staging baseline for SDR / Sales / Admin / Accountant
- [ ] Owner sign-off — then decide Slice 0 start
- [ ] Slice 0 → Slice 1 (Leads) → … → Slice 6

**While deferred:** avoid new hardcoded `roleName === "sdr"|"sales"` checks; note intended permission keys in PRs.

See [`plan.md`](plan.md) for full detail.
