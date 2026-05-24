# BazarCRM — Session Summary & Complete Plan
**Last updated:** May 23, 2026
**Status:** MVP complete + full order lifecycle + Won credit on production release + quote send validation + customer-level attributes + dev test reset. See **May 23, 2026 session** below for latest shipped work.

---

## May 23, 2026 (continued) — Customer attributes, quote source, CRM flows

### Decision Maker on customer record
- Migration `078_customer_authority.sql` — `customers.authority`; backfill from latest lead; drops unused `job_tickets.quote_authority`
- Add Lead, Verify Drawer, Sales Drawer, CRM profile read/write **Decision Maker** on the **customer**, not per-lead or per-quote
- `PATCH /api/leads/[id]` with `authority` updates `customers.authority` and returns refreshed customer join

### Direct quote source (Quotes page + CRM Add Quote)
- Migration `077_quote_source.sql` — `quote_source` on `job_tickets` (direct Quotes-page / CRM creates only)
- Standalone New Quote: Source on **Customer tab** → `quote_source` on ticket with `from_quote_page: true`
- CRM Add Quote: Customer tab skipped; **Quote source** required on **Info tab** → same ticket fields
- Lead entry (`?lead_id`): source from linked lead — no quote source card

### Customer pre-fill on New Quote
- `GET /api/customers/lookup` returns customer row (incl. `authority`, `industry`) + `latest_source` enrichment
- Industry/source selects show admin lookup **labels**

### CRM profile
- Edit Customer: industry lookup select + Decision Maker field
- Contact grid shows industry label, decision maker, quote source

### Customer approval gate (all payment types)
- When `ticket_require_client_confirm = true`, production/payment gates wait for public-page confirm — cash/deposit/full pay alone no longer bypasses approval
- Public `/q/[token]` checklist shows confirm step first when approval required

---

## May 23, 2026 — Won on production, quote validation, UX fixes

### Won credit timing
- Lead `sales_status: "Won"` (SDR Won tab) set only when linked ticket enters **`in_production`**, not at order conversion
- `lib/utils/mark-lead-won-on-production.ts` — shared helper called from all production-release paths
- Sales dashboard Won KPIs count tickets in `in_production` + `completed` only
- Admin revenue/won-leads aligned; migration `075_won_on_production_release.sql` backfills existing data

### Quote send validation
- `lib/utils/validate-quote-send.ts` — shared validation before Send / Convert
- Draft save still allowed with incomplete fields; Send disabled with amber missing-fields banner
- Receipt ID required for cash/offline paths; **digits only**

### Quote detail UX
- Action bar: Cancel left; Send/Resend/Convert grouped right; Convert uses verify button styling

### SDR / leads UX
- Hold modal: full-screen hold form hides tabs + lead form until confirmed/cancelled
- Urgency fix: `lib/utils/urgency-form.ts` maps DB `High`/`Medium`/`Low` ↔ lookup `high`/`medium`/`low`

### Accountant access
- `GET /api/tickets/[id]` — accountants can read any ticket (fixes 403 on `/orders/[id]`)

### Dev test reset
- `npm run reset-test-data` — clears `payment-evidence` bucket via Storage API, then runs DB wipe SQL
- `supabase/migrations/076_full_test_reset.sql` — DB-only portion (no direct `storage.objects` delete)

---

## May 21, 2026 — Order lifecycle, payments queue, public portal polish

### Payment evidence & accountant workflow
- Customer wire/ACH/Zelle/check/card proof **no longer auto-marks paid** — queues on `/payments` for accountant review
- `payment_evidence_amount` column (migration 071) — correct amount shown while pending
- Orders with pending evidence visible on **`/orders`** for ticket owner (Awaiting payment confirmation); accountants confirm on **`/payments`**
- `/payments/[id]` — dedicated payment review detail; list rows open here (not `/orders/[id]`)
- `record_payment` — **accountant + admin only**; clears evidence and sends **payment confirmed** email when applicable
- Accountant role: default home `/payments`, can confirm payment, view orders (in-production tab), completed, **Mark Completed** when paid in full

### Production & completed pages
- In-production orders on **`/orders?tab=in_production`** and **`/orders/[id]`** (legacy `/production` redirects)
- `/completed` + `/completed/[id]` — finished orders and detail (`context="completed"`)
- `/orders` tabs: All / Pending Payment / In Production / Cancelled
- Admin **Mark Completed** on in-production order detail; accountant when **paid in full** (`isTicketPaidInFull()`)
- **Resend invoice link** on in-production/completed detail — emails/SMS permanent `/q/{token}` link
- **Pickup notification** on mark complete — `sendOrderReadyToCustomer()` + History `ticket_order_ready_sent`
- **`markLeadWonOnProduction()`** — sets lead `sales_status = Won` on production release (SDR Won tab)

### Public page (`/q/[token]`)
- Unified portal phases: confirm → pay → evidence review → in production → **ready for pickup** (`order_ready`)
- Evidence pending shows amber **under review** (not paid); PDF hides paid rows until accountant confirms
- Completed orders: green pickup banner, **Ready for Pickup** badge, clickable address → Google Maps
- Net terms auto-release to production (migration 072, `maybe-auto-release-production.ts`)
- Staff logged in can preview `/q/{token}` — proxy skips RBAC on public paths

### CRM detail UX
- Unified **Overview + History** on `/quotes/[id]`, `/orders/[id]`, `/payments/[id]`, `/completed/[id]`
- Shared **LeadHistoryTable** on customer profile + Leads Won tab (Quote/Order refs, no SDR Status column)
- SDR Won row click → customer profile (`/crm/customers/[id]`)
- Quote stage overview: **Customer link** + **Copy** (with Copied! feedback)
- Quotes **All** tab badge = draft + sent + approved only (excludes in-production)

### Key new files
- `lib/utils/maybe-auto-release-production.ts`, `lib/utils/invoice-payment-summary.ts`, `lib/utils/copy-to-clipboard.ts`
- `lib/integrations/invoice-link-template.ts`, `order-ready-template.ts`, `payment-confirmed-template.ts`
- `components/quotes/quote-detail/ticket-detail-overview.tsx`, `ticket-overview-sections.tsx`, `quote-stage-overview.tsx`
- `components/orders/payment-detail-overview.tsx`, `production-detail-overview.tsx`

