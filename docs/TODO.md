# BazarCRM — TODO Tracker

**Last updated:** 2026-06-17 (Title optional, Receipt ID auto-gen, industry/name prefill, customer field sync-back, lookup cache invalidation, quote_reminder_date default removed)

Open and future work only. **Shipped features** → [`docs/CHANGELOG.md`](./CHANGELOG.md). **Specs** → [`docs/feature-specs/`](./feature-specs/). **Larger designs** → [`docs/FuturePlan/`](./FuturePlan/).

---

## Engineering — blocked or optional

### TODO-006 — Follow-up reminder cron (automatic schedule)

**Status:** Handler and manual trigger are built; **daily production cron is not active** on Vercel Hobby (requires **Vercel Pro**).

| Action | Notes |
|--------|--------|
| Enable Vercel Pro + redeploy | No code change if `CRON_SECRET` is already set |
| Until then | Manual run — [`docs/guides/cron-follow-ups.md`](./guides/cron-follow-ups.md) |

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
| Tax-exempt resubmit portal | **Done** — OTP `/permit`, Request flow, staff replace on `/payments`, internal denial notes. **Won't build:** customer declare-unavailable (staff use **Deny tax-exempt** instead) — [FuturePlan/tax-exempt-resubmit-portal/](./FuturePlan/tax-exempt-resubmit-portal/README.md) |
| Bulk lead import (JSON) | **Done** — Admin → Settings → **Lead import** (`/admin/settings/import-export`); AI template + validate-first; `docs/feature-specs/lead-import.md` |
| Bulk order import (JSON) | **Done** — Admin → Settings → **Order import**; cash-default, 9.75% tax backfill, `000000` receipt placeholder, `legacy_import` source for universal visibility; `docs/feature-specs/order-import.md` |
| Multi-word search (all list pages) | **Done** — CRM, Sales Pipeline, Leads Workspace, Quotes, Orders, Completed, Payments all split search terms and run separate `ilike` per word |
| Order Webhook page — pagination + filters | **Done** — 25-per-page default, date range (last 7 days default), search; `legacy_import` orders blocked from display and resend |
| Data management — delete & export | **Planned** — `docs/Data Management/data-management-plan.md`; SQL patch + API routes + admin UI not yet built |
| Admin broadcast notifications | `/admin/settings/notifications` — form not built |
| Per-user notification bell (V2) | `feature-specs/notifications.md` |
| Reports extras | JSON export (not CSV), product/source charts, bonus % preview, forecast — `feature-specs/reports.md` |
| Pricing calculator in quote form | Deferred — reps enter unit prices manually (owner Q17) |
| Zelle auto-matching (email parse) | Phase D in `feature-specs/invoice-payment.md` |
| Offline merchant-terminal card queue | `feature-specs/offline-card-payment.md` |
| Multi-tenant SaaS for other print shops | Separate major initiative |
