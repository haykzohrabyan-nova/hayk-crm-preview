# BazarCRM — TODO Tracker

**Last updated:** 2026-06-04

Open and future work only. **Shipped features** → [`docs/CHANGELOG.md`](./CHANGELOG.md). **Specs** → [`docs/feature-specs/`](./feature-specs/). **Larger designs** → [`docs/FuturePlan/`](./FuturePlan/).

---

## Owner decision required

Product/policy choice before implementation (~1–2 days after decision).

**Review doc:** [owner-decisions-pending.html](./order-ticket/owner-decisions-pending.html) (TODO-009 section)

### TODO-009 — Mark completed with balance still due

**Related:** [open-questions.md § B7](./order-ticket/open-questions.md)

| Role | Balance due | Mark completed today |
|------|-------------|----------------------|
| Accountant | Yes | Blocked |
| Admin | Yes | Allowed after modal (`acknowledge_outstanding_balance: true`) |
| Customer | After admin completes | Pickup email + can pay balance on `/q/{token}` |

| Option | Policy |
|--------|--------|
| **A** | Block everyone until paid in full |
| **B** | Keep admin override *(current behaviour)* |
| **C** | Admin override + pickup email mentions balance due |
| **D** | Admin override but no pickup email until paid in full |

**Files (after decision):** `app/api/tickets/[id]/route.ts`, `components/quotes/quote-detail.tsx`, pickup email templates

---

## Engineering — blocked or optional

### TODO-006 — Follow-up reminder cron (automatic schedule)

**Status:** Handler and manual trigger are built; **daily production cron is not active** on Vercel Hobby (requires **Vercel Pro**).

| Action | Notes |
|--------|--------|
| Enable Vercel Pro + redeploy | No code change if `CRON_SECRET` is already set |
| Until then | Manual run — [`docs/cron-follow-ups.md`](./cron-follow-ups.md) |

---

### TODO-007 — Performance (optional at scale)

Phase 1–3 core + Jun 2026 perf is **done** — page-data, 45s session cache, `/api/me`, list SWR, `line_preview` on page-data, split detail bootstrap (`ticket-form-bootstrap`). See CHANGELOG (2026-06-02).

**Next (prioritized):** [page-loading.md](./FuturePlan/Performance/page-loading.md)

| Priority | Item |
|----------|------|
| P0 ops | Vercel region `pdx1`/`sfo1` vs Supabase Oregon; confirm migration `107` in prod |
| P1 code | `useAppSession()` on list pages; prefetch bootstrap on list mount; hover prefetch detail; slimmer ticket detail select |
| P2 scale | CRM aggregates >1k customers; line-preview RPC if page-data JSON too large |

**Spec (historical):** [performance-anydoer-roadmap.md](./FuturePlan/Performance/performance-anydoer-roadmap.md)

---

## Future — not started

| Item | Spec / notes |
|------|----------------|
| Tax-exempt resubmit portal (remaining) | [FuturePlan/tax-exempt-resubmit-portal/](./FuturePlan/tax-exempt-resubmit-portal/README.md) — **shipped:** OTP `/permit`, Request flow, admin email/SMS. **Not shipped:** staff replace on payments tab, declare-unavailable, internal denial notes |
| Admin broadcast notifications | `/admin/settings/notifications` — form not built |
| Per-user notification bell (V2) | `feature-specs/notifications.md` |
| Reports extras | CSV export, product/source charts, bonus % preview, forecast — `feature-specs/reports.md` |
| Pricing calculator in quote form | Deferred — reps enter unit prices manually (owner Q17) |
| Zelle auto-matching (email parse) | Phase D in `feature-specs/invoice-payment.md` |
| Offline merchant-terminal card queue | `feature-specs/offline-card-payment.md` |
| Multi-tenant SaaS for other print shops | Separate major initiative |