---

## What Was Accomplished (All Sessions to Date)

Starting point: BazarCRM had only an auth scaffold (login, 2FA, session gate). No database, no pages, no features.

### Phase 1–6 (MVP) — Complete
- Full DB schema with RLS, indexes, triggers, views, seed data (23 migrations)
- Auth additions: change-password, is_active check, must_change_password, DB-driven route RBAC
- SDR Leads page — All Leads, On Hold, Directed to Sales, Rejected tabs; Manual Add Lead with dedup lookup; Verify Drawer (lock + hold/reject/route/resume)
- Sales Pipeline page — Unclaimed, On Hold, Rejected tabs; Sales Drawer (lock + hold/reject/claim)
- Dashboard — role-scoped KPI cards (SDR / Sales / Admin), period selector, quick actions
- Admin panel — Users section (create/edit/deactivate), Settings tabs, Roles & Permissions matrix

### Post-MVP: CRM + Roles Editor — Complete
- `/crm` — customer list with search, status filter, heat filter, count badge
- `/crm/customers/[id]` — customer profile with edit modal, lead history table
- Merge Duplicate Customers — two-step modal + API (moves leads & activities, deletes duplicate)
- `/admin/settings/roles` — role list, create/delete custom roles, permission matrix toggle

### Testing & Polish Pass — Complete
- Product Interests UI: tag-picker (select + quantity rows) replaces checkbox grid
- CRM filter bar: removed duplicate "All" button, heat pills toggle correctly
- Verify drawer: context-aware footer (Resume replaces On Hold when lead is already on hold)
- Hold timestamp bug fix (`hold_until || null` — empty string was crashing Supabase)
- Leads tab badges: all tabs show counts before clicking via `/api/leads/workspace/counts`
- Sales tab badges: all tabs show counts before clicking via `/api/leads/sales-counts`
- Sidebar badges: role-aware red count pills on Leads and Sales nav items
- Counts refresh immediately after any action via `bazaar:refresh-counts` custom event
- SDR lead scoping: On Hold / Directed to Sales / Rejected tabs scoped to current SDR's own leads

### Design System & Code Quality — Complete
- All hardcoded hex values replaced with CSS variables (`var(--color-*)`) across all components
- New semantic tokens added to `globals.css` (danger-bg, success-bg, warning-bg, info-bg, neutral-bg + borders/text variants)
- `components/ui/urgency-pill.tsx` — reusable UrgencyPill component, replaces inline ternary logic in 5+ places
- `components/ui/status-pill.tsx` — fully tokenized
- `components/ui/spec-preview.tsx` — shared building blocks for spec preview pages
- Cursor rules added: `color-tokens.mdc`, `tab-counts.mdc`, `git-push-policy.mdc`, `mobile-table-cards.mdc`, `select-labels.mdc`

### Sales Pipeline — Rejected Tab Bug Fix & History Tab (2026-05-09)
- **Bug fixed:** Sales Pipeline Rejected tab was showing all system rejections (including SDR-rejected leads that never reached sales). Now uses `GET /api/leads/workspace?status=Rejected&prev_status=Routed+to+Sales` to show only leads rejected from within the sales pipeline.
- **`prev_status` on reject:** `PATCH /api/leads/[id]` now auto-saves `prev_status = current.status` when rejecting, enabling the above filter and the history label "Rejected from Sales pipeline".
- **`lead_rejected` payload enriched:** now includes `from: prevStatus` so the activity log shows the pipeline origin of every rejection.
- **`ActivityType` union fixed:** added `'lead_sales_claimed'` and `'lead_edited'` (both were used in code but missing from the type).
- **`GET /api/leads/[id]/activities`:** new endpoint — returns the full activity timeline for one lead, newest first, with `by_user.full_name` joined.
- **Sales Drawer History tab:** third tab in the drawer (alongside Lead Info and Order/Quote). Lazy-loads activities on first open. Renders a vertical timeline with colored dots, human-readable labels, optional notes, actor name, and relative timestamp.
- **`sales-counts` rejected badge:** now counts only `prev_status = 'Routed to Sales'` rejections so the badge matches the tab list.
- **Migration 033:** `033_reset_leads_to_pending.sql` — resets all leads to Pending/inbox for testing (clears all workflow state, truncates activities).

### Supabase Realtime Live Updates — Fixed & Documented (2026-05-10)

Two root-cause bugs were found and fixed that prevented real-time DB change events from reaching the admin's browser:

