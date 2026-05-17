# Changelog

All notable changes to BazaarPrinting CRM are documented here.
Format: `## [version or date] — description`, newest first.

## [2026-05-16] — TODO cleanup + new open items

### Changed
- `docs/TODO.md`: Removed completed items TODO-002 (auto-set Validated/Quoted) and TODO-003 (HVT SDR block). Updated TODO-001 (Admin Override) now that Tickets phase is complete — Won/Dropped override notes are no longer blocked. Added three new open items:
  - **TODO-004**: Dashboard revenue should pull from `job_tickets.quote_final_total`, not the stale `leads.quote_total` snapshot
  - **TODO-005**: No UI exists to advance orders through `in_production → completed` lifecycle stages
  - **TODO-006**: Follow-up reminder fields are saved to DB but no background job sends them

## [2026-05-16] — Documentation audit pass

### Fixed
- `docs/schema.md`: Added migration 055 (`reset_tickets_for_testing`) to the migration file order list.
- `docs/feature-specs/notifications.md`: Added missing ticket activity type labels (`ticket_sent`, `ticket_client_confirmed`, `ticket_converted`, `ticket_payment_reminder_sent`) to the Activity Type Labels table.
- `docs/session-summary.md`: Added migration 055 to the migration table; corrected Rush toggle description (auto-toggle was removed, manual only).
- `docs/feature-specs/tickets.md`: Corrected Rush toggle line — no longer auto-toggled by due date (auto-toggle removed).
- `docs/component-architecture.md`: Updated `/quotes/[id]` detail section to reflect 2-tab layout, record locking, new header badges, "Convert to Order" action, Payment Link Bar, and removed Rush auto-toggle from `new-quote-form.tsx` Info Tab description.
- `docs/order-ticket/README.md`: Updated `/quotes/[id]` description to reflect 2-tab layout and latest features.

## [2026-05-16] — SMS E.164 fix + mobile-friendly order detail

### Fixed
- `lib/integrations/send-quote.ts`: Added `toE164()` phone normaliser — bare 10-digit US numbers (e.g. `3233413620`) are now auto-prefixed to `+13233413620` so Twilio delivers the SMS correctly. Applied to both `sendSms` and `sendPaymentReminder`.
- `app/api/tickets/[id]/route.ts`: Improved payment reminder logging — logs success (channel + destination) and warns when reminder is skipped due to missing data.

### Changed
- `components/quote-detail.tsx` — mobile-responsive overhaul:
  - Header: `flex-wrap`, `px-4 md:px-6`, title shrinks gracefully, badges abbreviated on small screens, PDF/Edit buttons are icon-only on mobile
  - Error and lock banners: `mx-4 md:mx-6` responsive margin
  - Two-column layout: `flex-col lg:flex-row` so customer info card stacks above content on mobile
  - Customer info aside: `w-full lg:w-72` (no fixed width on mobile)
  - Tabs: `overflow-x-auto` + `whitespace-nowrap` so they swipe horizontally
  - Form grids: `grid-cols-1 sm:grid-cols-2` on all multi-column input rows
  - Action bars: `flex-wrap` so buttons don't clip off-screen

## [2026-05-16] — Payment reminder with channel selector

### Added
- `lib/integrations/payment-reminder-template.ts`: Dedicated email template for payment reminders — "Pay Now" focused, shows order reference + amount due + payment methods + big "Pay Now" CTA. No line items (customer already confirmed, they just need to pay).
- `lib/integrations/send-quote.ts`: `sendPaymentReminder()` — sends payment reminder via Email (Instantly), SMS (Twilio), or WhatsApp (Twilio). Accepts channel + destination overrides independent of the original quote channel.
- `components/quote-detail.tsx`: `PaymentLinkBar` now has a 3-way channel selector (Email / SMS / WhatsApp), a destination input pre-filled with the original channel destination, and a "Send Payment Link" button. Rep can switch channels before sending (e.g. originally emailed, now want to WhatsApp).
- `app/api/tickets/[id]/route.ts`: `send_payment_reminder` now accepts `reminder_channel` and `reminder_destination` overrides, passed to `sendPaymentReminder()`.

## [2026-05-16] — Payment link bar on confirmed orders

### Added
- `components/quote-detail.tsx`: **Payment link bar** shown on all confirmed (customer-approved) orders where payment is not yet complete. Visible to all roles regardless of record lock. Contains:
  - Copyable public URL (`/q/[token]`) to paste into any channel
  - "Resend via Email/SMS" button that re-sends the original quote email (the same link the customer already has) and logs a `ticket_payment_reminder_sent` activity
  - Payment method label (Offline / Zelle / Card)
- `app/api/tickets/[id]/route.ts`: `send_payment_reminder: true` body flag triggers re-delivery and activity log without touching the ticket fields.
- `components/quote-detail.tsx`: History tab shows `ticket_payment_reminder_sent` events ("Payment reminder sent").

## [2026-05-16] — SDR/Sales Won tracking + Won tab

### Added
- `components/leads-page.tsx`: New **Won** tab shows all leads where `sales_status = "Won"` — the leads that became real orders. Shows customer name, company, order reference code, final amount, who closed it, and when.
- `app/api/leads/workspace/counts/route.ts`: `won` count added to the counts response, scoped to the SDR's own leads (admins see all).
- `app/api/leads/workspace/route.ts`: `?won=true` query param returns won leads with linked ticket data (reference code, amount, closer name).

### Changed
- `app/api/public/quotes/[token]/confirm/route.ts`: When a customer confirms a quote, the linked lead's `sales_status` is now automatically set to `"Won"`. Covers Case 1 (SDR routed → Sales closed), Case 2 (SDR did it directly), and skips Case 3 (direct order, no lead).
- `app/api/tickets/[id]/route.ts`: Same auto-update when a rep manually clicks "Convert to Order".

## [2026-05-16] — HubSpot-style "Convert to Order" flow

### Changed
- `components/quote-detail.tsx`: "Mark Won" button renamed to **"Convert to Order"** and now targets `ticket_status = "order"` (not the orphan `approved` status).
- `app/api/tickets/[id]/route.ts`: When a ticket is manually converted to `order` status, the API now auto-generates an `ORD-YYYY-NNN` reference code (same as customer confirmation path) and flips `ticket_kind` to `"order"`.
- `app/api/tickets/[id]/route.ts`: Manual conversion logs a dedicated `ticket_converted` activity (distinct from `ticket_client_confirmed`), so History always shows who converted it.
- `components/quote-detail.tsx`: Header badge is now three-way — **"Confirmed by Customer"** (green, customer clicked link), **"Converted to Order"** (blue, sales rep converted manually), or the regular status pill for quotes still in progress.
- `components/quote-detail.tsx`: History tab handles `ticket_converted` activity type with label "Converted to order" and the generated reference code.

## [2026-05-16] — Confirmed by Customer badge + edit lock

### Changed
- `components/quote-detail.tsx`: Header status badge replaced with a green "✓ Confirmed by Customer" badge when `client_confirmed = true`, instead of the generic "order" pill.
- `components/quote-detail.tsx`: Edit button is now hidden for **all users** (including admin) once the customer has confirmed. Admin can still cancel via the bottom action bar.

## [2026-05-16] — Record locking after customer approval

### Changed
- `components/quote-detail.tsx`: Once a quote is customer-approved and becomes an order (`ticket_status` is `order`, `in_production`, or `completed`), the record is now locked for all non-admin users. SDR and Sales roles cannot edit or cancel the ticket.
- `components/quote-detail.tsx`: Admins retain full control — they can still edit and cancel orders.
- `components/quote-detail.tsx`: A warning banner ("This record is locked…") is shown to non-admin users when viewing a locked order, explaining that only an admin can make changes.

## [2026-05-16] — Log quote resend in history

### Fixed
- `app/api/tickets/[id]/route.ts`: Resending a quote (clicking "Resend Quote" when status is already `sent`) now always logs a `ticket_sent` activity, not just on the first send. The payload includes `resend: true` to distinguish it.
- `components/quote-detail.tsx`: History shows "Quote resent to customer" (vs "Quote sent to customer") when `payload.resend` is `true`

## [2026-05-16] — Short reference ID visible on quote detail and searchable

### Changed
- `components/quote-detail.tsx`: Title row now shows `/ #XXXXXXXX` (first 8 chars of ticket UUID, uppercased) next to the quote/order title so customers and staff can reference the same ID seen on the PDF
- `components/quotes-page.tsx`: Search now also matches the short 8-char ID so you can search `1649D8D7` and find the quote
- `lib/integrations/send-quote.ts`: Email now shows the short ID as the quote reference when no `reference_code` exists (quotes), matching the PDF filename
- `app/api/dev/quote-email-preview/route.ts`: Preview now passes a realistic short ID for testing

## [2026-05-16] — Rich history events for quote sent and customer confirmed

### Changed
- `app/api/tickets/[id]/route.ts`: When `ticket_status` changes to `"sent"`, now logs a dedicated `ticket_sent` activity with `channel`, `destination`, and `recipient` in the payload instead of the generic `order_ticket_status_changed`
- `app/api/public/quotes/[token]/confirm/route.ts`: Customer confirmation now logs `ticket_client_confirmed` instead of `order_ticket_status_changed`, with `via: "public_link"` and the generated `reference_code`
- `components/quote-detail.tsx` History tab: updated `ACTIVITY_META` labels ("Quote sent to customer", "Customer confirmed quote") and `activityDetail` to show channel + recipient for sent events and order reference for confirmation

## [2026-05-16] — Allow editing orders with no payment made

### Changed
- `components/quote-detail.tsx`: Edit button now shows on orders when `payment_status` is `"unpaid"` (or unset); locks once payment is `"partial"` or `"paid"`

## [2026-05-15] — Merge Info / Line Items / Quote tabs into single Info tab

### Changed
- `components/quote-detail.tsx`: collapsed the three edit tabs (Info, Line Items, Quote) into a single **Info** tab; History remains its own tab
- Combined tab renders all three sections stacked with labelled dividers (Info → Line Items → Quote & Pricing)
- Edit mode bottom bar simplified to just Cancel + Save (Back/Next tab navigation removed)
- Removed unused `ChevronRight` import

## [2026-05-15] — Prepayment / Deposit redesign + deposit status tracking

### Added
- `supabase/migrations/054_add_prepayment_status_to_tickets.sql` — new `prepayment_status` column (`pending` | `paid`, default `pending`) on `job_tickets`; ready for Stripe webhook integration
- Deposit status bar on order detail view: shows **Pending / Paid** toggle buttons when the order has a partial prepayment set; displays the calculated deposit amount; notes "Will be auto-updated by Stripe"
- `prepayment_status` added to `ALLOWED_FIELDS` in `PATCH /api/tickets/[id]` so it can be saved
- `prepayment_status: 'pending' | 'paid'` added to `JobTicket` TypeScript type

### Changed
- Prepayment / Deposit section redesigned in both New Quote form and Quote Detail edit view
  - Top-level **Full Payment / Partial Payment** toggle (segmented button style)
  - % and $ sub-controls only appear when **Partial Payment** is selected
  - Saves `prepayment_type = "full"` for full, or `"percent"/"fixed"` for partial
  - Loads back correctly from existing tickets

## [2026-05-14] — Fix: Orders detail page and nav highlight

### Added
- `app/(app)/orders/[id]/page.tsx` — order detail route (reuses `QuoteDetail` component), so `/orders/:id` is a valid page with the correct active nav highlight.

### Fixed
- `components/orders-page.tsx` — row click and "View" button now navigate to `/orders/${id}` instead of `/quotes/${id}`, so the sidebar highlights Orders (not Quotes) when viewing an order.

## [2026-05-15] — New Quote: phone-first customer lookup on Step 1

### Changed
- `components/new-quote-form.tsx` — Customer tab redesigned:
  - Field order is now **Phone | Email → First Name | Last Name → Company**
  - Phone is always editable and acts as the search key: after 600ms of no typing (with ≥7 digits), calls `GET /api/customers/lookup?phone=…`
  - If an existing customer is found: all other fields auto-fill and lock (read-only, visually dimmed). A green "✓ Existing customer: Name" banner appears with a **Clear** button to reset.
  - If no match: all fields remain editable and required fields are validated before advancing.

## [2026-05-14] — Payment status on orders (Unpaid / Partial / Paid)

### Added
- `supabase/migrations/053_add_payment_status_to_tickets.sql` — adds `payment_status` column (`unpaid` default, `partial`, `paid`) to `job_tickets`. Run in Supabase dashboard SQL editor.
- `components/orders-page.tsx` — new **Payment** column with color-coded pill: red Unpaid, amber Partial, green Paid.
- `components/quote-detail.tsx` — payment status bar on order detail page; SDR/admin can click Unpaid / Partial / Paid to update instantly without re-opening edit mode.

### Changed
- `lib/types/index.ts` — added `payment_status` to `JobTicket` type.
- `app/api/tickets/[id]/route.ts` — added `payment_status` to `ALLOWED_FIELDS`; relaxed order-lock so non-admin users can update `payment_status` even after a ticket is in order status.

## [2026-05-14] — Fix: Orders count badge showing 0 in sidebar

### Fixed
- `app/api/sidebar-counts/route.ts` — `/orders` badge now counts by `ticket_status = "order"` instead of `ticket_kind = "order"`. Covers both old tickets (kind=quote, status=order) and new tickets (kind=order, status=order).
- `app/api/tickets/counts/route.ts` — `orders` count fixed the same way so the Orders tab badge on the Orders page is also accurate.

## [2026-05-14] — Resend Quote button + fix disappearing Send button

### Changed
- `components/quote-detail.tsx` — when a quote is already in `sent` status, a **Resend Quote** button is shown instead of hiding the action entirely. Clicking it re-sends the quote to the customer via the same channel.
- `app/api/tickets/[id]/route.ts` — removed the `existing.ticket_status !== "sent"` guard so `sendQuoteToCustomer` is triggered on every PATCH that sets status to `"sent"`, enabling resends.

## [2026-05-14] — Fix: Approved Quotes No Longer Appear in Quoted Requests

### Fixed
- `app/api/public/quotes/[token]/confirm/route.ts` — now also sets `ticket_kind = "order"` (alongside `ticket_status = "order"`) when a customer confirms. This removes the ticket from the `?kind=quote` API filter used by the Quotes page.
- `components/quotes-page.tsx` — added defensive filter to exclude any ticket with `ticket_status === "order"` from all tabs, covering tickets confirmed before this fix.

## [2026-05-14] — Quote Send & Customer Approval Flow

### Added
- `supabase/migrations/052_add_public_token_to_tickets.sql` — adds `public_token uuid DEFAULT gen_random_uuid()` + unique index to `job_tickets`. Each ticket gets a unique, unguessable URL token.
- `lib/integrations/quote-email-template.ts` — professional HTML email template. Navy/gold design with company header, line items table, pricing summary, gold CTA button, and footer. Works for both quotes and direct orders.
- `lib/integrations/send-quote.ts` — server-side delivery utility. Routes by `quote_channel`: Email → Instantly AI, SMS → Twilio, WhatsApp → Twilio WhatsApp, In-person → no outreach.
- `app/(public)/layout.tsx` — minimal public layout (no auth, no sidebar).
- `app/(public)/q/[token]/page.tsx` — customer-facing quote/order page. Shows company branding, line items, pricing summary, payment methods, and a "Confirm & Accept" button. Mobile-responsive card layout.
- `app/api/public/quotes/[token]/route.ts` — `GET` returns safe public ticket fields + company settings. No auth required.
- `app/api/public/quotes/[token]/confirm/route.ts` — `POST` confirms the quote: sets `client_confirmed = true`, `ticket_status = "order"`, generates `ORD-YYYY-NNN` reference code via `increment_order_sequence` RPC, logs activity.

### Changed
- `app/api/tickets/[id]/route.ts` — PATCH handler now calls `sendQuoteToCustomer()` (fire-and-forget) when `ticket_status` transitions to `"sent"`. Delivery errors are logged to console but never block the response.
- `proxy.ts` — added `isPublic` check: paths starting with `/q/` are allowed without authentication.
- `lib/types/index.ts` — added `public_token: string` to `JobTicket` interface.

---

## [2026-05-14] — Remove Broadcast Notifications from scope

### Removed
- Broadcast Notifications feature removed from scope entirely — the `/notifications` Activity Log page already covers all notification needs
- Removed "Broadcast Notifications" card from `app/(app)/admin/page.tsx`
- Removed from build queue in `docs/session-summary.md`, `docs/feature-specs/notifications.md`, `docs/feature-specs/admin.md`, `docs/navigation.md`

---

## [2026-05-14] — Documentation audit & Admin overview fix

### Changed
- `app/(app)/admin/page.tsx` — fixed all `built` flags: Dropdown Options, Company Info, Products, and Integrations were incorrectly marked `built: false` (showing "Planned" badge). Now correctly marked `built: true`. Added "Broadcast Notifications" card (genuinely planned, `built: false`).
- `docs/session-summary.md` — corrected route table (`/notifications` marked ✅ Built; `/admin/settings/audit-log` removed — it does not exist); build queue rewritten with accurate status and priorities.
- `docs/navigation.md` — route tree updated with `/notifications` page entry; admin tab list corrected; "Notification Bell" section replaced with accurate "Activity Log / Notifications Page" description.
- `docs/feature-specs/notifications.md` — fully rewritten to reflect actual build state: Activity Log ✅ built, Broadcast Notifications ⏳ not built, Per-user bell V2 ⏳ future.
- `docs/feature-specs/admin.md` — Overview card grid table corrected (all 7 cards with accurate built status); Audit Log section removed (not a real tab); Broadcast Notifications section points to notifications spec.

---

## [2026-05-14] — Twilio & Instantly AI integrations live

