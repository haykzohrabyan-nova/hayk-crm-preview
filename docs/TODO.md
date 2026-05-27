# BazarCRM — TODO Tracker

**Last updated:** 2026-05-26 (docs sync — deploy-ready)

This file tracks **what is still open** vs **what is already built**. Detailed specs live in `docs/feature-specs/` and `docs/CHANGELOG.md`.

---

## Open — needs owner decision (blocks implementation)

These are **product/policy choices**, not engineering unknowns. Pick an option, then we implement (~1–2 weeks total for both).

**Owner review doc (send as attachment or link):** [owner-decisions-pending.html](./order-ticket/owner-decisions-pending.html) — open in browser, print, or attach to email.

### TODO-008 — Sent-quote email vs live portal after edit

**Related:** [open-questions.md § B6](./order-ticket/open-questions.md)

When a rep edits a `sent` quote and saves, `/q/{token}` shows the new price but the original email/SMS still shows the old total. Only **Resend Quote** updates the customer message — nothing enforces it.

| Option | Policy |
|--------|--------|
| **A** | Link-only email/SMS — no totals in message; portal is source of truth |
| **B** | Keep full quote in email; prompt or require resend after material edits |
| **C** | Lock SKU/pricing after first send (admin exception) |
| **D** | A + soft resend nudge when price changes *(recommended hybrid)* |

**Files (after decision):** `lib/integrations/send-quote.ts`, `components/quotes/quote-detail.tsx`

---

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

## Open — ready to build (no owner decision)

### TODO-006 — Follow-up reminder cron (automatic schedule)

**Status:** **Code shipped (May 2026)** — **not fully live on production**

Production is on **Vercel Hobby (free)**. Automatic daily cron requires **Vercel Pro**.

| Done ✅ | Blocked on Pro ⏳ |
|---------|-------------------|
| Follow-up fields on quotes; schedule seeded when quote is sent | Vercel Cron firing daily in production |
| `GET /api/cron/follow-ups` — query due tickets, send via Instantly/Twilio, advance schedule | |
| `CRON_SECRET` can be set in Vercel (safe — no app impact on Hobby) | |
| Manual trigger via `curl` (or external cron service) | |

**Workaround (Hobby):** run manually — **`docs/cron-follow-ups.md`** → *Manual trigger (production on Hobby)*

**When Pro is enabled:** no code changes needed — redeploy is enough if `CRON_SECRET` is already set.

---

### TODO-007 — Performance Phase 3 *(optional remainder)*

**Status:** **Phase 3 core complete (May 2026)** — page-data bundling, session cache, coalesced refetch, role-scoped sidebar counts, lazy modal bootstrap

**Still optional at scale:**
- SWR / React Query for back-navigation cache
- List pagination when any tab exceeds ~500 rows
- CRM server-side search + pagination

**Spec:** [performance-anydoer-roadmap.md](./FuturePlan/Performance/performance-anydoer-roadmap.md)

---

## Out of scope — current application stage

**No online payment integrations** in this phase. Offline payment recording (cash, wire, ACH, Zelle, check) + accountant evidence review **is built** and stays.

| Item | Notes |
|------|--------|
| Stripe Checkout (online card) | Deferred — see `invoice-payment.md` Phase C |
| Zelle auto-matching (email parse) | Deferred — Phase D |
| Offline merchant-terminal card queue | Planned spec only — `offline-card-payment.md` |
| Stripe/Zelle admin integration cards | Removed from UI (2026-05-24) |

Revisit when product stage explicitly includes online payments.

---

## Future / nice-to-have (not blocking production use)

| Item | Spec / notes |
|------|----------------|
| Admin broadcast notifications | `/admin/settings/notifications` — form not built |
| Per-user notification bell (V2) | `feature-specs/notifications.md` |
| Reports extras | CSV export, product/source charts, bonus % preview, forecast — `feature-specs/reports.md` |
| Pricing calculator in quote form | Deferred — reps enter unit prices manually (owner Q17) |
| Multi-tenant SaaS for other print shops | Separate major initiative — not started |

---

## Completed ✅

MVP and day-to-day shop operations are **built**. Summary by area:

### Leads & CRM
- SDR workspace (All / Hold / Routed / Rejected / Won), lead locking, verify drawer
- Sales pipeline, claim flow, HVT routing
- CRM list + customer profile, merge (admin/sales API), dedup lookup
- **May 26:** **Add Customer** modal on CRM list (`POST /api/customers`); standalone customers in list
- **May 26:** CRM **Realtime** live updates (`customers` table, migration 083); manual Refresh removed
- **May 26:** Customer profile — Lead History removed; Quotes & Orders only
- **May 26:** SDR Directed to Sales / Won tabs — read-only Verify Drawer (not customer profile redirect)
- Admin override on terminal leads (TODO-001)
- **May 26:** Product Interests column (`ProductName[quantity]`); removed Initial Interest; website URL validation (scheme optional); **inline field errors + scroll-to-invalid-field** on Add Lead / Verify / Edit Customer / New Quote; CRM list Industry column (Heat badge on profile only); company/phone/email targeted links

### Quotes & orders
- New quote form, quote detail, send/resend quote (email/SMS/WhatsApp)
- Public portal `/q/{token}` — confirm, payment proof upload, balance while in production
- Quote-until-payment, convert to order, ORD-/QUO- reference codes
- Orders page (Pending / In Production / Cancelled tabs), completed queue
- **May 26:** SDR Completed page — nav access + list scoped to self-created completed orders (`created_by_id`); routed-to-Sales hand-offs excluded
- Order lifecycle: release to production, mark completed, pickup notifications
- Record locking after customer confirm; payment link bar

### Payments *(offline — no online processor)*
- Per-ticket payment config, deposit/partial/full/net terms
- Payment evidence (`/payments` Pending + Approved tabs), evidence retained after `record_payment`, accountant role
- Admin SMS templates (`/admin/settings/sms-templates`, `sms_templates` table)
- **May 26:** Public payment modal — fixed amount due (server-computed); client cannot override on submit
- Admin remittance settings (wire/ACH/Zelle on company + public page)
- Auto-release to production (net terms / payment gates)

### Dashboard & reports
- Role dashboards (SDR / Sales / Admin / Accountant) with KPI help text
- SDR/Sales dashboards: separate **Total**, **Received**, **Balance** KPI cards + shared date filter component
- Cash collected, released order value, pipeline, team session + work metrics
- Reports Phase 1 + 2: funnel, win rate, rep scorecards, payment ledger, awaiting collection, custom date range
- **May 26:** Staff cash deposits log `ticket_payment_recorded` (Reports + dashboard alignment); scorecards display-only; Reports links use lifecycle routes + `?from=/reports` Back
- **May 26:** Orders + Quotes + Completed list pages — `DashboardDateRangeFilter` (default Last 7 Days); tab badges on Quotes/Orders follow selected range; sidebar badges all-time

### Admin & auth
- User/role management, MFA (TOTP), per-user `mfa_required`, remember device 30 days
- Session tracking + idle sign-out, user activity tab, `/policy` page
- Company info, products/catalog, dropdowns, integrations (Twilio + Instantly live)
- API security hardening (`requireSession`, ticket scope, company field filtering) — 2026-05-24

### Performance & UX
- Performance Phase 1–2: slim list APIs, SQL head counts, partial indexes (TODO-007)
- **May 26:** Performance Phase 3 — combined `page-data` endpoints, session memoization, coalesced refetch, role-scoped sidebar counts, lazy modal bootstrap on Leads/Sales
- **May 26:** Fix leads page infinite reload — stable callback in `useCoalescedRefresh`
- **May 26:** Read-only lead drawer close — no list reload; `useCoalescedRefresh` silent resume when editable drawer closes
- **May 26:** Quote/order detail — Customer Link + Copy Link on `in_production` / `completed`; two 50/50 buttons on own row
- Mobile list cards (quotes, orders, payments, completed)
- Quote/order detail overview layout, global loading overlay
- PDF download (staff + public), print view

### Infrastructure
- Consolidated `supabase/schema.sql` (replaces numbered migration files)
- Dev test reset: `npm run reset-test-data`

For dates and file-level detail, see **`docs/CHANGELOG.md`**.
