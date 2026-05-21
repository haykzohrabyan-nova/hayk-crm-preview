# Order Ticket Module — Documentation Index

> **Note:** This folder is **historical research and phase planning** from the shadow-project port (Phases 0–7, completed 2026-05-12). For the **current shipped behaviour** (payments queue, production/completed lifecycle, public portal, accountant role), use `docs/feature-specs/tickets.md`, `docs/feature-specs/invoice-payment.md`, and `docs/navigation.md`. References to **OrderDrawer** below describe the original POC — the live app uses dedicated pages (`/quotes/new`, `/quotes/[id]`, etc.) instead.

This folder contains all research, analysis, and planning documents for the **Tickets phase** of BazarCRM (Quotes & Orders). All owner questions resolved on 2026-05-11. Phases 0–7 complete as of 2026-05-12.

---

## Documents in this folder

| File | Purpose |
|------|---------|
| [`shadow-project-analysis.md`](./shadow-project-analysis.md) | Complete analysis of the `sdr-crm-system` POC — what it built, how it works, what to port |
| [`data-model.md`](./data-model.md) | Field-by-field comparison: current `job_tickets` schema vs shadow project's richer model; what needs to be added |
| [`workflows.md`](./workflows.md) | Every role's order/quote creation flow from the shadow project; entry points, state transitions, status rules |
| [`open-questions.md`](./open-questions.md) | All owner decisions — fully resolved 2026-05-11 |
| [`integration-plan.md`](./integration-plan.md) | Phase-by-phase build plan with file paths, dependencies, and build order |
| [`product-catalog.md`](./product-catalog.md) | Product types, materials, lamination options, and admin management |

---

## Status

| Phase | Status |
|-------|--------|
| Shadow project analysis | ✅ Done |
| Data model gap analysis | ✅ Done |
| Workflow documentation | ✅ Done |
| Owner questions | ✅ All resolved — 2026-05-11 |
| Phase 0 — Commit current work | ✅ Done |
| Phase 1 — Docs created | ✅ Done |
| Phase 2 — Schema + Type Alignment | ✅ Done (migrations 041–045 applied 2026-05-12) |
| Phase 3 — Lead drawer cleanup + CRM filter | ✅ Done (2026-05-11) |
| Phase 3.5 — Admin override for terminal leads (TODO-001) | ⏳ Deferred |
| Phase 4 — API routes (`/api/tickets`) | ✅ Done (2026-05-12) |
| Phase 5 — Utilities (ticket-math) | ✅ Done (2026-05-12) |
| Phase 6 — Quote & Order dedicated pages | ✅ Done (2026-05-12) — design changed from modal to dedicated pages |
| Phase 7 — Quotes + Orders list pages + sidebar badges | ✅ Done (2026-05-12) |
| Phase 8 — Dashboard integration + PDF export | ⏳ Next |

---

## What was built in Phase 2 (2026-05-12)

- **Product catalog** (`product_types`, `material_groups`, `materials`) — 15 product types, 37 materials seeded; Admin → Products tab to manage
- **28 new columns on `job_tickets`** — identity, pricing, payment, follow-up, order-specific fields
- **`order_sequence_counters` table** — auto-increments `ORD-YYYY-NNN` reference codes
- **`company_settings` table** — single-row; stores branding, address, and order defaults (tax rate, high-value threshold, rush surcharge); Admin → Company Info tab
- **7 new lookup categories** (lamination, finishing, quote_channel, follow_up_freq, ticket_priority, order_source, ticket_payment) — Admin → Dropdown Options tab
- **Admin panel tabs** — Products, Dropdown Options, Company Info all live and functional
- **TypeScript types** — `JobTicket`, `QuoteSku`, `TicketForm`, `CompanySettings`, all lookup types enriched

## What was built in Phases 4–7 (2026-05-12)

- **`supabase/migrations/046`** — `increment_order_sequence()` PL/pgSQL function for atomic ORD-YYYY-NNN code generation
- **`supabase/migrations/047`** — `REPLICA IDENTITY FULL` + `ALTER PUBLICATION supabase_realtime ADD TABLE job_tickets` — enables Realtime broadcasts for quote/order pages
- **API routes** — `GET/POST /api/tickets`, `GET/PATCH /api/tickets/[id]`, `GET /api/tickets/counts`, `GET /api/activities` (combined lead+ticket lifetime)
- **`lib/utils/ticket-math.ts`** — `computePricing()`, `skuLineTotal()`, `formatCurrency()` pure helpers
- **`/quotes/new`** — new quote creation page with lead info card + 3-tab form (Info → Line Items → Quote); Save Draft + Save & Send actions
- **`/quotes/[id]`** — permanent quote/order detail page; 2-tab view (Info | History); read-only by default, edit toggled; record-locked for non-admins once customer approves; "Convert to Order" + Payment Link Bar for confirmed orders
- **`/quotes`** — Quoted Requests list with tabs (All / Draft / Sent / Approved), search, count badges, realtime refresh
- **`/orders`** — Orders list with tabs (All / Pending Payment / Cancelled), Rush indicator, due-date warnings, realtime refresh *(superseded: in-production and completed orders now on `/production` and `/completed`)*
- **"Create Quote / Order" button** — wired in both `verify-drawer.tsx` and `sales-drawer.tsx`: saves lead silently → navigates to `/quotes/new?lead_id=xxx`
- **Full lifetime history** — History tab on quote detail shows complete journey from lead creation through quote to order; each entry labelled Lead / Ticket with icons
- **Sidebar badges** — `/quotes` and `/orders` nav items now show live count badges via `sidebar-counts` API
- **Realtime refresh** — quote/order pages listen to `bazaar:tickets-changed`, `bazaar:leads-changed`, `bazaar:activities-changed` for instant silent updates