- **Bug 1 — RLS `SECURITY DEFINER` trap:** The `leads` table SELECT policies used `current_user_role()`, a `SECURITY DEFINER` function. In the Supabase Realtime evaluation context, this runs as `postgres` so `auth.uid()` returns `NULL` — every RLS check failed and events were silently dropped server-side. Fixed by replacing `current_user_role()` calls with inline `EXISTS` subqueries (`migration 038_fix_leads_rls_for_realtime.sql`).
- **Bug 2 — JWT timing trap:** `sidebar.tsx` was calling `.subscribe()` synchronously before `getSession()` resolved. Channels opened without a JWT, making the Realtime server treat them as unauthenticated. Fixed by moving all `.channel().subscribe()` calls inside the `getSession().then()` callback and removing manual `setAuth`/`onAuthStateChange` calls (those conflicted with `createBrowserClient`'s automatic JWT management).
- **Migration 037:** `GRANT SELECT ON public.leads TO authenticated` and same for `activities` — required for Realtime's RLS evaluation to succeed.
- **Sidebar badge count fixed:** `/api/sidebar-counts` now shows only **unclaimed** leads (`locked_by_id IS NULL`) for both admin and SDR roles, not total leads.
- **Admin dashboard Total Leads card:** now shows Open and Claimed sub-counts (`open_leads`, `claimed_leads`) alongside the period-scoped total. Realtime listener added — KPIs silently re-fetch whenever `bazaar:leads-changed` fires (no skeleton flash).
- **`docs/realtime-live-updates.md`:** fully rewritten with both bug explanations, correct RLS policy templates, subscription pattern guide, step-by-step checklist for new entities (e.g. orders), and complete debugging checklist.
- **`docs/api-contract.md`:** updated admin KPI response shape to include `open_leads`, `claimed_leads`, and the full `sdr_performance`, `rejection_reasons`, `source_breakdown` fields.
- **`docs/component-architecture.md`:** added Realtime Listeners table and `bazaar:leads-changed` row in Data Fetching Strategy.

### SDR History Tab, Sales Notes & Dashboard Enhancements (2026-05-09)
- **Verify Drawer History tab:** third tab added to the SDR's Verify Drawer (Lead Info | Quote | History). Same lazy-load pattern as Sales Drawer — fetches `GET /api/leads/[id]/activities` on first open. Full activity history visible even after a lead moves to Sales.
- **Sales Notes field:** `sales_notes text` column added to `leads` table (`migration 034`). Sales reps have a dedicated textarea in the Sales Drawer Lead Info tab. Changes saved via `PATCH /api/leads/[id]` and auto-logged as `lead_edited` activity entry.
- **Sales Pipeline tab renamed:** "Rejected (SDR)" → "Rejected" — the old label was misleading (these leads were rejected by Sales, not by SDRs).
- **Reset migration fix:** `033_reset_leads_to_pending.sql` corrected to set `is_inbox = false` (was `true`, which hid all leads from the workspace after reset).
- **`docs/TODO.md` created:** deferred item TODO-001 — Admin Override for Terminal Leads, with full problem description, fix sketch, and note that Won/Dropped must be handled separately after Tickets.
- **Dashboard — SDR:** two new KPI cards: Quote Value and My Share %.
- **Dashboard — Admin:** three new sections: SDR Performance Table (period-scoped, per-SDR stats), Rejection Reasons breakdown (all-time, red bars), Lead Sources breakdown (all-time, gold bars). No chart library — pure CSS bars matching the design system.

### Mobile Nav — Fixed
- Rewrote `components/layout/mobile-nav.tsx` from a hardcoded static list to role-based DB-driven pages (same logic as sidebar)
- Fixed admin-sub page filtering (was showing `/admin/users`, `/admin/roles` etc. in mobile menu)
- Added badge counts and `bazaar:refresh-counts` listener

### Tickets / Quotes & Orders — Complete (2026-05-12)
- Migrations 041–048: product catalog, extended job_tickets, admin RLS, order/quote lookup seed, company_settings, order sequence function, realtime for job_tickets, SKU lookup categories
- `lib/utils/ticket-math.ts` — QuoteSku interface, computePricing(), skuLineTotal(), formatCurrency()
- `lib/types/index.ts` — fully updated: QuoteSku (15 fields), JobTicket (40+ columns), TicketForm, CompanySettings, LookupCategory union (all categories)
- `/quotes/new` — `new-quote-form.tsx` — new quote form with up to 4 tabs: Customer (optional, shown for new customers), Line Items, Quote, Settings; the Customer tab is hidden when a lead or CRM customer is pre-selected via URL params
- `/quotes/[id]` — `quote-detail.tsx` — full detail view + edit mode, 2-tab layout (Info + History); Info tab contains all sections stacked
- `/quotes` — `quotes-page.tsx` — 4-tab Quoted Requests list with counts, search, sort
- `/orders` — `orders-page.tsx` — 4-tab Orders list (All | Pending Payment | In Production | Cancelled); includes evidence-pending for owner; API `status_label` / `status_tone`
- All dropdowns dynamically loaded from `lookup_values` via `/api/lookups`; `renderLookupOptions` helper prevents data loss for deactivated values
- Sidebar badges for `/quotes` and `/orders`
- `GET /api/lookups/products` — public product-type + material lookup for quote forms

### Record Locking, "Convert to Order", Won Tracking & Payment Link Bar (2026-05-16)

Full business-rule enforcement and payment workflow built:

- **Record locking**: Once a customer approves a quote (`client_confirmed = true`), the record is **locked for SDR/Sales users**. Only admins can cancel or edit it. A "Record Locked" banner is shown to non-admins. `isLocked` logic: `ticket.ticket_status === "cancelled" || (isCustomerApproved && userRole !== "admin")`.
- **"Convert to Order" (was "Mark Won")**: The "Mark Won" button was replaced with **"Convert to Order"**. Clicking it sets `ticket_status = "order"`, auto-generates `ORD-YYYY-NNN` reference code, sets `ticket_kind = "order"`, and logs `ticket_converted` activity. Mirrors the customer confirmation flow exactly.
- **`approved` status phased out**: The intermediate `approved` state is no longer used. Tickets go directly `sent → order` (either by customer or by rep clicking "Convert to Order"). The `approved` status is kept in the `TicketStatus` type for backwards compatibility only.
- **SDR/Sales Won tracking**: When a linked ticket enters **`in_production`**, the lead's `sales_status` is automatically updated to `"Won"`. Handled by `markLeadWonOnProduction()` on all production-release paths (not at order conversion).
- **SDR workspace "Won" tab**: `LeadHistoryTable` shared with customer profile — Status (`sales_status`), Source, Urgency, Quote/Order refs, Created. SDR row click → `/crm/customers/[id]`. API: `GET /api/leads/workspace?won=true` (nested tickets, no totals). Count: `counts.won`.
- **Payment Link Bar**: New `PaymentLinkBar` component visible on confirmed, unpaid orders. Shows: copyable public URL `/q/[token]` + channel selector (Email/SMS/WhatsApp) + pre-filled destination (switches to email or phone on channel change, user can override) + "Send Payment Link" button. Triggers `PATCH /api/tickets/[id]` with `{ send_payment_reminder: true, reminder_channel, reminder_destination }`.
- **Payment reminder email template**: New `lib/integrations/payment-reminder-template.ts` — dedicated "Pay Now" focused email. Shows order reference, amount due, payment methods, large "Pay Now" CTA. No line items.
- **Payment reminder SMS**: `sendPaymentReminder()` in `lib/integrations/send-quote.ts` handles Email/SMS/WhatsApp. SMS uses `toE164()` phone normalizer to ensure E.164 format (`+13233413620`) required by Twilio.
- **Payment status badge in order header**: Payment status (`Unpaid` / `Partial` / `Paid`) now shown as a colour-coded badge directly in the sticky header on order detail pages.
- **Activity logging enriched**:
  - `ticket_sent` — logged on every send/resend (not just status change). Resend adds `resend: true` to payload.
  - `ticket_converted` — logged when a rep clicks "Convert to Order".
  - `ticket_payment_reminder_sent` — logged every time a payment reminder is sent (channel + destination in payload).
- **Public confirmation page**: `/q/[token]` now dynamically shows "Quote Confirmed!" or "Order Confirmed!" based on `ticket_kind`.
- **Short reference code**: Quotes show `/{XXXXXXXX}` (first 8 chars of UUID, uppercase) next to the title in the header and in history. Orders show `ORD-YYYY-NNN` as the primary title. Searchable on quotes list.
- **Mobile-responsive order/quote detail page**: Header wraps (`flex-wrap`), badges abbreviated on small screens, PDF/Edit icon-only on mobile, layout stacks vertically (`flex-col lg:flex-row`), tabs `overflow-x-auto`, form grids `grid-cols-1 sm:grid-cols-2`, action bars `flex-wrap`.
- **SMS phone normalisation (`toE164`)**: Bare 10-digit US numbers (e.g. `3233413620`) are now auto-prefixed to `+13233413620`. Applied to `sendSms()` and `sendPaymentReminder()` in `lib/integrations/send-quote.ts`.

### Quote/Order Detail UX Simplification & Email Template Polish (2026-05-16)

- **Quote/Order detail — 2-tab layout**: Collapsed the 4-tab layout (Info | Line Items | Quote | History) into 2 tabs: **Info** (all content) and **History**. The Info tab scrolls through all sections separated by labelled dividers: Info → Line Items → Quote & Pricing.
- **Edit mode simplified**: Back/Next tab stepping removed. Single **Save Changes** button is always available. No stepping required since all fields are visible at once.
- **Order edit unlock**: Orders with `payment_status = 'unpaid'` (or unset) now show the Edit button. Editing locks once payment reaches `'partial'` or `'paid'`.
- **Email template — status badge repositioned**: The "Awaiting Approval" / "Confirmed" badge in the quote email is now a corner tab anchored to the top-right of the reference card (`border-radius:0 7px 0 8px`). Long ticket titles no longer push the badge out of position.
- **Dev email preview route**: `GET /api/dev/quote-email-preview` renders the full email template in-browser with fake data for visual testing.

### Prepayment / Deposit System — Complete (2026-05-15)

Full prepayment/deposit system built for Direct Order flow:

- **Full / Partial Payment toggle** (segmented button style) replaces the old always-visible % / $ controls
- **Partial Payment controls** (% / $ type + amount input + Due now / Balance breakdown) only shown when Partial is selected
- **`prepayment_status` column** (`pending` | `paid`, default `pending`) added to `job_tickets` via migration 054 — ready for Stripe webhook to flip automatically
- **Deposit status bar** on order detail (read-only): shows deposit amount + Pending / Paid toggle buttons; notes "Will be auto-updated by Stripe". Only visible when ticket is an order with a partial prepayment set.
- **Public quote page** (`/q/[token]`) now shows a **Payment Schedule** block when partial payment is set:
  - Amber "Deposit Due Now" box with amount and "Required to begin your order"
  - "Balance Remaining" row with "Due upon completion / delivery"
  - Hidden entirely for Full Payment orders
- `prepayment_type` now accepts `"full"` in addition to `"percent"` and `"fixed"`. Saves `"full"` / `"100"` for full payment mode.
- `prepayment_status` added to `ALLOWED_FIELDS` in `PATCH /api/tickets/[id]`
- `JobTicket` type updated with `prepayment_status: 'pending' | 'paid'`

### UI/UX Enhancements — New Quote & Quote Detail (2026-05-15)

Multiple UX improvements applied consistently to both `new-quote-form.tsx` and `quote-detail.tsx`:

- **Phone-first customer search** in New Quote Customer tab: Phone | Email → First Name | Last Name → Company → Source * → Industry * | Website. Debounced lookup. Pre-fill from customer + `latest_source`. Identity fields lock; Source/Industry/Website stay editable. `customer_id` + `from_quote_page` + `quote_source` on save. Decision Maker is on customer record only (not quote form).
- **Customer lock persistence**: `locked` and `foundName` states lifted to parent `NewQuoteForm` component so they survive tab navigation.
- **Dynamic quote destination pre-fill**: when customer is locked and "Send Via" channel changes, `quoteDestination` is automatically updated to the correct phone or email.
- **Rush toggle**: Manual only — no connection to the due date. The auto-toggle was built then removed at owner request.
- **Shipping / Tax Rate inputs**: local string state prevents snap-back to "0" when field is cleared.
- **Line total override**: manual "Line Total ($)" input in each SKU row — overrides qty × unit calculation. Shown with gold border when active. Line Item Comment moved to its own row above it.
- **Auto-scroll to new line item** when "Add Line Item" is clicked.
- **Standardized selects**: `SkuSelect` helper applies `appearance-none` + custom ChevronDown to all selects in Line Items tab. `StyledSelect` applied to Send Via and Follow-Up Frequency selects.
- **Payment method buttons**: segmented button group style (same as discount and prepayment toggles).
- **First Reminder date**: uses custom `DatePicker` component instead of native `<input type="date">`.
- **`Resend Quote` button**: shown on sent quotes instead of hiding the Send button.
- **`payment_status` selector** on order detail: Unpaid / Partial / Paid pills shown in read-only action bar for confirmed orders.
- **Orders page**: row click navigates to `/orders/[id]` (not `/quotes/[id]`). Payment status column with colour-coded pill added.
- **Sidebar counts**: `/orders` badge now filters by `ticket_status = 'order'` (was `ticket_kind = 'order'`).

### Quote/Order UI Redesign & Customer Flow (2026-05-13)

Major UX improvements and business rule enforcement:

- **New Quote form — unified entry point**: 4-step wizard (Customer → Info → Line Items → Quote) when creating standalone. Customer tab hidden when entering from Lead (`?lead_id`) or CRM (`?first_name&last_name&...` params). Read-only lead/customer card shown on left sidebar instead.
- **Customer upsert**: customer data saved to `customers` table on "Save Draft" or "Save & Send Quote" — customers created via quotes now appear in CRM.
- **CRM "Add Quote" button**: new action on CRM page pre-fills customer params in URL → skips Customer tab, shows read-only customer card.
- **Customer info card on quote detail**: if no linked lead but customer exists, shows customer card (`CustomerInfoCard`) on the left sidebar — includes source (`quote_source`), industry, and website for direct quotes.
- **Validation**: required fields enforced per tab before advancing. Line Items requires ≥ 1 fully-filled item.
- **Orders page**: now shows only `ticket_status = 'order'` tickets. `draft`, `sent`, `approved`, `routed` stay on Quotes page. "New Order" button removed.
- **Sidebar counts**: Quotes badge = `draft+sent+approved` (SDR) or `draft+sent+approved+routed` (Sales/Admin). Orders badge = `order` status only.
- **UI polish**: pill/chip checkboxes, single-select payment methods, custom DatePicker, redesigned Adjustments card, "Order Flow" segmented control (Quote First / Direct Order), "Add Line Item" as full-width dashed button, `#f8fafc` page background, `Urgent` priority hidden from user dropdown.

### High-Value Threshold (HVT) SDR Routing — Complete (2026-05-13)

Full business rule implementation for routing high-value quotes from SDRs to Sales:

- **`routed` ticket status** added to `lib/types/index.ts` `TicketStatus` union
- **HVT modal in `new-quote-form.tsx`**: fires when SDR advances from Line Items → Quote tab and `pricing.final_total > company_settings.high_value_threshold`. Non-dismissible modal with 30-second countdown. On "OK" or timeout: saves as `routed`, redirects to `/quotes`.
- **HVT modal in `quote-detail.tsx`**: same block fires when SDR clicks "Save Changes" on an existing `draft` quote over threshold.
- **`routed` tickets hidden from SDR Quotes page** "All" tab count (correctly subtracted in `GET /api/tickets/counts`)
- **"Routed to Sales" tab** on `/quotes` — visible to Sales/Admin only. Shows Contact, Title, Total (warning color), Routed By (SDR name), Date, Claim button.
- **Claim action** (`PATCH /api/tickets/[id]` with `claim_ownership: true`): Sales/Admin only; sets `ticket_status = 'draft'` and `created_by_id = claimant`; once claimed it disappears from other Sales users' "Routed to Sales" tab.
- **Supabase Realtime on `quotes-page.tsx`**: direct `postgres_changes` channel (independent of sidebar) so cross-session updates (SDR routes → Sales sees it; Sales claims → others see it disappear) happen instantly without manual refresh.
- **Sidebar badge**: Sales/Admin `/quotes` badge includes routed count.
- **`GET /api/tickets`**: Sales/Admin receive all `routed` tickets enriched with `created_by_name`.
- **Migration `050_add_urgent_priority.sql`**: seeds 'Urgent' to `ticket_priority` lookup (system-set only; hidden from UI dropdown).
- **Migration `051_backfill_routed_status.sql`**: retroactively marks SDR-created draft quotes over threshold as `routed`.
- **`docs/feature-specs/tickets.md`**: fully rewritten to document all current behaviour.

### PDF Export for Quotes & Orders — Complete (2026-05-14)

- **`lib/pdf/invoice-pdf.tsx`** — `@react-pdf/renderer` React component that produces a professional, fully styled PDF invoice. Sections: company header (logo or name, address, phone, email, website), Bill To block, Prepared By block, line items table (product, spec, qty, unit price, line total), pricing summary (subtotal → shipping → discount → pre-tax → tax → total), payment methods, delivery channel, special requirements, gold-accent footer. Works for both QUOTE and INVOICE document types.
- **`app/api/tickets/[id]/pdf/route.ts`** — authenticated GET endpoint. Fetches ticket + company settings, renders the PDF server-side with `renderToBuffer`, returns `application/pdf` with `Content-Disposition: attachment; filename="Quote-REF.pdf"` (or `Invoice-REF.pdf` for orders). Browser downloads the file immediately — no new tab, no print dialog.
- **`app/api/tickets/[id]/print/route.ts`** — HTML print endpoint (existing). Returns a fully styled HTML invoice document. Useful for browser-based print / Save as PDF via the system print dialog.
- **`components/quotes/quote-detail.tsx`** — "Save PDF" button replaced with a plain `<a href="/api/tickets/[id]/pdf" download>` link. One click → file download.
- **Root cause fix in both PDF and print routes:** `job_tickets.created_by_id` is the FK column (not `created_by`). The broken Supabase join `created_by:user_profiles(full_name)` was silently failing and making the whole query return null (404). Fixed by fetching the creator name in a separate query using `created_by_id`, identical to the pattern in `/api/tickets/[id]/route.ts`.
- Added `@react-pdf/renderer` to `package.json`.

### Admin Panel — Complete (2026-05-12)
- `/admin/settings/dropdowns` — fully built; 15+ categories (lead + order/quote + SKU)
- `/admin/settings/products` — product types + material library, full CRUD + link/unlink
- `/admin/settings/company` — EmailInput + PhoneInput components, ZIP digits-only, client-side validation
- `/admin/settings/integrations` — placeholder for Stripe + Zelle (configured buttons deferred)
- Admin overview card grid updated with Integrations card
- `components/ui/email-input.tsx` — added optional onBlur prop for external validation
- All phone fields use `PhoneInput`; all email fields use `EmailInput` — no inline duplicates

### Spec Preview System — Complete
All unbuilt pages now show their full feature spec as a styled in-app page instead of "coming soon":

| Page | Status |
|------|--------|
| `/tickets` | Spec preview — Quoted Requests, Orders, Order Drawer, PDF export, period filter |
| `/statistics` | Spec preview — SDR/Sales/Admin KPIs, charts, Recharts notes |
| `/notifications` | Spec preview — bell, real-time, all notification types |
| `/admin/settings/dropdowns` | Spec preview — categories, options table, API |
| `/admin/settings/notifications` | Spec preview — broadcast form, recent broadcasts |
| `/admin/settings/audit-log` | Spec preview — audit table, filters, pagination |
| `/admin/settings/company` | Spec preview — company info fields for PDF headers |
| `/admin/settings/products` | Spec preview — product types, materials, finishes |

### Navigation Cleanup — Complete
- `/settings` (personal account settings) removed from nav and DB — Admin manages passwords/2FA; theme is in sidebar
- Admin overview page updated: built sections show accent icon + "Open →"; unbuilt sections show "Planned" badge + "View spec →"
- Admin settings tab nav expanded with Audit Log, Company Info, Products tabs

### Build Gap Documentation — Complete
- `docs/feature-specs/leads-sdr.md` — "Build Status & Gaps" section added (6 deferred items with exact file/method to implement)
- `docs/feature-specs/leads-sales.md` — "Build Status & Gaps" section added (5 deferred items tied to Tickets phase)

---

## The Application

**BazaarPrinting CRM** — internal CRM for a B2B printing company.

**Roles:**
- **SDR** — adds leads, validates them, routes to Sales, holds or rejects
- **Sales Rep** — works leads routed by SDR, holds, rejects, or converts to order (future)
- **Admin** — full access, manages users, roles, and all settings

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16, App Router, React 19, TypeScript 5 strict |
| Auth | Supabase Auth — email/password + TOTP 2FA (AAL2) |
| Database | Supabase Postgres with Row Level Security |
| Styling | Tailwind CSS v4 + design system tokens (Navy/Gold light, Charcoal/Orange dark) |
| UI | shadcn (base-nova) + Lucide icons |
| Hosting | Vercel |
| Session gate | `proxy.ts` (Next.js 16 Proxy — never `middleware.ts`) |
| SMS | Twilio — toll-free number, Account SID + Auth Token auth |
| Email outreach | Instantly AI — v2 API, Bearer token, `INSTANTLY_SENDING_ACCOUNT` as sender |

---

## Current Navigation (as of 2026-05-16)

| Route | Section | Built? |
|-------|---------|--------|
| `/dashboard` | main | ✅ Built — role router (SDR / Sales / Admin dashboards) |
| `/leads` | main | ✅ Built — SDR workspace with All / On Hold / Directed to Sales / Rejected / **Won** tabs |
| `/sales` | main | ✅ Built |
| `/crm` | main | ✅ Built |
| `/crm/customers/[id]` | main | ✅ Built — full customer profile page |
| `/quotes` | main | ✅ Built — Quoted Requests list (All / Draft / Sent / Won / Routed to Sales tabs) |
| `/quotes/new` | main | ✅ Built — New Quote/Order form (Customer + 3 tabs; Customer tab conditional) |
| `/quotes/[id]` | main | ✅ Built — Quote/Order detail; record locked after customer approval (non-admins); "Convert to Order" button; Payment Link Bar; payment status badge; mobile-responsive |
| `/orders` | main | ✅ Built — Orders list (3 tabs: All / Pending Payment / Cancelled); Payment status column |
| `/orders/[id]` | main | ✅ Built — reuses QuoteDetail; locked for non-admins after confirmation; Payment Link Bar; payment status badge; deposit status bar; mobile-responsive |
| `/q/[token]` | public | ✅ Built — customer-facing quote page; "Quote Confirmed!" or "Order Confirmed!" based on kind; Confirm & Accept; Payment Schedule for partial prepayments |
| `/statistics` | main | ❌ Removed — Dashboard handles all KPIs and analytics |
| `/reports` | main | ✅ Built (placeholder) — 7 planned report types shown; full charts after Stripe; migration 058 adds page to DB |
| `/notifications` | main | ✅ Built — 2-tab layout: "Order / Lead Activity" (`ActivityLogSection`) + "User Activity" (`UserActivitySection` — session KPIs per user, admin only) |
| `/admin` | admin | ✅ Built — card grid overview (all 7 cards correct, 6 built + 1 planned) |
| `/admin/settings/users` | admin-sub | ✅ Built |
| `/admin/settings/roles` | admin-sub | ✅ Built |
| `/admin/settings/dropdowns` | admin-sub | ✅ Built — all lead + order/quote categories |
| `/admin/settings/products` | admin-sub | ✅ Built — product types, materials, links |
| `/admin/settings/company` | admin-sub | ✅ Built — with EmailInput + PhoneInput validation |
| `/admin/settings/integrations` | admin-sub | ✅ Built — Twilio SMS + Instantly AI live; Stripe + Zelle placeholder |
| `/admin/settings/notifications` | admin-sub | ⏳ Not built — broadcast form to send system messages to users/roles |

---

## Migrations (in order)

See `docs/schema.md` → Migration File Order for the full list (001–054). Key milestones:

| # | File | Purpose |
|---|------|---------|
| 001–021 | Core schema + seed | All base tables, RLS, indexes, triggers, views, functions, seed data |
| 022–033 | Nav + workflow fixes | Admin sub-pages, notifications page, lead reset, Realtime |
| 034 | `add_sales_notes_to_leads` | sales_notes field |
| 035–038 | Realtime | leads + activities realtime; RLS fix for realtime |
| 039 | `add_initial_interest_to_leads` | initial_interest field |
| 040 | `fix_activities_by_user_fkey` | activities FK → user_profiles |
| 041 | `create_products_catalog` | product_types, materials, material_groups, links (15 types, 37 materials) |
| 042 | `extend_job_tickets` | 28 new columns on job_tickets + order_sequence_counters |
| 043 | `fix_admin_rls_full_access` | admin full-access policies; no DELETE on tickets/leads |
| 044 | `seed_order_lookup_values` | 7 new lookup categories for order/quote dropdowns |
| 045 | `create_company_settings` | single-row company_settings table |
| 046 | `order_sequence_function` | increment_order_sequence() for ORD-YYYY-NNN |
| 047 | `enable_job_tickets_realtime` | REPLICA IDENTITY FULL + supabase_realtime for job_tickets |
| 048 | `add_sku_lookup_values` | color_mode, sides, roll_direction lookup categories |
| 049 | `remove_statistics_page` | deletes /statistics from pages table (Dashboard handles all analytics) |
| 050 | `add_urgent_priority` | seeds 'Urgent' to ticket_priority lookup (system-set only; hidden from user UI) |
| 051 | `backfill_routed_status` | retroactively sets ticket_status = 'routed' for SDR draft quotes over HVT threshold |
| 052 | `add_public_token_to_tickets` | `public_token` UUID column + unique index on job_tickets |
| 053 | `add_payment_status_to_tickets` | `payment_status` column (`unpaid`\|`partial`\|`paid`, default `unpaid`) |
| 054 | `add_prepayment_status_to_tickets` | `prepayment_status` column (`pending`\|`paid`, default `pending`) — Stripe-ready |
| 076 | `full_test_reset` | **DEV ONLY** — SQL wipe for clean testing; use with `npm run reset-test-data` for storage + DB |
| 056 | `add_idle_timeout_to_company_settings` | adds `session_idle_timeout_minutes` INTEGER NOT NULL DEFAULT 20 CHECK (>= 5 AND <= 480) to `company_settings` |
| 057 | `create_user_sessions` | `user_sessions` table: one row per login session; tracks `signed_in_at`, `signed_out_at`, `sign_out_reason`; RLS: users read/write own rows, admin reads all via service role |
| 058 | `add_reports_page` | adds `/reports` to `pages` table (section: main, sort_order: 9); access granted per-role via Admin panel |

---

## Key Architectural Decisions

### 1. Dynamic Role-Permission System
- `roles` table — Admin can create custom roles (e.g. "Manager")
- `pages` table — registry of all app routes
- `role_permissions` — many-to-many: which roles can access which pages
- `proxy.ts` reads permissions from DB on every request
- Adding a new page = add a row to `pages` table, grant to roles in Settings — **no code change**
- 3 system roles (SDR, Sales, Admin) are seeded and locked — cannot be deleted

### 2. User Creation — No Email Required
- Admin creates users with a **temporary password** (no email sent)
- Uses `supabase.auth.admin.createUser({ email_confirm: true })`
- `must_change_password = true` set on `user_profiles`
- `proxy.ts` intercepts: forces `/change-password` before any page loads
- Admin tells user their temp password directly (Slack, in person, etc.)
- After changing password → TOTP 2FA setup → dashboard

### 3. Lead Locking
- When a user opens a lead drawer → `POST /api/leads/[id]/lock` fires immediately
- Other users see the lead in **read-only mode** with "Being worked by [Name]" banner
- **No auto-expiry** — lock persists until user closes drawer OR Admin force-releases
- Admin always overrides any lock
- DB fields: `locked_by_id`, `locked_at` on `leads` table

### 4. Terminal Reject States
- `status = 'Rejected'` (SDR reject) — **only Admin can change**
- `sales_status = 'Rejected'` (Sales reject) — **only Admin can change**
- Route Handlers return `403` with `code: 'LEAD_REJECTED_TERMINAL'` for non-admin attempts

### 5. Customer Deduplication
- `customers` table — **no unique constraint** on phone or email
- When SDR types a phone → live lookup (600ms debounce)
- 0 matches: fill form fresh → new customer on submit
- 1 match: banner "Existing customer found" → Use info / Continue new
- 2+ matches: modal with list → pick one or add new
- CRM: Merge Duplicate button on customer profile — moves all leads + activities, deletes duplicate

### 6. Lead Status Flow
```
ALL LEADS (Pending)
  └─ SDR opens + locks
       ├─ Validated → On Hold → Resume → Route to Sales | Reject
       ├─ Route to Sales → Sales Pipeline
       └─ Reject → TERMINAL

SALES PIPELINE (Routed to Sales)
  └─ Sales opens + locks
       ├─ Ongoing → On Hold → Resume (always → Ongoing)
       ├─ Reject → TERMINAL
       └─ Convert to Order → (Tickets phase)
```

### User Session Tracking + Idle Sign-Out (2026-05-17)

- **Idle auto sign-out** — `components/layout/idle-timer.tsx` mounted in app layout; tracks mouse/keyboard/touch; shows blocking warning modal 2 min before timeout; auto signs out with session logging
- **Configurable timeout** — `session_idle_timeout_minutes` on `company_settings` (migration 056); Admin sets it in Company Info → Session & Security; min 5 min, max 480 min, default 20
- **Session logging** — `user_sessions` table (migration 057); one row per login session with `signed_in_at`, `signed_out_at`, `sign_out_reason` (`manual`/`auto`/`deactivated`/`unknown`)
- **Session start** logged after MFA verify in `verify-2fa/page.tsx`; stale open sessions auto-closed on new login
- **Session end** logged before sign-out in sidebar + mobile nav (reason: `manual`) and idle timer (reason: `auto`)
- **Admin User Activity tab** — second tab on `/notifications` page; per-user KPI cards (sessions, active time, auto sign-out count, green dot for active now) + filterable session history table (Today / 7d / 30d + user filter)
- **`/policy` page** — plain-English security policy (no auth required); linked from idle warning modal and Company Info
- **API routes** — `POST /api/auth/session` (start/end), `GET /api/admin/sessions` (admin KPI + history)

### Dashboard Fixes + Admin Overrides + Order Lifecycle (2026-05-17)

- **Dashboard revenue** — `GET /api/dashboard/kpis` now sums `job_tickets.quote_final_total` for all revenue/won-value/pipeline-value KPIs. Previously used `leads.quote_total` (stale snapshot never updated after quote edits). Applies to both Sales and Admin dashboard variants.
- **Admin override for terminal leads** — `SalesDrawer` and `VerifyDrawer` accept an `isAdmin` prop. When admin opens a Won/Dropped/Rejected lead: amber "Admin override" banner shown, drawer fully editable. Won leads show a caution note to handle the linked order manually in Tickets. Non-admins still see the red lock banner.
- **Order lifecycle** — In-production on `/orders?tab=in_production` + `/orders/[id]` (legacy `/production` redirects). `/completed` for finished orders. Mark Completed on order detail when in production. Pickup notification on complete. Auto-release via `maybe-auto-release-production.ts`. Won credit via `markLeadWonOnProduction()` on production release.
- **Dashboard session KPI cards** — Two new cards on admin dashboard: "Active Users" (users with an open session right now) and "Idle Sign-outs" (auto sign-outs in the last 7 days). Data sourced from `GET /api/admin/sessions`.

### 7. Count Badges Pattern
- Every tabbed UI fetches counts from a dedicated API endpoint on mount
- Badges show on **all tabs** before the user clicks (not just the active tab)
- After any action: `window.dispatchEvent(new Event("bazaar:refresh-counts"))` refreshes all badges instantly
- Sidebar badges also use this event + 60s polling interval
- Rule: `.cursor/rules/tab-counts.mdc`

### 8. Design System
- All colors via CSS variables — never hardcoded hex
- Tokens defined in `app/globals.css` for light and dark themes
- Rule: `.cursor/rules/color-tokens.mdc`

---

## What's Next — Build Queue

| Feature | Status | Notes |
|---------|--------|-------|
| ~~Twilio SMS~~ | ✅ Done (2026-05-14) | Toll-free number, real credentials, SMS delivering |
| ~~Instantly AI~~ | ✅ Done (2026-05-14) | v2 API, `INSTANTLY_SENDING_ACCOUNT` env var, email delivering |
| ~~PDF Export~~ | ✅ Done (2026-05-14) | `@react-pdf/renderer`, direct download link |
| ~~High-value SDR block~~ | ✅ Done (2026-05-13) | HVT modal + routed status + Sales claim flow |
| ~~Activity Log (/notifications)~~ | ✅ Done (2026-05-14) | `ActivityLogSection` — paginated activity feed, mobile cards |
| ~~Quote Send & Approval Flow~~ | ✅ Done (2026-05-14) | Email/SMS/WhatsApp delivery on Send Quote; public `/q/[token]` page; customer confirm → order |
| ~~Prepayment / Deposit system~~ | ✅ Done (2026-05-15) | Full/Partial toggle, deposit status tracking, payment schedule on public page, Stripe-ready |
| ~~Record Locking~~ | ✅ Done (2026-05-16) | Customer-approved records locked for non-admins; "Record Locked" banner |
| ~~Convert to Order flow~~ | ✅ Done (2026-05-16) | "Convert to Order" button replaces "Mark Won"; auto ORD-YYYY-NNN; `approved` status retired |
| ~~SDR/Sales Won tracking~~ | ✅ Done (2026-05-16, updated 2026-05-23) | `leads.sales_status = "Won"` on **production release**; "Won" tab in SDR workspace |
| ~~Payment Link Bar~~ | ✅ Done (2026-05-16) | Send payment reminders via Email/SMS/WhatsApp from locked order detail |
| ~~Mobile-responsive detail page~~ | ✅ Done (2026-05-16) | `flex-col lg:flex-row`, wrapping header, responsive grids, swipeable tabs |
| ~~User Session Tracking~~ | ✅ Done (2026-05-17) | Idle sign-out timer, session logging, admin User Activity tab, `/policy` page. |
| ~~Dashboard revenue fix~~ | ✅ Done (2026-05-17) | KPIs now use `job_tickets.quote_final_total` (actual final prices). |
| ~~Admin Override (terminal leads)~~ | ✅ Done (2026-05-17) | Amber banner + fully editable drawer for admins on terminal leads. |
| ~~Order lifecycle buttons~~ | ✅ Done (2026-05-17) | `order → in_production → completed` admin-only buttons on order detail. |
| ~~Dashboard session KPI cards~~ | ✅ Done (2026-05-17) | "Active Users" + "Idle Sign-outs (7d)" cards on admin dashboard. |
| Integrations — Stripe + Zelle | ⏳ Deferred | Placeholder built in Integrations tab; API wiring deferred. |
| Follow-up reminders cron | ⏳ Deferred | Data saved, no sending logic built (TODO-006). |
| ~~Reports placeholder~~ | ✅ Done (2026-05-17) | `/reports` page in nav; 7 planned charts shown; builds after Stripe. |
| Notification bell | ⏳ Next | Per-user notification feed; bell icon in header/sidebar. |
| AI / webhook lead ingestion | ⏳ Future | Auto-create leads from web form or external webhook. |

---

## Docs Index

| What you need | Where to look |
|---------------|--------------|
| DB schema + SQL | `docs/schema.md` |
| API endpoints | `docs/api-contract.md` |
| Who can access what | `docs/rbac.md` |
| Page routes + sidebar | `docs/navigation.md` |
| TypeScript types | `docs/types.md` |
| Component structure | `docs/component-architecture.md` |
| MVP scope boundary | `docs/mvp-scope.md` |
| SDR page behavior + gaps | `docs/feature-specs/leads-sdr.md` |
| Sales page behavior + gaps | `docs/feature-specs/leads-sales.md` |
| Lead locking | `docs/feature-specs/lead-locking.md` |
| Tickets spec | `docs/feature-specs/tickets.md` |
| Statistics spec | `docs/feature-specs/statistics.md` |
| Notifications spec | `docs/feature-specs/notifications.md` |
| Activity timeline spec | `docs/feature-specs/activity.md` |
| Admin panel spec | `docs/feature-specs/admin.md` |
| Dashboard spec | `docs/feature-specs/dashboard.md` |
| All changes | `docs/CHANGELOG.md` |
