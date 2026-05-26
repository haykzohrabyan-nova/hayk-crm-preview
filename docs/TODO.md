# BazarCRM — TODO Tracker

**Last updated:** 2026-05-26

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

### TODO-006 — Follow-up reminder cron

**Status:** Fields saved on `job_tickets`; **no sending logic**

| Field | Purpose |
|-------|---------|
| `follow_up_at`, `follow_up_frequency`, `follow_up_cycles`, `follow_up_completed` | Schedule repeat reminders on sent quotes |

**Fix:** Vercel Cron → `GET /api/cron/follow-ups` → query due tickets → send via Instantly/Twilio → advance schedule.

**Rough effort:** ~1–2 weeks

---

### TODO-007 — Performance Phase 3+ *(optional)*

**Status:** Not started — only if list pages feel slow at scale

**Spec:** [performance-anydoer-roadmap.md](./FuturePlan/Performance/performance-anydoer-roadmap.md)

**Suggested first task:** combined `page-data` endpoints (list + counts in one request).

**Rough effort:** ~2–4 weeks for high-impact items

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
- Admin override on terminal leads (TODO-001)
- **May 26:** Product Interests column (`ProductName[quantity]`); removed Initial Interest; website URL validation; CRM list Industry column (Heat badge on profile only); company/phone/email targeted links

### Quotes & orders
- New quote form, quote detail, send/resend quote (email/SMS/WhatsApp)
- Public portal `/q/{token}` — confirm, payment proof upload, balance while in production
- Quote-until-payment, convert to order, ORD-/QUO- reference codes
- Orders page (Pending / In Production / Cancelled tabs), completed queue
- Order lifecycle: release to production, mark completed, pickup notifications
- Record locking after customer confirm; payment link bar

### Payments *(offline — no online processor)*
- Per-ticket payment config, deposit/partial/full/net terms
- Payment evidence queue (`/payments`), accountant role, `record_payment`
- Admin remittance settings (wire/ACH/Zelle on company + public page)
- Auto-release to production (net terms / payment gates)

### Dashboard & reports
- Role dashboards (SDR / Sales / Admin / Accountant) with KPI help text
- Cash collected, released order value, pipeline, team session + work metrics
- Reports Phase 1 + 2: funnel, win rate, rep scorecards, payment ledger, awaiting collection, custom date range
- **May 26:** Staff cash deposits log `ticket_payment_recorded` (Reports + dashboard alignment); scorecards display-only; Reports links use lifecycle routes + `?from=/reports` Back

### Admin & auth
- User/role management, MFA (TOTP), per-user `mfa_required`, remember device 30 days
- Session tracking + idle sign-out, user activity tab, `/policy` page
- Company info, products/catalog, dropdowns, integrations (Twilio + Instantly live)
- API security hardening (`requireSession`, ticket scope, company field filtering) — 2026-05-24

### Performance & UX
- Performance Phase 1–2: slim list APIs, SQL head counts, partial indexes (TODO-007)
- Mobile list cards (quotes, orders, payments, completed)
- Quote/order detail overview layout, global loading overlay
- PDF download (staff + public), print view

### Infrastructure
- Consolidated `supabase/schema.sql` (replaces numbered migration files)
- Dev test reset: `npm run reset-test-data`

For dates and file-level detail, see **`docs/CHANGELOG.md`**.