### Changed
- `app/api/admin/integrations/instantly/test/route.ts` — migrated from deprecated Instantly API v1 (`/api/v1/emails/send`) to v2 (`/api/v2/emails/test`). Updated request body to v2 schema: `eaccount`, `to_address_email_list`, `subject`, `body.html`. Added `INSTANTLY_SENDING_ACCOUNT` env var check.
- `.env.local.example` — added `INSTANTLY_SENDING_ACCOUNT` variable (email account connected to Instantly workspace, required by v2 API).
- `TWILIO_PHONE_NUMBER` — updated from Twilio magic test number (`+15005550006`) to a real toll-free number. Toll-free numbers bypass US A2P 10DLC registration requirements.
- `TWILIO_WHATSAPP_FROM` — updated to Twilio WhatsApp Sandbox number (`whatsapp:+14155238886`). Full WhatsApp Business requires Meta Business Manager registration (deferred).

### Fixed
- Instantly test sending 404 error — v1 endpoint removed by Instantly; code now uses v2.
- SMS delivery blocked — was using Twilio magic test number which never delivers. Replaced with real toll-free number.

## [2026-05-14] — Twilio & Instantly AI integration scaffold

### Added
- `app/api/admin/integrations/twilio/test/route.ts` — authenticated POST endpoint; sends a test SMS or WhatsApp message via the Twilio SDK to a provided number. Returns `{ ok, sid, status }` or `{ ok: false, error }`.
- `app/api/admin/integrations/instantly/test/route.ts` — authenticated POST endpoint; sends a test email via the Instantly AI REST API to a provided address.
- `components/admin/integrations-section.tsx` — added live **Twilio** and **Instantly AI** cards to the Integrations settings page. Each card has a test-input field, send button with loading spinner, and inline success/error feedback. Existing Stripe/Zelle cards moved to a "Coming soon" section.
- `.env.local.example` — added `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER`, `TWILIO_WHATSAPP_FROM`, and `INSTANTLY_API_KEY` variable names.

### Changed
- `package.json` — added `twilio` npm package (v5.x) for SMS/WhatsApp sends.

## [2026-05-14] — Quote send validation, mail icon, and Send Quote section required fields

### Changed
- `components/quote-detail.tsx` — "Send Quote" button now shows a `Mail` icon (lucide-react) to the left of the label, making it immediately clear the quote is sent via email.
- `components/quote-detail.tsx` — "Send Via" and the contact destination field (email / phone / location) in the **Send Quote to Customer** and **Send Payment Link** sections now show a required `*` asterisk. Saving a draft quote or clicking **Send Quote** blocks and shows an inline error if the destination field is blank; error clears as soon as the user types. Added `quoteDestinationError` state; validation added inside `handleSave` before `setSaving(true)`.
- `components/new-quote-form.tsx` — Same required-field enforcement for the **Send Quote to Customer** / **Send Payment Link** sections in the Quote tab. `quoteDestinationError` prop added to `QuoteTabProps`; validation added in `validateAndAdvance` (when leaving the Quote tab) and in `handleSave` (when status is `"sent"`). Error clears on input via wrapped setter `clearQuoteDestinationError`. Both `EmailInput` and `PhoneInput` receive the `error` prop; plain text input gets a red border + `<p role="alert">` message.

## [2026-05-14] — PDF download for quotes and orders

### Added
- `lib/pdf/invoice-pdf.tsx` — `@react-pdf/renderer` React component (`InvoicePDF`) that produces a styled PDF: company header (logo or text name, address, phone, email, website), Bill To, Prepared By, line items table (product, spec, qty, unit price, line total), pricing summary (subtotal → shipping → discount → pre-tax → tax → total), payment methods, delivery channel, special requirements, gold-accent footer. Supports QUOTE and INVOICE document types.
- `app/api/tickets/[id]/pdf/route.ts` — authenticated GET endpoint; fetches ticket + company settings, renders PDF with `renderToBuffer`, returns `application/pdf` + `Content-Disposition: attachment; filename="Quote-REF.pdf"`. One click in the browser downloads the file directly.
- `app/api/tickets/[id]/print/route.ts` — (kept) HTML fallback; returns a fully styled standalone HTML invoice with `@media print` rules and auto-print script when loaded in an iframe.

### Changed
- `components/quote-detail.tsx` — replaced the iframe-based print hack with a plain `<a href="/api/tickets/[id]/pdf" download>` link. No JavaScript needed.
- `package.json` — added `@react-pdf/renderer`

### Fixed
- `app/api/tickets/[id]/pdf/route.ts` + `print/route.ts` — removed broken Supabase join `created_by:user_profiles(full_name)` (FK column is `created_by_id`, not `created_by`). The bad join caused the entire ticket query to return null → 404 on every request. Creator name is now fetched separately, matching the pattern in `GET /api/tickets/[id]`.

### Documentation
- `docs/session-summary.md` — added PDF Export section under completed work; marked PDF Export done in build queue
- `docs/api-contract.md` — added `GET /api/tickets/[id]/pdf` and `GET /api/tickets/[id]/print` endpoint docs
- `docs/component-architecture.md` — added PDF Generation section with `InvoicePDF` component, how-it-works notes, and pattern for adding new PDF types

## [2026-05-13] — Documentation audit and corrections

### Fixed
- `docs/schema.md` — added `order` to ticket_status enum (confirmed order on Orders page); added `order_ticket_status_changed` to Activity Type Enums table
- `docs/types.md` — added `'order'` to `TicketStatus` union; added `customer_id` alias note on `Activity` interface (`contact_id` was stale)
- `lib/types/index.ts` — added `'order'` to `TicketStatus` union (matches runtime usage)
- `docs/navigation.md` — corrected `/orders` tabs to 3 (All | Active | Cancelled, no Won/completed); added `?tab=routed` to Tab URL Convention; fixed All tab filter to `IN ('order','cancelled')`
- `docs/feature-specs/tickets.md` — corrected Orders page tab table (3 tabs, removed Won/in_production)
- `docs/component-architecture.md` — corrected Orders page tab list (3 tabs, not 4)
- `docs/api-contract.md` — corrected Notifications section from "two" to "three" Realtime channels; added `tickets-realtime` channel entry
- `docs/session-summary.md` — fixed `/quotes/new` description (conditional Customer tab, not "3 tabs"); fixed `/orders` description (3 tabs); updated migration range from 001–048 to 001–051

## [2026-05-13] — HV threshold check extended to quote-detail editing

### Changed
- `components/quote-detail.tsx` — SDR users editing an existing `draft` quote now trigger the same High-Value Threshold blocking modal as the new-quote flow. If the final total exceeds the threshold, a non-dismissible modal with a 30-second countdown appears; on "OK" or timeout the quote is saved as `routed` and the SDR is redirected to `/quotes`. Applies regardless of whether the draft was created from a lead, the CRM, or the Quotes page.

## [2026-05-13] — Backfill routed status for pre-migration SDR quotes

### Added
- `supabase/migrations/051_backfill_routed_status.sql` — one-time backfill that finds `draft` quotes created by SDR users whose `quote_final_total` exceeds the company's `high_value_threshold`, and sets their `ticket_status` to `routed` so Sales can see and claim them in the new "Routed to Sales" tab



### Added
- `lib/types/index.ts` — added `'routed'` to `TicketStatus` union
- `components/quotes-page.tsx` — "Routed to Sales" tab (visible only to `sales` and `admin` roles); dedicated table layout showing SDR name, total, and a "Claim" button; routed tickets hidden from all other tabs; amber badge on the tab
- `app/api/tickets/[id]/route.ts` — `claim_ownership: true` in PATCH body triggers a claim flow: validates ticket is `routed`, updates `ticket_status → draft` and `created_by_id → claimant`, logs activity. GET now also allows `sales`/`admin` to view `routed` tickets they don't own.
- `app/api/tickets/counts/route.ts` — added `routed` count for `sales`/`admin` roles
- `app/api/sidebar-counts/route.ts` — `/quotes` badge for `sales`/`admin` now includes unclaimed routed ticket count

### Changed
- `components/new-quote-form.tsx` — high-value HV redirect saves ticket as `'routed'` instead of `'draft'`; `handleSave` signature updated to accept `"routed"`
- `app/api/tickets/route.ts` — GET: `sales` users now receive their own tickets **or** tickets with `ticket_status = 'routed'`; routed tickets are enriched with `created_by_name` (SDR display name from `user_profiles`)



### Added
- `components/new-quote-form.tsx` — when an SDR user clicks "Next" from Line Items and the quote total exceeds the company's High-Value Threshold, a blocking modal appears with a 30-second animated countdown ring. On "OK" or countdown expiry the draft is auto-saved and the user is redirected to `/quotes` so a Sales rep can claim it. The user cannot dismiss the modal in any other way.
- Fetches current user's role on mount via Supabase `user_profiles` so the check only applies to `sdr` users.



### Changed
- `components/crm-page.tsx` — added "Add Quote" (`FilePlus`) button next to "View" in both table row and card view; clicking it navigates to `/quotes/new` with customer fields pre-filled as query params
- `components/new-quote-form.tsx` — reads `first_name`, `last_name`, `email`, `phone`, `company` from URL search params to pre-fill the Customer tab; automatically skips to the Info tab when arriving with customer data already filled

## [2026-05-13] — Fix sidebar counts; move "Won" to Quotes page

### Fixed
- `app/api/sidebar-counts/route.ts` — sidebar badge for "Quoted Requests" was always 0 because `ticketQuery()` returns data rows (not a count), so switched to `(data ?? []).length`. Also added `approved` to the `/quotes` badge statuses.

### Changed
- `components/quotes-page.tsx` — renamed "Approved" tab to **"Won"** (customer accepted quote).
- `components/orders-page.tsx` — removed "Won" / `approved` tab and status from Orders; `approved` tickets now live exclusively on the Quotes page. Orders page now only shows `order` and `cancelled`.
- `app/api/sidebar-counts/route.ts` — `/quotes` badge includes `draft + sent + approved`; `/orders` badge counts only `ticket_status = "order"`.

## [2026-05-13] — Use admin-panel lookups for priority, channel, payment, follow-up freq

### Changed
- `components/quote-detail.tsx` — fetches `ticket_priority`, `quote_channel`, `ticket_payment`, `follow_up_freq` from `/api/lookups`; hardcoded arrays (`PRIORITY_OPTIONS`, `CHANNEL_OPTIONS`, `PAYMENT_OPTIONS`, `FOLLOW_UP_FREQ`) kept only as fallbacks. `InfoSection` and `QuoteSection` now receive these as props.

### Added
- `supabase/migrations/050_add_urgent_priority.sql` — seeds `('ticket_priority', 'urgent', 'Urgent', 3)` so "Urgent" appears in priority dropdowns from the admin panel



### Changed
- `components/quote-detail.tsx` — Quote tab now renders two distinct flows:
  - **Quote first**: shows pricing inputs → "Send Quote to Customer" (channel + destination) → Follow-up Schedule. Payment Methods section only appears once the ticket status is `approved`
  - **Direct order**: shows pricing inputs → Payment Methods first → "Send Payment Link" (channel + destination). No follow-up schedule
- Read-only view labels update to match the active flow ("Send Payment Link Via" vs "Send Quote Via"; Payment Methods hidden for quote-first until approved)

## [2026-05-13] — Fix urgency check constraint on lead create/edit

### Fixed
- `app/api/leads/manual/route.ts` — normalize urgency to title case (`high` → `High`) before inserting; lookup values store lowercase keys but the DB constraint requires `'High' | 'Medium' | 'Low'`
- `app/api/leads/[id]/route.ts` — same normalization applied in the PATCH handler so editing a lead's urgency no longer throws the constraint violation

## [2026-05-13] — Consolidated schema file for fresh DB setup

### Added
- `supabase/schema.sql` — single-file equivalent of all 50 migrations (001–049).
  Run this on a blank Supabase project to reach the current production schema in one shot.
  Includes: all table definitions (final column state), indexes, RLS + policies (final),
  functions, triggers, views, realtime setup, grants, and all seed data
  (roles, pages, role_permissions, lookup values, product catalog, company settings).
  Dev-only and one-time cleanup scripts are intentionally excluded.

## [2026-05-13] — Remove Statistics page (Dashboard handles all analytics)

### Removed
- `app/(app)/statistics/page.tsx` — spec-preview page deleted; never built
- `docs/feature-specs/statistics.md` — spec deleted; analytics covered by Dashboard instead
- `supabase/migrations/049_remove_statistics_page.sql` — removes `/statistics` from `pages` table; `role_permissions` rows cascade-delete

### Changed
- `docs/navigation.md` — removed `/statistics` from all three sidebar views (SDR / Sales / Admin), icon map, and breadcrumb table
- `docs/rbac.md` — removed `/statistics` from SDR and Sales default page lists and from the page access matrix
- `docs/schema.md` — marked `/statistics` page row as removed; updated default page lists for SDR and Sales roles; added migration 049 to file order
- `docs/session-summary.md` — navigation table updated (Statistics row marked removed); migration table updated with 049; "What's Next" updated

## [2026-05-13] — Final doc pass: session-summary + SDR duplicate-check endpoint

### Fixed
- `docs/feature-specs/leads-sdr.md` — "Duplicate banner" section had wrong endpoint `/api/contacts/lookup`; corrected to `/api/customers/lookup` (matches the Manual Add Lead section in the same file and the actual API)

### Changed
- `docs/session-summary.md` — updated to current state (last updated was May 10, missing Tickets/Admin/Integrations work): status line refreshed, navigation table updated (all /quotes + /orders + admin tabs now shown as ✅ Built), migration table updated to 048, "What Was Accomplished" expanded with Tickets and Admin sections, "What's Next" queue updated to remove already-built items and add remaining deferred work

## [2026-05-13] — Triple-check audit: code bug fixes + final doc corrections

### Fixed
- `lib/types/index.ts` — `LookupCategory` was missing `color_mode`, `sides`, `roll_direction` (present in DB and `CATEGORY_META` but not in the type union); `QuoteSku` interface was outdated (missing `color_mode`, `sides`, `roll_direction`, `spot_uv`, `foil`, `perforation`, `comment`); both now match `lib/utils/ticket-math.ts` and the actual DB schema

### Changed
- `docs/api-contract.md` — Company Settings response shape corrected: `address_street/city/state/zip/country` → `address_line1`, `address_line2`, `city`, `state`, `zip` (matches migration 045 column names)
- `docs/feature-specs/admin.md` — Company Info address fields: removed non-existent "Country" field; now shows Address Line 1, Address Line 2, City, State, ZIP
- `docs/schema.md` — added `company_settings` table definition (missing from docs despite migration 045 being present)
- `docs/types.md` — `TicketBuilderForm` renamed to `TicketForm` (matches actual `lib/types/index.ts`); `QuoteSku` updated to canonical shape; `LookupCategory` changed to flat union (matches actual code); added `CompanySettings` interface (was in code but missing from docs)

## [2026-05-13] — Second documentation pass — navigation, architecture, RBAC

### Changed
- `docs/navigation.md` — dashboard and change-password corrected from "TO BUILD" to "✓ EXISTS"; CRM corrected from `⬜` to `✓` in all sidebar role views; Settings corrected to `✓`; integrations tab added to admin settings route tree and breadcrumbs table
- `docs/architecture.md` — file structure completely updated: migrations bumped from 033 to 048; added all Tickets API routes (`/api/tickets/*`), lookup routes (`/api/lookups/products`), admin routes (`/api/admin/company`, `/api/admin/lookups/*`, `/api/admin/product-types/*`, `/api/admin/materials/*`); added all new components (`new-quote-form`, `quote-detail`, `quotes-page`, `orders-page`, all admin sections); added `lib/utils/ticket-math.ts`
- `docs/rbac.md` — API endpoint matrix replaced with correct current endpoint names (`/api/customers/` not `/api/contacts/`, no `/api/leads/inbox`, no `/api/leads/verify`); added 15 new rows for tickets, lookups, admin CRUD; Database RLS matrix renamed `contacts` → `customers` and added `lookup_values`, `product_types/materials`, `company_settings` rows

## [2026-05-13] — Full documentation audit and update

### Changed
- `docs/types.md` — `LookupCategory` now includes all 10 order/quote categories; `QuoteSku` fully rewritten to match `lib/utils/ticket-math.ts` (was stale old shape); `JobTicket` updated with all 28+ columns from migration 042; `TicketBuilderForm` rewritten to match `new-quote-form.tsx` local state shape
- `docs/api-contract.md` — `POST /api/tickets` body updated with all current fields (title, priority, due_date, rush, all quote_* pricing fields, etc.); `GET /api/admin/lookups` response updated to include all 10 order/quote categories; added missing `GET/PATCH /api/admin/company` and `GET /api/lookups/products` endpoint documentation
- `docs/mvp-scope.md` — removed stale "Future Fields" note for `quote_total`, `quote_channel`, `quote_destination` (all built)
- `docs/component-architecture.md` — expanded `PhoneInput` and `EmailInput` "Used in" to reflect all current usages; added component-reuse rule
- `docs/feature-specs/tickets.md` — Send Via destination field documents smart component swap (EmailInput / PhoneInput)
- `docs/feature-specs/admin.md` — Company Info documents PhoneInput + EmailInput usage + client-side validation; Invite User form documents EmailInput usage

## [2026-05-13] — Use shared PhoneInput / EmailInput everywhere

### Changed
- `components/ui/email-input.tsx` — added optional `onBlur` prop so callers can attach blur-time validation
- `components/admin/company-section.tsx` — replaced custom `FieldInput type="email"` with reusable `EmailInput` (was already using `PhoneInput` for phone)
- `components/admin/users-section.tsx` — replaced shadcn `Input type="email"` on invite form with reusable `EmailInput`
- `components/new-quote-form.tsx` — quote delivery destination now renders `EmailInput` when channel is Email, `PhoneInput` when SMS/WhatsApp, plain text input otherwise
- `components/quote-detail.tsx` — same conditional-component pattern for quote destination as above; label also updated to reflect In-person / SMS / WhatsApp channels

## [2026-05-13] — Add Integrations section to Admin panel

### Added
- `components/admin/integrations-section.tsx` — placeholder page showing Stripe and Zelle cards with "Coming soon" badges, planned feature bullets, and disabled "Configure" buttons
- `app/(app)/admin/settings/[tab]/page.tsx` — registered `integrations` as a supported tab
- `app/(app)/admin/page.tsx` — added Integrations overview card with `Plug` icon
- `components/admin/settings-tab-nav.tsx` — added Integrations tab link

---

## [2026-05-12] — Guard inactive/deleted lookup values in all selects

### Changed
- `components/new-quote-form.tsx` + `components/quote-detail.tsx` — replaced `withSavedValue` helper with `renderLookupOptions`. If a saved value is no longer in the active list (deactivated or hard-deleted), it is re-injected as `"<label> (inactive)"` with the HTML `value` attribute set to the **original label string** so the stored data is never silently wiped on save. Applied to all SKU and Quote tab selects.

---

## [2026-05-12] — Quote tab dropdowns (Priority, Channel, Payment, Follow-up) now dynamic

### Changed
- `components/new-quote-form.tsx` — removed hardcoded `PRIORITY_OPTIONS`, `CHANNEL_OPTIONS`, `PAYMENT_OPTIONS`, `FOLLOW_UP_FREQ` constants and dead `PREPAY_OPTIONS`. All four are now loaded via `/api/lookups?categories=ticket_priority,quote_channel,ticket_payment,follow_up_freq` in the same single request that already fetches SKU lookups. Added `QuoteLookups` type. `InfoTab` and `QuoteTab` accept the lookup arrays as props.

---

## [2026-05-12] — SKU dropdowns now fully admin-managed (no more hardcoded options)

### Changed
- `components/new-quote-form.tsx` + `components/quote-detail.tsx` — Lamination, Color Mode, Sides, Roll Direction, and Add-on Finishings are now loaded at runtime from `/api/lookups?categories=lamination,color_mode,sides,roll_direction,finishing`. Hardcoded option arrays removed. Fallback to built-in values if API data is not yet loaded.
- Admin → Dropdown Options now shows all 5 SKU categories under **Order / Quote** section (Color Mode, Sides, Roll Direction were registered via migration 048; Add-on Finishings / Lamination were already present)

---

## [2026-05-12] — Match shadow project SKU field order; add Line Item Comment

### Changed
- `components/new-quote-form.tsx` — `SkuRow` fields reordered to match shadow project: Product Type / Material → Width / Height → Color Mode / Sides → Quantity / Unit Price → **Lamination / Roll Direction** (side-by-side, always visible). Roll Direction is no longer conditional. Added line-price banner and Line Item Comment textarea. Add-on Finishings section split into UV Coating / Foil / Perforation checkboxes + Design on file / Die Cut row.
- `components/quote-detail.tsx` — `EditableSkuRow` updated with same field order and new fields. Read-only card now shows comment.
- `lib/utils/ticket-math.ts` — `QuoteSku` extended with `comment?: string`

---

## [2026-05-12] — Add Color Mode, Sides, Roll Direction to SKU form

### Added
- `supabase/migrations/048_add_sku_lookup_values.sql` — seeds three new admin-managed lookup categories: `color_mode`, `sides`, `roll_direction`
- `app/api/admin/lookups/route.ts` — registers the three new categories in `CATEGORY_META` so they appear under Admin → Dropdown Options → Order / Quote

### Changed
- `lib/utils/ticket-math.ts` — `QuoteSku` interface extended with `color_mode`, `sides`, `roll_direction` optional fields
- `components/new-quote-form.tsx` — SKU row now renders Color Mode + Sides in a 2-column grid row, and Roll Direction (conditionally, for roll-based product types)

---

## [2026-05-12] — Close shadow project gaps in new-quote-form

### Changed
- `components/new-quote-form.tsx`
  - SKU description is now auto-derived on every field change: `productType – material – lamination` (shadow project rule; needed for PDF)
  - Quote destination input now uses `type="tel"` for SMS and WhatsApp channels (was `type="text"`)
  - Prepayment section now shows **Due now / Balance** split below the input, using the shadow project's prepayment formula

## [2026-05-12] — Clickable phone and email across all lead/customer cards

### Changed
- `components/new-quote-form.tsx` — phone → `tel:` link, email → `mailto:` link in LeadInfoCard; both styled in accent color with hover opacity
- `components/quote-detail.tsx` — same in LinkedLeadCard
- `components/customer-profile.tsx` — phone and email in the contact fields grid are now `tel:` / `mailto:` links

## [2026-05-12] — Quote detail page Linked Lead card shows full context

### Changed
- `components/quote-detail.tsx` — `LinkedLeadCard` updated to match `new-quote-form.tsx`: now shows industry, returning customer badge, source, urgency, "What they need", product interests + quantities, and SDR notes. Updated `Lead` interface to include `source`, `sdr_comment`, `is_returning_customer`, `interests`, `quantities`, `customer.industry`.

## [2026-05-12] — New quote lead info card shows full lead context

### Changed
- `components/new-quote-form.tsx` — `LeadInfoCard` now shows all useful lead data: name + company + industry, returning customer badge, phone, email, lead source, urgency, "What they need" (initial interest), product interests + quantities (bullet list), SDR notes. Updated `LeadInfo` interface to include `sdr_comment`, `is_returning_customer`, `interests`, `quantities`, `customer.industry`, `customer.website`.

## [2026-05-12] — Fix: GET /api/leads/[id] was missing

### Fixed
- `app/api/leads/[id]/route.ts` — added `GET` handler; previously only `PATCH` existed. Without this, `new-quote-form.tsx` could never fetch the lead on page load, so `customer_id` was always null on created tickets and the lead info card was always empty.

## [2026-05-12] — CRM customer profile shows Quotes & Orders

### Changed
- `components/customer-profile.tsx` — replaced "Order History" placeholder with a live list of quotes and orders for the customer; fetches `GET /api/tickets?customer_id=<id>` in parallel with the customer data; each row shows kind icon, title, Rush badge, reference code, relative date, total, and status pill; clicking a row navigates to `/quotes/[id]`
- `app/api/tickets/route.ts` — added `customer_id` query param filter so the CRM can fetch tickets scoped to a specific customer

## [2026-05-12] — Fix: tickets API DB_ERROR on user_profiles join

### Fixed
- `app/api/tickets/route.ts` — removed `created_by:user_profiles!job_tickets_created_by_id_fkey` from the SELECT; `created_by_id` references `auth.users`, not `user_profiles`, so PostgREST had no FK path and returned a 500. Creator name is not shown in the list view so the join was unnecessary.
- `app/api/tickets/[id]/route.ts` — same bad join removed; creator profile is now fetched with a separate `user_profiles` query after the ticket is loaded. Also fixed `lead:leads(...)` select — removed `first_name`, `last_name`, `industry`, `notes` which don't exist on the `leads` table (those live on `customers`); the invalid column names caused Supabase to return null even when the ticket existed, producing a false 404.

## [2026-05-12] — Fix: Save Draft redirects to Quoted Requests list

### Changed
- `components/new-quote-form.tsx` — after saving: **Save Draft** → `/quotes` (list), **Save & Send Quote** → `/quotes/[id]` (detail page for immediate follow-up)

## [2026-05-12] — Fix: proxy.ts blocked /quotes/new and /quotes/[id]

### Fixed
- `proxy.ts` — route permission check was an exact match against `pages.route`, so sub-routes like `/quotes/new` and `/quotes/[id]` were never found in `role_permissions` and every non-admin user was silently redirected to their home page instead. Changed to prefix matching: if a role has access to `/quotes`, they automatically have access to `/quotes/*`. This also future-proofs `/crm/[id]`, `/orders/[id]`, etc.

## [2026-05-12] — Docs audit: full sweep of all 33 doc files

### Changed
- `docs/rbac.md` — replaced `/tickets` with `/quotes`, `/quotes/new`, `/quotes/[id]`, `/orders` in route matrix and role definitions; added `GET /api/tickets/[id]`, `GET /api/tickets/counts`, `GET /api/activities` to API access matrix
- `docs/api-contract.md` — added `GET /api/tickets/counts` endpoint; added `GET /api/activities` (ticket-scoped + `include_linked_lead` param) above the older lead-scoped activity endpoints
- `docs/feature-specs/activity.md` — updated "Used inside" header to reference `quote-detail.tsx` instead of "Order Drawer"; expanded ticket-scoped section to document the built `GET /api/activities?ticket_id` and `include_linked_lead` parameter
- `docs/feature-specs/dashboard.md` — "Quotes & Orders" quick action link changed from `/tickets` to `/quotes`
- `docs/feature-specs/admin.md` — custom role page example updated: `/tickets` replaced with `/quotes` + `/orders`
- `docs/schema.md` — `pages` table seed data corrected: `/tickets` row replaced with `/quotes` + `/orders`; seeded role permissions updated for SDR and Sales roles
- `docs/navigation.md` — Breadcrumbs/Page Titles table updated: `/tickets` removed, `/quotes`, `/quotes/new`, `/quotes/[id]`, `/orders` added

### Changed
- `docs/navigation.md` — full route tree updated: `leads`, `sales`, `quotes/*`, `orders` all marked ✓ EXISTS; `/tickets` route replaced with `/quotes` and `/orders`; sidebar nav items updated with badge descriptions; tab URL convention corrected for all four pages; icon map updated
- `docs/feature-specs/leads-sdr.md` — "Quote tab not built" items updated: "Create Quote / Order" button is now live; `status = 'Quoted'` is set automatically by the ticket API
- `docs/feature-specs/leads-sales.md` — Order/Quote tab updated to describe the page-navigation flow; "Convert to Order" footer action updated; deferred items marked correctly built vs. still pending
- `docs/feature-specs/tickets.md` — fully rewritten to match actual implementation (pages, not modal; correct routes, tabs, API contract, realtime)
- `docs/realtime-live-updates.md` — `job_tickets` row corrected from `042_enable_job_tickets_realtime.sql` (planned) to `047_enable_job_tickets_realtime.sql` (✅ built); consumer list updated
- `docs/TODO.md` — TODO-002 (auto-set Quoted/Validated status) marked ✅ DONE; implemented in `app/api/tickets/route.ts`
- `docs/mvp-scope.md` — "Create Order = placeholder" updated to reflect live navigation to `/quotes/new`; "Tickets / Quote builder / Orders" row updated to ✅ Built
- `docs/component-architecture.md` — added page-by-page breakdown for `/quotes`, `/orders`, `/quotes/new`, `/quotes/[id]`; role-specific components table updated with four new components

## [2026-05-12] — Phase 7: Quotes + Orders list pages live

### Added
- `components/quotes-page.tsx` — Quoted Requests list; tabs: All / Draft / Sent / Approved with count badges on all tabs; search by contact, company, title or reference; columns: Contact, Title, Channel, Total, Status, Follow-up (red if overdue), Created; clicking any row or View button navigates to `/quotes/[id]`; listens to `bazaar:tickets-changed` for realtime silent refresh
- `components/orders-page.tsx` — Orders list; tabs: All / Active / Won / Cancelled with count badges; search; columns: Order #, Contact, Title (with Rush lightning bolt), Total, Priority (colour-coded), Due Date (orange = due soon, red = overdue), Status, Created; navigates to `/quotes/[id]` (same ticket record); realtime via `bazaar:tickets-changed`

### Changed
- `app/(app)/quotes/page.tsx` — replaced spec preview placeholder with `<QuotesPage />`
- `app/(app)/orders/page.tsx` — replaced spec preview placeholder with `<OrdersPage />`
- `app/api/sidebar-counts/route.ts` — added `/quotes` count (active non-cancelled quote tickets) and `/orders` count (sent/order-status tickets) so the sidebar nav badges populate for those two pages

## [2026-05-12] — Enable Realtime on job_tickets

### Added
- `supabase/migrations/047_enable_job_tickets_realtime.sql` — `REPLICA IDENTITY FULL` + `ALTER PUBLICATION supabase_realtime ADD TABLE public.job_tickets`; same pattern as migrations 035/036 for `leads`/`activities`. Without this, the sidebar's `tickets-realtime` channel would subscribe successfully but never receive any events from the DB.

## [2026-05-12] — Quote/Order realtime refresh + full lifetime history

### Changed
- `components/quote-detail.tsx`
  - Listens to `bazaar:tickets-changed` and `bazaar:leads-changed` events (broadcast by sidebar realtime subscriptions) — silently re-fetches the ticket + linked lead whenever either changes; edit-state is not clobbered if the user is actively editing
  - History tab now fetches the **complete lifetime** of the record (all lead activities from `leads` + all ticket activities from `job_tickets`) via `GET /api/activities?ticket_id=xxx&include_linked_lead=true`
  - History redesigned: vertical timeline, date separators, per-event icons, human-readable labels, **Lead / Ticket source badge** on each row so you can see exactly when the lead became a quote and then an order
  - History section listens to `bazaar:activities-changed` to auto-append new entries without a full page reload
- `components/new-quote-form.tsx` — lead info card now silently refreshes when `bazaar:leads-changed` fires (another user may update the lead while the form is open)
- `app/api/activities/route.ts` — added `include_linked_lead=true` query param: when set, the API fetches activities for both the ticket AND its linked lead, merges them, and returns them chronologically oldest→newest; each row gets a `_source` field (`"lead"` or `"ticket"`)

## [2026-05-12] — Phase 4–6: Tickets API, Quote/Order dedicated pages

### Added
- `supabase/migrations/046_order_sequence_function.sql` — `increment_order_sequence(p_year)` PL/pgSQL function; atomically increments the `order_sequence_counters` table and returns the next sequence number for ORD-YYYY-NNN reference codes
- `app/api/tickets/route.ts` — `GET /api/tickets` (list with scoped visibility) + `POST /api/tickets` (create quote or order with auto reference-code generation and activity logging)
- `app/api/tickets/[id]/route.ts` — `GET /api/tickets/[id]` (single ticket with joined lead/customer) + `PATCH /api/tickets/[id]` (update with status-change logging; locked for reps once ticket is in order status)
- `app/api/tickets/counts/route.ts` — `GET /api/tickets/counts` (lightweight tab badge counts: drafts / sent / approved / orders / total)
- `app/api/activities/route.ts` — `GET /api/activities?lead_id=xxx` or `?ticket_id=xxx` (shared activities endpoint for both lead and ticket history timelines)
- `lib/utils/ticket-math.ts` — pure pricing helpers: `computePricing()`, `skuLineTotal()`, `formatCurrency()`
- `app/(app)/quotes/new/page.tsx` — server shell for new-quote page (reads `lead_id` from searchParams)
- `components/new-quote-form.tsx` — full 3-tab (Info → Line Items → Quote) create form; shows lead info card on the left; pre-fills contact email from lead; Save Draft + Save & Send Quote footer actions
- `app/(app)/quotes/[id]/page.tsx` — server shell for quote detail/edit page
- `components/quote-detail.tsx` — 4-tab (Info | Line Items | Quote | History) view/edit component; read-only by default, edit mode toggled by Edit button; status-aware action bar (Send Quote / Mark Won / Cancel Ticket); linked lead card in sidebar; skeleton loader

### Changed
- `components/verify-drawer.tsx` — "Create Quote / Order" button is now live: saves the lead silently then navigates to `/quotes/new?lead_id=<id>`; added `useRouter` + `handleCreateQuote`
- `components/sales-drawer.tsx` — same: "Create Quote / Order" now saves sales fields silently then navigates to `/quotes/new?lead_id=<id>`
- `docs/order-ticket/integration-plan.md` — Phase 6 updated to document the design change from modal (OrderDrawer) to dedicated pages (`/quotes/new` + `/quotes/[id]`)

## [2026-05-12] — Fix: rejection from Sales clears sales_status

### Fixed
- `components/sales-drawer.tsx` — `handleRejectConfirm` now also patches `sales_status: null` alongside `status: "Rejected"`. Previously `sales_status` was left as "Ongoing" even after rejection, causing it to display incorrectly anywhere the sales status was shown.

---

## [2026-05-12] — Disable backdrop click-to-close on lead drawers

### Changed
- `components/verify-drawer.tsx` — backdrop `onClick` removed; clicking outside the modal no longer closes it. Users must use Save, Route to Sales, On Hold, Reject, or the ✕ header button.
- `components/sales-drawer.tsx` — same change; backdrop is now a visual overlay only.

---

## [2026-05-12] — Restore Save button in Verify Drawer

### Fixed
- `components/verify-drawer.tsx` — re-added the **Save** button to the footer action bar. The `handleSave` function was already implemented but had no button wired to it. Save appears as the first action (navy/verify style), followed by Route to Sales, On Hold / Resume, and Reject. Save goes through `promptThenRun` so the "update customer profile?" prompt still fires when contact fields change.

---

## [2026-05-12] — Lead forms use DB-driven dropdown options

### Changed
- `components/leads-page.tsx`:
  - Expanded `/api/lookups` fetch to include `urgency`, `route_reason`, `sales_drop_reason` in addition to existing `source`, `industry`, `hold_reason`, `reject_reason`
  - Replaced hardcoded `URGENCY_OPTIONS` with `lookups.urgency` from DB (prepends a static "Not Defined" entry)
- `components/verify-drawer.tsx`:
  - Removed hardcoded `URGENCY_OPTIONS` and `REJECT_REASONS` constants
  - Urgency select now uses `lookups.urgency` passed from `leads-page`
  - Rejection reason select now uses `lookups.reject_reason` passed from `leads-page`
  - `HoldSubForm` now receives `reasons={lookups.hold_reason}` instead of using a hardcoded constant
- `components/hold-sub-form.tsx`:
  - Removed `HOLD_REASONS` import from `lib/constants/hold-reasons`
  - Added required `reasons: LookupValue[]` prop — caller provides DB-driven hold reasons
- `components/sales-drawer.tsx`:
  - Removed hardcoded `SALES_HOLD_REASONS` and `REJECT_REASONS` constants
  - Added `lookups: LookupMap` prop
  - Hold radio grid now uses `lookups.hold_reason`; reject dropdown uses `lookups.reject_reason`
- `components/sales-page.tsx`:
  - Added `lookups` state and on-mount fetch from `/api/lookups` for all 7 lead categories
  - Passes `lookups` to `SalesDrawer`

All selectable options in Add Lead, Claim Lead, Verify Drawer, and Sales Drawer now come from the `lookup_values` table, making them fully manageable from Admin → Dropdown Options.

---

## [2026-05-12] — Documentation sync: schema, integration plan, product catalog, README

### Changed
- `docs/schema.md`:
  - Fixed wrong index name `tickets_contact_id_idx` → `tickets_customer_id_idx`
  - Added indexes for `tickets_reference_code_idx` (unique partial) and `tickets_created_by_idx`
  - Added 7 new `lookup_values` Order/Quote category entries to Category Enums
  - Added product catalog tables section (`product_types`, `material_groups`, `materials`, `product_material_links`)
  - Added `company_settings` and `order_sequence_counters` RLS policy sections
  - Added `notifications` admin policy (`admin_all_notifications`)
  - Added permanent-record rules table explaining intentional absence of DELETE on tickets/leads/activities
  - Updated Migration File Order list to include migrations 039–045
- `docs/order-ticket/README.md`:
  - Updated status header (no longer blocked)
  - Replaced placeholder status table with full phase-by-phase progress tracking
  - Added "What was built in Phase 2" summary section
- `docs/order-ticket/integration-plan.md`:
  - Updated overall status banner
  - Phase 0: marked done
  - Phase 2: marked done; corrected migration number (042, not 041); added sections 2d/2e/2f/2g for migrations 041–045 and admin panel tabs
  - Phase 3.5 (TODO-001): marked as deferred
  - Phase 4: marked as next
- `docs/order-ticket/product-catalog.md`:
  - Part 6b (pricing calculator): added deferred status note (per owner decision Q17)
  - Part 8 build order: marked completed phases with ✅, pending with ⏳

---

## [2026-05-12] — Phase 2b: enrich types for Quotes & Orders module

### Changed
- `lib/types/index.ts`:
  - `LookupCategory` — added 7 new order/quote categories: `lamination`, `finishing`, `quote_channel`, `follow_up_freq`, `ticket_priority`, `order_source`, `ticket_payment`
  - `QuoteSku` — fully enriched: `product_type`, `material`, `lamination`, `width`, `height`, `design_required`, `die_cut`, `finishing[]`; `description` is auto-derived, never user-typed; legacy `sku` kept optional for backwards compat
  - `JobTicket` — all 28 new columns from migration 042 added; legacy columns kept as nullable
  - Added `PaymentTypeKey = 'card_default' | 'zelle' | 'offline'`
  - Added `TicketPriority`, `OrderSource`, `DiscountType`, `PrepayType`, `FollowUpFreq` union types
  - Added `TicketForm` interface — OrderDrawer form state (string inputs for number fields, controlled inputs pattern)
  - Added `CompanySettings` interface matching migration 045 schema

---

## [2026-05-12] — Dropdown Options + Company Info admin tabs (live)

### Added
- `supabase/migrations/044_seed_order_lookup_values.sql` — seeds 7 new `lookup_values` categories for the OrderDrawer: `lamination`, `finishing`, `quote_channel`, `follow_up_freq`, `ticket_priority`, `order_source`, `ticket_payment` (29 options total)
- `supabase/migrations/045_create_company_settings.sql` — single-row `company_settings` table with branding fields (name, address, phone, email, logo, website) + OrderDrawer defaults (`default_tax_rate`, `high_value_threshold`, `rush_surcharge_percent`); RLS: authenticated read, admin update only
- `app/api/admin/lookups/route.ts` — GET (all categories + items grouped) + POST (create new option with auto-slug)
- `app/api/admin/lookups/[id]/route.ts` — PATCH (label / sort_order / is_active) + DELETE (blocked if option is in use on any lead or ticket)
- `app/api/admin/company/route.ts` — GET + PATCH for company settings
- `components/admin/dropdowns-section.tsx` — two-panel UI matching Products layout: category list on left (grouped by "Lead Forms" / "Order / Quote"), options on right with add inline, rename, active toggle, delete with safety check
- `components/admin/company-section.tsx` — company info form with branding, contact, address, and OrderDrawer defaults (tax rate, high-value threshold, rush surcharge)

### Changed
- `app/(app)/admin/settings/[tab]/page.tsx` — replaced spec placeholders for Dropdown Options and Company Info tabs with live `<DropdownsSection />` and `<CompanySection />` components; removed unused `TabSpecWrapper` and `SpecBadge` imports

---

## [2026-05-12] — Migration 043: admin full access on config + supporting tables

### Fixed
- `supabase/migrations/043_fix_admin_rls_full_access.sql`:
  - **Products catalog (041 over-permissive writes fixed):** `product_types_write_auth`, `material_groups_write_auth`, `materials_write_auth`, `product_material_links_write_auth` all allowed any authenticated user to mutate product data — replaced with admin-only policies (`admin_all_*`)
  - **`order_sequence_counters`:** added `admin_all_sequence_counters` (table was inaccessible to admin users — only service role could touch it)
  - **`leads`:** added `admin_delete_leads` (no DELETE policy existed)
  - **`activities`:** added `admin_delete_activities` (no DELETE policy existed)
  - **`notifications`:** added `admin_all_notifications` (admin could not read or manage other users' notifications)
  - **`user_profiles`:** added `admin_insert_profiles` + `admin_delete_profiles` (INSERT and DELETE were missing)

### Intentional non-changes (permanent business records — DB-level protection)
- **`job_tickets`** — no DELETE policy. Quotes and orders are permanent financial records. Close via `ticket_status = 'cancelled'` only.
- **`leads`** — no DELETE policy. Leads and the sales pipeline are permanent. Close via `status = 'Rejected'` / `sales_status = 'Dropped'`; merge duplicates via the merge flow.
- **`activities`** — no DELETE or UPDATE policy. Append-only audit trail. Removing entries would destroy lead/ticket history.

---

## [2026-05-12] — Migration 042: extend job_tickets for Quotes & Orders module

### Added
- `supabase/migrations/042_extend_job_tickets.sql` — adds 26 new columns to `job_tickets` (identity, quote delivery, richer pricing, payment array, follow-up scheduling, order-specific fields); creates `order_sequence_counters` table (for `ORD-YYYY-NNN` reference codes); replaces the overly-broad `authenticated_read_tickets` SELECT policy with scoped policies (`rep_read_own_tickets` + `admin_read_all_tickets`)
- Unique index on `job_tickets.reference_code` + index on `created_by_id`

### Changed
- `docs/schema.md` — updated `job_tickets` table definition with all new columns; added `order_sequence_counters` table; documented legacy columns; updated RLS section

---

## [2026-05-12] — Products admin UI redesign + catalog migration (complete build)

### Added
- `supabase/migrations/041_create_products_catalog.sql` — **complete from-scratch build**: creates `product_types` (text slug PK), `material_groups` (uuid PK), `materials` (text slug PK), `product_material_links` (text FKs); RLS policies + grants to `anon / authenticated / service_role`; seeds 15 product types, 9 material groups, 37 materials, and all product-material links from `docs/order-ticket/product-catalog.md`
- `app/api/admin/product-types/route.ts` — GET (list + linked material IDs) + POST (create with auto-slug ID)
- `app/api/admin/product-types/[id]/route.ts` — PATCH + DELETE (safe — blocked if used in `job_tickets.quote_skus`)
- `app/api/admin/product-types/[id]/materials/[matId]/route.ts` — POST (link) + DELETE (unlink)
- `app/api/admin/materials/route.ts` — GET (all groups + materials) + POST (create)
- `app/api/admin/materials/[id]/route.ts` — PATCH + DELETE (safe — blocked if used in `quote_skus`)
- `app/api/admin/material-groups/route.ts` — POST (create group)
- `app/api/admin/material-groups/[id]/route.ts` — PATCH + DELETE (blocked if group has materials)
- `app/api/lookups/products/route.ts` — public GET for OrderDrawer; returns active products with their linked active materials

### Changed
- `components/admin/products-section.tsx` — **redesigned UI**: product-centric layout (no separate Materials tab or Material Library concept)
  - **Left panel**: product list with active toggle, inline rename, delete
  - **Right panel**: flat list of materials for the selected product; `+ Add Material` with smart search — links an existing material by name or creates a new one on the fly
  - `×` removes a material from the product only; 🗑 deletes it from the library entirely (with safety check)
  - Material groups are an internal DB concept only — hidden from the admin UI
- `app/(app)/admin/settings/[tab]/page.tsx` — replaced Products spec placeholder with live `<ProductsSection />`
- `app/layout.tsx` — added `suppressHydrationWarning` to `<body>` to silence Grammarly extension attribute mismatch

### Schema notes
- `product_types.id` and `materials.id` use **text slugs** (e.g. `labels-roll`, `bopp-white`) not UUIDs — allows stable IDs in `quote_skus` JSONB without FK overhead
- `material_groups.id` uses UUID (internal grouping only, not referenced in tickets)
- Migration is idempotent: `CREATE TABLE IF NOT EXISTS` + `INSERT … ON CONFLICT DO NOTHING`; safe to re-run

> **Realtime for `job_tickets`** is deferred until the `job_tickets` schema is finalised in Phase 2. The sidebar already has the subscription wired (`tickets-realtime` channel) — just needs the migration to enable it.

## [2026-05-12] — Fix Quoted Requests nav icon

### Fixed
- `components/sidebar.tsx` — added `MessageSquareQuote` to `ICON_MAP` so the Quoted Requests nav link renders with the correct icon (was falling back to the Dashboard icon)

## [2026-05-11] — Tickets module owner review — all decisions recorded

### Changed
- `docs/order-ticket/owner-questionnaire.md` — filled in all 22 questions with owner decisions from the 2026-05-11 review session; updated summary table
- `docs/order-ticket/open-questions.md` — updated all status flags; marked three key design changes from the shadow project prototype
- `docs/order-ticket/integration-plan.md` — removed all `[PENDING OWNER ANSWER]` markers; updated RLS scoping, Q4 quote→order flow, high-value hard block, admin-configurable values, reference number format, PDF logo, and dashboard revenue scoping

**Key decisions:**
- Quotes and Orders pages are **scoped** — each rep sees their own; admin sees all; customer detail page shows all for that customer
- Quote ticket **becomes the order in place** — no simultaneous order shell (differs from shadow project)
- High-value threshold is **admin-configurable**; when exceeded, SDR is **hard-blocked** and can only route to Sales Pipeline
- Order reference format: **`ORD-YYYY-NNN`** (year + sequential, resets annually)
- Tax rate, rush surcharge, and high-value threshold are all managed from Admin → Company Info tab
- Pricing engine is **deferred** — rep enters unit price manually in this phase

## [2026-05-11] — CRM page listens for real-time lead changes

### Changed
- `components/crm-page.tsx` — added `bazaar:leads-changed` event listener so the customer list silently re-fetches whenever any lead is updated (e.g. an SDR routes a lead, making that customer visible in the CRM for the first time)

## [2026-05-11] — Filter CRM page to routed leads only

### Fixed
- `app/api/customers/route.ts` — CRM contact list now only returns customers that have at least one lead with `status = "Routed"` or a non-null `sales_status`. Customers whose leads are still Pending, On Hold (SDR), or Rejected no longer appear in the CRM page.

## [2026-05-11] — Remove Quote/Order placeholder tabs from lead drawers

### Changed
- `components/verify-drawer.tsx` — removed placeholder "Quote" tab; SDR drawer now has only "Lead Info" and "History" tabs. Added disabled "Create Quote / Order" footer button (enabled in Tickets phase).
- `components/sales-drawer.tsx` — removed placeholder "Order / Quote" tab; Sales drawer now has only "Lead Info" and "History" tabs. Added disabled "Create Quote / Order" footer button (enabled in Tickets phase).

## [2026-05-10] — Add call/email action buttons to phone & email inputs

### Changed
- `components/ui/phone-input.tsx` — added optional `showAction` prop; when enabled and a full 10-digit number is present, renders a fused Phone icon link (`tel:+1…`) at the right edge of the input
- `components/ui/email-input.tsx` — added optional `showAction` prop; when enabled and a value is present, renders a fused Mail icon link (`mailto:…`) at the right edge of the input
- `components/leads-page.tsx` — enabled `showAction` on both Phone and Email inputs in the Add Lead modal
- `components/verify-drawer.tsx` — enabled `showAction` on both Phone and Email inputs in the View/Claim modal

## [2026-05-10] — Fix activity history always empty (FK mismatch)

### Fixed
- `supabase/migrations/040_fix_activities_by_user_fkey.sql` — re-pointed `activities.by_user_id` FK from `auth.users` to `public.user_profiles`. The original FK prevented Supabase from traversing the relationship to `user_profiles` in the inline select, causing `GET /api/leads/[id]/activities` to return a "Could not find a relationship" DB error and the History tab to always appear empty.
- `docs/schema.md` — updated `activities` table definition to reflect the corrected FK target.

## [2026-05-10] — Redefine Validated/Quoted as system-set statuses

### Changed
- `app/api/leads/[id]/resume/route.ts` — resume no longer restores to `Validated`; fallback is now `Pending`. A lead that was previously `Validated` before being put on hold also resumes to `Pending` (since `Validated` is now system-set by ticket creation, not the SDR).
- `docs/schema.md` — rewrote `status` enum definitions: `Validated` and `Quoted` are now documented as system-set (auto-applied on ticket creation) and never set manually.
- `docs/TODO.md` — added `[TODO-002]` with full implementation spec for auto-setting these statuses when the Tickets module is built.
- `docs/feature-specs/leads-sdr.md` — Resume from Hold now restores to `Pending` instead of `Validated`.

## [2026-05-10] — Remove Validate button from SDR workflow

### Removed
- `components/verify-drawer.tsx` — Validate button and `doValidate`/`handleValidate` functions removed entirely. SDRs now go directly from any status to Route to Sales, On Hold, or Reject.

### Changed
- `docs/feature-specs/leads-sdr.md` — Footer Actions table updated; Validate row marked as removed.

> **Note:** The `Validated` status value is kept in the DB schema and TypeScript types for backward compatibility with existing leads that already carry that status. No migration needed.

## [2026-05-10] — Remove validation gate before Route to Sales

### Changed
- `components/verify-drawer.tsx` — "Route to Sales" button is now always enabled; SDR can route directly from `Pending` without validating first. Removed the disabled state and tooltip that enforced validation.
- `docs/feature-specs/leads-sdr.md` — updated Footer Actions table, build status table, and validation-gate paragraph to reflect the new behaviour.

## [2026-05-10] — Remove Save button and X close from claimed-lead modal

### Changed
- `components/verify-drawer.tsx` — removed the **Save** button; form edits are now persisted as part of each action (Validate, Route to Sales, On Hold, Reject, Resume). Hold and Resume now call `patchLead(buildLeadPayload())` before their own API request so no field edits are lost.
- `components/verify-drawer.tsx` — **X close button** is now hidden when the SDR has the lead claimed (edit mode). It remains visible in read-only mode (locked by another SDR, or rejected lead). The SDR must take a real action to exit.
- `docs/feature-specs/leads-sdr.md` — Footer Actions table updated to reflect removed Save/Close buttons and new auto-save-on-action behaviour.

## [2026-05-10] — Convert Verify Drawer to centered modal

### Changed
- `components/verify-drawer.tsx` — replaced the right-side slide-in panel with a centered modal window (`max-w-[780px]`, `max-h-90vh`, `border-radius: 12px`); all content, tabs, actions, and lock logic unchanged

## [2026-05-10] — Add Initial Interest field to leads

### Added
- `supabase/migrations/039_add_initial_interest_to_leads.sql` — adds `initial_interest text` column to the `leads` table (nullable, no constraints)
- `initial_interest` field in Add Lead modal (`components/leads-page.tsx`) — optional free-text input below Urgency, full-width, not required
- `initial_interest` column in the All Leads table — shows value truncated with tooltip, or "—" when empty; also shown in mobile cards
- `initial_interest: string | null` added to `Lead` interface in `lib/types/index.ts`

### Changed
- `app/api/leads/manual/route.ts` — accepts and persists `initial_interest` on lead creation
- `docs/schema.md` — documented new `initial_interest` column in the `leads` table

## [2026-05-10] — Require validation before routing lead to Sales

### Changed
- `components/verify-drawer.tsx` — "Route to Sales" button is now disabled when `status = 'Pending'`; hovering shows the tooltip "Lead must be validated before sending to Sales"
- `docs/feature-specs/leads-sdr.md` — updated Footer Actions table and Build Status table to reflect the validation gate; corrected stale routing path descriptions

## [2026-05-10] — Update docs to reflect all Realtime and dashboard changes

### Changed
- `docs/api-contract.md` — corrected admin KPI response shape: added `open_leads`, `claimed_leads`, `sdr_performance`, `rejection_reasons`, `source_breakdown`; removed stale `active_sdr_count` / `active_sales_count` fields that never existed.
- `docs/component-architecture.md` — added Realtime Listeners table listing all components that listen to `bazaar:leads-changed`; added `bazaar:leads-changed` row to the Data Fetching Strategy table.
- `docs/session-summary.md` — added May 10 entry covering all Realtime fixes, badge count fix, dashboard sub-counts, and doc updates.

## [2026-05-10] — Add Open / Claimed breakdown to Total Leads dashboard card

### Changed
- `app/api/dashboard/kpis/route.ts` — admin KPI response now includes `open_leads` (unclaimed `Pending/Validated` workspace leads, current snapshot) and `claimed_leads` (same status but owned by an SDR).
- `components/admin-dashboard.tsx` — `KpiCard` accepts a new optional `subStats` prop that renders colored pill badges below the subtext. The **Total Leads** card uses it to show `Open: X` (green) and `Claimed: X` (gold) inline inside the card. Dashboard now also listens to `bazaar:leads-changed` and silently re-fetches KPIs when any lead changes (no skeleton flash).

### Fixed
- `app/api/sidebar-counts/route.ts` — `/leads` badge was counting all `Pending/Validated` leads including ones already claimed. Both SDR and admin now count only `locked_by_id IS NULL` leads. The badge represents "new leads waiting to be picked up", not leads already being worked. Simplified the SDR/admin split into a single shared query.

## [2026-05-10] — Fix Realtime not delivering lead-change events to admin

### Fixed
- `supabase/migrations/038_fix_leads_rls_for_realtime.sql` — replaced `current_user_role()` (a `SECURITY DEFINER` function) in all three `leads` SELECT RLS policies with inline `EXISTS` subqueries. `SECURITY DEFINER` functions run as their owner (`postgres`) in the Supabase Realtime evaluation context, causing `auth.uid()` to return `NULL`, which made every subscriber's RLS check fail and every event to be silently dropped even when the WebSocket was `SUBSCRIBED`.
- `components/sidebar.tsx` — moved Realtime channel setup inside `getSession().then()` so the JWT is guaranteed to be present before the WebSocket handshake. Previously, `.subscribe()` was called synchronously while `setAuth` was still pending an async `getSession()` resolve, meaning channels opened without a JWT and Realtime silently rejected all events. Also removed the manual `setAuth` + `onAuthStateChange` handler — `createBrowserClient` handles token refresh automatically.

### Changed
- `docs/realtime-live-updates.md` — fully rewritten with both bug post-mortems, inline subquery RLS templates for all roles, JWT timing rules, complete debugging checklist, and a step-by-step checklist for adding Realtime to future entities (orders, etc.).

## [2026-05-10] — Admin can reassign/unassign Sales rep from pipeline leads

### Added
- `app/api/leads/[id]/reassign` — extended to accept `role: "sales"` param; updates `sales_owner_id` instead of `locked_by_id`/`sdr_id`; logs `lead_reassigned` activity with `role: "sales"` in payload

### Changed
- `components/sales-page.tsx` — admin action column in the Pipeline tab now shows **View + Reassign** buttons (desktop table and mobile cards); added reassign modal with Sales rep dropdown (fetched from `/api/admin/users?role=sales`); added `handleSalesReassign` function that calls the reassign endpoint with `role: "sales"`

## [2026-05-10] — Remove Quick Actions from all dashboards

### Changed
- `components/sdr-dashboard.tsx` — removed Quick Actions section and `QuickAction` component; removed unused `Link`, `LayoutDashboard`, `ArrowRight` imports
- `components/sales-dashboard.tsx` — same removal; removed unused `Link`, `ArrowRight` imports

## [2026-05-10] — Align table/card breakpoint with sidebar (sm→lg)

### Changed
- `components/leads-page.tsx` — table/mobile-card toggle changed from `sm` (640px) to `lg` (1024px)
- `components/sales-page.tsx` — same breakpoint fix (all three pipeline tabs)
- `components/crm-page.tsx` — same breakpoint fix
- `components/customer-profile.tsx` — same breakpoint fix
- All four files now switch to mobile card view at the same 1024px point as the sidebar/navigation

## [2026-05-10] — Documentation audit and sync to actual implementation

### Changed
- `docs/api-contract.md` — removed non-existent endpoints (`GET /api/leads/inbox`, `POST /api/leads/verify`, `GET /api/admin/audit`, `GET/PATCH/POST /api/notifications/*`); fixed `GET /api/leads/workspace` to correctly describe SDR lock-based filtering; replaced `GET /api/admin/audit` with the real `GET /api/admin/activity-log`; replaced Notifications REST section with accurate description of the Supabase Realtime system
- `docs/feature-specs/lead-locking.md` — removed `POST /api/leads/verify` reference from lock-check description; replaced non-existent `/admin/audit` page force-unlock UI with the actual Reassign/Unassign flow on the leads page; removed false `SELECT ... FOR UPDATE` claim
- `docs/feature-specs/leads-sdr.md` — fixed Rejection Form footer action to reference `PATCH /api/leads/[id]` instead of the non-existent "verify endpoint"
- `docs/feature-specs/activity.md` — removed `POST /api/leads/verify` row from server-side auto-logging table; split its logged activities (`lead_routed_to_sales`, `lead_rejected`) to the correct `PATCH /api/leads/[id]` row; marked Verify Drawer History tab as built

## [2026-05-10] — Realtime live updates + sidebar badges + admin activity log

### Added
- `supabase/migrations/035_enable_leads_realtime.sql` — enables Supabase Realtime on the `leads` table (`REPLICA IDENTITY FULL` + publication)
- `supabase/migrations/036_enable_activities_realtime.sql` — enables Supabase Realtime on the `activities` table so the admin activity log updates live
- `app/api/admin/activity-log/route.ts` — paginated admin-only activity log API reading from the `activities` table, enriched with user name, role, and customer name
- `components/admin/activity-log-section.tsx` — client component rendering the activity log table (who, action, lead/customer, when) with mobile card layout, load-more pagination, and live Realtime updates via `bazaar:activities-changed`
- `docs/realtime-live-updates.md` — comprehensive pattern guide for adding Supabase Realtime to any future entity (orders, tickets, etc.), including architecture diagram, layer-by-layer code examples, and a copy-paste checklist

### Changed
- `components/sidebar.tsx` — replaced `setInterval(60s)` polling with two Supabase Realtime subscriptions: `leads` table (badge counts + `bazaar:leads-changed`) and `activities` table (`bazaar:activities-changed`)
- `app/api/sidebar-counts/route.ts` — uncommented sidebar badge count queries (SDR: pending leads count on `/leads`; Sales: unclaimed + active deals on `/sales`; Admin: same combined view)
- `components/sales-page.tsx` — added `bazaar:leads-changed` listener with drawer-aware deferral: silent table re-fetch when drawer is closed, deferred until drawer closes when open
- `components/leads-page.tsx` — added `bazaar:leads-changed` listener for silent background table re-fetch (skipped when drawer is open)
- `app/(app)/admin/settings/[tab]/page.tsx` — replaced "Broadcast Notifications" spec preview with the real `<ActivityLogSection />` component
- `docs/Notification/Notification.md` — updated to reflect V1 implementation (sidebar badges + Realtime, not bell system)
- `docs/feature-specs/notifications.md` — updated to reflect V1 scope and future V2 plan

### Removed
- `docs/FuturePlan/Notification/Notification.md` — deleted (exact duplicate of `docs/Notification/Notification.md`)

## [2026-05-09] — Enhance Dashboard with live statistics

### Added
- `components/sdr-dashboard.tsx` — two new KPI cards: **Quote Value** (sum of `quote_total` for the SDR's leads this period) and **My Share %** (this SDR's handled leads ÷ all SDR leads in period)
- `components/admin-dashboard.tsx` — three new sections:
  - **SDR Performance Table** — one row per SDR showing Handled, Routed, Rejected, Quote Value, and Share % for the selected period. Sorted by most handled. Only visible to admins.
  - **Rejection Reasons** — horizontal bar breakdown of the top rejection reason values across all leads. Uses `var(--color-danger)` bars.
  - **Lead Sources** — horizontal bar breakdown of lead source distribution across all leads. Uses `var(--color-accent)` bars.
- Both breakdown sections hide automatically when there is no data (no empty states to manage).

### Changed
- `app/api/dashboard/kpis/route.ts` — SDR response now includes `quote_value` and `share_pct`. Admin response now includes `sdr_performance[]`, `rejection_reasons[]`, and `source_breakdown[]`. No breaking changes to existing fields.

## [2026-05-09] — Rename Sales Pipeline "Rejected (SDR)" tab to "Rejected"

### Changed
- `components/sales-page.tsx` — tab label changed from `"Rejected (SDR)"` to `"Rejected"`. The confusing "(SDR)" suffix implied SDRs rejected these leads, when the opposite is true — these are leads the Sales team rejected. Logic unchanged: admin sees all sales-rejected leads; each sales rep sees only their own.

## [2026-05-09] — SDR History tab, Sales Notes field, and TODO doc

### Added
- `components/verify-drawer.tsx` — **History tab** (third tab alongside Lead Info and Quote). Lazy-loads `GET /api/leads/[id]/activities` on first open. Renders the same vertical timeline as the Sales Drawer — colored dots, human-readable labels, actor name, relative timestamp, skeleton loader. Full activity history is preserved even after a lead moves to Sales, so SDRs and admins can always see the complete chain of events.
- `supabase/migrations/034_add_sales_notes_to_leads.sql` — adds `sales_notes text` column to the `leads` table.
- `components/sales-drawer.tsx` — **Sales Notes** textarea in the Sales Fields section. Sales reps can now write their own internal notes (separate from the SDR's Verify Lead Comment). Notes are saved via `PATCH /api/leads/[id]` and automatically logged to the activity timeline as `lead_edited` (field: `sales_notes`).
- `docs/TODO.md` — new deferred-items file. First entry: **TODO-001 Admin Override for Terminal Leads**, with full problem description, fix sketch, and a note that Won/Dropped must be handled separately after the Tickets phase.

### Changed
- `app/api/leads/[id]/route.ts` — added `"sales_notes"` to `TRACKED_FIELDS` so any change to sales notes is automatically logged as a `lead_edited` activity entry.
- `lib/types/index.ts` — added `sales_notes: string | null` to the `Lead` interface.

## [2026-05-09] — Lead History tab in Sales Drawer

### Added
- `app/api/leads/[id]/activities/route.ts` — `GET` endpoint that returns the full activity timeline for a lead (newest first), joining `user_profiles` so every entry includes the actor's name.
- `components/sales-drawer.tsx` — new **History** tab (third tab alongside Lead Info and Order / Quote) that renders a vertical timeline of all activity events for the open lead. Loads lazily on first open. Shows: event label, optional notes (rejection/hold), actor name, and relative timestamp. Skeleton loader while fetching; empty-state when no events exist.

### Changed
- `app/api/leads/[id]/route.ts` — `lead_rejected` activity payload now includes `from: prevStatus` so the timeline can display "Rejected from Sales pipeline" vs "Rejected from SDR pipeline".
- `lib/types/index.ts` — added `'lead_sales_claimed'` and `'lead_edited'` to the `ActivityType` union (both were already written by API routes but missing from the type).

## [2026-05-09] — Fix Sales Pipeline Rejected tab showing SDR rejections

### Fixed
- **Sales Pipeline Rejected tab was mixing two unrelated rejection types**: it showed all leads with `status = "Rejected"` — including leads rejected by SDRs before they ever reached sales — instead of only leads rejected *from* the sales pipeline.
- `app/api/leads/[id]/route.ts` — PATCH route now automatically saves `prev_status = current.status` whenever a lead is moved to `status = "Rejected"`, mirroring the same pattern already used by the hold route. This allows downstream queries to distinguish "SDR rejected" (`prev_status ≠ "Routed to Sales"`) from "rejected from sales" (`prev_status = "Routed to Sales"`).
- `app/api/leads/workspace/route.ts` — added support for `?prev_status=` query param so callers can filter leads by their previous status.
- `app/api/leads/sales-counts/route.ts` — `rejected` badge count now filters by `prev_status = "Routed to Sales"` so the badge reflects only sales-pipeline rejections, not all system rejections.
- `components/sales-page.tsx` — `fetchRejectedLeads` now requests `/api/leads/workspace?status=Rejected&prev_status=Routed+to+Sales` so the Rejected tab lists only leads that were in the sales pipeline before being rejected.

## [2026-05-09] — Split dashboard into per-role components

### Added
- `components/sdr-dashboard.tsx` — standalone SDR dashboard (KPIs + quick actions)
- `components/sales-dashboard.tsx` — standalone Sales dashboard (KPIs + quick actions)
- `components/admin-dashboard.tsx` — standalone Admin dashboard (KPIs + team grid + quick actions)

### Changed
- `components/dashboard-page.tsx` — now a thin role-router; detects role via Supabase then renders the appropriate dashboard component; shows skeleton while role loads

## [2026-05-09] — Sortable columns + close drawer on save

### Changed
- `components/leads-page.tsx` — **Urgency** and **Created** column headers on the All Leads desktop table are now clickable sort toggles; active column shows `↑`/`↓` arrow, inactive columns show a faint `⇅` hint
- `components/leads-page.tsx` — Mobile All Leads view gains a **cycling sort pill** (tap to cycle: Newest first → Oldest first → Urgency: High first); no extra dropdowns or selects
- `components/verify-drawer.tsx` — Drawer now closes automatically after **Save** (same behaviour as Validate, Route, Reject, and Hold)
- `components/leads-page.tsx` — SDR action button on All Leads renamed **Claim** for unclaimed leads and **View** for already-claimed leads; visually distinct styles (filled vs outlined) reinforce the difference

## [2026-05-09] — Owner column + My Leads filter on All Leads tab

### Changed
- `components/leads-page.tsx` — All Leads table now shows an **Owner** column (visible to all roles) that displays the assigned SDR's name, "You" for the current user's own leads, or an "Unclaimed" badge for unowned leads; replaces the previous admin-only "Working" column
- `components/leads-page.tsx` — Added **My Leads / All Leads** segmented toggle on the All Leads tab; visible to SDR users only; filters client-side to show only the SDR's own claimed leads when "My Leads" is selected

## [2026-05-09] — Directed to Sales tab: info-only redesign + admin scope fix

### Changed
- `components/leads-page.tsx` — Directed to Sales tab is now a status-tracking view with no action buttons or drawer; added **Phone** and **Sales Rep** columns; "Unclaimed" pill shown when `sales_status` is null
- `app/api/leads/workspace/route.ts` — admin users now skip the `scope=mine` (`sdr_id`) filter so they see all leads on On Hold / Directed to Sales / Rejected tabs (previously admin saw an empty list on these tabs); also restored the `locked_by` join that was temporarily removed pending migration 032
- `app/api/leads/workspace/counts/route.ts` — admin users now get full counts on scoped tabs (Hold / Routed / Rejected) instead of zero
- `app/api/leads/[id]/reassign/route.ts` — update select now includes `locked_by` join so the Working column in the All Leads table shows the correct new SDR name immediately after reassignment (no page refresh needed)

---

## [2026-05-09] — Docs update: Sales Pipeline spec aligned to code

### Changed
- `docs/feature-specs/leads-sales.md` — Pipeline tab columns corrected (Phone + Urgency added, Quote Total removed — not in actual table); Claim action corrected to `POST /api/leads/[id]/claim`; Admin View (no lock) documented; Rejected tab moved from "deferred" to "built and working" with accurate columns; Build Status date updated to 2026-05-09; `lead_sales_claimed` activity logging added to Build Status

---

## [2026-05-09] — Docs update: reflect soft lock, activity logging, and reassign

### Changed
- `docs/feature-specs/leads-sdr.md` — Action column now lists Reassign (Admin); Behaviors section documents Reassign button; "Close" footer action corrected (ownership not released); race-condition paragraph updated; Build Status table expanded with soft lock, reassign, and activity logging entries
- `docs/feature-specs/lead-locking.md` — Lock lifecycle diagram updated: removed old "close = unlock" footer; added Route/Reject and Admin Reassign as the correct ownership-release triggers
- `docs/rbac.md` — API matrix: added `POST /api/leads/[id]/lock`, `POST /api/leads/[id]/unlock`, `POST /api/leads/[id]/reassign` rows; replaced "Releasing a Lock" section with the soft lock model; removed stale Lock API Access sub-table; added Reassign row to Role-Aware UI Rendering table

---

## [2026-05-09] — Admin Reassign Lead action

### Added
- `app/api/leads/[id]/reassign/route.ts` — admin-only POST endpoint; sets `locked_by_id`, `locked_at`, and `sdr_id` to the chosen SDR (or clears all three to null on unassign); logs a `lead_reassigned` activity with from/to names

### Changed
- `components/leads-page.tsx` — admin view of All Leads table now shows a **Reassign** button alongside View when a lead has an owner (`locked_by_id` is set); clicking opens a modal with a dropdown of active SDRs plus an "Unassign" option; on confirm the row updates in place and counts refresh. Added `sdrList`, `reassignLead`, `reassignUserId`, `reassigning` state and a `handleReassign` function.

---

## [2026-05-09] — Complete lead activity logging

### Changed
- `app/api/leads/[id]/lock/route.ts` — now fetches `customer_id` and logs a `lead_claimed` activity when an SDR claims a lead for the first time (not on self-refresh)
- `app/api/leads/[id]/route.ts` — PATCH handler now fetches tracked fields (`urgency`, `interests`, `quantities`, `sdr_comment`, `is_returning_customer`, `brand`, `source`, `authority`) and logs `lead_edited` with a list of changed fields when a save does not include a status change
- `app/api/leads/[id]/claim/route.ts` — now fetches `customer_id` and logs `lead_sales_claimed` after a successful Sales claim

### Docs
- `docs/feature-specs/activity.md` — added `lead_claimed`, `lead_edited`, `lead_sales_claimed`, and `lead_reassigned` to the icon map and payload details table; updated the auto-logging table to include all four new handlers

---

## [2026-05-09] — SDR soft lock: permanent ownership model

### Changed
- `app/api/leads/[id]/lock/route.ts` — also sets `sdr_id = userId` on lock acquisition so Hold/Routed/Rejected tab filters (`scope=mine`) work correctly from the moment the SDR claims a lead
- `app/api/leads/[id]/hold/route.ts` — SDR holds no longer clear `locked_by_id`; ownership persists through hold/resume cycles. Sales holds still release the lock (sales ownership is tracked via `sales_owner_id`).
- `components/verify-drawer.tsx` — removed `unlockRef`, the cleanup `useEffect`, and the unlock call from `handleClose`; closing the drawer no longer releases the lead. `doValidate` no longer calls unlock and no longer removes the lead from the list — the row updates in place with Validated status. `doRoute` and `doReject` still call unlock (ownership truly ends). `doHold` no longer sets `unlockRef`.

### Docs
- `docs/feature-specs/lead-locking.md` — rewrote Client Implementation section; added "When Ownership IS / is NOT Released" tables; updated schema fields to note `sdr_id`; updated activity logging note

## [2026-05-09] — Fix locked_by FK to enable user_profiles join

### Added
- `supabase/migrations/032_fix_locked_by_fk.sql` — re-points `leads.locked_by_id` FK from `auth.users` → `public.user_profiles` (same fix as migration 029 for `sales_owner_id`); required for PostgREST to auto-join the locker's profile name

### Changed
- `app/api/leads/workspace/route.ts` — temporarily removed `locked_by` join until migration 032 is applied; join will be restored after the FK is in place

## [2026-05-09] — SDR lock-based lead visibility + admin Working column

### Changed
- `app/api/leads/workspace/route.ts` — SDRs now only receive unlocked leads + leads they themselves have open (`locked_by_id IS NULL OR locked_by_id = userId`), applied to the all-leads tab only; also added `locked_by` profile join so the locker's name is available in the row
- `app/api/leads/workspace/counts/route.ts` — added `roleName` from `requireSession`; applies the same SDR lock filter to the all-leads count so the tab badge matches what the SDR actually sees
- `components/leads-page.tsx` — added `userId` state (alongside `isAdmin`); added a "Working" column to the All Leads desktop table (admin only) showing which SDR has each lead open; same field shown on mobile cards for admin

## [2026-05-09] — Admin view-only access in leads pipeline

### Changed
- `components/leads-page.tsx` — admin users now see a **View** button (no lock acquired) instead of Verify on all tabs; SDRs still see Verify / Work as before. Added `handleViewLead` function (opens drawer read-only without calling the lock endpoint) and role detection via `user_profiles`.

## [2026-05-09] — Auto-submit on 6th digit in setup-2fa

### Changed
- `app/(auth)/setup-2fa/page.tsx` — added `useEffect` watching `code`; when all 6 digits are entered the form auto-submits via `formRef.current?.requestSubmit()`, matching the existing behavior on the verify-2fa page

---

## [2026-05-09] — Future plan docs saved

### Added
- `docs/FuturePlan.md` — top-level future improvements doc covering the planned Notification System + Smart Sales Pipeline Refresh
- `docs/Notification/Notification.md` — full architecture plan for the notification system: mermaid flowchart, notification types, all phases, files to create/modify, infrastructure notes, and estimated effort

---

## [2026-05-09] — Remove /overview from sidebar nav; revert admin default home

### Changed
- `supabase/migrations/031_remove_overview_from_nav.sql` — removes `/overview` from `public.pages` and deletes its `role_permissions` rows; page file (`app/(app)/overview/page.tsx`) is retained for future use
- `lib/auth/resolve-default-home.ts` — admin default landing reverted from `/overview` back to `/dashboard` (Overview was removed from nav to avoid duplicate Dashboard + Overview entries)

---

## [2026-05-09] — Fix: proxy.ts whitelist /profile as universal route

### Changed
- `proxy.ts` — added `/profile` and `/dashboard` to `universalRoutes` array so all authenticated users can reach their profile page regardless of role, without triggering the `role_permissions` gate

---

## [2026-05-09] — Fix: sidebar badge counts disabled

### Changed
- `app/api/sidebar-counts/route.ts` — all badge counting logic for `/leads` and `/sales` commented out pending confirmation with owner; sidebar badges now return empty (no count displayed)

---

## [2026-05-09] — Fix: admin team section excludes admins

### Changed
- `app/api/admin/team/route.ts` — team list now resolves the admin `role_id` first, then filters `user_profiles` by `.neq("role_id", adminRole.id)` so admin accounts never appear in the team performance section

---

## [2026-05-09] — Fix: ringColor build error in dashboard TeamSection

### Fixed
- `components/dashboard-page.tsx` — replaced invalid inline `ringColor: "var(--color-surface)"` style property (not a standard CSS property) with `outline: "2px solid var(--color-surface)"` to achieve the same visual ring effect without causing TypeScript build failure

---

## [2026-05-09] — Admin dashboard team section

### Added
- `app/api/admin/team/route.ts` — admin-only endpoint returning all active users with role, claimed active deal count (sales), and `last_sign_in_at` from Supabase auth
- `components/dashboard-page.tsx` — `TeamSection` component rendered below admin KPI cards showing avatar initial, name, role, active deals (sales only), and online indicator (green = signed in within 8 h)

## [2026-05-09] — Dedicated admin Overview page and routing

> Note: `/overview` was subsequently removed from the sidebar nav (see `031_remove_overview_from_nav.sql` entry above). The page file remains for future customization.

### Added
- `app/(app)/overview/page.tsx` — admin-only overview page (currently renders shared DashboardPage; ready to be customized independently)
- `supabase/migrations/030_add_admin_overview_page.sql` — inserts `/overview` into pages table (sort_order -1) and grants admin role_permissions

## [2026-05-09] — User profile card in sidebar and mobile nav

### Added
- `app/(app)/profile/page.tsx` — placeholder profile page ("coming soon")
- `components/sidebar.tsx` — user profile card at the top of the nav (avatar initial, full name, role label, chevron); collapsed state shows avatar only; links to `/profile`
- `components/mobile-nav.tsx` — same user profile card inside the slide-in drawer

### Changed
- `components/dashboard-page.tsx` — removed user card (moved to nav)

## [2026-05-09] — Dashboard user greeting card + profile page

### Added
- `app/(app)/profile/page.tsx` — placeholder profile page ("coming soon") linked from the greeting card
- `components/dashboard-page.tsx` — user greeting card at the top of the dashboard showing avatar initial, full name, and role; clicking navigates to `/profile`

## [2026-05-09] — Fix sidebar Sales Pipeline badge count

### Fixed
- `app/api/sidebar-counts/route.ts` — Sales Pipeline badge is now role-scoped: sales reps see unclaimed leads + their own active deals; admins see total active deals across all reps. Previously showed a global unfiltered count.

## [2026-05-09] — Sales pipeline: admin View button + role-based filtering + owner name

### Changed
- `components/sales-page.tsx` — admin users now see a read-only "View" button on all pipeline leads instead of "Claim"/"Open"; fetches role on mount via `user_profiles.roles(name)`

## [2026-05-09] — Sales pipeline: role-based filtering + owner name display

### Added
- `supabase/migrations/029_fix_sales_owner_fk.sql` — re-points `leads.sales_owner_id` FK from `auth.users` to `public.user_profiles(id)`, enabling PostgREST to join owner profile data in a single query

### Changed
- `app/api/leads/workspace/route.ts` — joins `sales_owner:user_profiles(id,full_name)` via PostgREST; sales role now filtered to unclaimed + owned leads only; admins still see all
- `app/api/leads/sales-counts/route.ts` — same role-based filter applied to tab badge counts
- `lib/types/index.ts` — added `sales_owner?: { id, full_name } | null` to `Lead` interface
- `components/sales-page.tsx` — Owner column now shows the actual sales rep name instead of "Claimed"; passes `currentUserId` to drawer
- `components/sales-drawer.tsx` — Sales Fields section now includes a read-only "Assigned To" field showing owner name, "You", or "Unclaimed"

## [2026-05-09] — Auto-login after first-time password setup

### Fixed
- `app/api/auth/change-password/route.ts` — replaced `adminClient.auth.admin.updateUserById` (which invalidates all refresh tokens) with `supabase.auth.updateUser` (session-aware). The user's AAL2 session is now preserved after setting their first password, so they land directly on the dashboard instead of being bounced back to `/login`.

## [2026-05-07] — Remove /tickets hub; Quoted Requests and Orders are standalone nav pages

### Removed
- `/tickets` removed from navigation — it was a holdover from the POC that became redundant once Quoted Requests and Orders got their own pages; the route still exists in code but is not linked
- `supabase/migrations/028_remove_tickets_page.sql` — deletes /tickets from pages table and cleans up role_permissions rows

## [2026-05-07] — Add Quoted Requests and Orders as nav pages

### Added
- `app/(app)/quotes/page.tsx` — Quoted Requests spec preview (formal + informal quotes, Quote Drawer, line items, follow-up, Convert to Order)
- `app/(app)/orders/page.tsx` — Orders spec preview (order table, Order Drawer, PDF export via jspdf, API routes)
- `supabase/migrations/027_add_quotes_orders_pages.sql` — inserts `/quotes` and `/orders` into the `pages` table (sort_order 5 and 6); shifts Statistics to 7 and Notifications to 8

### Changed
- `app/(app)/tickets/page.tsx` — redesigned as a Tickets hub landing page with two cards (Quoted Requests · Orders) that link to their individual pages; replaced the previous monolithic spec preview

## [2026-05-07] — Remove /settings page from nav

### Removed
- `/settings` page removed from navigation — password resets and 2FA are Admin-managed; theme toggle lives in the sidebar; no use case for a personal settings page
- `supabase/migrations/025_remove_settings_page.sql` — deletes /settings from pages table and cleans up role_permissions rows

## [2026-05-07] — Add all planned pages with spec previews

### Added
- `app/(app)/notifications/page.tsx` — spec preview: bell popover, real-time setup, all notification types (lead_routed, hold reminder, follow-up due, system broadcast, lead_assigned v2)
- `supabase/migrations/024_add_notifications_page.sql` — seeds /notifications into main nav; seeds audit-log, company, products as admin-sub pages
- Admin Settings tabs: `audit-log`, `company`, `products` — full spec content for each (deferred from MVP)
- Admin Settings tabs: `dropdowns`, `notifications` — replaced "coming soon" stubs with full spec content

### Changed
- `components/admin/settings-tab-nav.tsx` — added Audit Log, Company Info, Products tabs
- `app/(app)/admin/page.tsx` — added deferred cards (Audit Log, Company Info, Products) with "Planned" badge; built cards show accent icon, unbuilt show muted icon + "View spec →"

## [2026-05-07] — Spec preview pages for unbuilt features

### Added
- `components/ui/spec-preview.tsx` — shared `SpecPreviewPage`, `SpecSection`, `SpecCard`, `SpecNote`, `SpecBadge` components for rendering feature documentation as styled in-app pages
- `app/(app)/tickets/page.tsx` — full spec preview: Quoted Requests tab, Orders tab, Order Drawer (line items, pricing, follow-up, history), PDF export, period filter
- `app/(app)/statistics/page.tsx` — full spec preview: SDR KPIs + charts, Sales KPIs + charts, Admin KPIs + extras, chart library notes

## [2026-05-07] — Tab count badges always visible (Sales Pipeline + rule)

### Added
- `app/api/leads/sales-counts/route.ts` — lightweight endpoint returning `{ pipeline, hold, rejected }` counts for the Sales Pipeline tabs
- `.cursor/rules/tab-counts.mdc` — rule enforcing upfront count fetching and always-visible badges on all tab UIs

### Changed
- `components/sales-page.tsx` — count badges now show on **all** tabs before the user clicks; counts fetched from API on mount and refreshed on `bazaar:refresh-counts` event; Refresh button also triggers count refresh

## [2026-05-07] — Fix mobile navigation menu

### Fixed
- `components/mobile-nav.tsx` — rewrote mobile drawer to load role-based pages from Supabase (same as sidebar), replacing the hardcoded `[Dashboard, Settings]` stub that showed wrong items for SDR/Sales/Admin roles
- Mobile nav now shows sidebar badge counts (Leads, Sales) and refreshes them via the `bazaar:refresh-counts` event, matching desktop sidebar behavior
- Active-route detection matches sidebar logic (exact match for `/dashboard`, prefix match for all others)

## [2026-05-07] — Design System Tokenization

### Added
- `components/ui/urgency-pill.tsx` — reusable `<UrgencyPill urgency={...} />` component; replaces 5 copies of inline urgency ternary logic across leads, sales, and CRM pages
- `.cursor/rules/color-tokens.mdc` — Cursor rule enforcing CSS variable usage; documents all available tokens and `<StatusPill>` / `<UrgencyPill>` components with good/bad examples
- New semantic tokens in `app/globals.css` (light + dark): `--color-success-bg/border`, `--color-warning-bg/border/text-deep`, `--color-info-bg/text/border/text-deep`, `--color-neutral-bg/text/border`, `--color-danger-text-deep`

### Changed
- `components/ui/status-pill.tsx` — all status styles now reference CSS vars (no hardcoded hex)
- `components/crm-page.tsx`, `components/customer-profile.tsx` — customer status and heat tag style objects converted to CSS vars
- `components/verify-drawer.tsx`, `components/sales-drawer.tsx` — banners, borders, buttons all tokenized
- `components/leads-page.tsx`, `components/sales-page.tsx` — urgency pills replaced with `<UrgencyPill>`, all hex replaced with vars
- `components/admin/roles-section.tsx` — danger colors tokenized
- `components/sidebar.tsx` — badge colors tokenized
- `components/ui/phone-input.tsx`, `components/ui/email-input.tsx` — error state colors tokenized

---

## [2026-05-07] — Testing & Polish Pass (Post-Phase 6)

### Added
- `app/api/customers/[id]/merge/route.ts` — POST endpoint that moves all leads and activities from a source (duplicate) customer to a surviving target, logs a merge activity, then deletes the duplicate
- `app/api/leads/workspace/counts/route.ts` — lightweight endpoint returning per-tab lead counts scoped to the current SDR (`all` = shared queue, `hold/routed/rejected` = own leads only)
- `app/api/sidebar-counts/route.ts` — role-aware endpoint returning action-required counts per nav route (SDR → `/leads`, Sales → `/sales`, Admin → both); used to populate sidebar badges
- Merge Duplicate button on customer profile: two-step modal — search for surviving customer → yellow warning → merge & redirect

### Changed
- **Product Interests UI** (`verify-drawer.tsx`) — replaced always-visible checkbox grid with a tag-picker: `+ Add product interest…` dropdown adds items; selected items appear as rows with qty input and remove button
- **CRM filter bar** (`crm-page.tsx`) — removed duplicate "All" button from Heat filter group; Heat pills now toggle (click to filter, click again to deselect); added thin vertical divider between Status and Heat groups
- **Verify drawer footer** — On Hold lead now shows `Resume` button instead of `On Hold`; `Resume` calls `/api/leads/[id]/resume` and restores `prev_status`; all action buttons are now context-aware
- **Sidebar** (`sidebar.tsx`) — NavLink now accepts a `badge` prop; `Sidebar` fetches `/api/sidebar-counts` on mount and every 60 s; expanded sidebar shows red pill count on right, collapsed sidebar shows red dot on icon corner
- **Sidebar badge refresh** — every successful drawer action (validate, route, hold, reject, resume) dispatches `window.dispatchEvent(new Event("bazaar:refresh-counts"))` so sidebar counts update immediately without waiting for the 60 s poll
- **SDR lead scoping** — On Hold, Directed to Sales, and Rejected tabs in `/leads` now pass `scope=mine` to the workspace API, filtering by `sdr_id = userId`; All Leads tab remains a shared queue visible to all SDRs
- **Leads tab badges** — all four tabs show their count badge before the user clicks; active tab uses accent colour, inactive tabs use muted grey; zero-count tabs hide the badge

### Fixed
- `hold_until` empty-string bug — changed `hold_until ?? null` to `hold_until || null` in `/api/leads/[id]/hold/route.ts`; Supabase was rejecting `""` as an invalid timestamp
- CRM customer list showing duplicate entries — root cause was two separate customer records created during testing; explained dedup lookup flow and provided SQL to delete orphan; built Merge feature to prevent future manual cleanup

---

## [2026-05-07] — Merge Duplicate Customers

### Added
- `app/api/customers/[id]/merge/route.ts` — POST endpoint that moves all leads and activities from a source customer to a target, then deletes the source
- Merge Duplicate button on customer profile header opens a two-step modal: search for the surviving customer → confirm with warning → redirect to merged profile

---

## [2026-05-07] — CRM + Roles Editor

### Added
- `GET /api/customers` — list all customers with embedded lead count, last activity, and computed `customer_status` (new / known)
- `GET /api/customers/[id]` — single customer with full lead history
- `POST /api/admin/roles` — create custom role (validates slug format, rejects duplicates)
- `DELETE /api/admin/roles/[id]` — delete custom role; guards system roles and roles with assigned users
- `GET /api/admin/pages` — list all navigable pages for permission matrix
- `POST /api/admin/roles/[id]/permissions` — grant a page to a role (upsert)
- `DELETE /api/admin/roles/[id]/permissions/[pageId]` — revoke a page from a role
- `components/crm-page.tsx` — CRM list: customer table with search, status filter (All / New / Known), heat tag filter, desktop table + mobile cards, click-to-navigate
- `components/customer-profile.tsx` — customer profile page: header with status/heat badges, contact fields grid, Edit Customer modal (PhoneInput, EmailInput, heat tag select), Lead History table, Order History placeholder
- `app/(app)/crm/page.tsx` — updated from placeholder to render `<CRMPage />`
- `app/(app)/crm/customers/[id]/page.tsx` — customer profile route
- `components/admin/roles-section.tsx` — two-panel roles editor: left panel lists roles with New Role form and delete; right panel is permission matrix with instant toggle (POST/DELETE); Admin role shown as locked/read-only

### Changed
- `app/api/admin/roles/route.ts` (GET) — now includes embedded `role_permissions` flattened to `permitted_page_ids` array
- `app/(app)/admin/settings/[tab]/page.tsx` — roles tab now renders `<RolesSection />` instead of ComingSoon

---

## [2026-05-07] — Phase 6: Dashboard (MVP complete)

### Added
- `app/api/dashboard/kpis/route.ts` — `GET /api/dashboard/kpis?period=week|month|quarter`; role-scoped: SDR gets inbox/handled/routed/on-hold/rejected counts, Sales gets pipeline/won/hold/value counts, Admin gets total/inbox/routed/won/revenue counts; all queries run in parallel
- `components/dashboard-page.tsx` — client component: period selector (This Week / This Month / This Quarter), 6 role-scoped KPI cards with icons and accent highlight on primary card, Quick Actions grid (role-specific links), 300ms minimum skeleton display
- `app/(app)/dashboard/page.tsx` — updated from null stub to render `<DashboardPage />`

---

## [2026-05-07] — Phase 5: Sales Pipeline page

### Added
- `components/sales-drawer.tsx` — right-side drawer for Sales reps: read-only contact info, editable Sales fields (sales_status, quote_total), lock on open / unlock on close, Sales-specific hold sub-form (4 reasons), reject sub-form (sets `status = 'Rejected'`), Order/Quote tab placeholder
- `components/sales-page.tsx` — full Sales Pipeline client component: 3 tabs (Pipeline, On Hold, Rejected), Claim/Open actions, Resume from hold, desktop table + mobile card layout, lazy-fetch for Rejected tab, userId lookup for ownership display
- `app/(app)/sales/page.tsx` — updated from placeholder to render `<SalesPage />`
- `app/api/leads/[id]/claim/route.ts` — `POST /api/leads/[id]/claim` → sets `sales_owner_id` to session user, `sales_status = 'Ongoing'`; 409 if already claimed

---

## [2026-05-07] — Phase 3 SDR Leads page refinements & bug fixes

### Added
- `components/ui/phone-input.tsx` — custom phone input with `(xxx) xxx-xxxx` auto-format; stores digits-only
- `components/ui/email-input.tsx` — email input with blur-time format validation
- `components/ui/status-pill.tsx` — reusable `StatusPill` component for all lead/sales statuses
- `components/hold-sub-form.tsx` — hold reason sub-form with 2-column radio grid + notes + date picker
- `components/verify-drawer.tsx` — full Verify Drawer (lock-on-open, release-on-close, validate / hold / route / reject actions)
- `components/leads-page.tsx` — SDR Leads page with tab filters, desktop table, mobile cards, Add Lead modal
- `lib/utils/phone.ts` — `digitsOnly`, `formatPhone`, `validatePhone` utilities
- `lib/auth/require-session.ts` — reusable server-side session + role resolver for Route Handlers
- `app/(app)/leads/page.tsx` — server component rendering `<LeadsPage />`
- `app/api/lookups/route.ts` — `GET /api/lookups` → active lookup values (sources, industries, etc.)
- `app/api/customers/lookup/route.ts` — `GET /api/customers/lookup` → customer dedup by phone/email
- `app/api/customers/route.ts` — `POST /api/customers` → create new customer profile
- `app/api/customers/[id]/route.ts` — `PATCH /api/customers/[id]` → update customer + log `contact_edited`
- `app/api/leads/workspace/route.ts` — `GET /api/leads/workspace` → workspace leads filtered by status/search
- `app/api/leads/manual/route.ts` — `POST /api/leads/manual` → create lead manually
- `app/api/leads/[id]/route.ts` — `PATCH /api/leads/[id]` → update lead fields
- `app/api/leads/[id]/lock/route.ts` — `POST /api/leads/[id]/lock` → acquire optimistic lock
- `app/api/leads/[id]/unlock/route.ts` — `POST /api/leads/[id]/unlock` → release lock on drawer close
- `app/api/leads/[id]/hold/route.ts` — `POST /api/leads/[id]/hold` → place lead on hold + log activity
- `app/api/leads/[id]/resume/route.ts` — `POST /api/leads/[id]/resume` → resume lead from hold

### Changed
- **Authority field**: options changed from "Decision Maker / Influencer / User / Unknown" to "Yes / No"; label renamed to "Decision Maker?"
- **Urgency field**: added "Not Defined" option (UI sentinel `not_defined`, stored as `null` in DB to satisfy `leads_urgency_check`); displays a grey "Not Defined" pill instead of a dash when unset
- **Hold reasons**: updated from 4 generic options to 6 POC-aligned options displayed as a 2-column radio grid:
  - Awaiting customer response, Awaiting artwork / files, Awaiting payment confirmation, Pricing review needed, Vacation / customer unavailable, Other
- **Add Lead modal**: widened to `sm:max-w-[820px]`; `SelectTrigger` components set to `w-full`
- **Verify Drawer**: `SelectTrigger` components set to `w-full`; urgency and authority options aligned with above changes
- **Leads table**: added Urgency column (colour-coded pill); renamed "Work" action button to "Verify" on both desktop and mobile
- **Add User modal** (`components/admin/users-section.tsx`): role `SelectTrigger` set to `w-full`; `SelectValue` now renders the resolved `display_name` instead of the raw UUID
- `components/ui/dialog.tsx` — default modal width increased from `sm:max-w-sm` (384 px) to `sm:max-w-lg` (512 px); default padding increased from `p-4` to `p-6`
- `docs/feature-specs/leads-sdr.md` — updated table columns (added Urgency), Authority options, Urgency options, hold reasons sub-form, and Verify button label
- `docs/mvp-scope.md` — updated Authority and Urgency field descriptions in lead form reference table
- `docs/session-summary.md` — updated Authority and Urgency field notes in lead form reference table

### Fixed
- **DB constraint error** `leads_urgency_check`: `POST /api/leads/manual` and `PATCH /api/leads/[id]` now convert `urgency = 'not_defined'` or `''` to `null` before DB write
- **PostgREST relationship error** "Could not find a relationship between 'leads' and 'user_profiles'": removed the invalid `locked_by:user_profiles!locked_by_id` join from workspace and patch routes; lock conflict response now performs a direct `user_profiles` lookup by ID
- **Role UUID display in Add User modal**: `SelectValue` now explicitly renders the resolved role `display_name` so the dropdown shows the human-readable label instead of the raw UUID after selection

---

## [2026-05-07] — CRM spec: customer profile page + enriched dedup banner

### Changed
- `docs/feature-specs/crm.md` — full rewrite to include:
  - Three-tier customer status system (New Contact / Known Customer / Returning Customer) replacing the manual `is_returning_customer` checkbox
  - Enriched dedup banner showing status, order count, and last order date
  - Customer profile page (`/crm/customers/[id]`) with lead history, order history, and activity timeline sections
  - `GET /api/customers/lookup` response schema expanded with `order_count`, `lead_count`, `last_order_at`, `customer_status`
  - "View customer profile →" deep-link from Add Lead modal and Verify Drawer
  - Build dependency table listing what's needed before CRM can be built

## [2026-05-07] — Phase 3: SDR Leads page

### Added
- `lib/utils/phone.ts` — `digitsOnly`, `formatPhone`, `validatePhone` helpers
- `lib/auth/require-session.ts` — generic session + role resolver for Route Handlers
- `components/ui/phone-input.tsx` — validated phone input with auto-formatting `(xxx) xxx-xxxx`
- `components/ui/email-input.tsx` — email input with blur validation
- `components/ui/status-pill.tsx` — colour-coded status badge for `LeadStatus` / `SalesStatus`
- `components/hold-sub-form.tsx` — inline hold reason / notes / date sub-form used in Verify Drawer
- `components/verify-drawer.tsx` — right-side slide-in drawer for working a lead: lock on open, Validate / Route to Sales / Hold / Reject / Save actions, "Update customer?" prompt, read-only banner when locked by another user
- `components/leads-page.tsx` — full SDR Leads client component: four tabs (All Leads, On Hold, Directed to Sales, Rejected), Add Lead modal with 600ms debounce customer dedup (single match banner, multi-match picker), desktop table + mobile card layout, Verify Drawer integration, optimistic removal on action
- `app/(app)/leads/page.tsx` — updated from stub to render `<LeadsPage />`
- `app/api/lookups/route.ts` — `GET /api/lookups?categories=…` returns active dropdown options
- `app/api/customers/lookup/route.ts` — `GET /api/customers/lookup` phone/email dedup
- `app/api/customers/route.ts` — `POST /api/customers` create customer
- `app/api/customers/[id]/route.ts` — `PATCH /api/customers/[id]` update customer + activity log
- `app/api/leads/workspace/route.ts` — `GET /api/leads/workspace` with status + search filters
- `app/api/leads/manual/route.ts` — `POST /api/leads/manual` create lead + optional customer
- `app/api/leads/[id]/route.ts` — `PATCH /api/leads/[id]` with lock guard + terminal state guard + activity logging
- `app/api/leads/[id]/lock/route.ts` — `POST /api/leads/[id]/lock` acquire / refresh lock
- `app/api/leads/[id]/unlock/route.ts` — `POST /api/leads/[id]/unlock` release lock
- `app/api/leads/[id]/hold/route.ts` — `POST /api/leads/[id]/hold` put on hold (SDR or Sales role)
- `app/api/leads/[id]/resume/route.ts` — `POST /api/leads/[id]/resume` restore from hold

## [2026-05-07] — Fix self-edit blocked when only name changes

### Fixed
- `components/admin/users-section.tsx` — Edit User dialog was always sending `role_id` in the PATCH payload even when the role hadn't changed; the API's self-modify guard (`role_id !== undefined`) would then reject any self-edit including a plain name change. Fixed: `role_id` is now only included in the payload when it actually changed from the original value. Also added a no-op early exit if nothing changed at all.

## [2026-05-07] — Select dropdowns always show labels, never raw DB values

### Added
- `.cursor/rules/select-labels.mdc` — rule: any `<Select>` pre-filled from DB data must pass resolved label as children of `<SelectValue>` to avoid showing UUIDs/slugs when options load asynchronously

### Fixed
- `components/admin/users-section.tsx` — Edit User dialog Role dropdown was showing UUID instead of display name; fixed by passing `roles.find(r => r.id === roleId)?.display_name` as children of `<SelectValue>`

## [2026-05-07] — Mobile card layout for tables + users table updated

### Added
- `.cursor/rules/mobile-table-cards.mdc` — workspace rule: every data table must render as a card list on mobile (`sm:hidden` / `hidden sm:block` pattern)

### Changed
- `components/admin/users-section.tsx` — users table now has a full mobile card view (`sm:hidden`): each user renders as a card with avatar, name, status badge, email/role/joined fields, and Edit/Deactivate buttons; skeleton loader also card-based; desktop table (`hidden sm:block`) updated to use BazarCRM design tokens (row-alt, row-hover, badge-bg, text-muted)

## [2026-05-07] — Edit user opens modal instead of inline row

### Fixed
- `components/admin/users-section.tsx` — replaced inline `EditRow` (which appeared to "disappear" the row) with a proper `EditUserDialog` modal; clicking Edit now opens a dialog matching the Add User modal pattern

## [2026-05-07] — Documentation synced to current implementation

### Changed
- `docs/architecture.md` — file structure updated to reflect all built admin files (`admin/layout.tsx`, `admin/page.tsx`, `admin/settings/layout.tsx`, `admin/settings/[tab]/page.tsx`), admin API routes, and new UI components; noted `max-width: 1980px` on app layout
- `docs/navigation.md` — route tree updated to actual `/admin/settings/[tab]` structure; page title table updated to match real routes; removed stale `/admin/users`, `/admin/roles`, etc.
- `docs/feature-specs/admin.md` — all admin sub-routes updated from `/admin/users` etc. to `/admin/settings/users` etc.; overview card section rewritten to reflect current implementation; permission matrix paths corrected
- `docs/session-summary.md` — Phase 2 marked complete with actual built files listed; "How to start" URL updated to `/admin/settings/users`

## [2026-05-07] — Admin UI redesigned to match PrintManager pattern

### Changed
- `app/(app)/admin/page.tsx` — overview card grid: removed `available` / "Soon" disabled state; all 4 cards fully clickable with BazarCRM design tokens (accent icon, token-based hover, no hardcoded hex)
- `app/(app)/admin/layout.tsx` — restructured to `flex min-h-full flex-col` with a `border-b` sub-nav strip (matches PrintManager layout)
- `components/admin/admin-sub-nav.tsx` — applied BazarCRM CSS token–based active/inactive styles (replaces generic shadcn classes)
- `components/admin/settings-tab-nav.tsx` — removed disabled/coming-soon pill state; all 4 tabs fully clickable; active tab uses `var(--color-btn-verify-bg/text)` (navy + gold); inactive uses muted fill with hover
- `app/(app)/admin/settings/layout.tsx` — removed `<Separator>` and extra padding; now matches PrintManager `px-6 pb-8 pt-4` structure
- `app/(app)/admin/settings/[tab]/page.tsx` — replaced emoji in ComingSoon placeholder with token-based design-system icon

## [2026-05-07] — Admin restructured to proper file-based routing

### Added
- `components/admin/admin-sub-nav.tsx` — client component for Overview/Settings strip; uses `usePathname` for active state
- `components/admin/settings-tab-nav.tsx` — client component for horizontal settings tab pills; links to `/admin/settings/[tab]`
- `app/(app)/admin/settings/layout.tsx` — settings sub-layout: renders `SettingsTabNav` + `<Separator>` above `{children}`
- `app/(app)/admin/settings/page.tsx` — redirects `/admin/settings` → `/admin/settings/users`
- `app/(app)/admin/settings/[tab]/page.tsx` — renders section component per tab (`users`, `roles`, `dropdowns`, `notifications`); unknown tabs → `notFound()`
- `supabase/migrations/023_admin_settings_routes.sql` — inserts new `/admin/settings/*` routes into `pages` table as `section = 'admin-sub'`

### Changed
- `app/(app)/admin/layout.tsx` — now renders the shared page title + `AdminSubNav` strip; all admin child routes inherit this wrapper
- `app/(app)/admin/page.tsx` — simplified to only the overview card grid (no more query-param tab logic); cards link to `/admin/settings/[tab]`
- `app/(app)/admin/users/page.tsx` — redirect updated from `?tab=settings&section=users` to `/admin/settings/users`

## [2026-05-07] — Admin hub and users section rebuilt with shadcn UI

### Added
- `components/ui/card.tsx`, `button.tsx`, `badge.tsx`, `dialog.tsx`, `input.tsx`, `select.tsx`, `separator.tsx`, `tooltip.tsx` — installed via shadcn CLI
- `TooltipProvider` wrapper added to `app/layout.tsx`

### Changed
- `app/globals.css` — added full shadcn CSS token bridge (`--color-card`, `--color-primary`, `--color-muted`, `--color-sidebar`, `--radius`, etc.) mapped to existing design system vars
- `app/(app)/admin/page.tsx` — rebuilt using shadcn `Card`/`CardHeader`/`CardContent`, `Separator`; sub-nav strip uses blueprint link-state classes; settings tab bar uses filled-pill primary style from blueprint
- `components/admin/users-section.tsx` — rebuilt using shadcn `Button`, `Input`, `Select`, `Dialog`, `Badge`; table uses blueprint row/header patterns; role and status badges use Tailwind color utility classes; inline edit row and create dialog fully converted

## [2026-05-07] — Fix 404 → back button navigation and double-padding

### Added
- `app/(app)/leads/page.tsx` — "Coming in Phase 3" placeholder inside the app layout
- `app/(app)/sales/page.tsx` — "Coming in Phase 4" placeholder inside the app layout
- `app/(app)/crm/page.tsx` — placeholder inside the app layout
- `app/(app)/tickets/page.tsx` — placeholder inside the app layout
- `app/(app)/statistics/page.tsx` — placeholder inside the app layout
- `app/(app)/settings/page.tsx` — updated to a proper "coming soon" placeholder

### Fixed
- Navigating to an unbuilt route (e.g. `/leads`) no longer renders the global `/_not-found` page outside the `(app)` layout; all planned routes now stay inside the sidebar shell
- Browser Back button from a 404 now correctly restores the previous page with sidebar intact
- Removed duplicate `mx-auto max-w-[1280px] px-6 py-8` wrapper from `admin/page.tsx` and `components/admin/users-section.tsx` — `(app)/layout.tsx` already provides this container

## [2026-05-07] — Admin panel redesigned as two-tab layout (Overview + Settings)

### Changed
- `app/(app)/admin/page.tsx` — complete rewrite: two top-level tabs "Overview" (card grid) and "Settings" (horizontal section tabs). Clicking a card from Overview switches to Settings with that section active — no separate page navigation needed.
- `app/(app)/admin/users/page.tsx` — now redirects to `/admin?tab=settings&section=users`
- `components/admin/users-section.tsx` — users table+modal extracted into a named export component rendered inside the Settings tab

### Added
- `supabase/migrations/022_fix_admin_subpages_section.sql` — updates admin sub-pages (`/admin/users`, `/admin/roles`, etc.) section from `'admin'` to `'admin-sub'` so they no longer appear as individual sidebar items. Only `/admin` remains in the sidebar.

---

## [2026-05-07] — Phase 2 User Management complete

### Added
- `app/(app)/admin/page.tsx` — Admin overview card grid (4 cards: Users active, Roles/Dropdowns/Notifications show "Coming soon")
- `app/(app)/admin/layout.tsx` — Admin section shell
- `app/(app)/admin/users/page.tsx` — Full user management page: table with skeleton loader, search + role filter + show-inactive toggle, avatar initials, role pills, status badges, must-change-password warning icon, relative timestamps, inline edit row (name, role, optional temp password reset), deactivate/reactivate, create modal, bottom-right toast
- `app/api/admin/users/route.ts` — GET: lists all users from `user_profiles_with_role` view, merges email from `auth.admin.listUsers`, supports search/role/is_active filters
- `app/api/admin/users/create/route.ts` — POST: creates auth user (no email), inserts `user_profiles` with `must_change_password: true`, cleans up orphaned auth user on profile failure
- `app/api/admin/users/[id]/route.ts` — PATCH: update name/role/active/temp-password; guards self-modify and last-admin deactivation
- `app/api/admin/roles/route.ts` — GET: lists all roles (used to populate role dropdowns)
- `lib/auth/require-admin.ts` — shared auth guard for all admin Route Handlers

---

## [2026-05-07] — Phase 1 DB Foundation complete

### Added
- `supabase/migrations/001–021` — all 21 migration SQL files: table creation, indexes, RLS, triggers, views, helper functions, and seed data (system roles, pages, role permissions, all dropdown lookup values from POC)
- `lib/types/index.ts` — canonical TypeScript types for all domain entities (UserProfile, Role, Page, Lead, Customer, LookupValue, JobTicket, Activity, AppNotification, KPIs, form types)
- `app/(auth)/change-password/page.tsx` — forced password change UI shown to users with `must_change_password = true`
- `app/api/auth/change-password/route.ts` — POST handler: updates password via admin client, clears `must_change_password` flag

### Changed
- `proxy.ts` — extended with: `is_active` check (deactivated → sign out → `/login?error=deactivated`), `must_change_password` redirect to `/change-password`, DB-driven role permission gate (fetches `role_permissions` + `pages` per request; Admin bypasses check; wrong-role redirects to home)
- `lib/auth/resolve-default-home.ts` — now role-aware: SDR → `/leads`, Sales → `/sales`, Admin/other → `/dashboard`
- `components/sidebar.tsx` — fully rewritten as DB-driven role-aware nav; fetches allowed pages from `role_permissions` join at runtime; supports all 10 Lucide icons mapped by name; shows "Admin" section label; collapses correctly

---

---

## [2026-05-07] — Admin panel redesigned as card grid with separate pages

### Changed
- `docs/feature-specs/admin.md` — complete rewrite: `/admin` is now a card overview grid; each admin section is a separate full page (`/admin/users`, `/admin/roles`, `/admin/dropdowns`, `/admin/notifications`). Removed `/admin/settings` route. `/admin/audit` deferred (not in MVP card grid). Added full specs for Roles & Permissions page (two-column with permission matrix), Dropdown Options page (category sidebar + options table with drag-reorder), and Notifications broadcast page.
- `docs/navigation.md` — updated route tree, admin sidebar (single "Admin Panel" link to `/admin`), icon map (added ShieldCheck, KeyRound, ListFilter, Megaphone), page title table

---

## [2026-05-07] — lookup_values table — DB-managed dropdown options

### Added
- `docs/schema.md` — new `lookup_values` table with `category`, `value`, `label`, `sort_order`, `is_active`; 7 seeded categories (source 15 opts, industry 14 opts, urgency 3 opts, hold_reason 6 opts, reject_reason 6 opts, route_reason 6 opts, sales_drop_reason 5 opts); migration 010 + seed 020 added to migration order
- `docs/api-contract.md` — `GET /api/lookups`, `GET /api/admin/lookups`, `POST /api/admin/lookups`, `PATCH /api/admin/lookups/[id]`
- `docs/types.md` — `LookupValue`, `LookupCategory`, `LookupMap` types
- `docs/session-summary.md` — updated DB summary to include lookup_values

---

## [2026-05-07] — Session summary document created

### Added
- `docs/session-summary.md` — complete session record covering tech stack, all architectural decisions, DB schema summary, MVP build phases, lead status flow, customer dedup design, and docs index

---

## [2026-05-06] — Customer deduplication system, contacts renamed to customers

### Changed
- `docs/schema.md` — Renamed `contacts` table to `customers` throughout. Removed unique constraints on `phone` and `email` (multiple customer profiles per phone intentional). Added customer lookup deduplication rules section. Updated all FK references (`contact_id` → `customer_id`). Updated indexes, RLS policies, triggers, and migration file names.
- `docs/api-contract.md` — Renamed all `/api/contacts/*` to `/api/customers/*`. Replaced `GET /api/contacts/lookup` with richer `GET /api/customers/lookup` returning all matches (not just first). Added `POST /api/customers` and `PATCH /api/customers/[id]`. Updated `POST /api/leads/manual` body to include `customer_id` / `create_customer` fields and correct new fields (`urgency`, `is_returning_customer`, `sdr_comment`).
- `docs/types.md` — Renamed `Contact` → `Customer`. Added `CustomerLookupResult` type. Updated `Lead.contact_id` → `Lead.customer_id`. Removed `ContactMergeFields` (dedup is now UI-choice, not field-level merge).
- `docs/feature-specs/leads-sdr.md` — Added complete **Customer Lookup (Smart Deduplication)** section to Manual Add Lead: phone lookup flow, no-match / 1-match / 2+-match modal variants, secondary email lookup, on-submit customer creation logic, "Update Customer?" prompt when SDR takes action on a lead.
- `docs/mvp-scope.md` — Added `customers` table to Phase 1 foundation. Updated Phase 4 description to include customer dedup lookup.

---

## [2026-05-06] — Lead form fields corrected — added Urgency, Returning Customer, SDR Comment

### Changed
- `docs/schema.md` — Added 3 missing lead fields: `urgency` (High/Medium/Low), `is_returning_customer` (boolean), `sdr_comment` (Verify Lead Comment textarea).
- `docs/types.md` — Added `LeadUrgency` type; added `urgency`, `is_returning_customer`, `sdr_comment` to `Lead` interface and `VerifyLeadForm` interface. Reorganized form type to match actual field layout.
- `docs/feature-specs/leads-sdr.md` — Updated Lead Info Tab to show full correct field grid (matches POC screenshot layout). Added Urgency, Returning Customer, Verify Lead Comment. Specified Product Interests are in drawer only, not in add modal. Added two-column layout spec matching screenshot.
- `docs/mvp-scope.md` — Updated Lead Form Fields table with all correct fields and notes on which appear in add modal vs drawer only.

---

## [2026-05-06] — MVP scope defined, plan updated

### Added
- `docs/mvp-scope.md` — Defines exact build boundary: DB foundation, auth additions, minimal user management, SDR leads page, Sales leads page, basic dashboard. All other features explicitly deferred with order.

### Changed
- Build plan updated to reflect MVP-first approach: Phases 1–5 are in scope now; CRM, Tickets, Statistics, full Admin panel, Notifications, and Email/SMS are deferred to named later phases.

---

## [2026-05-06] — Dynamic roles/permissions system, temp password, change-password flow

### Added
- `docs/schema.md` — Three new tables: `roles` (admin-manageable), `pages` (route registry), `role_permissions` (many-to-many). `user_profiles.role` text column replaced by `user_profiles.role_id FK → roles`. Added `must_change_password` boolean. Added `user_profiles_with_role` convenience view. Added `user_can_access_route()` DB function. Updated migration order to 19 files.
- `docs/api-contract.md` — New endpoints: `POST /api/auth/change-password`, full `GET/POST/PATCH/DELETE /api/admin/roles/*` CRUD + permission grant/revoke endpoints. Replaced `POST /api/admin/users/invite` with `POST /api/admin/users/create` (no email, temp password, `must_change_password`). Updated `PATCH /api/admin/users/[id]` with `role_id`, `new_temp_password`, `must_change_password` fields.
- `docs/types.md` — Added `Role`, `Page`, `RolePermission` types. Updated `UserProfile` to use `role_id` and `must_change_password`.
- `docs/navigation.md` — Added `/change-password` to route tree and proxy.ts path classifications.
- `docs/architecture.md` — Added `change-password/page.tsx`, `api/auth/change-password/`, `api/admin/roles/` to file structure.

### Changed
- `docs/rbac.md` — Completely rewrote `proxy.ts` extension: now reads allowed routes from DB (`role_permissions` JOIN `pages`), adds `is_active` check, adds `must_change_password` intercept before role check.
- `docs/feature-specs/admin.md` — Replaced "Invite User" with "Create User" (temp password, no email). Added full **Roles & Permissions** tab spec to Settings (role list, permission matrix, create/delete custom role flow).

---

## [2026-05-06] — Component architecture doc, tab URL spec, role redirect refinement

### Added
- `docs/component-architecture.md` — Full component architecture: Server vs Client component split for every page, SDR vs Sales side-by-side breakdown, shared vs role-specific components table, `LeadTable` props interface, drawer anatomy, data fetching strategy, URL state convention.

### Changed
- `docs/navigation.md` — Added Tab URL Convention section: all `?tab=` values for `/leads`, `/sales`, `/tickets`; documents use of `router.replace` over `router.push`.
- `docs/rbac.md` — Refined `proxy.ts` extension to use **redirects** (not just blocks): wrong-role user typing `/leads` lands on `/sales`, not `/dashboard`. Added `is_active` check for deactivated users.

---

## [2026-05-06] — Lead locking, terminal reject, corrected status flow

### Added
- `docs/feature-specs/lead-locking.md` — Complete lead locking spec: schema fields (`locked_by_id`, `locked_at`), lock lifecycle, edit vs read-only mode, Admin override, client implementation pattern, concurrency edge case.

### Changed
- `docs/schema.md` — Added `locked_by_id` and `locked_at` to `leads` table + index. Updated status enums to mark `Rejected` (SDR) and `Rejected`/`Won` (Sales) as **terminal states** only Admin can override.
- `docs/api-contract.md` — Added `POST /api/leads/[id]/lock` and `POST /api/leads/[id]/unlock` endpoints. Added lock guard and terminal state guard to `PATCH /api/leads/[id]` and `POST /api/leads/verify`.
- `docs/rbac.md` — Added full Lead Locking Rules section (acquire/release/read-only/admin-override table) and Terminal State Rules table.
- `docs/feature-specs/leads-sdr.md` — Added locking behavior section; updated footer actions to show locking constraints; clarified Hold resume goes back to `Validated`; documented Reject as terminal.
- `docs/feature-specs/leads-sales.md` — Added locking behavior note; updated footer actions for terminal Reject; corrected Hold resume to go back to `Ongoing` only; added distinct Hold/Rejected sections.

---

## [2026-05-06] — Full production documentation suite

### Added
- `docs/schema.md` — Complete Supabase Postgres schema: 6 tables (`user_profiles`, `contacts`, `leads`, `job_tickets`, `activities`, `notifications`), all indexes, RLS policies, `set_updated_at` trigger, migration file order.
- `docs/api-contract.md` — Full Route Handler contract for all endpoints: Leads, Contacts, Tickets, Activity, Notifications, Dashboard KPIs, Outreach, Admin.
- `docs/rbac.md` — Role definitions (SDR / Sales / Admin), route access matrix, API access matrix, DB RLS matrix, `proxy.ts` role-gate extension, user lifecycle.
- `docs/navigation.md` — Full route tree, sidebar nav per role with Lucide icon map, tab structures per page, notification bell placement.
- `docs/types.md` — Canonical TypeScript types for all domain entities: `UserProfile`, `Contact`, `Lead`, `JobTicket`, `Activity`, `Notification`, form input types, KPI types.
- `docs/feature-specs/leads-sdr.md` — SDR Inbox, On Hold, Directed, Rejected tabs + Verify Drawer full spec.
- `docs/feature-specs/leads-sales.md` — Sales Pipeline, On Hold, Rejected tabs + Sales Drawer spec.
- `docs/feature-specs/crm.md` — Contact registry, expand row, merge, edit, great heat, admin toolbar.
- `docs/feature-specs/tickets.md` — Quoted Requests, Orders tabs, Order Drawer (ticket builder), PDF export.
- `docs/feature-specs/activity.md` — HistoryTimeline, icon map, manual logging, server-side auto-logging table.
- `docs/feature-specs/statistics.md` — SDR / Sales / Admin KPI cards, all chart specs, shared period context.
- `docs/feature-specs/notifications.md` — Notification bell, feed, all notification types, Supabase Realtime setup.
- `docs/feature-specs/admin.md` — User management, invite flow, system settings (products, sources, company info, broadcast), audit log.
- `docs/feature-specs/dashboard.md` — Role-scoped KPI cards, quick actions, follow-up alerts, design notes.
- `docs/feature-specs/` directory created.

### Changed
- `docs/architecture.md` — Updated to reflect full production plan: complete file structure (existing + planned), new environment variables (outreach providers), updated "Creating users" section to describe Admin invite flow.

---

## [2026-05-06] — Rule compliance audit & fixes

### Added
- `--color-danger-bg` and `--color-danger-border` CSS tokens (light + dark) to `globals.css` — eliminates hardcoded hex from components.
- `lib/utils/email.ts` — `validateEmail()` helper.
- `components/ui/email-input.tsx` — `EmailInput` component with blur validation, focus ring, and `aria-invalid`/`aria-describedby` support.

### Changed
- All 3 auth pages (`login`, `verify-2fa`, `setup-2fa`): error banners now use `var(--color-danger-bg)` and `var(--color-danger-border)` instead of `#FEF2F2`/`#FECACA`. Added `role="alert"` to error banners.
- `login/page.tsx`: replaced bare `<input type="email">` with `<EmailInput>`. Added `aria-invalid` and `aria-describedby` to the password field when an auth error is present. Error banner now has `id="login-error"` for the `aria-describedby` reference.
- `setup-2fa/page.tsx`: fixed `text-[11px]` → `text-[12px]` on the "Manual entry key" label to match the 12px label standard.

### Removed
- `components/tab-nav.tsx` — unused since navigation switched to sidebar layout.
- `components/topbar.tsx` — unused since navigation switched to sidebar layout.

---

## [2026-05-06] — Auth UX polish & sign-out

### Added
- Auto-submit on 6th digit in `/verify-2fa` — no button press needed
- Wrong code: clears all 6 boxes and shows "Incorrect code — please try again."
- Sign out logic wired in desktop sidebar and mobile nav drawer (calls `supabase.auth.signOut()` then `window.location.assign("/login")`)

---

## [2026-05-06] — Auth pages redesigned

### Added
- `components/otp-input.tsx` — reusable 6-box OTP input with auto-advance on input, backspace navigation, and full paste support

### Changed
- `app/(auth)/login/page.tsx` — full redesign: navy lock icon header, italic subtitle, uppercase labels, show/hide password toggle, step dots, security badge. Removed "Forgot password?" and "Remember device" (not needed for internal tool)
- `app/(auth)/verify-2fa/page.tsx` — 6-box OTP grid replacing single input field; info box; step dots (step 1 green = done, step 2 gold = active); "Use a different account" link
- `app/(auth)/setup-2fa/page.tsx` — matching card style, skeleton loader while QR generates, manual key display, 6-box OTP input

---

## [2026-05-06] — QR code fixes

### Fixed
- Replaced `react-qr-code` with `qrcode.react` — `react-qr-code` threw "code length overflow" on Supabase TOTP URIs
- Switched QR error correction from `level="M"` to `level="L"` for higher data capacity
- Replaced Supabase's full `qr_code` URI with a minimal `otpauth://totp/BazaarPrinting?secret=...` URI — Supabase's URI was too long for any QR library level
- Added `useRef` guard to prevent React StrictMode double-invoke causing duplicate enrollment calls
- Changed TOTP friendly name to `BazarCRM-{timestamp}` — prevents "factor name conflict" 422 error on re-enrollment

---

## [2026-05-06] — Navigation & mobile nav

### Added
- `components/mobile-nav.tsx` — mobile top bar (56px, navy) with hamburger button; full-height slide-in drawer with nav items, dark mode toggle, sign out; closes on route change; locks body scroll while open

### Changed
- `app/(app)/layout.tsx` — sidebar hidden below `lg` breakpoint; mobile nav shown on mobile only; page padding `px-4` mobile / `px-6` desktop

---

## [2026-05-06] — Sidebar navigation

### Changed
- Navigation switched from horizontal tab bar to **collapsible left sidebar** matching Pulse V2 pattern
- `components/sidebar.tsx` — navy background (`var(--color-topbar)`), expanded 224px / collapsed 56px, active item uses gold/orange accent, collapse state persisted in `localStorage` key `bazaar-sidebar-collapsed`, dark mode toggle + sign out + collapse button at bottom
- `app/(app)/layout.tsx` — uses sidebar instead of topbar + tab nav
- Removed old `components/sidebar.tsx` and `components/mobile-nav.tsx` (horizontal tab versions)
- Updated `.cursor/rules/ui-design-system.mdc` to reflect sidebar layout

---

## [2026-05-06] — BazaarPrinting UI design system applied

### Added
- `components/topbar.tsx` — navy/charcoal topbar, gold/orange `BAZAARPRINTING CRM` logo, theme toggle
- `components/tab-nav.tsx` — horizontal tab bar with active gold/orange underline, count badge support

### Changed
- `app/globals.css` — replaced generic Tailwind variables with full BazaarPrinting token set (19 CSS variables, light + dark), skeleton shimmer animation
- `app/layout.tsx` — font swapped Roboto → **Inter**; `NextTopLoader` uses `var(--color-accent)`
- `components/theme-provider.tsx` — localStorage key changed from `bazar-crm-theme` to `bazaar-theme`
- `.cursor/rules/ui-design-system.mdc` — updated to reflect new nav layout

---

## [2026-05-06] — Cursor rules created

### Added
- `.cursor/rules/stack-conventions.mdc` — stack rules (always applied): Next.js 16 proxy.ts pattern, Supabase client split, env var rules
- `.cursor/rules/ui-design-system.mdc` — BazaarPrinting design system (always applied): full color token table, typography, layout rules, component specs, do/don'ts

---

## [2026-05-06] — Vercel deployment fixes

### Added
- `vercel.json` — sets `framework: nextjs` to fix "No Output Directory named public" error
- `package.json` `engines` field — requires `node >=18.18.0` for Next.js 16 compatibility

### Fixed
- Vercel was treating project as static site instead of Next.js app

---

## [2026-05-06] — Supabase + local dev setup

### Added
- `.env.local` — local Supabase credentials (gitignored)
- Auth bypass in `proxy.ts` — skips auth when `NEXT_PUBLIC_SUPABASE_URL` is empty, enabling UI-only local dev without Supabase

### Configured (Supabase dashboard)
- Email signup: disabled
- Confirm email: disabled  
- TOTP MFA: enabled
- Site URL + redirect URLs added for Vercel domain and localhost

---

## [2026-05-06] — Initial scaffold

### Added
- `package.json` — Next.js 16, React 19, TypeScript 5, Tailwind CSS v4, Supabase SSR, shadcn, lucide-react, qrcode.react, nextjs-toploader, tw-animate-css
- `tsconfig.json` — strict mode, path alias `@/*` → project root
- `next.config.ts`, `postcss.config.mjs`, `components.json` (shadcn, style: base-nova)
- `.gitignore`, `.env.local.example`
- `proxy.ts` — Next.js 16 Proxy, AAL2 session enforcement, MFA redirect logic (adapted from Pulse V2)
- `lib/supabase/client.ts` — browser Supabase client
- `lib/supabase/admin.ts` — service-role client (server/Route Handlers only)
- `lib/auth/safe-return-path.ts` — open redirect prevention
- `lib/auth/resolve-default-home.ts` — default post-login path (`/dashboard`)
- `lib/utils.ts` — `cn()` helper
- `app/globals.css`, `app/layout.tsx`, `app/page.tsx` (redirects → `/dashboard`)
- `app/(auth)/layout.tsx`, `login/page.tsx`, `setup-2fa/page.tsx`, `verify-2fa/page.tsx`
- `app/(app)/layout.tsx`, `dashboard/page.tsx`, `settings/page.tsx`
- `components/theme-provider.tsx` — light/dark toggle, localStorage
- `docs/` folder for project documentation
