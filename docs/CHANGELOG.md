# Changelog

All notable changes to BazaarPrinting CRM are documented here.
Format: `## [version or date] — description`, newest first.

## [2026-06-17] — Rename Roll Direction lookup labels to numbered short form

### Changed
- `supabase/patches/2026-06-17-roll-direction-labels.sql` — updated `lookup_values` labels for `roll_direction` category: "Top Off First" → "1-Top", "Bottom Off First" → "2-Bottom", "Right Off First" → "3-Right", "Left Off First" → "4-Left"
- `supabase/schema.sql` — updated seed values to match

---

## [2026-06-16] — Fix: change-password works when MFA is enabled (AAL2 error)

### Fixed
- `app/api/auth/change-password/route.ts` — switched password update from `supabase.auth.updateUser()` (session-aware) to `adminClient.auth.admin.updateUserById()` (service-role). The session client requires an AAL2 session when MFA is enabled, but users on the forced `/change-password` flow are still AAL1 (they haven't completed MFA verification yet). The admin client bypasses the AAL level check entirely.

---

## [2026-06-16] — Fix: title no longer blocks Send Quote in quote detail

### Fixed
- `components/quotes/quote-detail.tsx` — removed the "A title is required" validation from `handleSave`; title was made optional in the previous commit but the send/submit flow in the detail view still blocked submission when the title was empty

---

## [2026-06-15] — schema.sql: merge all patches through 2026-06-15

### Changed
- `supabase/schema.sql` — merged all 5 patches that had been applied to production but not reflected in the consolidated schema file:
  - `permissions` + `role_action_grants` tables, full permissions catalog seed, and role grants (RBAC Slice 0, `2026-06-09-action-permissions.sql`)
  - `record_ticket_payment_atomic` function + service_role grant (`2026-06-09-atomic-payment-rpc.sql`)
  - `webhook_deliveries` table + 3 indexes + RLS policy (`2026-06-12-webhook-deliveries.sql`)
  - 10 composite/partial performance indexes on `leads`, `customers`, `job_tickets`, `activities` (`2026-06-13-performance-indexes.sql`)
  - `/admin/settings/import-export` page added to pages seed
  - RLS enables and policies for all 3 new tables
  - Schema header updated to list all applied patches through 2026-06-15

---

## [2026-06-15] — Docs cleanup: archive historical planning files, remove noise

### Removed
- `docs/sibling-project-stack-bootstrap.md` — bootstrap guide for a different project, not BazarCRM-specific
- `docs/realtime-agent-setup-guide.md` — generic Realtime guide for other projects, not BazarCRM-specific
- `docs/Notification/Notification.md` — content already covered by `feature-specs/notifications.md`
- `docs/owner-color-picker.html` — standalone HTML tool, not documentation

### Changed
- `docs/TODO.md` — updated to 2026-06-15; added Done rows for bulk order import, multi-word search, webhook pagination/filters; added Planned row for data management
- Moved 11 historical planning files to `docs/archive/`: `mvp-scope.md`, `session-summary.md`, `UserSessions.md`, and 8 `order-ticket/` planning docs (shadow-project analysis, integration plan, open questions, owner questionnaire, pricing proposal, product catalog) — work is shipped, lifecycle-flow.md kept as ongoing reference

---

## [2026-06-15] — Order Webhook: date filter, ListPagination (25/50/100), legacy guard

### Added
- `app/api/admin/webhook/page-data/route.ts` — accepts `tab`, `search`, `date_from`, `date_to`, `limit` (default 25), `offset` query params; returns paginated results with `pagination` metadata
- `components/admin/webhook-section.tsx` — search bar (300 ms debounce, filters by order #), `DashboardDateRangeFilter` (same date presets as Orders page, defaults to last month), `ListPagination` component (25 / 50 / 100 rows per page, persisted to `localStorage`)

### Changed
- Webhook page API now **excludes all `order_source = legacy_import` orders** — historical imported orders will never appear in the webhook panel or be sent to the external system
- `app/api/admin/webhook/resend/route.ts` — blocks resend for `legacy_import` orders at the API level with a `422 LEGACY_IMPORT` error code
- Tab counts (All / Delivered / Failed / Not Sent) always reflect totals across all non-legacy orders for the selected date range, regardless of current search or page
- Page size default changed to 25; user preference persists across sessions (same `localStorage` key used by all other list pages)

## [2026-06-15] — Fix multi-word search across all list pages

### Fixed
- `lib/utils/leads-workspace-query.ts` — `resolveLeadSearchCustomerIds` now splits search terms by whitespace and applies each word as a separate `ilike` condition; fixes Sales Pipeline and Leads Workspace full-name search (e.g. "John Smith")
- `lib/utils/ticket-list-filters.ts` — `resolveTicketSearchCustomerIds` same fix; applies to Quotes, Orders, Completed, and In-Production search
- `lib/utils/fetch-payments-data.ts` — `resolvePaymentSearchCustomerIds` same fix; applies to Payments page search

## [2026-06-15] — Fix CRM full-name search (first + last)

### Fixed
- `lib/utils/fetch-crm-data.ts` — searching "Tae Tae" or "John Smith" now matches
  customers correctly. Previously the search was treated as a single string and
  compared against each column individually, so multi-word queries never matched.
  Now each word is matched independently across all fields (AND between words,
  OR across fields per word) — e.g. "John Smith" finds customers where "John"
  appears in any field AND "Smith" appears in any field.

## [2026-06-15] — DRY refactor: eliminate duplicated code across all pages

### Added
- `lib/integrations/email-format.ts` — shared `fmtEmailCurrency` used by all 9 email/SMS integration files
- `lib/utils/bulk-import-shared.ts` — shared `LookupOption`, `slugToLookupLabel`, `formatLookupOptionsHint` for bulk import utils
- `lib/utils/order-styles.ts` — `PRIORITY_STYLE` and `PAYMENT_STYLE` maps for order list pages
- `lib/utils/form-field-styles.ts` — shared Tailwind and inline form field style constants
- `components/ui/toast-banner.tsx` — shared `ToastBanner` used by leads, sales, crm, customer-profile, roles pages
- `components/dashboard/kpi-card.tsx` — unified `KpiCard` / `KpiCardSkeleton` for both dashboard and reports page
- `components/admin/bulk-import-shared.tsx` — `LookupOptionsTable`, `IMPORT_CHUNK_SIZE` for import wizards
- `formatCompact` added to `lib/utils/format.ts`

### Changed
- **Phase 1**: Removed 9 copies of `relativeTime`, 7 `displayName`/`leadName` wrappers, local `isOverdue`/`parseLocalDate` in `quotes-page.tsx`, and all local format helpers in `webhook-section.tsx` — all now import from `lib/utils/format`
- **Phase 2**: All email template files (`send-quote`, `customer-email-builders`, `customer-email-extra-html`, `quote-email-template`, and 5 others) now share `fmtEmailCurrency`
- **Phase 3**: `LookupOption` type consolidated to `components/quotes/shared/types.ts` (5 UI files updated); bulk-import utils share helpers from `bulk-import-shared.ts`
- **Phase 4**: `PRIORITY_STYLE`/`PAYMENT_STYLE` centralised; form field styles centralised; `RoleSessionPill` replaces local `ROLE_STYLES`+`RolePill` in 3 files; `ToastBanner` deduped across 5 files; urgency ternary in `verify-drawer` replaced with `<UrgencyPill>`; `formatCompact` deduped from 2 report components
- **Phase 5**: `KpiCard` unified across admin-dashboard and reports-page; `LookupOptionsTable` and `IMPORT_CHUNK_SIZE` shared across both import wizards

## [2026-06-15] — Refactor duplicated user session card into shared component

### Added
- `components/admin/user-session-card.tsx` — new shared `UserSessionCard` component (and exported helpers `formatSessionDuration`, `sessionRelativeTime`, `sessionAbsoluteTime`, `RoleSessionPill`) used by both the admin dashboard and the team activity page

### Changed
- `components/admin/admin-dashboard.tsx` — replaced 60-line inline card block with `<UserSessionCard>`; removed duplicated helpers `formatDuration`, `relativeTime`, `ROLE_STYLES`
- `components/admin/user-activity-section.tsx` — replaced local `UserCard`, `RolePill`, and helper functions with the shared component and its exports

## [2026-06-15] — Persist "Remember this device" checkbox across visits

### Changed
- `lib/auth/remember-mfa-client.ts` — added `getRememberDevicePref` / `saveRememberDevicePref` helpers using `localStorage` key `bazaar_remember_device_pref`
- `app/(auth)/login/page.tsx` — checkbox now initialises from saved preference and saves on submit; if you checked it last time it stays checked on your next visit

## [2026-06-15] — Fix session tracking for trusted-device logins

### Fixed
- `app/(auth)/login/page.tsx` — call `session/start` immediately after successful `signInWithPassword()` so trusted-device logins (where 2FA is skipped and `verify-2fa` is never reached) still create a `user_sessions` row; users with "Remember me" active now show as "Active now" on the admin dashboard

## [2026-06-15] — Fix "active now" for long-lived sessions

### Fixed
- `app/api/admin/sessions/route.ts` — sessions open for more than 7 days were not detected as `currently_active` because the query only covered `signed_in_at >= 7 days ago`; now overlays a separate `WHERE signed_out_at IS NULL` check so any open session (regardless of age) is correctly marked active

## [2026-06-15] — Show admin users on team dashboard

### Changed
- `app/api/admin/team/route.ts` — removed admin exclusion filter; admin users now appear as cards on the team dashboard; sort order updated to admin → sdr → sales → accountant
- `components/admin/admin-dashboard.tsx` — added `accountant` role badge style (amber); the "1 active now" badge now correctly reflects all visible team members including admins

## [2026-06-15] — Webhook payload fix + title optional + delete-one-order script

### Added
- `scripts/delete-one-order.mjs` — deletes a single order by reference code including storage files; usage: `ORDER_REF=ORD-2026-005 node --env-file=.env.local scripts/delete-one-order.mjs`
- `supabase/patches/2026-06-15-delete-completed-test-order-ORD-2026-085.sql` — SQL-only patch to delete a specific completed test order

### Changed
- `lib/utils/send-order-webhook.ts` — payload now includes `items[]` array (one entry per line item with its own `product`, `finished_size`, `materials`, `finishing`, `sides`, `color`, `order_qty`, `skus`); `product_type` sends as `null`; finishing separator changed to ` + `; legacy flat top-level fields retained for backward compat
- `components/quotes/shared/info-form.tsx` — Title field no longer shows required asterisk
- `components/quotes/new-quote-form.tsx` — removed title validation from all three check points (tab step, save, route-to-sales)
- `app/api/tickets/route.ts` — removed server-side title required validation (DB column is nullable)

## [2026-06-15] — Title field made optional in quote creation

### Changed
- `components/quotes/shared/info-form.tsx` — removed required asterisk from Title label
- `components/quotes/new-quote-form.tsx` — removed all three title validation checks (tab validation, save, route-to-sales)
- `app/api/tickets/route.ts` — removed server-side `title is required` validation; DB column is nullable so no migration needed

## [2026-06-15] — Webhook payload: multi-item format + finishing fix

### Changed
- `lib/utils/send-order-webhook.ts` — payload now includes an `items[]` array with one entry per line item (each with its own `product`, `finished_size`, `materials`, `finishing`, `sides`, `color`, `order_qty`, and `skus`); matches the multi-item format expected by the external workflow system
- `finishing` now joins values with ` + ` (e.g. `"Spot UV + Foil"`) instead of `, `
- `product_type` field sends as `null` — no Roll/Sheet/Flat/Folded classification in DB
- Legacy flat top-level fields (`product`, `materials`, etc.) retained from first line item for backward compat

## [2026-06-15] — Test-data reset script for orders + leads

### Added
- `scripts/delete-production-cancelled-orders.mjs` — deletes all `in_production` + `cancelled` orders, their linked leads, and all associated storage files (`ticket-attachments` bucket: design files + sales permits; `payment-evidence` bucket)
- `npm run delete-test-orders` script in `package.json`
- `supabase/patches/2026-06-15-delete-production-cancelled-orders.sql` — SQL-only fallback (no storage cleanup)

## [2026-06-13] — Add missing performance indexes

### Added
- `supabase/patches/2026-06-13-performance-indexes.sql` — 9 new indexes targeting the three highest-traffic tables:
  - **`leads`**: composite `(is_inbox, status, updated_at DESC)` serves the most common filter+sort pattern on every tab; composite `(is_inbox, status, sales_status)` for the sales tab; standalone `updated_at DESC` fallback.
  - **`customers`**: `updated_at DESC` for CRM list sort; `(heat_tag, updated_at DESC)` partial index for heat filter.
  - **`job_tickets`**: composite `(ticket_status, updated_at DESC)` for orders/production/completed/payments pages; standalone `updated_at DESC` fallback; partial `(tax_exempt, sales_permit_reviewed_at)` for the tax-exempt payment queue.
  - **`activities`**: `type` index eliminates a full-table scan on every Routed-to-Sales tab load (`WHERE type = 'lead_routed_to_sales'`); composite `(type, lead_id)` partial index for the most common activity lookup pattern.

## [2026-06-13] — Move merge duplicate action to customer profile only

### Changed
- **`components/crm/crm-page.tsx`** — Removed the Merge button and duplicate phone indicator (`CopyX` icon + amber highlight) from the CRM list page. Merge is now only accessible from the individual customer profile page, where the context is clear and the action is intentional. The Duplicates filter tab still works — it shows which customers have duplicate phones so users can click View to open their profile and use the Merge button there.
- **`lib/utils/fetch-crm-data.ts`** — Removed `is_duplicate_phone` from `CrmCustomerRow` type and from `enrichCustomerPage` output (no longer consumed by the list UI). Removed the `checkPageDuplicatePhones` helper that was added earlier today since it is no longer needed.

## [2026-06-13] — Performance audit: eliminate unnecessary full-table fetches

### Fixed
- **`lib/utils/fetch-crm-data.ts`** — Eliminated two unconditional 100 000-row scans (leads + job_tickets customer IDs) that ran on every CRM page load regardless of filters:
  - Fast path (`status=all`): removed upfront `knownIds` pre-fetch. `enrichCustomerPage` now derives `customer_status` ("new" / "known") from the leads/tickets it already fetches for the current page of 25 customers — no full-table scan needed.
  - Removed unconditional `fetchDuplicatePhoneIds(admin, {})` (another 100 000-row phone scan) that ran on every tab. Duplicate phone detection now uses `checkPageDuplicatePhones` — a targeted query against only the current page's phone numbers.
  - Status-filter path (`status=new|known`): retains the two-pass ID-scan approach (unavoidable in PostgREST without a DB view), but no longer also scans phones unconditionally.
  - Duplicates tab path: unchanged — still requires a full phone scan to find all duplicate IDs.
- **`app/api/customers/lookup/route.ts`** — Changed `select("*")` to explicit column list and added `.limit(10)` to prevent unbounded result sets on phone/email lookup.

## [2026-06-13] — Fix order webhook product_type field

### Fixed
- `lib/utils/send-order-webhook.ts` — `product_type` field now sends `"Flat"` for non-die-cut products instead of `null`. Matches updated external API spec: `"Die Cut"` when `die_cut=true`, `"Flat"` otherwise.

## [2026-06-13] — Full Lines-tab validation in new quote/order flow

### Fixed
- **`components/quotes/new-quote-form.tsx`** — `validateAndAdvance` and `handleRouteToSalesClick` now enforce all required fields on every line item row before allowing the user to proceed from the Lines tab:
  - **Per-row**: Product Type, Material, Width, Height, Quantity, Unit Price must all be filled. Every row that exists is validated — not just "started" ones. A completely empty second row is also blocked.
  - **Per-variant (additional SKU)**: each SKU row must have a non-empty name and quantity > 0.
  - Error keys (`lineItem-N`, `lineVariants-N`) are included in the scroll-priority list so the page auto-scrolls to the first failing row.
  - Fixed a `Cannot access 'skus' before initialization` crash by moving the scroll-priority array inside `scrollToValidationError()` (called at runtime, not at module init).
- **`components/quotes/shared/line-items-form.tsx`** — new `rowErrors` and `variantErrors` props (`Record<number, string>`) thread per-row and per-variant error messages down to each `SkuRow`.
- **`components/quotes/shared/sku-row.tsx`** — new `rowError` and `variantError` props:
  - `rowError`: shows an inline danger banner at the top of the row, outlines the card border red, and highlights the specific missing field inputs (Product Type, Material, Width, Height, Quantity, Unit Price) red.
  - `variantError`: passed as `bannerError` + `nameError`/`qtyError` to `LineItemVariants` so the Additional SKUs section shows an inline message and turns the offending input red.
  - Fixed React style warning by replacing `border` shorthand in `skuFieldStyle` with separate `borderWidth` / `borderStyle` / `borderColor` longhand properties, and removing redundant Tailwind `border` classes from inputs whose border is fully controlled by inline style.

## [2026-06-13] — InkCloud legacy order conversion script + import batches

### Added
- `scripts/convert-inkcloud-orders.py` — converts `InkCloud-Legacy-Orders-Full.xlsx` (8,485 orders / 17,460 line-item rows) into CRM-ready JSON batches. Features: name splitting, tax_amount field, auto-computed discounts, payment method detection from notes (Zelle/Cash/Card/Wire/Check keyword patterns), year-correct reference codes, no-phone order separation.
- `scripts/order-import-batches/orders-batch-001.json` … `orders-batch-042.json` — 42 import batch files covering 8,382 importable orders (Feb 2024 – Jun 2026). 2,854 have `tax_amount`; 269 have `discount_amount`; 727 have `payment_method` auto-detected from notes.
- `scripts/order-import-batches/orders-no-phone.json` — 103 orders without phone, set aside.
- `scripts/order-import-batches/no-phone-orders-review.csv` — categorized: SKIP (27 test/system), READY (1 auto-matched), NEED REAL PHONE (19 — "holo roll" fake number), NEED PHONE (56 — Esther Farag/Execuprint $54K is highest priority).
- `scripts/order-import-batches/OWNER-QUESTIONNAIRE.html` — styled HTML form for the owner covering: payment method, paid/cancelled status, phone numbers for holo roll and Execuprint, date range, and a product-type limitation note.
- `scripts/order-import-batches/OWNER-QUESTIONNAIRE.md` — same questionnaire in plain Markdown.
- `scripts/README.md` — documented `convert-inkcloud-orders.py`, all output files, current status (waiting for owner answers), and step-by-step import instructions.

### Changed
- `lib/utils/bulk-import-orders.ts` — added `tax_amount` to `BulkOrderImportRowInput`; commit now sets `quote_tax_amount`, `quote_pre_tax_total`, and `quote_final_total` in DB so tax is a proper field, not only in notes.

### Status
**⏳ Waiting for owner answers** before running the 42 batch files. See `scripts/order-import-batches/OWNER-QUESTIONNAIRE.html`.

## [2026-06-13] — Enable Order import in admin panel

### Changed
- **`app/(app)/admin/page.tsx`** — Order import card set to `built: true`; now links to `/admin/settings/order-import` from the admin overview grid.
- **`components/admin/settings-tab-nav.tsx`** — Added "Order import" tab (with `PackagePlus` icon) between "Customer import" and "Webhook".
- **`lib/utils/bulk-import-orders.ts`** — Three bug fixes:
  - Removed `completed_at` timestamp assignment (column does not exist in schema; `ticket_status = 'completed'` is the source of truth).
  - Added auto `ORD-YYYY-NNN` reference code assignment for orders without an explicit `reference_code`. The year is taken from the order's `order_date`, so a 2025 historical order gets `ORD-2025-NNN` rather than the current year.
  - Fixed activity log type from `order_created` → `order_ticket_created` to match the activity log UI; also sets `ticket_id` on the activity row.

## [2026-06-12] — Conditional Merge Duplicate button on customer profile

### Changed
- **`components/crm/customer-profile.tsx`** — "Merge Duplicate" button is now hidden by default. After the customer loads, a background check (`GET /api/customers?search={phone}`) runs; the button appears only when 2+ records share the same phone number. No visual change for customers with unique phones.
- **`app/(app)/admin/page.tsx`** — Order import card renders as a non-interactive `<div>` (not a `<Link>`) when `built: false`: 50% opacity, `cursor-not-allowed`, no "Open →" label, no hover shadow. Removed duplicate "Coming soon." text from the card description.

## [2026-06-12] — Comprehensive documentation update

### Added
- `docs/feature-specs/customer-import.md` — full spec for bulk customer JSON import (field reference, validation rules, progress modal, phone normalisation, `customer_since` mapping)
- `docs/feature-specs/order-import.md` — full spec for bulk order JSON import (customer resolution by phone, line items, progress modal)
- `scripts/README.md` — documents `auto-merge-duplicates.py` and `backfill-customer-since.py` scripts and the batch import JSON files

### Changed
- `docs/feature-specs/crm.md` — updated CRM list table (duplicate phone badge, Merge button, fixed-column layout, truncation); rewrote Merge Duplicate Customers section for 3-step modal flow, API overrides, and automated merge script; updated filters to include Duplicates pill; added DB-level pagination notes
- `docs/feature-specs/admin.md` — added Customer Import and Order Import cards to overview grid; added import sections with flow description and links to specs
- `docs/api-contract.md` — `GET /api/crm/page-data`: added `duplicates` query param, `is_duplicate_phone` response field, DB-level pagination explanation; `POST /api/customers/[id]/merge`: documented `overrides` body field and step-by-step server execution
- `docs/TECHNICAL_REFERENCE.md` — Section 17 (CRM): added duplicate phone detection, 3-step merge modal, bulk merge script, customer + order import; Section 18 (Admin Settings): added Import/Export tab row and sub-section documenting all three import tabs + progress modal pattern

## [2026-06-12] — Redesign merge-duplicate modal with 3-step picker flow

### Changed
- **`components/crm/merge-customer-modal.tsx`** — fully redesigned:
  - Removed search input; modal now auto-loads *all* customers sharing the same phone (including the initiating record) on open
  - **Step 1 – Pick keeper:** list of all duplicates with radio-style selection, "This record" badge on the initiating entry
  - **Step 2 – Choose info:** for every field where values differ (name, company, email, industry, heat_tag) shows per-field radio buttons so the user can pull a value from any duplicate record
  - **Step 3 – Confirm:** warning box listing which records will be deleted, then executes sequential merge API calls
- **`app/api/customers/[id]/merge/route.ts`** — added optional `overrides` body field: a map of allowed field keys → values that get applied to the surviving record before child rows are moved; only `first_name, last_name, company, email, industry, heat_tag` are accepted (other keys are silently dropped)

## [2026-06-12] — DB-level pagination everywhere + page size from user selection

### Changed
- **`lib/utils/leads-workspace-query.ts`** — rewrote `fetchLeadsWorkspace` standard path:
  - **`created` sort (default):** DB-level `count: "exact"` + `.range()` — only the user's chosen page size comes over the wire. Search is now DB-level too: customer IDs resolved once via `resolveLeadSearchCustomerIds`, then pushed as `customer_id.in.(...)` + `status.ilike` filter.
  - **`urgency` sort:** two-pass — pass 1 fetches only `id, urgency, created_at` for all matching leads (no JOINs, tiny payload), sorts in memory, slices; pass 2 fetches full `LEAD_WORKSPACE_LIST_SELECT` for page IDs only.
  - **Routed / Won tabs:** unchanged (still need full rows for sub-filter stage counts and `routedIds` cross-check).
  - Extracted `applyStandardLeadFilters` and `applyLeadSearchFilter` helpers for the DB path.
- **`lib/utils/fetch-orders-data.ts`** — rewrote `fetchOrdersList` custom-sort path:
  - **Default sort:** unchanged (already DB-level).
  - **Custom sort (any):** two-pass — pass 1 fetches only `ORDERS_SORT_ONLY_SELECT` (9 fields) for all matching rows, sorts in memory; pass 2 fetches full `ORDERS_LIST_SELECT` for page IDs only via `.in("id", pageIds)`. Reduces transferred data ~10× vs. fetching full rows for every order.
- **`lib/utils/fetch-payments-data.ts`** — pending and refunded tabs with search:
  - Previously: loaded all rows, filtered in memory, sliced.
  - Now: customer IDs resolved from DB once, then `reference_code`, `title`, `contact_name`, `contact_email`, and `customer_id.in.(...)` filters applied at DB level with `count: "exact"` + `.range()`. Only the page rows come over the wire.
  - `tax_exempt` and `approved` tabs still in-memory (merge of two independent queries; dataset is small in practice).
- **`lib/utils/fetch-crm-data.ts`** (previous entry) — page-size limit removed; page size now comes from `parseListPaginationParams` which reads `limit` from the query string (user-selectable: 25 / 50 / 100, persisted in localStorage).

## [2026-06-12] — CRM efficient DB-level pagination

### Changed
- `lib/utils/fetch-crm-data.ts` — rewrote `fetchCrmCustomers` to eliminate full-table fetches:
  - **No status filter ("all"):** uses a `head: true` count query (returns just a number, zero row data) + `LIMIT/OFFSET` page query (returns only the 25 current-page rows) + enrichment for those 25 IDs only.
  - **Status filter ("new"/"known"):** fetches only the `id` column for matching customers (UUIDs only, no field data), applies the known/new split in memory, then fetches full data for the 25 page IDs + enrichment for those 25 only.
  - Lead/ticket activity IDs (for the known-set) are fetched as UUID-only queries — never full row data.
  - Removed the previous `.limit(50000)` full-row approach.

## [2026-06-12] — Order bulk import

### Added
- `lib/utils/bulk-import-orders.ts` — parse, validate, commit logic for bulk order import (max 200 rows); customer lookup by phone with optional auto-create; validates ticket_status, payment_status, payment_method, and line items; writes `order_created` and `orders_bulk_imported` activity log entries; sets completed_at, production_released_at, cancelled_at, and payment timestamps automatically from ticket_status/payment_status.
- `app/api/admin/orders/import/route.ts` — `POST /api/admin/orders/import?dry_run=true` (validate + customer match preview) and `POST /api/admin/orders/import` (commit); admin-only.
- `app/api/admin/orders/import/template/route.ts` — `GET /api/admin/orders/import/template`; downloadable JSON template with embedded AI documentation.
- `components/admin/orders-import-section.tsx` — 3-step wizard UI; customer match explained upfront with Found / Will create / Not found legend; preview table shows customer match, order status pill, payment status+total, item count; "Validate & match customers" button triggers dry-run.
- `public/samples/bazaar-orders-import-sample.json` — static sample file with embedded `_documentation` for AI tools.

### Changed
- `components/admin/settings-tab-nav.tsx` — added "Order import" tab with `PackagePlus` icon.
- `app/(app)/admin/settings/[tab]/page.tsx` — added `"order-import"` to `SUPPORTED_TABS` and wired `<OrdersImportSection />`.
- `app/(app)/admin/page.tsx` — added Order import card to admin overview grid.

## [2026-06-12] — Customer bulk import

### Added
- `lib/utils/bulk-import-customers.ts` — parse, validate, commit, and template-build logic for bulk customer import (max 500 rows per file); dedup by phone against existing customers; industry lookup validation with optional auto-create; writes `customer_created` and `customers_bulk_imported` activity log entries.
- `app/api/admin/customers/import/route.ts` — `POST /api/admin/customers/import?dry_run=true` (validate only) and `POST /api/admin/customers/import` (commit); admin-only.
- `app/api/admin/customers/import/template/route.ts` — `GET /api/admin/customers/import/template`; returns downloadable JSON template with live industry lookups embedded.
- `components/admin/customers-import-section.tsx` — 3-step wizard UI (upload → preview → done) matching the Lead import pattern; industry lookup table, skip-duplicate-phones checkbox, auto-add missing industry checkbox, results table with status pills, download results JSON.
- `public/samples/bazaar-customers-import-sample.json` — static sample import file with embedded `_documentation` for AI tools.

### Changed
- `components/admin/settings-tab-nav.tsx` — added "Customer import" tab with `UserRoundPlus` icon.
- `app/(app)/admin/settings/[tab]/page.tsx` — added `"customer-import"` to `SUPPORTED_TABS` and wired `<CustomersImportSection />`.

## [2026-06-12] — Webhook delivery log + admin panel

### Added
- `supabase/patches/2026-06-12-webhook-deliveries.sql` — `webhook_deliveries` table: one row per delivery attempt, columns `ticket_id`, `reference_code`, `attempt`, `status` (success/failed), `http_status`, `response_body`, `error_message`, `via`, `sent_at`. Indexes on ticket_id, sent_at, status. Service-role only (RLS denies anon/user).
- `app/api/admin/webhook/page-data/route.ts` — `GET /api/admin/webhook/page-data` admin-only endpoint; returns all order-stage tickets with their latest delivery status and aggregate counts (total / delivered / failed / not sent).
- `app/api/admin/webhook/resend/route.ts` — `POST /api/admin/webhook/resend` admin-only endpoint; accepts `{ ticket_id }` and retriggers `sendOrderWebhook`.
- `components/admin/webhook-section.tsx` — full admin panel UI: stats bar (4 counters), filter tabs (All / Delivered / Failed / Not Sent) with counts, order table with delivery badges, expandable attempt detail (HTTP status, error, response body), Resend button per row, mobile card layout.

### Changed
- `lib/utils/send-order-webhook.ts` — now logs every delivery attempt (success or failure) to `webhook_deliveries` with HTTP status, response body, and error messages. DB fetch is awaited; HTTP POST + logging are still fire-and-forget.
- `components/admin/settings-tab-nav.tsx` — added "Webhook" tab with `Webhook` icon.
- `app/(app)/admin/settings/[tab]/page.tsx` — added `"webhook"` to `SUPPORTED_TABS` and wired `<WebhookSection />`.

## [2026-06-12] — Webhook status card on admin dashboard

### Changed
- `components/admin/admin-dashboard.tsx` — added `WebhookStatusCard` between the KPI grid and the Reports footnote. Shows Delivered / Failed / Not Sent counts loaded independently from `/api/admin/webhook/page-data`. Card border turns red and shows a "click to resend" CTA when there are failures. Shows a "not configured" warning if `ORDER_WEBHOOK_URL` is missing. Links to `/admin/settings/webhook` for the full panel.

## [2026-06-12] — Webhook artwork signed URLs

### Changed
- `lib/utils/send-order-webhook.ts` — fetches `ticket_files` for all line items/variants and generates 7-day Supabase signed URLs. Each SKU in the payload now includes `artwork_url` when a file is attached to that variant. Top-level `artwork_url` is the first file across all line items (for single-SKU orders). URLs expire after 7 days — the external workflow system should download immediately on receipt.

## [2026-06-12] — Order webhook notification (workflow-rho-one integration)

### Added
- `lib/utils/send-order-webhook.ts` — `sendOrderWebhook(admin, ticketId, referenceCode, via, now)` async utility. Fetches full ticket + line items from DB, then fires a fire-and-forget POST to `ORDER_WEBHOOK_URL` with the exact payload contract expected by `workflow-rho-one.vercel.app` (`customer_name`, `customer_contact`, `order_number`, `product`, `materials`, `finishing`, `sides`, `color`, `order_qty`, `skus`, etc.). Uses `x-webhook-secret: ORDER_WEBHOOK_SECRET` header. Silent no-op when `ORDER_WEBHOOK_URL` is unset.
- `.env.local.example` — documented `ORDER_WEBHOOK_URL` and `ORDER_WEBHOOK_SECRET`.

### Changed
- `lib/utils/maybe-convert-quote-to-order.ts` — awaits `sendOrderWebhook` after every successful quote→order conversion (covers: admin override, payment confirm, Stripe checkout, customer confirm, net-terms, cash).
- `app/api/tickets/route.ts` — awaits `sendOrderWebhook` when `POST /api/tickets` creates a ticket directly as `ticket_kind: "order"`.

## [2026-06-09] — RBAC Slice 0 — SQL patch verified, docs finalized

### Changed
- `supabase/patches/2026-06-09-action-permissions.sql` — full codebase verification pass; fixed 2 seed errors found: (1) removed `payments.resend_invoice` + `payments.send_reminder` from accountant seed (`canResendTicketNotifications` requires admin or ticket creator — accountants cannot create tickets); (2) added `orders.release_production` to accountant seed (`canAccountantMutateTicket` explicitly allows `production_released_at` field). Added 6 previously missing permission keys: `quotes.upload_sales_permit`, `orders.convert_manual`, `payments.request_resubmit`, `payments.send_reminder`, `payments.view_evidence`, `payments.view_sales_permit`. Total keys: 50
- `docs/rbac-migration/plan.md` — added "How to wire up a slice" step-by-step section with exact code pattern, pre-flight custom role check, per-route permission key reference table, and updated success criteria checklist
- `docs/rbac.md` — added enforcement status callout: Slice 0 deployed, zero routes wired yet, all `roleName` checks still authoritative
- `docs/rbac-migration/plan.md` — resolved known gaps section; updated success criteria

## [2026-06-09] — RBAC Slice 0 — Action permission foundation

### Added
- `supabase/patches/2026-06-09-action-permissions.sql` — `permissions` catalog table (50 action keys across leads/sales/quotes/orders/payments/crm/admin) + `role_action_grants` join table + RLS policies + seeds for all 4 system roles (SDR, Sales, Accountant, Admin). Keys verified against full codebase scan — covers all existing `roleName` checks, `isPaymentStaffRole`, `canMutateTicket`, `canResendTicketNotifications`, `canPatchTicket`, and `canAcquireLeadLock` logic paths
- `lib/auth/resolve-action-grants.ts` — loads DB-granted action keys for a user/role (admin gets all; others filtered by role)
- `lib/auth/action-grants-cache.ts` — 45 s in-memory cache for action grants (same pattern as `allowed-routes-cache.ts`)
- `lib/auth/has-permission.ts` — `hasPermission(session, key)`, `hasAllPermissions`, `hasAnyPermission` server-side helpers
- `lib/auth/require-permission.ts` — `requirePermission(key)` server guard; returns 403 `FORBIDDEN` with `requiredPermission` field if key missing
- `hooks/use-permissions.ts` — `usePermissions()` client hook with `can(key)`, `canAll(keys)`, `canAny(keys)` helpers; module-level cache so repeated renders don't re-fetch
- `app/api/admin/permissions/route.ts` — `GET /api/admin/permissions` returns full permissions catalog grouped by area
- `app/api/admin/roles/[id]/action-grants/route.ts` — `GET` list + `POST` grant for a role
- `app/api/admin/roles/[id]/action-grants/[permissionId]/route.ts` — `DELETE` revoke for a role

### Changed
- `lib/auth/require-session.ts` — `SessionSuccess` type extended with `actionGrants: string[]`; `requireSession()` now loads action grants in parallel with page routes (no added latency — concurrent `Promise.all`)
- `app/api/me/route.ts` — response now includes `actionGrants: string[]`
- `app/api/admin/roles/route.ts` — `GET /api/admin/roles` now includes `permitted_action_ids` per role (join on `role_action_grants`)
- `components/admin/roles-section.tsx` — added **Actions** tab alongside existing Page Access tab; shows permissions grouped by area with toggle checkboxes; system roles (admin) show locked read-only banner; badge shows `granted/total` count on inactive tab; `+ New` button moved into left column header

## [2026-06-09] — Fix four pre-launch critical issues

### Changed
- `package.json` — Next.js upgraded from 16.2.4 to 16.2.9 (patches proxy-bypass CVEs GHSA-26hh-7cqf-hhc6, GHSA-492v-c6pp-mqqv, GHSA-267c-6grr-h53f)

### Fixed
- `app/api/leads/[id]/route.ts` — PATCH now uses `ALLOWED_PATCH_FIELDS` whitelist; only `urgency`, `interests`, `quantities`, `has_design`, `sdr_comment`, `is_returning_customer`, `brand`, `source`, `quote_destination`, `sales_notes`, `sales_status`, `status`, `rejection_reason`, `rejection_notes` can be written; privileged columns (`sales_owner_id`, `locked_by_id`, `sdr_id`, hold/follow-up fields) are silently dropped
- `lib/utils/public-resubmit-otp.ts` — OTP HMAC secret now requires `SUPABASE_SECRET_KEY`; removed fallback to `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` which would have made hashes forgeable if the env var was unset
- `app/api/customers/[id]/merge/route.ts` — customer merge now moves `job_tickets` to the target customer before deleting the source; previously the delete would fail (FK violation) or leave orphaned tickets for any customer with order history

## [2026-06-09] — Fix role bypass on lead hold / resume / follow-up routes

### Fixed
- `app/api/leads/[id]/hold/route.ts` — `isSales` now derived from verified session `roleName` instead of `body.role`; activity log also fixed to use derived value; `locked_by_id` conditional updated to use the same variable
- `app/api/leads/[id]/resume/route.ts` — same fix; `body.role` removed entirely; activity log uses derived value
- `app/api/leads/[id]/follow-up/route.ts` — replaced partially-client-controlled `roleParam === "sales"` expression with session-only `roleName === "sales" || roleName === "admin"`

## [2026-06-09] — Fix three race conditions in leads and payment recording

### Fixed
- `app/api/leads/[id]/claim/route.ts` — atomic conditional update (`.is("sales_owner_id", null)`) replaces the non-atomic read-then-write; two sales reps claiming simultaneously now get a deterministic 409 instead of a silent double-claim
- `app/api/leads/[id]/lock/route.ts` — atomic conditional update (`.or("locked_by_id.is.null,locked_by_id.eq.{userId}")`) prevents two SDRs from both acquiring the same lead lock in the same race window; loser gets a 409 with the winner's name
- `app/api/tickets/[id]/route.ts` — `record_payment` block now calls `record_ticket_payment_atomic` RPC instead of read→compute→blind write; concurrent payment recordings (accountant + Stripe webhook) serialize at the DB row level so no payment total can be overwritten

### Added
- `supabase/patches/2026-06-09-atomic-payment-rpc.sql` — `record_ticket_payment_atomic(uuid, numeric, text, text, timestamptz, text)` Postgres function using `SELECT … FOR UPDATE` to atomically increment `payment_amount_received` and stamp all related payment timestamp/status fields

## [2026-06-08] — Full test reset includes ticket attachments

### Changed
- `scripts/full-test-reset.mjs` — also empties the `ticket-attachments` storage bucket (line-item files, sales permits) before wiping leads, orders, and customers

## [2026-06-07] — Hide Jarvis from nav on main

### Changed
- `resolve-nav-pages.ts` — `/assistant` filtered via `HIDDEN_NAV_ROUTES` so the DB `pages` row does not show in sidebar until the assistant feature branch ships

## [2026-06-06] — Documentation sync (payments replace, lead import, TODO-009)

### Changed
- `docs/api-contract.md` — `POST …/sales-permit` payment-staff auth + `sales_permit_number`; `POST …/evidence` staff replace; `deny_tax_exempt` + `sales_permit_denial_notes`; lead import APIs; payments row actions; mark-completed **Option B**
- `docs/feature-specs/invoice-payment.md`, `docs/TECHNICAL_REFERENCE.md` — staff replace + deny notes shipped; declare-unavailable won't build
- `docs/feature-specs/admin.md`, `docs/navigation.md`, `docs/component-architecture.md` — Lead import tab + components
- `docs/feature-specs/activity.md`, `docs/feature-specs/tickets.md`, `docs/order-ticket/lifecycle-flow.md`, `docs/session-summary.md` — activity types, B7 decided
- `docs/FuturePlan/tax-exempt-resubmit-portal/` — Phase 0 + denial notes checked off; Phase 1b won't build
- `docs/TODO.md`, `docs/feature-specs/reports.md`, `README.md` — lead import path, JSON export note
- `docs/architecture.md`, `docs/rbac.md` — lead import routes, payments staff replace + deny notes, mark-completed Option B

## [2026-06-06] — AI-friendly lead import JSON template

### Changed
- Download template — `_documentation` block (purpose, instructions, required/optional fields, example source/industry values); single example lead; full `_lookups` list for AI matching

## [2026-06-06] — Lead import dropdown reference + strict lookup validation

### Added
- `GET /api/admin/leads/import/template` — sample JSON with live `_lookups` (source/industry value + label tables)
- Import page — **Allowed dropdown values** tables (`value` | `label`); optional **Add missing source/industry** on import

### Changed
- Bulk import — rejects unknown `source`/`industry` by default; errors list valid options; `create_missing_lookups` adds new Dropdown Options on commit

## [2026-06-06] — Lead import copy: JSON only

### Changed
- Admin lead import UI — renamed **Import / Export** → **Lead import**; removed CSV references; notes JSON-only policy for import and future exports

## [2026-06-06] — Admin bulk lead import (JSON)

### Added
- `/admin/settings/import-export` — upload JSON, **validate first** (dry run preview), then import valid rows only
- `POST /api/admin/leads/import` — `?dry_run=true` for validation; commit creates customer + lead per row (max 500)
- `lib/utils/bulk-import-leads.ts` — parse, lookup validation, duplicate-phone skip, batch activities
- `public/samples/bazaar-leads-import-sample.json` — owner reference format
- `docs/feature-specs/lead-import.md`

### Changed
- Admin overview + Settings tab nav — **Import / Export** card

## [2026-06-06] — Owner decisions documented (TODO-009, tax-exempt portal)

### Changed
- **TODO-009 / open-questions B7** — confirmed **Option B**: only **admin** may mark in-production orders completed when balance is still due (accountant blocked; modal + `acknowledge_outstanding_balance`); no code change
- **Tax-exempt resubmit portal** — marked complete; customer **declare-unavailable** won't build (staff use **Deny tax-exempt**); `docs/TODO.md`, FuturePlan README

## [2026-06-06] — Sales permit replace requires permit number

### Changed
- `ReplaceTicketDocumentModal` — sales permit upload/replace includes required **Sales Permit #** field (pre-filled when replacing)
- `POST /api/tickets/[id]/sales-permit` — accepts `sales_permit_number` in form data; required for payment-staff replaces from `/payments`
- Ticket history — staff permit replace shows permit number change when updated

## [2026-06-06] — Payments row icon tooltips

### Changed
- `components/orders/payments-row-actions.tsx` — icon-only row actions show labeled tooltips on hover (View file, Replace, Request updated proof, etc.)

## [2026-06-06] — Staff replace on Payments tabs

### Added
- `components/orders/replace-ticket-document-modal.tsx` — view current file + upload replacement (payment proof or sales permit)
- `POST /api/tickets/[id]/evidence` — staff replace payment proof (`lib/utils/staff-replace-payment-evidence.ts`)
- `/payments` **Pending approval** and **Tax-exempt pending** — **Replace** icon (desktop) / button (mobile) opens replace modal; legacy missing permit uses upload flow in the same modal
- Ticket history — `ticket_payment_evidence_replaced`, `ticket_tax_exempt_permit_replaced` activity labels

### Changed
- `POST /api/tickets/[id]/sales-permit` — payment staff (accountant/admin) may replace permit from `/payments` without ticket-owner mutate rights

## [2026-06-06] — Tax-exempt deny notes + compact payments actions

### Added
- `sales_permit_denial_notes` on `job_tickets` — required internal note when denying tax-exempt (`schema.sql`)
- `components/orders/payments-row-actions.tsx` — icon secondary actions + primary CTA for payments table rows

### Changed
- `ApproveTaxExemptModal` — deny step shows required internal note textarea; **Yes, deny** only after note is entered; **Back** returns to review
- `PATCH /api/tickets/[id]` `deny_tax_exempt` — accepts `sales_permit_denial_notes`; stored on ticket and in `ticket_tax_exempt_denied` activity
- `/payments` desktop rows — File, View, Request as compact icon buttons; primary **Confirm** / **Review** keeps label

## [2026-06-06] — Payments table header keys

### Fixed
- `components/orders/payments-page.tsx` — duplicate React keys on table headers (expand/actions columns used empty strings)

## [2026-06-06] — Tighter transactional email spacing

### Fixed
- `lib/integrations/wrap-transactional-email.ts` — quote follow-up and other simple customer emails no longer show large gaps between header, body, and footer; replaced `<p>` margins with table rows and explicit padding; body paragraphs render as separate rows instead of double `<br/>` gaps
- Payment evidence and tax-exempt resubmit emails — OTP block no longer uses `<p>` margins (`resubmitOtpExtraHtml` in `customer-email-extra-html.ts`)

## [2026-06-04] — Documentation sync (Jun 4 changes)

### Changed
- Docs updated for payment evidence OTP portal (`/evidence`), `/q` resubmit UX, read-only payment method, reports toolbar, welcome email API, Supabase patches — see files listed under Payment proof resubmit portal → Docs

## [2026-06-04] — Reports toolbar control height

### Fixed
- `/reports` — period filter button and team member select share `h-9` (aligned height)

### Docs
- `docs/feature-specs/reports.md`, `docs/navigation.md`

## [2026-06-04] — Payment proof resubmit portal (`/evidence`)

### Added
- `payment_evidence_resubmit_token`, `payment_evidence_otp_hash`, `payment_evidence_otp_expires_at` on `job_tickets` (`schema.sql` §1 + §1b)
- `/evidence/[token]` — OTP verify + upload (mirrors `/permit/[token]`)
- `GET|POST /api/public/evidence/[token]/status|verify-otp|upload`
- `lib/constants/payment-evidence-resubmit-cookie.ts`, `lib/utils/public-payment-evidence-resubmit.ts`, `lib/utils/record-payment-evidence-resubmit-upload.ts`

### Changed
- Accountant **Request**: OTP + email/SMS link `/evidence/{resubmitToken}` (`{otpCode}` / SMS `{amount}`); Instantly delivery shared with quote sends
- Resubmit email copy is **email/SMS only** — not stored on ticket or shown on `/q` or `/evidence`
- `/q/{token}` — hides balance-under-review and resubmit UI while resubmit is active
- `/evidence` — read-only `payment_method_used` (must match upload)

### Fixed
- Payment resubmit links no longer use `public_token` or `/q` for proof upload
- Permit OTP cookie `path: /` so upload API receives verification cookie

### Docs
- `docs/api-contract.md`, `docs/schema.md`, `docs/navigation.md`, `docs/security.md`, `docs/TECHNICAL_REFERENCE.md`, `docs/feature-specs/invoice-payment.md`, `docs/feature-specs/tickets.md`, `docs/email-template-guide.md`, `supabase/migrations/README.md`, `supabase/patches/2026-06-04-payment-evidence-otp.sql`, `README.md`, `supabase/README.md`

## [2026-06-04] — Permit upload OTP cookie fix

### Fixed
- Tax-exempt permit upload returned “Please verify your code first” after OTP — verification cookie used `path: /permit/{token}` so it was not sent to `/api/public/permit/.../upload` (cookie path now `/`)

## [2026-06-04] — Permit resubmit upload UX

### Changed
- `/permit/[token]` — obvious **Choose file** button, drag-and-drop zone, and selected-file preview (replaces native file input)
- `/permit/[token]` — Sales permit # and document are required; permit # accepts digits only (client + API validation)

## [2026-06-04] — Tax-exempt resubmit email delivery fix

### Fixed
- Resubmit request emails (**payment proof** + **tax-exempt permit**) use the same Instantly API as quote/order sends (`/api/v2/emails/test`) — previously used a non-working endpoint
- Payment proof resubmit: same `outreach_email` / modal path as tax-exempt; API reports error if send prerequisites missing (`public_token`, reference, company settings)
- Modal email/phone from user input is sent as `outreach_email` / `outreach_phone`; form no longer resets while open on background list refresh
- API returns `outreach_ok` / `outreach_error`; modal shows delivery failure instead of always closing on success

## [2026-06-04] — schema.sql only; remove migrations folder

### Removed
- `supabase/migrations/*.sql` (077–111) — consolidated into `schema.sql`; `migrations/README.md` points to the single file

### Changed
- `supabase/schema.sql` — final RLS from 080/096 (CRM customers, scoped lead updates, staff activities, admin-only `company_settings`), `get_company_remittance_settings()`, sequence RPC lockdown, `user_profiles_with_role` security invoker
- `supabase/README.md`, root `README.md`, `docs/schema.md`, `email-templates-db-error.ts` — setup docs reference `schema.sql` only

### Fixed
- `supabase/schema.sql` — `customers.tax_exempt_last_*` deferred to §1b (no forward FK to `job_tickets` at CREATE time)

## [2026-06-04] — Payments resubmit column + tax-exempt modal footer

### Changed
- `/payments` — **Resubmit status** column appears only when at least one row on the page has resubmit activity; empty cells no longer show "—"
- `ApproveTaxExemptModal` — wider modal (`720px`); footer actions on one row (Request, Cancel, Deny, Approve)
- **Docs** — `feature-specs/invoice-payment.md`, `component-architecture.md`, `TECHNICAL_REFERENCE.md`, `session-summary.md` (and prior doc sync for email templates 108–110, `/permit`, admin Email Templates)

## [2026-06-04] — Documentation sync (email templates + resubmit)

### Changed
- `docs/email-template-guide.md`, `docs/feature-specs/admin.md`, `docs/feature-specs/invoice-payment.md`, `docs/feature-specs/tickets.md`, `docs/api-contract.md`, `docs/schema.md`, `docs/navigation.md`, `docs/architecture.md`, `docs/component-architecture.md`, `docs/TECHNICAL_REFERENCE.md`, `docs/security.md`, `docs/TODO.md`, `docs/FuturePlan/`, `README.md`, `supabase/README.md`, `docs/session-summary.md` — aligned with admin email templates (109–110), evidence resubmit (108), and `/permit` portal

## [2026-06-04] — All customer emails editable in Admin

### Added
- `supabase/migrations/110_email_templates_customer_emails.sql` — seeds quote/order delivery, payment reminder, invoice links, payment confirmed, tax-exempt approved, order ready, and quote follow-up email templates
- `lib/integrations/customer-email-builders.ts`, `customer-email-extra-html.ts`, `apply-admin-email.ts` — outbound email uses admin subject/body/CTA (quote emails keep line-item layout; intro + CTA are editable)

### Changed
- `lib/integrations/email-template-catalog.ts` — full catalog mirroring customer SMS keys (delivery, payment, invoice, pickup, follow-up)
- `send-quote.ts` — all customer email sends load templates from `email_templates` (falls back to coded defaults if DB row missing)
- Admin **Email Templates** — placeholder help for `{total}`, `{amount}`, `{statusLine}`, `{previousTotal}`

## [2026-06-04] — Admin-controlled resubmit SMS & email templates

### Added
- `supabase/migrations/109_email_templates.sql` — `email_templates` table + seeds for resubmit emails; SMS seeds for resubmit keys
- **Admin → Settings → Email Templates** — subject, body, and button label (placeholders `{firstName}`, `{ref}`, `{link}`, `{otpCode}`, etc.)
- `lib/integrations/email-template-catalog.ts`, `load-email-templates.ts`, `wrap-transactional-email.ts`

### Fixed
- Email Templates admin page — shows coded defaults + migration banner when `109_email_templates.sql` is not applied yet (instead of a blank error)

### Changed
- Admin overview (`/admin`) — **Email Templates** card links to `/admin/settings/email-templates`
- Resubmit **Request** modal — channel and recipient only; message copy always from admin SMS/email templates
- `resubmit-requested-outreach.ts` — loads admin templates; stores rendered body on ticket for customer portal banner
- Removed per-send message field and `lib/client/default-resubmit-messages.ts`

## [2026-06-04] — Payment & tax-exempt evidence resubmit flows

### Added
- `supabase/migrations/108_evidence_resubmit.sql` — resubmit request/received timestamps, permit portal token + OTP fields on `job_tickets`
- `app/api/public/permit/[token]/*` — OTP verify + permit upload for tax-exempt resubmit
- `app/(public)/permit/[token]/page.tsx` — customer permit resubmit portal
- `lib/utils/evidence-resubmit-list-status.ts`, `lib/client/request-evidence-resubmit.ts`, `components/orders/request-evidence-resubmit-flow.tsx` — shared list status + `ResendQuoteModal` outreach
- Payment Evidence **Resubmit status** column (Pending + Tax-exempt tabs); **Request** actions on list, confirm modals, and payment/tax-exempt detail sections

### Changed
- `components/quotes/quote-detail/resend-quote-modal.tsx` — modes `payment_evidence_resubmit` / `tax_exempt_resubmit` with editable customer message
- `app/api/tickets/[id]/route.ts` — `request_payment_evidence_resubmit` / `request_tax_exempt_resubmit` with customer email/SMS
- `app/(public)/q/[token]/page.tsx` — resubmit banner, replace-proof upload, thank-you / already-submitted states
- Activity log + ticket history labels for resubmit request/receive events

## [2026-06-04] — Payment Evidence action buttons aligned

### Fixed
- `components/ui/ticket-list-expand.tsx` — **View** list button matches File/Confirm sizing (`13px`, `py-2`, `px-3`)
- `components/orders/payments-page.tsx` — **Confirm** uses same padding and transparent border so row actions share one height

## [2026-06-02] — Sidebar slate background & white nav text

### Changed
- `app/globals.css` — `--color-topbar` `#32373F` (light + dark); new `--color-sidebar-nav` tokens; inactive nav links white
- `components/layout/sidebar.tsx`, `components/layout/mobile-nav.tsx` — nav labels use sidebar tokens

## [2026-06-02] — Table column headers bold

### Changed
- `app/globals.css` — all `thead th` use `font-weight: 600` (semibold) across list and detail tables

## [2026-06-02] — Light theme: black text, black verify & tabs

### Changed
- `app/globals.css` (`:root` light) — main and label text `#000000`; active tab text `#000000`; verify button bg `#000000` / text `#FFFFFF`; card/surface `#FAFAFA` and borders `#E5E7EB` unchanged

## [2026-06-02] — Order detail: Stripe payment section after Line Items

### Added
- `components/quotes/quote-detail/stripe-payment-detail-section.tsx` — collapsible **Stripe card payment** block (open by default) with CRM review status + `StripeEvidencePanel` (amount, card, IDs, receipt, Open in Stripe)
- Order / completed overview and edit layout — shown for **admin** and **accountant** when `stripe_payment_intent_id` is set, directly under **Line Items**

## [2026-06-02] — Stripe Checkout: connection error on Vercel

### Fixed
- `lib/stripe/client.ts` — Stripe SDK uses `createFetchHttpClient()` + trims `STRIPE_SECRET_KEY`; rejects `pk_` keys in secret env
- `POST .../stripe/create-session` — `runtime = "nodejs"`

## [2026-06-02] — Stripe Checkout: fix redirect URLs on Vercel

### Fixed
- `POST /api/public/quotes/[token]/stripe/create-session` — success/cancel URLs use `resolveAppUrl()` (request origin / `VERCEL_URL`) instead of falling back to `localhost` when `NEXT_PUBLIC_APP_URL` is unset — fixes Stripe 500 on production
- Same route — returns Stripe’s error message in JSON for easier diagnosis; minimum $0.50 charge guard

## [2026-06-02] — Net terms: allow Stripe/offline pay on public link

### Fixed
- `computePublicPaymentDueAmount()` — net-term ($0 upfront) orders no longer return $0 on the server while the portal showed a balance; card checkout and submit-payment now accept early/full payment (e.g. $1.08 balance)

## [2026-06-02] — Net terms: payment methods on quote + public portal

### Fixed
- `components/quotes/quote-payment-config.tsx` — **$0 upfront / Net terms** now includes **Payment method** channel selection (same chips as pay-in-full); saved to `ticket_full_channels`
- `/q/[token]` — net-term quotes use `ticket_full_channels` for Pay modal (was empty, so customers could not choose card/Zelle/etc.)

## [2026-06-02] — Public portal footer centered

### Fixed
- `/q/[token]` page footer — company address and contact links centered (block `fit-content` links were left-aligned under `text-align: center`)

## [2026-06-02] — Public portal: remove internal status pills on invoice

### Changed
- `components/public/public-quote-document.tsx` — removed Order / Rush / workflow status pills from customer `/q/[token]` invoice header; cancel/refund alerts, payment totals, and checklist still explain next steps

## [2026-06-02] — Admin Total Leads: cancelled+refunded → Cancelled

### Fixed
- `lib/utils/admin-lead-breakdown.ts` — leads with a cancelled ticket (including refunded-then-cancelled, e.g. ORD-2026-014) now bucket as **Cancelled** instead of **Refunded**; active refunded orders still count as **Refunded**

## [2026-06-02] — Page-loading documentation

### Added
- `docs/FuturePlan/Performance/page-loading.md` — how list/detail/layout load today, DevTools measurement, P0–P2 backlog

### Changed
- `performance-optimization.md`, `session-and-api-auth-cache.md`, `architecture.md`, `api-contract.md`, `TECHNICAL_REFERENCE.md`, `component-architecture.md`, `session-summary.md`, `feature-specs/tickets.md`, `FuturePlan/README.md`, `TODO.md` — synced with Jun 2026 perf work

## [2026-06-02] — Faster quote/order detail open

### Added
- `GET /api/ticket-form-bootstrap` — company settings, edit/action lookups, products (5 min server cache)
- `lib/client/ticket-form-bootstrap-cache.ts` — memory + `sessionStorage` (30 min); `seedTicketFormBootstrapFromQuotesBootstrap` after `/quotes/new` load

### Changed
- `GET /api/tickets/[id]/page-data` — returns `{ ticket }` only (was bundled bootstrap + ticket)
- `QuoteDetail` — `Promise.all` bootstrap + slim page-data; second detail in same tab often skips bootstrap network
- `fetch-ticket-detail.ts` — single `job_tickets` lookup by ref or UUID

## [2026-06-02] — Line preview bundled in list page-data (instant expand)

### Added
- `fetchTicketLinePreviewsBatch` — 3 DB queries for all tickets on a list page
- `line_preview` on each row from `GET …/page-data` (orders, quotes, payments, completed)
- Client `seedLinePreviewFromListRows` — expand uses cache, no extra `line-preview` fetch for current page
- `docs/FuturePlan/Performance/vercel-supabase-region.md` — align Vercel `sfo1`/`pdx1` with Supabase Oregon

### Changed
- List `page-data` responses slightly larger; first load may add ~50–100ms, expand is immediate for rows on that page
- `line-preview` API remains for stale rows, detail refresh, or cache miss

## [2026-06-02] — Session cache + GET /api/me for faster loads

### Added
- `GET /api/me` — user id, role, full name, allowed routes, nav `pages` (server-validated)
- `components/layout/app-session-provider.tsx` — single layout fetch; sidebar + mobile nav consume context
- `lib/auth/allowed-routes-cache.ts`, `lib/auth/resolve-allowed-page-routes.ts`, `lib/auth/resolve-nav-pages.ts`, `lib/auth/nav-sections.ts`
- `checkTicketDetailPageAccess()` — sync ticket-page gate when session already has `allowedRoutes`
- `docs/FuturePlan/Performance/session-and-api-auth-cache.md` — follow-up perf ideas

### Changed
- `requireSession()` — returns `roleId`, `fullName`, `allowedRoutes`; session cache **45s** (was 3s)
- `requirePageAccess` / `requireAnyPageAccess` — use cached routes (no repeated `role_permissions` per route)
- `components/layout/sidebar.tsx`, `mobile-nav.tsx` — nav from `/api/me` (no duplicate Supabase nav queries)
- `components/admin/dashboard-page.tsx` — role from `useAppSession()`
- `app/(app)/layout.tsx` — wraps app shell in `AppSessionProvider`

## [2026-06-02] — Faster line-preview API

### Changed
- `fetch-ticket-line-preview.ts` — one `job_tickets` lookup (was resolve + fetch); preview uses slim column selects on line tables
- `requireTicketDetailPageAccess` — one permission resolve (was up to 14 sequential DB round-trips for non-admin)

## [2026-06-02] — Dedupe line-preview fetches

### Fixed
- `ticket-line-items-quick-preview.tsx` — one in-flight request per ticket (desktop expand row + hidden mobile card no longer double-fetch; React Strict Mode no longer cancels and retries)

## [2026-06-02] — Line-item quick preview on Orders, Payments, Completed

### Added
- `components/ui/ticket-list-expand.tsx` — shared expand chevron, View button, and preview row for ticket list tables

### Changed
- `components/orders/orders-page.tsx`, `completed-page.tsx`, `payments-page.tsx` — row click expands line items (same API as Quoted Requests); **View** opens detail; payment actions (Confirm, File, Stripe) unchanged with `stopPropagation`
- `components/quotes/quotes-page.tsx` — uses shared list-expand primitives

## [2026-06-02] — Blur placeholder while line-item images load

### Added
- `components/ui/lazy-blur-image.tsx` — shimmer + blurred image until sharp (`motion-reduce` respected)

### Changed
- `LineItemFileThumbnail` and `LineItemFilePreviewModal` image preview use `LazyBlurImage`

## [2026-06-02] — Quote list preview matches detail line items UI

### Changed
- `components/quotes/ticket-line-items-quick-preview.tsx` — read-only `LineItemsForm` with thumbnails and file preview modal (same as quote detail)
- `GET /api/tickets/[id]/line-preview` — adds `ticket_ref` for file URLs

## [2026-06-02] — Quote list preview: line items only

### Changed
- Quoted Requests quick preview — removed Subtotal/Tax/Total block; `line-preview` API returns line items only

## [2026-06-02] — Fix quote list line-preview 404

### Fixed
- `lib/utils/fetch-ticket-line-preview.ts` — removed invalid `sales_owner_id` from `job_tickets` select (column exists on `leads` only); Supabase error was returned as 404

## [2026-06-02] — Quoted Requests list quick preview

### Added
- `GET /api/tickets/[id]/line-preview` — line items + slim pricing totals for list expand (auth + `canAccessTicket`)
- `lib/utils/fetch-ticket-line-preview.ts`, `lineDisplayRowToCardProps()` in `lib/utils/ticket-line-items.ts`
- `components/quotes/ticket-line-items-quick-preview.tsx` — lazy-loaded preview panel with client cache

### Changed
- `components/quotes/quotes-page.tsx` — row/card click expands line-item preview; **View quote** / **View** / **Claim** still navigate or claim (`stopPropagation`)
- `docs/feature-specs/tickets.md`, `docs/api-contract.md` — quick preview documented

## [2026-06-02] — Owner brand color picker (HTML)

### Added
- `docs/owner-color-picker.html` — shareable light/dark color tool with presets, live CRM preview, and copy-to-email export for the business owner

## [2026-06-02] — Docs: color system guide

### Added
- `docs/color-system.md` — how CSS tokens, light/dark mode, Tailwind/shadcn bridge, and component usage work

## [2026-06-02] — Docs: performance, realtime, list SWR, bootstrap APIs

### Changed
- `docs/api-contract.md`, `docs/TECHNICAL_REFERENCE.md`, `docs/architecture.md`, `docs/component-architecture.md`, `docs/types.md`, `docs/realtime-live-updates.md`, `docs/realtime-agent-setup-guide.md`, `docs/navigation.md`, `docs/feature-specs/tickets.md`, `docs/feature-specs/leads-sdr.md`, `docs/FuturePlan/Performance/*`, `docs/schema.md`, `docs/TODO.md`, `docs/session-summary.md` — align with `useListPageData`, zero-delay realtime, `107_performance_indexes`, ticket `page-data` + `form-bootstrap`, Sales/Payments pagination, routed claim **409**, `ListRefreshingNotice`, `notifyListDataChanged`

## [2026-06-02] — List UX polish: coalesced fetch, claim safety, updating indicator

### Added
- `ListRefreshingNotice` on all tabbed list pages — subtle “Updating” during background refetch
- `lib/client/notify-list-data-changed.ts` — post-mutation cache prefix clear + realtime events
- `supabase/migrations/107_performance_indexes.sql` — restores documented partial indexes (073 was never in repo)

### Changed
- `hooks/use-stale-while-revalidate.ts` — one in-flight request per cache key; realtime cancels pending nav revalidate timer; queue one follow-up fetch after burst
- `PATCH` routed quote claim — `WHERE ticket_status = 'routed'` + **409** `ALREADY_CLAIMED`; quotes UI shows error banner

### Not in this pass (low ROI or already done)
- TanStack Query migration (behavior equivalent today)
- Derive all list rows directly from `pageData` (local state clear on tab change is sufficient)
- CRM/Leads/Sales already use SQL `limit`/`offset` on page-data APIs

## [2026-06-02] — Remove 300ms delay from all realtime refetch paths

### Changed
- `lib/constants/realtime-refetch.ts` — `REALTIME_REFETCH_MS = 0`, `LIST_NAV_REVALIDATE_MS = 300` (navigation cache only)
- List pages, `use-ticket-realtime-sync`, sidebar `bazaar:refresh-counts`, public `/q/[token]` broadcast, `use-coalesced-refresh` default event delay — realtime refetches start immediately; 300ms remains only for optional background sync when reopening a cached list URL

## [2026-06-02] — Remove Routed to Sales tab banner for Sales/Admin

### Changed
- `components/quotes/quotes-page.tsx` — drop high-value explainer banner on **Routed to Sales** for Sales and Admin; SDR read-only hint remains

## [2026-06-02] — Fix tab switch showing previous tab rows

### Fixed
- Tabbed list pages (Orders, Payments, Quotes, etc.) — switching to an empty tab no longer flashes the previous tab’s rows; SWR resets per-tab cache key before paint and clears list state while loading

### Changed
- `hooks/use-stale-while-revalidate.ts` — `useLayoutEffect` on cache key change; ignore in-flight fetches for stale keys

## [2026-06-02] — Perceived performance (SWR cache + detail bootstrap)

### Added
- `hooks/use-stale-while-revalidate.ts`, `hooks/use-list-page-data.ts`, `lib/client/list-page-cache.ts` — in-memory stale-while-revalidate for list `page-data` (5 min TTL, instant tab/back navigation)
- `GET /api/tickets/[id]/page-data` — ticket + company settings + edit/action lookups + product catalog in one auth pass
- `GET /api/quotes/form-bootstrap` — company + lookups + products for `/quotes/new`
- `lib/utils/fetch-ticket-detail.ts`, `lib/utils/fetch-lookup-categories.ts`, `lib/utils/fetch-products-catalog.ts` — shared server loaders

### Changed
- All tabbed list pages (Orders, Quotes, Payments, Sales, Leads, CRM, Completed, Production) — `useListPageData` instead of refetch-only `useCoalescedRefresh`
- `components/quotes/quote-detail.tsx` — initial load via `page-data`; silent ticket refresh still uses `GET /api/tickets/[id]`
- `components/quotes/new-quote-form.tsx` — single `form-bootstrap` request replaces 4 parallel fetches
- `GET /api/tickets/[id]` — delegates to `fetchTicketDetailPayload`

## [2026-06-02] — Sales + Payments list pagination

### Added
- **`/sales`** — server-side pagination (`limit`/`offset` on `GET /api/leads/sales/page-data`); `ListPagination` 25/50/100; debounced search on server
- **`/payments`** — active tab only per request (`?tab=` + pagination); tab counts via SQL head counts (`fetchPaymentsTabCounts`); pending/refunded use DB `range` when not searching

### Changed
- `components/sales/sales-page.tsx`, `components/orders/payments-page.tsx` — match Orders page pagination UX
- `lib/utils/fetch-payments-data.ts` — paginated `fetchPaymentsPageData(admin, tab, { search, pagination })`
- `docs/TODO.md` — remove Sales/Payments pagination from TODO-007 optional list

## [2026-06-02] — TODO.md: open items only

### Changed
- `docs/TODO.md` — removed completed-work summary (see `CHANGELOG.md`); kept TODO-009, TODO-006 (Vercel Pro cron), TODO-007 optional scale items, and Future / not started table

## [2026-06-02] — Legacy tax-exempt orders (permit # without file)

### Fixed
- Orders like **ORD-2026-013** (tax exempt before permit-file migration) — appear on **Payments → Tax-exempt pending** with **File required**; public link no longer shows “under review” without an uploaded file
- Staff: upload permit on **Orders → ORD-…** (Quote tab → Permit File), then confirm on Payments tab

### Changed
- `fetchPendingTaxExemptOrders` — includes legacy rows (`sales_permit_number` set, no `sales_permit_storage_path`)
- `tax_exempt_review_pending` on public API only when a permit **file** exists and is not yet reviewed
- `docs/TECHNICAL_REFERENCE.md`, `docs/api-contract.md`, `docs/schema.md`, `docs/types.md`, `docs/feature-specs/invoice-payment.md`, `docs/navigation.md`, `docs/rbac.md`, `docs/component-architecture.md`, `docs/architecture.md` — legacy tax-exempt queue, public document helpers (`public-invoice-document.ts`), public `tax_exempt_review_pending` rule

## [2026-06-02] — Public link contact links hit target

### Fixed
- Company address, phone, email, and website on `/q/[token]` — clickable area is text width only (`publicContactLinkStyle`), not full column

## [2026-06-02] — Hide pricing on public link for cancelled/refunded orders

### Changed
- Public `/q/[token]` and customer PDF — **cancelled only**: no pricing; **refunded** (with or without cancel): **Amount Refunded** / **Refunded to Date** only (`total_refunded_amount`), no full breakdown

## [2026-06-02] — Fix public invoice/PDF for cancelled refunded ORD tickets

### Fixed
- Public portal + PDF showed **QUOTE** for `ORD-*` when status was `cancelled` — now uses `ticketIsOrderStage()` (reference prefix wins)
- PDF still showed **Payment under review** after refund/cancel — hides that banner when `cancelled` or `refund_status` partial/full; shows cancelled/refund notice instead
- Public PDF route omitted `payment_evidence_reviewed_at` — included so reviewed evidence is not mislabeled as pending

### Added
- `lib/utils/public-invoice-document.ts` — shared customer-document helpers (`customerDocumentPaymentSummary`, `customerDocumentBanner`)

## [2026-06-02] — Docs: tax-exempt approval (103–106)

### Changed
- `docs/TECHNICAL_REFERENCE.md` — tax-exempt accountant approval, payments four-tab page-data, sales-permit GET auth, `jobTicketCustomerEmbed`, key file index
- `docs/api-contract.md` — `taxExemptOrders`, `approve_tax_exempt` / `deny_tax_exempt`, reuse + CRM tax-exempt-history routes, public embed note
- `docs/schema.md`, `docs/types.md` — migrations 104–106 columns on `job_tickets` and `customers`
- `docs/feature-specs/invoice-payment.md` — B++++ tax-exempt workflow; Stripe webhook auto-approve alignment
- `docs/navigation.md`, `docs/rbac.md`, `docs/component-architecture.md`, `docs/architecture.md`, `docs/email-template-guide.md` — four-tab `/payments`, accountant approve/deny, related components and templates
- `docs/TODO.md`, `docs/CHANGELOG.md`, `docs/FuturePlan/tax-exempt-resubmit-portal/README.md` — correct `FuturePlan/` paths

## [2026-06-02] — Future plan: tax-exempt resubmit portal

### Added
- `docs/FuturePlan/tax-exempt-resubmit-portal/` — [README](FuturePlan/tax-exempt-resubmit-portal/README.md) + [tax-exempt-resubmit-portal.md](FuturePlan/tax-exempt-resubmit-portal/tax-exempt-resubmit-portal.md) (staff replace, OTP customer upload, missing docs, internal denial notes, email templates)
- `docs/TODO.md` — link to future plans folder

## [2026-06-02] — Tax-exempt approve/deny modal totals

### Added
- `deny_tax_exempt` PATCH action — turns off tax-exempt, applies sales tax to pre-tax total, logs `ticket_tax_exempt_denied`
- Modal side-by-side totals: **If approved** vs **If denied** (with tax at quote rate)

### Changed
- Tax-exempt review modal: **Deny tax-exempt** (double-click confirm), approve button shows exempt total; adjust totals in collapsible section

## [2026-06-02] — Tax-exempt review aligned with payment evidence

### Added
- Migration `106_sales_permit_submitted_at.sql` — `sales_permit_submitted_at` on `job_tickets` (mirrors `payment_evidence_submitted_at`)

### Changed
- **Payments** tax-exempt tab: same queue UX as pending payment evidence — Submitted column, View file, inline **Confirm** modal (not review-only navigation)
- **Approved** tab includes tax-exempt permits already reviewed (merged with payment-evidence approved rows)
- `TaxExemptReviewSection` / `ApproveTaxExemptModal` — layout and confirmation flow match payment evidence review
- `GET /api/tickets/[id]/sales-permit` — accountant/admin only (same as payment evidence file route)
- Payment detail (`context=payment`) navigates back to `/payments` after tax-exempt confirm, like payment confirm

## [2026-06-02] — Fix job_tickets customer embed after migration 105

### Fixed
- PostgREST `PGRST201` on orders/quotes/payments lists — `customer:customers(...)` now uses `customers!job_tickets_customer_id_fkey` because migration 105 added a second FK via `customers.tax_exempt_last_source_ticket_id`
- Shared helper `jobTicketCustomerEmbed()` in `lib/utils/ticket-list-select.ts`
- `GET /api/tickets/[id]` 404 — nested `lead.customer` embed no longer uses the job_tickets FK hint (only ticket-level customer does)

## [2026-06-02] — Tax-exempt accountant approval (UI + payments tab)

### Added
- Migrations `104_tax_exempt_approval.sql`, `105_customer_tax_exempt_last.sql` — per-ticket review fields + customer last-permit reuse hints
- `approve_tax_exempt` PATCH action, payment/complete gates, `POST .../sales-permit/reuse-from-customer`, CRM tax-exempt history API
- **Payments** page tab **Tax-exempt pending** with counts and review queue
- `TaxExemptReviewSection` / `ApproveTaxExemptModal` on payment and order detail views
- CRM customer profile **See more** → `CustomerTaxExemptModal` (per-quote approval history + customer last permit)
- New quote: banner to **reuse / upload / dismiss** customer’s last tax-exempt permit; calls reuse API after create

### Changed
- **Orders** list and **Quotes** list badges show tax-exempt pending/approved in payment status column
- Order/quote detail: banners for SDR/sales; stats row shows tax-exempt status; admin complete override for unapproved permit
- Public quote API/document + invoice PDF: pending tax-exempt footnote/banner (confirm/pay still allowed)

## [2026-06-02] — Technical reference: add-quote sales permit + Stripe auto-approve

### Changed
- `docs/TECHNICAL_REFERENCE.md` — §12 Quote Creation documents tax-exempt permit # + file UI, validation/send gates, and post-create upload flow; §13/§19 Stripe auto-approve; §20 sales-permit API; schema columns; key file index
- `docs/api-contract.md` — `POST/GET/DELETE /api/tickets/[id]/sales-permit`; tax-exempt file upload note on ticket create; Stripe webhook auto-approve; payments pending filter
- `docs/schema.md`, `docs/types.md` — `sales_permit_storage_path`, `sales_permit_file_name`, `sales_permit_mime_type` on `job_tickets` / `Ticket`

## [2026-06-01] — Sales permit file attachment for tax-exempt tickets

### Added
- `supabase/migrations/103_sales_permit_file.sql` — adds `sales_permit_storage_path`, `sales_permit_file_name`, `sales_permit_mime_type` columns to `job_tickets`
- `app/api/tickets/[id]/sales-permit/route.ts` — GET (signed URL redirect), POST (upload/replace), DELETE (remove) for the sales permit file; stored in `ticket-attachments` bucket under `{ticketId}/sales-permit/`
- `quote-form.tsx` — when tax exempt is enabled in edit mode, shows a required "Permit File" attachment control (file picker + pending/saved file display with view/remove buttons); read-only mode shows a clickable download link
- New props on `QuoteForm`: `salesPermitPendingFile`, `setSalesPermitPendingFile`, `salesPermitSavedName`, `salesPermitViewHref`, `onClearSavedSalesPermit`, `salesPermitFileError`

### Changed
- `validate-quote-send.ts` — `getQuoteSendMissingFields` now requires a sales permit file (`hasSalesPermitFile`) in addition to the permit number when `taxExempt` is true; quote cannot be sent without both
- `new-quote-form.tsx` — tracks `salesPermitFile` state, validates file presence before routing/sending, uploads file after ticket creation
- `quote-detail.tsx` — tracks `salesPermitPendingFile` and `clearSavedPermit` state; on save, uploads or deletes the permit file before the PATCH; `sendValidationInput` includes file presence; `TicketDetail` type gains `sales_permit_file_name`, `sales_permit_storage_path`, `sales_permit_mime_type`
- `ticket-overview-sections.tsx` — accepts optional `ticketRef` prop and passes `salesPermitSavedName` + `salesPermitViewHref` to the read-only `QuoteForm` for the download link
- `lib/types/index.ts` — `Ticket` type gains the three new permit file columns
- `app/api/tickets/[id]/route.ts` — GET query now selects `sales_permit_storage_path`, `sales_permit_file_name`, `sales_permit_mime_type`

## [2026-06-01] — Auto-approve Stripe payments (no accountant review)

### Changed
- `lib/stripe/apply-checkout-session.ts` — Stripe `checkout.session.completed` webhook now auto-approves the payment instead of leaving it pending for accountant review:
  - Sets `payment_evidence_reviewed_at` immediately (was `null`)
  - Updates `payment_amount_received`, `payment_status`, and deposit/balance timestamp fields
  - Calls `maybeConvertQuoteToOrder` → converts quote to order if confirm + payment gates pass
  - Calls `maybeAutoReleaseProduction` → releases to production if all gates satisfied
  - Logs `ticket_payment_recorded` activity (same event dashboards/reports read)
  - Sends "payment confirmed" notification to customer (email/SMS, fire-and-forget)
  - Payments tab no longer shows Stripe payments in the "Pending" state

## [2026-06-01] — Add comprehensive technical reference document

### Added
- `docs/TECHNICAL_REFERENCE.md` — full system technical reference covering: app overview, tech stack, folder structure, auth/MFA/RBAC, database schema (all tables), lead management, sales pipeline, dashboards & KPIs, quote/order lifecycle, line items & pricing, payment system (Stripe, evidence, refunds), production workflow, completed orders, email/SMS delivery, CRM, admin settings, public customer portal, file management, real-time system, activity log, PDF generation, UI design system, sidebar & navigation, and key file index

## [2026-06-01] — Line item thumbnail moved to card right panel

### Changed
- `components/quotes/quote-detail/detail-layout-primitives.tsx` — `DetailLineItemCard` accepts new optional `thumbnail` prop; card layout switches to `flex items-stretch` so the thumbnail fills the full card height as a right-side panel with a left border
- `components/quotes/shared/line-item-attachment.tsx` — `LineItemFileThumbnail` gains a `fill` prop: when true the button stretches to `w-full h-full` (no fixed square), designed for use inside the `DetailLineItemCard` thumbnail panel
- `components/quotes/shared/line-items-form.tsx` — line-level file attachment rendered as `<LineItemFileThumbnail fill />` passed to `DetailLineItemCard.thumbnail` (after the price) instead of a separate `LineItemAttachmentOverview` footer row

### Changed
- `lib/utils/sdr-dashboard-metrics.ts` — self-closed order value, received, balance, and order-created counts exclude cancelled/refunded tickets
- `lib/utils/sales-dashboard-metrics.ts` — order value (via shared helper), quotes created, and orders converted exclude cancelled/refunded
- `components/sales/sdr-dashboard.tsx` and `sales-dashboard.tsx` — silent KPI refresh on `bazaar:tickets-changed` (cancel/refund)

## [2026-06-01] — Line item file thumbnails in overview

### Changed
- Line item attachments in read-only overview now show a **clickable thumbnail** instead of a "View image"/"View PDF" button
  - Images: inline `<img>` thumbnail (72 px for line-level, 52 px for variant rows)
  - PDFs: icon card with red "PDF" badge and truncated filename
  - Clicking the thumbnail opens the same full-screen preview modal as before
  - Download icon button is still available alongside the thumbnail
- `components/quotes/shared/line-item-attachment.tsx` — new `LineItemFileThumbnail` component; `LineItemAttachmentOverview` updated
- `components/quotes/shared/line-item-variants.tsx` — `AdditionalSkusOverviewList` uses thumbnail for per-variant files

## [2026-06-01] — "More details" collapsible group in order/quote overview

### Changed
- Quote/order detail overview now shows only **Line Items** by default; all other sections (Fulfillment, Quote & Pricing, Payment Plan, Quote Delivery, Follow-up Schedule, Production & Evidence, Payments Received, Refund History) are collapsed under a **"More details"** toggle row
- Clicking "More details" expands the group and reveals each section individually collapsible; clicking "Less" re-collapses all of them
- `components/quotes/quote-detail/detail-layout-primitives.tsx` — added `MoreSectionGroup` component
- `components/quotes/quote-detail/ticket-overview-sections.tsx` — wraps detail sections in `MoreSectionGroup`; accepts `extraMoreContent` prop for payment/refund sections
- `components/quotes/quote-detail.tsx` — passes `PaymentsReceivedSection` + `RefundHistorySection` as `extraMoreContent`

## [2026-06-01] — Send/Resend quote modal with prefilled contact

### Changed
- **"Send Quote" / "Resend Quote" buttons** now open a modal instead of sending immediately — user can pick channel (Email / SMS / Both) and edit the destination email/phone before sending; fields are prefilled from the saved payment config
- **"Resend Link" button** (orders in production / completed) similarly opens the same modal so staff can adjust channel/destination per resend
- `components/quotes/quote-detail/detail-quick-actions.tsx` — wires both buttons to `ResendQuoteModal`
- `components/quotes/quote-detail.tsx` — `handleSave` accepts `channelOverride` opts; `onSendQuote` forwards modal selections; passes `sendChannel/sendEmail/sendPhone` prefill props

### Added
- `components/quotes/quote-detail/resend-quote-modal.tsx` — reusable channel picker modal (Email / SMS / Both, phone + email inputs, inline validation)

## [2026-05-31] — Bidirectional public portal ↔ staff realtime sync

### Added
- `hooks/use-ticket-realtime-sync.ts` — ticket-scoped `postgres_changes` on `job_tickets` + `activities`, plus window event relay

### Changed
- `POST /api/public/quotes/[token]/confirm` — broadcasts `notifyPublicQuoteUpdated` so open public tabs and staff-linked flows refresh
- `components/quotes/quote-detail.tsx` — uses `useTicketRealtimeSync` (pauses while editing) for customer payment/confirm updates without relying on sidebar alone

## [2026-05-31] — Dashboard revenue KPIs exclude cancelled and refunded

### Changed
- `lib/utils/exclude-refunded-tickets.ts` — `isExcludedFromRevenueKpis()` for cancelled tickets and partial/full refunds
- `lib/utils/dashboard-metrics.ts` — **Cash Collected** and **Pipeline Value** exclude cancelled/refunded tickets; new `sumPipelineQuoteValue()` helper
- `GET /api/reports/summary` — cash collected aligned with dashboard (cancelled + refunded excluded)
- `lib/utils/team-dashboard-metrics.ts` — team card cash/pipeline/awaiting metrics use same exclusions

## [2026-05-31] — Admin Total Leads breakdown: rejected, cancelled, refunded

### Added
- `lib/utils/admin-lead-breakdown.ts` — period-scoped, mutually exclusive lead status buckets for the admin dashboard

### Changed
- `GET /api/dashboard/kpis` (admin) — Total Leads sub-counts now include **Rejected**, **Cancelled**, and **Refunded**; Open/Claimed are period-scoped (not live snapshots); breakdown sums to `total_leads`
- `components/admin/admin-dashboard.tsx` — all status badges always visible; listens to `bazaar:tickets-changed` for cancel/refund updates

## [2026-05-31] — Lock system roles + Admin Panel in Roles UI

### Changed
- `components/admin/roles-section.tsx` — SDR, Sales, and Accountant page permissions are read-only again (same as Admin); only custom roles are editable
- `lib/auth/admin-only-pages.ts` — added `/admin` to admin-only routes; `filterPagesForRole()` strips admin-only nav for non-admins
- `components/layout/sidebar.tsx` and `mobile-nav.tsx` — Admin Panel hidden for non-admin roles even with stale DB grants
- `lib/auth/require-page-access.ts` — admin-only routes blocked for non-admins in page-access checks
- `POST/DELETE /api/admin/roles/[id]/permissions/*` — returns `403` when modifying system role permissions

## [2026-05-31] — RBAC audit pass 5 (lead APIs, shipping scope, docs)

### Fixed
- **Lead `[id]` routes** — `GET/PATCH /api/leads/[id]`, activities, lock/unlock, hold, resume, follow-up now call **`requireLeadApiPageAccess()`** (`/leads` or `/sales`) before object checks
- **`GET /api/customers/[id]/shipping-addresses`** — returns ship-to addresses only from tickets visible via **`scopeJobTicketsQuery()`** (no CRM-wide leak of other reps' ticket addresses)

### Added
- `requireLeadApiPageAccess()` in `lib/auth/require-page-access.ts`

### Changed
- `docs/rbac.md` — enforcement layers, `/reports` + `/activity-log` routes, API matrix sync (lead gates, sidebar-counts, production scope, shipping scoping, ticket detail gates)

## [2026-05-31] — RBAC audit pass 4 (production API, sidebar, legacy routes)

### Fixed
- **`/api/production/*`** — was returning all in-production orders to any authenticated user; now uses `scopeJobTicketsQuery()` + `requirePageAccess('/orders')`
- **`GET /api/sidebar-counts`** — no longer trusts client `?routes=` param; counts only pages the user is allowed (via `resolveAllowedPageRoutes()`)
- Legacy routes **`/api/orders/orders`**, **`/api/completed/orders`** — added `requirePageAccess`
- **`GET/PATCH /api/tickets/[id]`** — `requireAnyPageAccess` on ticket-detail page routes
- **`GET /api/tickets/counts`** — requires `/quotes` or `/orders` page permission
- **`POST /api/customers/[id]/merge`** — requires `/crm` page permission (sales)
- **`GET /api/tickets/[id]/pdf`** and **`/print`** — `requireTicketDetailPageAccess()`

### Added
- `resolveAllowedPageRoutes()` and `requireTicketDetailPageAccess()` in `lib/auth/require-page-access.ts`

## [2026-05-31] — RBAC audit pass 3 (100% hardening)

### Added
- `lib/auth/role-checks.ts` — `isAdminRole()`, `isPaymentStaffRole()`
- `lib/auth/admin-only-pages.ts` — `isAdminOnlyPagePath()` for proxy hard-block

### Changed
- `proxy.ts` — `/reports` and `/activity-log` admin-only at proxy layer (ignores stale `role_permissions`)
- `fetch-quotes-data.ts` — `applyTicketScope()` delegates to `scopeJobTicketsQuery()` (single scoping source)
- Ticket list APIs — `requirePageAccess()` on quotes, orders, payments, completed, and contextual `GET/POST /api/tickets`
- Payment routes — `isPaymentStaffRole()` + `/payments` page permission
- Refund/evidence routes — `canAccessTicket()` before signed URL or refund POST
- `detail-quick-actions.tsx` — Resend Link hidden unless `canResendTicketNotifications()` (matches server)
- `GET /api/tickets/counts` — blocked for accountants

## [2026-05-31] — RBAC audit hardening (second pass)

### Fixed
- `lib/utils/db-counts.ts` — accountant counts scoped to payment/order stages only (no global draft/routed quote counts)
- `app/api/tickets/[id]/route.ts` — PATCH requires `canAccessTicket` unless accountant on allowed lifecycle action (cancel/confirm on draft quotes)
- `lib/utils/ticket-access.ts` — added `canPatchTicket()` helper; renamed quote-workflow guard to `isAccountantQuoteWorkflowDenied`
- `lib/auth/admin-only-pages.ts` — single source for `/reports` and `/activity-log` lock (UI + grant API)
- `app/api/tickets/counts/route.ts` — removed accountant from global routed count

## [2026-05-31] — RBAC enforcement (accountant, resend, settings, roles lock)

### Changed
- `lib/utils/ticket-access.ts` — accountants blocked from quote list APIs; GET limited to payment/order stages; PATCH limited to payment/cancel/complete/refund; resend requires ownership (admin bypasses)
- `app/api/quotes/page-data`, `app/api/quotes/counts`, `GET /api/tickets?kind=quote` — return `403` for accountant role
- `app/api/tickets/[id]/route.ts` — `send_payment_reminder` and `resend_invoice` enforce owner-or-admin
- `proxy.ts` — `/settings` admin-only; non-admins redirected to `/profile`
- `app/(app)/settings/page.tsx` — admin redirect to `/admin/settings/users`
- `lib/auth/require-page-access.ts` — removed `/settings` from universal routes (only `/dashboard`, `/profile`)
- `components/admin/roles-section.tsx` — `/reports` and `/activity-log` locked as admin-only in Roles UI
- `app/api/admin/roles/[id]/permissions/route.ts` — server-side block granting admin-only pages
- `supabase/schema.sql` — merged migrations 097–102 (Stripe columns, refunds table, lookup seeds, `refund-evidence` bucket, `cancelled_at`)
- `docs/rbac.md` — updated route/API matrix for decisions A–F

## [2026-05-31] — Deep doc audit (phantom APIs, CRM, sales, Stripe TODO)

### Changed
- `docs/api-contract.md` — removed unimplemented `GET/POST /api/activity`; outreach is server-side only; documented `POST /api/payments/stripe/webhook`
- `docs/feature-specs/crm.md` — removed false Activity Timeline / `HistoryTimeline` section
- `docs/feature-specs/leads-sales.md` — pipeline uses `GET /api/leads/sales/page-data`
- `docs/feature-specs/activity.md` — manual Log Call marked not built
- `docs/TODO.md` — Stripe Checkout marked built (Phase C)
- `docs/rbac.md` — removed phantom activity/outreach API rows

## [2026-05-31] — Documentation sync (full audit pass)

### Changed
- `supabase/schema.sql` — Sales seed includes `/quotes`, `/orders` (existing prod: grant via Admin → Roles or already configured)
- `docs/architecture.md` — user create flow, API paths (`/api/quotes/page-data`), Twilio env vars, design tokens, migration range, profile vs settings, orphaned `production-page.tsx`
- `docs/rbac.md` — role home paths, user lifecycle, `/profile` universal route, `release_production` auth notes
- `docs/navigation.md` — sidebar `/profile`, Rejected tab badge, Completed Sales scope, Activity Log admin-only
- `docs/schema.md` — accountant system role, current pages/permissions seeds, `/settings` removed
- `docs/api-contract.md` — legacy `release_production` PATCH mode documented
- `docs/component-architecture.md` — six SDR tabs, ticket detail contexts, production page orphaned
- `docs/mvp-scope.md` — historical banner pointing to current specs
- `docs/feature-specs/admin.md` — permission matrix uses `/profile`
- `.cursor/rules/ui-design-system.mdc` — token values match `app/globals.css`
- `.cursor/rules/tab-counts.mdc` — in-production via orders page; follow_up in sales counts examples

## [2026-05-31] — Completed list: row click only (no View button)

### Changed
- `/completed` — removed redundant **View** / **View order** buttons; table row and mobile card open detail (matches `/orders`)

## [2026-05-31] — Remove legacy Stripe-only refund route and modal

### Removed
- `app/api/tickets/[id]/stripe/refund/route.ts` — superseded by `POST /api/tickets/[id]/refund`
- `components/quotes/quote-detail/stripe-refund-modal.tsx` — unused; UI uses `record-refund-modal.tsx`

### Changed
- `docs/api-contract.md`, `payment-refunds.md`, `invoice-payment.md`, `security.md` — drop legacy endpoint references

## [2026-05-31] — Documentation audit (refunds / Stripe / security)

### Changed
- Second pass: fixed stale **admin-only cancel**, two-tab `/payments`, deferred Stripe paths, `/invoice/` URLs; added `security.md` public payment guards + staff refund auth; `rbac.md` refund/cancel rows; `session-summary.md` historical disclaimer
- `payment-refunds.md` — canonical refunds spec (UI uses unified `/refund` only)

## [2026-05-31] — Payment refunds documentation

### Added
- `docs/feature-specs/payment-refunds.md` — unified refunds spec (ledger, UI, lists, public portal, cancel, reports)

### Changed
- `docs/feature-specs/invoice-payment.md`, `tickets.md`, `api-contract.md`, `schema.md`, `rbac.md`, `navigation.md`, `reports.md` — aligned with May 2026 refund/cancel/Stripe work

## [2026-05-31] — Customer link on cancelled orders

### Fixed
- Order detail sidebar — **Customer Link** and **Copy Link** show for `ticket_status = cancelled` (portal stays read-only)

## [2026-05-31] — Public portal message when order is refunded

### Added
- `/q/[token]` — amber banner when `refund_status` is partial/full; payment/confirm/Stripe blocked (read-only invoice)
- `GET /api/public/quotes/[token]` exposes `refund_status`, `total_refunded_amount`

## [2026-05-31] — Partial refund warning before cancel order

### Added
- Cancel order on partially refunded tickets — warning modal (refund first or **Proceed to cancel**), then existing cancel-reason modal
- Accountants may cancel quotes/orders (same as admin); API `PATCH` cancel allows accountant role

## [2026-05-31] — Linked Lead shows order cancelled date

### Added
- `LinkedLeadCard` — **Order cancelled {date}** footer when the ticket is cancelled (alongside Production started)
- Migration `102_ticket_cancelled_at.sql` — `job_tickets.cancelled_at`; set on cancel; GET resolves from column or `ticket_cancelled` activity

## [2026-05-31] — Refunds at top of Overview tab

### Changed
- Order/production/completed detail — **Refunds** is the first block inside the **Overview** tab (not above stats on the page)

## [2026-05-31] — Orders list payment pill shows refund status

### Fixed
- Orders table **Payment** column shows **Fully refunded** / **Partially refunded** when `refund_status` is set (was showing Unpaid after refund)

## [2026-05-31] — Refunded + cancelled orders visible again

### Fixed
- Fully refunded then **cancelled** orders disappeared (Refunded tab omitted `cancelled` status; Cancelled tab excluded refunded rows)
- Payment Evidence **Refunded** includes `ticket_status = cancelled` with **Cancelled** badge
- Orders **Cancelled** and **All** tabs include refunded cancelled orders

## [2026-05-31] — Open in Stripe on Refunds section

### Added
- `RefundHistorySection` — **Open payment in Stripe** (Payment Intent) and **Open refund in Stripe** per Stripe ledger row
- `lib/stripe/dashboard-url.ts` — `stripeRefundDashboardUrl`; shared `OpenInStripeLink` component

## [2026-05-31] — Reports exclude fully refunded revenue

### Changed
- `dashboard-metrics.ts`, `GET /api/reports/summary` — cash collected, released order value, and awaiting collection skip tickets with `refund_status = full` (partial refunds still count until fully refunded)
- `exclude-refunded-tickets.ts` — `excludeFullyRefundedFromRevenue`, `isFullyRefundedTicket`
- `docs/api-contract.md`, `docs/feature-specs/invoice-payment.md`, `docs/feature-specs/dashboard.md` — unified refunds API and revenue rules

## [2026-05-31] — Refunded tab: paid via and refunded via columns

### Changed
- Payment Evidence **Refunded** tab — shows how the order was **paid** and how the **refund** was issued (channel + Stripe/manual + deposit/balance/full slot)
- `fetch-payments-data.ts` — enriches refunded rows from `ticket_payment_refunds` ledger

## [2026-05-31] — Refunded stat card shows refund amount

### Fixed
- `ticket-stats-row.tsx` — **Refunded** card main value is total refunded (e.g. $500.00), not $0.00, when order is fully refunded

## [2026-05-31] — Quote/order detail: remove Overview panel scroll

### Fixed
- `quote-detail.tsx` — Overview/History tab strip no longer uses horizontal overflow scroll; panel content uses page scroll only (no inner scrollbar on the tab card)

## [2026-05-31] — Refunded orders only on Payment Evidence Refunded tab

### Changed
- `lib/utils/exclude-refunded-tickets.ts` — shared filter; refunded orders excluded from **Orders**, **Production**, and **Completed** lists and sidebar counts
- `/payments/[id]` — hide bottom **Order completed** banner; refunded orders stay on Payment Evidence **Refunded** only

## [2026-05-31] — Refunds and payment evidence match overview sections

### Changed
- `refund-history-section.tsx`, `payment-detail-overview.tsx` — use shared `DetailSection` + `DetailCollapsibleSection` (no extra card border) like Line Items and other overview rows

## [2026-05-31] — Refunds at top on payment review detail

### Changed
- `/payments/[id]` — when the order has refunds, **Refunds** (+ payments received) render at the top of Overview, above payment review

## [2026-05-31] — Refund-aware order stats and Payment Evidence queues

### Changed
- `ticket-stats-row.tsx` — after a refund, stats show **Collected** (paid before refunds), **Refunded** amount, and **Fully/Partially refunded** instead of misleading **Unpaid** / full balance due
- `fetch-payments-data.ts` — orders with `refund_status` partial/full appear **only** on Payment Evidence **Refunded** tab (removed from Pending/Approved)
- `quote-detail.tsx` — **Payments received** + **Refunds** sections on order overview
- `order-payment-summary.tsx`, `history-section.tsx` — refund status labels and history entries for `ticket_payment_refund`

## [2026-05-31] — Refund payment label

### Changed
- Order detail quick action and refund modal — **Record refund** renamed to **Refund payment**

## [2026-05-31] — Record refund evidence upload button

### Changed
- `record-refund-modal.tsx` — optional evidence uses a primary **Upload image or PDF** button (dashed drop zone, filename + remove) instead of the native file input

## [2026-05-31] — Payment Evidence Refunded tab

### Added
- `components/orders/payments-page.tsx` — third **Refunded** tab (partial/full `refund_status`) with counts from page-data

### Changed
- `lib/utils/filter-payment-evidence-rows.ts` — search includes refund status, total refunded, refunded-by name

## [2026-05-31] — Order & completed detail: Line Items expanded by default

### Changed
- `/orders/[id]` and `/completed/[id]` overview — **Line Items** section starts open (still collapsible)

## [2026-05-31] — Payment settings: balance paid amount

### Added
- **Payment & order settings** — **Balance paid** amount (total received minus deposit) when balance was recorded; pay-in-full shows **Amount paid**

## [2026-05-31] — Payment settings: balance payment method

### Added
- **Payment & order settings** (and payment summary blocks) — **Balance method** when balance was recorded (`payment_method_used`); full-pay orders show **Payment method**

## [2026-05-31] — Confirm payment evidence: sure-step modal

### Added
- `components/orders/confirm-payment-evidence-modal.tsx` — accountant/admin must confirm before `record_payment` runs (**Payments** queue + payment detail overview)

## [2026-05-31] — Orders list: row click only (no View button)

### Changed
- `/orders` — removed redundant **View** / **View order** buttons; entire table row and mobile card open order detail (no per-row actions for any role)

## [2026-05-31] — Clearer awaiting-payment labels (… confirmation)

### Changed
- Pending payment labels — **Awaiting deposit confirmation**, **Awaiting balance confirmation**, **Awaiting full payment confirmation** (orders list + order detail stats)

## [2026-05-31] — Orders list: In Production + specific payment-awaiting label

### Changed
- `/orders` status column stays **In Production** (or other workflow status) when payment evidence is pending; payment column still shows **Awaiting deposit** / **Awaiting balance** / **Awaiting full payment** (order detail stats row unchanged — **Under review** there)

## [2026-05-31] — Specific awaiting-payment labels (deposit / balance / full)

### Changed
- Orders list payment column and order detail stats subtitle — pending confirmation uses **Awaiting deposit**, **Awaiting balance**, or **Awaiting full payment** via `inferPaymentEvidenceMode`

## [2026-05-31] — Orders list: payment-under-review status for Stripe evidence

### Fixed
- `/orders` list — includes `stripe_payment_intent_id` so card payments awaiting accountant confirm show **Under review** / type-specific awaiting label instead of **In Production** + **Partial** (matches order detail and stats row)

## [2026-05-31] — Stripe card refunds (accountant / admin)

### Added
- `POST /api/tickets/[id]/stripe/refund` — full or partial refund after card payment is confirmed; validates amount ≤ Stripe charge minus prior refunds
- `StripeRefundModal` — two-step confirmation (“100% sure”) + refund reason (Admin → Dropdown Options → **Stripe Refund Reasons**), full/partial amount
- **Refund card payment** quick action (below Cancel order) for accountant and admin when refundable balance remains
- Migrations `098_stripe_refund_tracking.sql`, `099_seed_stripe_refund_reasons.sql`

### Changed
- `components/ui/stripe-evidence-panel.tsx` — shows refunded amount when applicable

## [2026-05-31] — Stripe Checkout on public quote link

### Added
- `supabase/migrations/097_stripe_payment_columns.sql` — Stripe session/PI/charge IDs, amount, card brand/last4, receipt URL on `job_tickets`
- `app/api/public/quotes/[token]/stripe/create-session/route.ts` — hosted Checkout for deposit/balance/full (server-computed amount)
- `app/api/payments/stripe/webhook/route.ts` — `checkout.session.completed` → payment evidence pending (no auto-record)
- `lib/stripe/*`, `lib/utils/payment-evidence-pending.ts`, `components/ui/stripe-evidence-panel.tsx`
- Public `/q/[token]` — **Pay with card** redirects to Stripe; `?stripe=success` refreshes portal

### Changed
- `/payments` and payment detail — Stripe evidence links (receipt + Dashboard); pending queue includes Stripe rows without uploaded files
- `record_payment` marks evidence reviewed when `stripe_payment_intent_id` is set
- `npm` dependency: `stripe`

## [2026-05-30] — Orders list: fix stale “Awaiting review” after evidence approved

### Fixed
- `/orders` — list API now includes `payment_evidence_reviewed_at`; rows no longer show **Awaiting payment confirmation** / **Awaiting review** once accountant has approved the evidence (e.g. ORD-2026-014 deposit)

## [2026-05-30] — Payment Evidence search

### Added
- `/payments` — search box filters pending and approved queues by order #, title, customer, contact, creator, payment method, amounts, and payment type

## [2026-05-30] — Fix payment status after deposit evidence confirm

### Fixed
- `/payments` list omitted `ticket_deposit_type` / `ticket_deposit_value`, so Confirm inferred **Full payment** instead of **Deposit** on partial-strategy orders — `payment_status` stayed **Unpaid** even after approval
- `record_payment` now infers payment mode server-side from ticket config and sets `payment_status` to **partial** whenever money is recorded but the order is not fully paid

## [2026-05-30] — Payments list: Created by column

### Changed
- `/payments` — desktop table and mobile cards show **Created by** (quote/order creator name) on Pending approval and Approved tabs
- `lib/utils/fetch-payments-data.ts` — select `created_by_id` and enrich rows with `user_profiles.full_name`

## [2026-05-29] — RBAC migration plan (deferred)

### Added
- `docs/rbac-migration/` — deferred capability-based RBAC planning folder (`README.md`, `plan.md`, placeholders for Phase 0)

### Changed
- Moved RBAC migration plan from `docs/rbac-migration-plan.md` → `docs/rbac-migration/plan.md`
- `docs/rbac.md` — link to `docs/rbac-migration/` folder

## [2026-05-29] — Security audit fixes (API auth, RLS, rate limits)

### Added
- `lib/auth/require-page-access.ts` — mirrors `proxy.ts` page RBAC on CRM and related API routes
- `lib/security/rate-limit.ts`, `lib/security/get-client-ip.ts`, `lib/security/enforce-route-rate-limit.ts` — IP rate limits on public quote and auth endpoints
- `lib/utils/lead-access.ts` — `canMutateLead`, `canClaimLead`, `canAcquireLeadLock`
- `supabase/migrations/096_security_hardening.sql` — RLS on `ticket_shipping_destinations`; tighten `customers`, `leads`, `activities`, `company_settings`; lock sequence RPCs; `security_invoker` on `user_profiles_with_role`

### Changed
- Lead mutations (`PATCH`, `claim`, `hold`, `lock`) — object-level authorization aligned with `canReadLead` / scoped-tab helpers
- Customer and CRM APIs — require `/crm` (or `/quotes` for shipping addresses) page permission
- `GET /api/dashboard/kpis` — admin metrics branch restricted to `admin` role only (accountant uses `/api/payments/counts`)
- `POST /api/leads/manual` — SDR and admin only with `/leads` page permission
- `GET /api/activities?include_linked_lead=true` — `canReadLead()` on linked lead before merge
- `PATCH /api/admin/company` — remittance fields (bank/Zelle) admin-only via API
- `components/admin/payment-section.tsx` — load/save remittance via `/api/admin/company` (no direct Supabase client)
- Public quote routes + `auth/change-password`, `auth/mfa-trust` — rate limiting (429)

### Docs
- `docs/security.md` — updated auth model, rate limits, RLS 096
- `docs/rbac.md` — API matrix, RLS matrix, `requirePageAccess`
- `docs/schema.md` — migration 096 policies
- `docs/api-contract.md` — auth helpers, lead/customer/company endpoints
- `docs/architecture.md`, `docs/session-summary.md`, `docs/feature-specs/crm.md`, `docs/types.md`

## [2026-05-29] — Line attachment lifecycle: line ↔ first SKU + Storage cleanup

### Changed
- `lib/utils/ticket-line-items.ts` — line file moves to first SKU only when SKUs are first added (0→1+); deleting first SKU returns file to line level; non-first SKU files deleted with SKU; orphan line delete removes Storage objects
- `components/quotes/shared/line-item-attachment.tsx` — `applyVariantListAttachmentChanges` mirrors server rules in the edit form
- `components/quotes/shared/utils.ts`, `line-items-form.tsx`, `public-line-item-skus-grid.tsx` — line-level file shown alongside additional SKUs when present

### Docs
- `docs/schema.md`, `docs/api-contract.md`, `docs/types.md`, `docs/feature-specs/tickets.md`, `docs/component-architecture.md`, `docs/architecture.md`, `docs/session-summary.md`, `docs/order-ticket/integration-plan.md`, `docs/realtime-live-updates.md`, `docs/CHANGELOG.md` (historical entries corrected)

## [2026-05-29] — Line item file preview modal + overview download

### Added
- `components/quotes/shared/line-item-file-preview-modal.tsx` — in-page preview popup (X close, Escape, backdrop click) for images and PDFs

### Changed
- `line-item-file-preview-modal.tsx` — spinner + fixed min-height while images/PDFs load so modal does not collapse

## [2026-05-29] — Add-on Finishings: icon download before delete

### Changed
- `components/quotes/shared/line-item-attachment.tsx` — shared `LineItemSavedFileActions` (view + download icons); Add-on Finishings compact row uses both
- `components/quotes/shared/line-item-variants.tsx` — Additional SKUs: view + download icons before remove SKU

## [2026-05-29] — Public portal live sync: full mutation coverage

### Changed
- `lib/integrations/notify-public-quote-updated.ts` — `notifyPublicQuoteUpdatedByTicketId` skips broadcast unless `ticket_status` is customer-portal visible (`sent`, `order`, `in_production`, `completed`, `cancelled`)
- `app/api/tickets/route.ts` — broadcast after create/send
- `app/api/tickets/[id]/files/route.ts` — broadcast after line-item attachment upload/replace
- `app/api/tickets/[id]/files/[fileId]/route.ts` — broadcast after attachment delete
- `app/api/tickets/[id]/route.ts` — payment confirm uses guarded helper (same as PATCH)
- `docs/realtime-live-updates.md`, `docs/feature-specs/invoice-payment.md` — public portal Realtime broadcast documented

## [2026-05-29] — Public quote page: Realtime instead of 30s polling

### Added
- `lib/constants/public-quote-realtime.ts` — channel name + broadcast event for `/q/[token]`
- `lib/integrations/notify-public-quote-updated.ts` — server-side Supabase Realtime broadcast (fire-and-forget)

### Changed
- `app/(public)/q/[token]/page.tsx` — subscribe to `public-quote:{token}` broadcast; debounced silent refetch; removed 30s payment-review polling
- `app/api/tickets/[id]/route.ts` — broadcast after payment confirm, production release, and ticket PATCH
- `app/api/public/quotes/[token]/submit-payment/route.ts` — broadcast after customer payment submit

## [2026-05-29] — Realtime setup guide for external projects

### Added
- `docs/realtime-agent-setup-guide.md` — general Supabase Realtime + Next.js guide (how it works, DB/RLS setup, three frontend patterns — page-level, central provider, local refetch; no sidebar/nav requirement); shareable to other repos

### Changed
- `docs/realtime-agent-setup-guide.md` — prominent AI-agent warning: do not use sidebar/nav; Pattern A/B only; BazarCRM sidebar marked as legacy example not to copy

## [2026-05-29] — Docs sync + build fixes for push

### Fixed
- `app/api/leads/[id]/resume/route.ts` — select `sales_status` for resume activity payload
- `app/api/public/quotes/[token]/files/[fileId]/route.ts` — `Buffer.from()` for NextResponse body type
- `components/orders/payments-page.tsx` — typed `ticket_payment_strategy` union
- `lib/types/index.ts` — add `lead_claimed` and `lead_reassigned` to `ActivityType`

### Changed
- Docs aligned: **Payment For** (Deposit / Balance / Full payment), Route to Sales on Quote tab — `tickets.md`, `invoice-payment.md`, `navigation.md`, `api-contract.md`, `component-architecture.md`, `rbac.md`, `mvp-scope.md`, `architecture.md`, `types.md`, `integration-plan.md`, `admin.md`, `leads-sdr.md`, `session-summary.md`

## [2026-05-29] — Payment review header layout fix

### Fixed
- `payment-detail-overview.tsx` — **Payment for** and **Method** are separate labeled columns so badges no longer misalign; action buttons align on the right

## [2026-05-29] — Payment Evidence: deposit vs balance vs full

### Changed
- `payment-evidence-type.ts` — infer deposit/balance/full from strategy, prior payments, and submitted amount; clearer labels (Deposit, Balance, Full payment)
- `payment-type-badge.tsx`, `payments-page.tsx`, `payment-detail-overview.tsx` — **Payment For** column/badge with short description; distinct from payment method (Wire, Zelle, etc.)
- `order-payment-summary.tsx` — label **Payment for** on evidence review rows

## [2026-05-29] — SDR Route to Sales on Quote tab

### Changed
- `new-quote-form.tsx` — **Route to Sales** button now appears on both Line Items and Quote tabs so SDRs can complete shipping, tax, and payment settings before routing; quote-tab validation runs when routing from that step

## [2026-05-29] — Docs: sidebar nav badge counts

### Changed
- `docs/navigation.md` — new **Sidebar badge counts** section documenting exact query per route, role scoping, and differences from page tab badges

## [2026-05-29] — Docs: quote routing, shipping picker, follow-up Other

### Changed
- `docs/feature-specs/tickets.md` — manual SDR Route to Sales on Line Items, per-destination Previous addresses, delivery prefill on routed save
- `docs/api-contract.md` — `POST /api/tickets` `routed_reason` / `routed_notes`; follow-up Other validation; shipping-addresses per-block usage
- `docs/schema.md`, `docs/types.md` — `routed_reason`, `routed_notes`; expanded `route_reason` seeds
- `docs/feature-specs/admin.md`, `leads-sdr.md`, `leads-sales.md`, `rbac.md`, `component-architecture.md`, `session-summary.md`, `order-ticket/integration-plan.md` — aligned with May 29 quote/shipping/follow-up behaviour

## [2026-05-29] — Per-destination Previous addresses picker

### Changed
- `shipping-fulfillment-section.tsx` — each **Shipping destination** block has its own **Previous addresses** dropdown; choosing **Enter new address** clears that block’s fields so a fresh address can be typed

## [2026-05-29] — Prefill Send quote via when routing to Sales

### Added
- `lib/utils/resolve-quote-delivery-from-contact.ts` — copies customer phone/email into quote delivery fields and picks SMS vs Email channel

### Changed
- `new-quote-form.tsx` — on save (including Route to Sales), **Send quote via** is prefilled from customer contact when the Quote tab was skipped
- `quote-detail.tsx` — routed quotes backfill delivery destination from ticket contact on load; edit form passes contact for Quote tab prefill

## [2026-05-29] — Add SKU control styled as button

### Changed
- `components/quotes/shared/line-item-variants.tsx` — **Add SKU** uses primary gold/orange button styling for better visibility

## [2026-05-29] — Follow Up Later: require detail when Other is selected

### Changed
- `components/leads/follow-up-sub-form.tsx` — SDR Verify Drawer and Sales modal: choosing **Other** requires free-text in **Please specify**; preset reasons keep optional notes
- `POST /api/leads/[id]/follow-up` — server validates notes when reason is Other

## [2026-05-29] — SDR manual Route to Sales on new quote Line Items

### Added
- `components/quotes/route-to-sales-modal.tsx` — reason picker with optional notes; **Other** requires free-text detail (same as cancel / hold flows)
- `supabase/migrations/095_ticket_routed_reason.sql` — `job_tickets.routed_reason`, `routed_notes` (admin-managed `route_reason` lookups)

### Changed
- `components/quotes/new-quote-form.tsx` — SDR users see **Route to Sales** on the Line Items tab (before Next); choosing a reason saves the quote as `routed` and redirects to `/quotes`
- `POST /api/tickets` — accepts optional `routed_reason` when `ticket_status = routed`
- Admin → Lookups — **Route to Sales Reasons** label clarifies use for leads and quotes
- Migration `095` seeds default `route_reason` lookup values (including quote-oriented options) until Admin edits them

## [2026-05-29] — Docs: Follow Up Later + Sales vs SDR locking

### Changed
- `docs/feature-specs/lead-locking.md` — `locked_by_id` vs `sales_owner_id`; Sales Open skips lock; activity logging rules
- `docs/feature-specs/leads-sales.md`, `leads-sdr.md`, `api-contract.md`, `rbac.md`, `schema.md`, `types.md`, `activity.md`, `component-architecture.md`, `session-summary.md` — aligned with May 29 lead pipeline behaviour

## [2026-05-29] — Sales Open skips redundant session lock for owned leads

### Changed
- `sales-page.tsx` — **Open** on a lead you already claimed does not call `POST /lock`; `sales_owner_id` is the exclusive assignment (other reps never see that row)

## [2026-05-29] — Fix Sales Open re-logging lead_claimed

### Fixed
- `POST /api/leads/[id]/lock` — `lead_claimed` activity is logged for **SDR only** (first claim). Sales **Open** on owned leads no longer calls lock at all.

## [2026-05-29] — Lead History: hold / follow-up / resume timeline

### Added
- `lib/utils/lead-activity-display.ts` — shared History labels for SDR Verify Drawer and Sales modal

### Changed
- Hold / Follow Up Later activities log optional `until` date; Resume logs `from` (On Hold vs Follow Up Later)
- History tab shows **Put on hold**, **Follow up later**, and **Resumed from …** with reason, notes, and scheduled date

## [2026-05-29] — Sales modal: full-screen On Hold / Follow Up Later forms

### Changed
- `components/sales/sales-drawer.tsx` — On Hold and Follow Up Later use the same full-screen reason UI as the SDR Verify Drawer (`HoldSubForm` / `FollowUpSubForm`); tabs, lead fields, and footer actions hidden until confirm or cancel

## [2026-05-29] — Sales pipeline: Follow Up Later tab

### Added
- `/sales` — **Follow Up Later** tab; Sales rep sees only own leads (`sales_owner_id`); Admin sees all
- Sales modal — **Follow Up Later** before On Hold; shared `follow_up_reason` lookups; `POST /api/leads/[id]/follow-up` with `role: 'sales'` sets `sales_status = 'Follow Up Later'`
- `lib/utils/lead-sales-scoped-tab.ts` — sales ownership checks on follow-up / resume

### Changed
- `fetchLeadsSalesTabCounts` — `counts.follow_up`; pipeline excludes `sales_status = Follow Up Later`
- `docs/feature-specs/leads-sales.md`, `docs/navigation.md`, `docs/api-contract.md`

## [2026-05-29] — Follow Up Later: enforce SDR-only visibility

### Changed
- Follow Up Later tab — SDR list/counts already scoped by `sdr_id`; `POST /api/leads/[id]/follow-up` now sets `sdr_id` on defer and returns 403 if the lead belongs to another SDR
- `POST /api/leads/[id]/resume` — SDR cannot resume another SDR's held or follow-up leads
- `lib/utils/lead-sdr-scoped-tab.ts` — shared scope checks (same rule as On Hold tab)

## [2026-05-29] — SDR Verify Drawer: click outside to close

### Changed
- `components/leads/verify-drawer.tsx` — clicking the backdrop closes the modal (same as ✕); soft lock unchanged

## [2026-05-29] — Admin Dropdown Options: Follow Up Later Reasons in Lead Forms

### Changed
- `GET /api/admin/lookups` — all `CATEGORY_META` categories always appear under **Admin → Settings → Dropdown Options** (Lead Forms / Order · Quote), including empty ones; stable sidebar order (Follow Up Later Reasons after Hold Reasons)

## [2026-05-29] — SDR Leads: Follow Up Later tab and drawer action

### Added
- `/leads` — **Follow Up Later** tab (`?tab=follow-up`) — SDR-scoped queue with reason, follow-up date, and Resume
- Verify Drawer — **Follow Up Later** button (before On Hold); full-screen reason form; admin-managed `follow_up_reason` lookups (Admin → Dropdown Options)
- `POST /api/leads/[id]/follow-up` — sets `status = 'Follow Up Later'`, stores reason/notes/date; logs `lead_follow_up_later` activity
- Migration `094_lead_follow_up_later.sql` — `follow_up_*` columns on `leads` + seeded lookup values

### Changed
- `POST /api/leads/[id]/resume` — clears follow-up fields when resuming
- `fetchLeadsWorkspaceTabCounts` — includes `follow_up` badge count

### Docs
- `docs/navigation.md`, `docs/api-contract.md`

## [2026-05-29] — Separate cancelled quotes from cancelled orders in list pages

### Changed
- `/quotes` — new **Cancelled** tab (`ticket_kind = 'quote'`, `ticket_status = 'cancelled'`); SDR/Sales see own tickets only, Admin sees all
- `/orders` — **Cancelled** tab (and All tab) now only includes `ticket_kind = 'order'` — quote-stage cancellations no longer appear here
- `lib/utils/fetch-quotes-data.ts`, `lib/utils/fetch-orders-data.ts`, `lib/utils/ticket-list-filters.ts`, `components/quotes/quotes-page.tsx`, `lib/utils/quote-list-status.ts`

### Docs
- `docs/feature-specs/tickets.md`, `docs/navigation.md`

### Docs
- `docs/feature-specs/tickets.md`, `docs/navigation.md`, `docs/api-contract.md`, `docs/component-architecture.md`, `docs/session-summary.md`, `docs/schema.md`, `docs/rbac.md`, `docs/TODO.md`, `docs/order-ticket/integration-plan.md`

## [2026-05-29] — Product Interests: Has Design checkbox

### Changed
- `components/leads/product-interest-rows.tsx` — **Has Design** is a centered checkbox instead of Yes/No toggle pill; product column grows to full row width; extra spacing below **Product Interests** section title (Add Lead modal + Verify Drawer)

### Docs
- `docs/feature-specs/leads-sdr.md`, `docs/mvp-scope.md`, `docs/component-architecture.md`, `docs/session-summary.md`, `docs/TODO.md`

## [2026-05-29] — Documentation sync (shipping, PDF, public portal)

### Changed
- `docs/session-summary.md`, `docs/schema.md` (093), `docs/api-contract.md`, `docs/types.md`, `docs/feature-specs/tickets.md`, `docs/component-architecture.md`, `docs/architecture.md`, `docs/order-ticket/integration-plan.md` — multi-shipping, optional Shipping ($), PDF 50/50 grid, public `shipping_destinations[]`, edit-mode collapsibles

## [2026-05-29] — Quote/invoice PDF: shipping, SKUs, attachments

### Changed
- `lib/pdf/invoice-pdf.tsx` — multiple **shipping destinations** in a **2-column (50/50)** card grid (matches public quote UI); single destination stays in **Ship To** column; additional SKUs use `SKU{n}.` labels; line/variant **file names** on line items; **Need a design** addon label
- `GET /api/public/quotes/[token]/pdf` and `GET /api/tickets/[id]/pdf` — load `ticket_shipping_destinations` and pass resolved rows into `InvoicePDF`

## [2026-05-29] — Public quote: multiple shipping addresses

### Changed
- `/q/[token]` — one address: **Ship To** column (unchanged); multiple addresses: 2-column card list (same style as additional SKUs)
- `GET /api/public/quotes/[token]` returns `shipping_destinations[]`

## [2026-05-29] — Quote/order edit: expand all collapsible sections

### Changed
- Clicking **Edit** on quote/order detail opens **Line Items**, **Fulfillment**, and **Quote & Pricing** automatically; after **Save**, overview sections return to collapsed

## [2026-05-29] — Shipping destinations: quote/order overview + edit

### Changed
- Quote and order **Overview → Fulfillment** lists each shipping destination (charge + address); section opens by default when destinations exist
- Edit quote or edit order (admin, or quote before customer confirm): same **Add shipping address** multi-block UI
- `GET /api/customers/[id]/shipping-addresses` includes addresses from `ticket_shipping_destinations`

## [2026-05-29] — Multiple shipping destinations + optional Shipping ($)

### Added
- **Add shipping address** on quote form (Ship to customer) — duplicate Shipping ($) + address blocks
- `supabase/migrations/093_ticket_shipping_destinations.sql` — `ticket_shipping_destinations` table; backfill from legacy `ship_to_*`
- `lib/utils/ticket-shipping-destinations.ts` — sync/fetch; `quote_shipping` = sum of destination charges

### Changed
- **Shipping ($)** no longer required when ship-to-customer is selected
- `POST`/`PATCH /api/tickets` accept `shipping_destinations[]`; GET returns them on ticket

## [2026-05-29] — Line Items collapsible on quote/order detail

### Changed
- Quote and order **Overview** + edit view: **Line Items** uses `DetailCollapsibleSection` with `defaultOpen` (collapsed on click)

## [2026-05-29] — Additional SKU labels: SKU1. SKU2. prefix

### Changed
- Additional SKUs display as `SKU1. {name} · Qty N` on overview, public quote grid, PDF, and quote email (`lib/utils/format-ticket-line-variants.ts`)

## [2026-05-29] — Rename "Design on file" to "Need a design"

### Changed
- Line item checkbox label **Need a design** (was Design on file) — form, public quote, PDF, print

## [2026-05-29] — Documentation sync (quote form + public portal)

### Changed
- `docs/session-summary.md`, `docs/schema.md` (092), `docs/security.md` (CSP `/q` + blob), `docs/api-contract.md`, `docs/types.md`, `docs/component-architecture.md`, `docs/architecture.md`, `docs/navigation.md`, `docs/feature-specs/tickets.md`

## [2026-05-29] — Public quote PDF preview: object embed + CSP on /q

### Fixed
- PDF preview uses `<object>` + `blob:` URL (uses `object-src`, not `frame-src`) — avoids `frame-src` CSP blocks
- `object-src 'self' blob:`; dedicated `/q/:path*` CSP header (last in next.config) so quote pages pick up `blob:` after restart

## [2026-05-29] — Public quote PDF preview: blob URL (CSP bypass)

### Fixed
- PDF preview loads file with `fetch` → `blob:` URL in iframe so global `frame-ancestors 'none'` on API responses no longer blocks embed; route handler + next.config header order also fixed

## [2026-05-29] — Public quote PDF preview: frame-ancestors CSP

### Fixed
- PDF iframe error `frame-ancestors 'none'` — file API responses inherited global CSP; excluded `/api/public/quotes/.../files/` from global headers and set `frame-ancestors 'self'` on that route only

## [2026-05-29] — Public quote PDF preview: CSP + frame headers

### Fixed
- PDF embed on `/q/[token]` — CSP had `object-src 'none'` and API responses used `X-Frame-Options: DENY` (images worked via `<img>` only). Set `object-src 'self'`, `SAMEORIGIN` on public file route, iframe preview

## [2026-05-29] — Public quote SKU files: download + inline PDF preview

### Changed
- `GET /api/public/quotes/[token]/files/[fileId]` — streams file inline (fixes broken PDF iframe); `?download=1` for Download button
- `components/public/public-line-item-skus-grid.tsx` — **Download** on every SKU with a file; PDF preview via same-origin iframe

## [2026-05-29] — Public quote page: additional SKUs grid with attachments

### Added
- `/q/[token]` — 2-column grid per line item: `SKU1 - name · Qty N` with image preview or embedded PDF
- `GET /api/public/quotes/[token]/files/[fileId]` — token-scoped streamed file bytes for customer preview/download
- `components/public/public-line-item-skus-grid.tsx`

### Changed
- `components/public/public-quote-document.tsx` — SKU list moved from inline text to grid below each product row (desktop + mobile)

### Docs
- `docs/feature-specs/tickets.md`, `docs/api-contract.md`

## [2026-05-29] — Line item file attachment (image / PDF)

### Added
- **Attach file** on line item Add-on Finishings row — JPEG, PNG, WebP, PDF; line ↔ first SKU lifecycle (May 29)
- `supabase/migrations/092_ticket_files_line_item_attachment.sql` — `ticket_files.variant_id` nullable; one file per line without SKUs
- `components/quotes/shared/line-item-attachment.tsx` — attach control + overview download link
- `POST /api/tickets/[id]/files` accepts `line_item_id` (or `variant_id`)

### Changed
- First **Add SKU** (0→1+ variants) moves line attachment to first SKU; further SKUs attach independently; delete first SKU returns file to line (May 29 lifecycle)
- Quote/order detail **Overview** — View (modal) + Download for line and per-SKU files
- `uploadPendingLineItemFiles` uploads line + variant pending files after save

### Docs
- `docs/feature-specs/tickets.md`, `docs/api-contract.md`, `docs/schema.md`

## [2026-05-29] — Line item quantity totals additional SKUs

### Changed
- Line item **Quantity *** is the **sum** of all additional SKU quantities when SKUs are present (read-only total)
- First **Add SKU** pre-fills from line Quantity; further SKUs pre-fill from the first SKU’s quantity
- Editing any SKU quantity updates the line total; pricing (`qty × unit price`) uses that total
- `lib/utils/line-item-variant-quantity.ts` — shared sum/prefill helpers; edit load reconciles line qty from variants

### Docs
- `docs/feature-specs/tickets.md`

## [2026-05-29] — Due Date optional on create and edit

### Changed
- `components/quotes/new-quote-form.tsx` — Due Date not required on Info tab, Save Draft, or Save & Send
- `components/quotes/quote-detail.tsx` — Due Date not required on edit save, send, or convert
- `components/quotes/shared/info-form.tsx` — `dueDateRequired={false}` hides required asterisk
- `lib/utils/validate-quote-send.ts` — Due date removed from send validation

### Docs
- `docs/feature-specs/tickets.md`, `docs/component-architecture.md`

## [2026-05-29] — Documentation sync (SDR dashboard, payments, detail UX)

### Docs
- `docs/feature-specs/dashboard.md` — SDR owner KPI labels and help text
- `docs/feature-specs/tickets.md` — payments Payment Type column; payment detail stats/timeline/Back; Cancel Quote/Order
- `docs/feature-specs/invoice-payment.md` — payment type + detail navigation
- `docs/navigation.md` — payments list columns; Back from `/payments/[id]`
- `docs/component-architecture.md`, `docs/api-contract.md`, `docs/types.md`, `docs/session-summary.md` — aligned with above

## [2026-05-29] — Cancel button label by ticket stage

### Changed
- `detail-quick-actions.tsx` — admin cancel action shows **Cancel Order** (order / in production / completed) or **Cancel Quote** (draft / sent / routed)
- `cancel-reason-category.ts` — shared `cancelActionLabel()`; cancel modal title uses the same wording

## [2026-05-29] — Payment detail Back returns to Payments queue

### Fixed
- `lib/utils/ticket-detail-href.ts` — Back on `/payments/[id]` no longer sends in-production tickets to `/orders` (context `payment` wins over ticket status)
- `components/orders/payments-page.tsx` — list rows pass `?from=/payments` when opening payment review detail

## [2026-05-29] — Payment detail: stats row and lifecycle timeline

### Changed
- `components/quotes/quote-detail.tsx` — `/payments/[id]` now shows the same top stats row and lifecycle timeline as order/quote detail (was hidden for `context="payment"`)

## [2026-05-29] — Payment type on accountant payments queue

### Added
- `lib/utils/payment-evidence-type.ts` — infer Pre payment / Balance / Full payment from ticket payment strategy and deposit state
- `components/orders/payment-type-badge.tsx` — shared badge for payments list and detail

### Changed
- `components/orders/payments-page.tsx` — **Payment Type** column on Pending approval and Approved tabs (desktop + mobile)
- `components/orders/payment-detail-overview.tsx`, `order-payment-summary.tsx` — payment type shown on `/payments/[id]` review card

## [2026-05-29] — SDR dashboard KPI labels and owner copy

### Changed
- `components/sales/sdr-dashboard.tsx` — renamed all 9 KPI cards to owner terminology (Closed Order Value, Paid From Closed Orders, Remaining Balance for Closed Orders, Qty of Claimed Leads, Manually Created Leads, Unclaimed/Pending Leads, Rejected / Not Qualified, Pending Follow-Up, Qty of Leads Routed to Sales Team); lead metrics show `N leads` format
- `lib/utils/kpi-help-text.ts` — updated SDR dashboard help lines to match owner descriptions

### Docs
- `docs/feature-specs/dashboard.md`

## [2026-05-29] — Collapsible Quote & Pricing and Fulfillment on detail

### Changed
- Quote/order detail — **Quote & Pricing** and **Fulfillment** use `DetailCollapsibleSection`, collapsed by default (overview layout + draft/sent quote tab)
- Order overview — **Payment plan**, **Quote delivery**, **Follow-up schedule**, **Production & evidence**, and **Payment review** collapsible, collapsed by default on order detail
- `components/quotes/shared/quote-form.tsx` — optional `hideFulfillment` when parent renders fulfillment separately

### Docs
- `docs/feature-specs/tickets.md`, `docs/feature-specs/invoice-payment.md`, `docs/component-architecture.md`, `docs/navigation.md`, `docs/session-summary.md`, `docs/TODO.md`

## [2026-05-29] — Admin cancel and edit at any lifecycle stage

### Changed
- **Cancel** — only **admin** may cancel quotes or orders; allowed at any status including **completed** (still requires cancellation reason from Admin → Dropdown Options)
- **Edit** — admin can edit any non-cancelled ticket, including completed orders and customer-confirmed records
- After admin **Save Changes** on `sent`, `order`, `in_production`, or **completed** tickets → resend prompt offers to notify the customer
- `lib/utils/can-admin-cancel-ticket.ts` — removed unpaid-only gate; admin cancel blocked only when already `cancelled`
- `lib/utils/cancel-reason-category.ts` — `completed` uses **Order Cancellation Reasons**
- `app/api/tickets/[id]/route.ts`, `components/quotes/quote-detail/detail-quick-actions.tsx`, `components/quotes/quote-detail.tsx`

### Docs
- `docs/feature-specs/tickets.md`, `docs/api-contract.md`, `docs/component-architecture.md`, `docs/session-summary.md`

## [2026-05-29] — Verify Lead modal close button for claimed leads

### Changed
- `components/leads/verify-drawer.tsx` — X close button always visible in the header so SDRs can dismiss the modal without saving (lead stays claimed per soft-lock model)

### Docs
- `docs/feature-specs/leads-sdr.md`, `docs/feature-specs/lead-locking.md`

## [2026-05-29] — Fix 401 on Add Lead after session token refresh

### Fixed
- `lib/supabase/server.ts` — Route Handler Supabase client now refreshes auth cookies via `setAll` (was a no-op in `requireSession`, causing `POST /api/leads/manual` and other writes to return 401 when the access token expired)
- `lib/auth/session-cache.ts` — exclude `__next_hmr_refresh_hash__` from cache key so dev hot reload does not force a fresh auth check on every save
- `components/leads/add-lead-modal.tsx` — clearer error when session expires or MFA is required

### Docs
- `docs/security.md`, `docs/architecture.md`, `docs/api-contract.md`

## [2026-05-29] — Product Interests layout in Add Lead modal

### Changed
- `components/leads/product-interest-rows.tsx` — Product, Quantity, and Has Design in one row; labels and inputs on separate grid rows so fields align pixel-perfect

### Docs
- `docs/feature-specs/leads-sdr.md`

## [2026-05-28] — Admin dashboard privacy toggle

### Changed
- `components/admin/admin-dashboard.tsx` — **Hide / Show values** toggle (same as SDR/Sales/Accountant); KPI cards and Team section use `DashboardHiddenValue` when `dashboard_values_hidden` is set; team/sessions refetch on toggle
- `components/dashboard/dashboard-privacy.tsx` — Hide/Show toggle matches date filter height (`rounded-[8px] border p-0.5` wrapper + inner `py-1.5` button)

### Docs
- `docs/feature-specs/dashboard.md`, `docs/TODO.md`, `docs/component-architecture.md`

## [2026-05-28] — Quote & order shipping fulfillment

### Added
- Pickup vs **Ship to customer** toggle on New Quote and quote detail (Quote tab)
- When shipping is selected: **Shipping ($)** required (> 0); optional delivery address with previous-address picker from past tickets
- `supabase/migrations/091_ticket_shipping_address.sql` — `requires_shipping`, `ship_to_*` on `job_tickets`
- `lib/utils/address.ts`, `components/quotes/shared/shipping-fulfillment-section.tsx`
- `GET /api/customers/[id]/shipping-addresses` — distinct past ship-to addresses for a customer

### Changed
- `components/quotes/shared/quote-form.tsx` — shipping charge moved into fulfillment section (hidden unless Ship selected); Tax Rate (%), Discount, and Tax Exempt on one row
- Quote detail, public quote page, PDF, and print — **Ship To** block when address entered
- Quote/order detail **Overview** — always-visible **Fulfillment** section (method, shipping charge, ship-to address)
- Order-ready email/SMS — pickup vs shipped copy when `requires_shipping`
- `app/api/tickets/route.ts`, `app/api/tickets/[id]/route.ts`, `lib/utils/validate-quote-send.ts`

### Docs
- `docs/schema.md`, `docs/api-contract.md`, `docs/types.md`, `docs/feature-specs/tickets.md`, `docs/feature-specs/invoice-payment.md`, `docs/component-architecture.md`, `docs/session-summary.md`, `docs/order-ticket/open-questions.md`, `docs/order-ticket/product-catalog.md`

## [2026-05-28] — Resend prompt after saving sent quotes / orders

### Added
- Post-save modal on quote detail — **SDR/Sales:** after editing a **sent** quote (not yet confirmed), prompts to resend; **Admin:** after any edit on **sent**, **order**, or **in_production**, prompts to notify customer
- `components/quotes/quote-detail/resend-after-save-modal.tsx`, `lib/utils/should-offer-resend-after-save.ts`
- `PATCH` body `notify_revision` (`standard` | `admin`) — revision banner in quote email and invoice-link email; SMS prefix for updates

### Changed
- `lib/integrations/quote-email-template.ts`, `invoice-link-template.ts`, `send-quote.ts`, `app/api/tickets/[id]/route.ts`

### Docs
- `docs/api-contract.md`, `docs/feature-specs/tickets.md`, `docs/TODO.md`, `docs/order-ticket/open-questions.md`

## [2026-05-28] — Quote overview: additional SKU display

### Changed
- Quote/order detail **Overview** line items — additional SKUs in a nested card with name, quantity, filename, and **View** (modal) / **Download** actions
- `components/quotes/shared/line-item-variants.tsx` — `AdditionalSkusOverviewList`; `line-items-form.tsx` + `detail-layout-primitives.tsx` footer on line item card
- `lib/utils/ticket-line-items.ts` — `lineItemsToDisplayRows` includes variant file metadata

## [2026-05-28] — Ticket attachment upload fixes

### Added
- `supabase/migrations/090_ticket_attachments_storage_bucket.sql` — creates private `ticket-attachments` Storage bucket

### Fixed
- `lib/utils/ticket-line-files.ts` — MIME from file extension when browser sends empty type; clearer error when bucket is missing
- `app/api/tickets/[id]/files/route.ts` — uses resolved MIME on upload

## [2026-05-28] — Additional SKU row layout

### Changed
- `components/quotes/shared/line-item-variants.tsx` — Name, Quantity, Attach, and delete on one row; matched 38px control height for Quantity and File attach; file name / pending hint on a second line when relevant

## [2026-05-28] — Ticket line items: additional SKUs and variant files

### Added
- Migration `089_ticket_line_items_variants_files.sql` — `ticket_line_items`, `ticket_line_variants`, `ticket_files`; backfill from `quote_skus` then drop column
- `lib/utils/ticket-line-items.ts` — sync/fetch/validate; `lib/utils/ticket-line-files.ts` — Storage upload/signed URL; `lib/utils/format-ticket-line-variants.ts`
- `POST/GET/DELETE /api/tickets/[id]/files` — staff-only variant attachments (bucket `ticket-attachments`)
- `components/quotes/shared/line-item-variants.tsx` — additional SKU rows + pending upload after save

### Changed
- `POST` / `PATCH` / `GET /api/tickets/[id]` — client sends **`line_items`** tree (not `quote_skus`); detail returns lines → variants → file metadata
- Quote/new + `QuoteDetail` forms, overview, PDF, print, email (`send-quote`), public `/q/[token]` — show variant name + qty (files staff-only on public)
- Admin product-type/material delete guards query `ticket_line_items` instead of JSONB
- `supabase/schema.sql` — relational line-item tables; removed `quote_skus` from `job_tickets`

### Docs
- `docs/schema.md`, `docs/api-contract.md`, `docs/feature-specs/tickets.md`, `docs/types.md`, `docs/component-architecture.md`, `docs/architecture.md`, `docs/TODO.md`, `docs/session-summary.md`, `docs/order-ticket/product-catalog.md`

## [2026-05-28] — Leads workspace, locking, and Product Interests (session batch)

### Fixed
- **Leads list empty while tab count showed rows** — All Leads query excluded `sales_status IS NULL` via PostgREST `not.eq Won`; fixed with `sales_status IS NULL OR sales_status <> Won` (`applyExcludeSalesStatusWon`). Affected admin and SDR.
- `components/leads/leads-page.tsx` — clamp pagination when `offset` exceeds `total`; guard `data.leads` with `Array.isArray`

### Changed
- **SDR All Leads / My Leads toggle** — `owner_scope=all` lists only **unclaimed** leads (`locked_by_id IS NULL`); `owner_scope=mine` lists leads **claimed** by current user. Other SDRs' locked leads stay hidden. Tab badge **All** count = unclaimed pool size (not affected by toggle).
- **Manual Add Lead** (`POST /api/leads/manual`) — sets `sdr_id` for attribution only; does **not** set `locked_by_id` / `locked_at`. New leads (SDR or admin) enter the open pool until someone clicks **Claim**.
- **Claim / View loading** — `components/leads/leads-page.tsx` uses `useGlobalLoading` + row spinner (`GLOBAL_LOADING_MESSAGES.openingLead`) while lock + lead fetch run.
- **Product Interests** — each selected product requires **quantity > 0**; product required when row is used (cannot save quantity-only rows); shared `components/leads/product-interest-rows.tsx` with labels **above** inputs; separate product vs quantity error borders; styled remove button; validated on `POST /api/leads/manual` and `PATCH /api/leads/[id]`
- `lib/utils/leads-workspace-query.ts`, `lib/utils/validate-lead-product-interests.ts`, `components/leads/add-lead-modal.tsx`, `components/leads/verify-drawer.tsx`, `components/layout/global-loading-provider.tsx`

### Removed
- `supabase/migrations/089_leads_backfill_manual_lock.sql` — auto-lock backfill not desired

### Docs
- `docs/feature-specs/leads-sdr.md`, `docs/feature-specs/lead-locking.md`, `docs/component-architecture.md`, `docs/api-contract.md`, `docs/types.md`, `docs/session-summary.md`, `docs/navigation.md`, `docs/mvp-scope.md`, `docs/architecture.md`, `docs/rbac.md`, `docs/schema.md`, `docs/crm-logic-overview.html`

## [2026-05-28] — Content Security Policy fixes

### Fixed
- CSP — allow Vercel Speed Insights in development (`va.vercel-scripts.com`, `vitals.vercel-insights.com`), Vercel Live frames, Next.js HMR localhost connections, `style-src-elem` for Google Fonts on 404 page, `worker-src blob:`
- `lib/security/content-security-policy.ts` — single builder used by `next.config.ts`

## [2026-05-28] — Fix Sales page leads.filter crash

### Fixed
- `GET /api/leads/sales/page-data` — return `result.rows` as `leads` (workspace query now returns `{ rows, total }`, not a bare array)
- `components/sales/sales-page.tsx` — guard against non-array `leads` on fetch error

## [2026-05-28] — Quote & order cancellation reasons

### Added
- Admin → Settings → **Dropdown Options** — **Quote Cancellation Reasons** and **Order Cancellation Reasons** (5 defaults each; add, edit label, reorder, deactivate)
- Migration `088_ticket_cancel_reasons.sql` — `job_tickets.cancel_reason`, `cancel_reason_label`, `cancel_notes`
- Cancel confirmation modal on quote/order detail — required reason + optional notes before `ticket_status = cancelled`
- Cancelled tickets show reason banner on detail overview; history logs `ticket_cancelled` with reason

### Changed
- `PATCH /api/tickets/[id]` — requires active lookup reason on cancel; snapshots label on ticket for audit
- In-use cancellation reasons cannot be deleted (409) — deactivate instead; stored label preserved on cancelled tickets
- Cancel modal — selecting **Other** requires free-text detail (saved in `cancel_notes`); optional notes for all other reasons

## [2026-05-28] — Admin cancel on unpaid in-production orders

> **Superseded (2026-05-29):** Admin may cancel at **any** lifecycle stage including **completed** (paid or unpaid). See changelog entry **Admin cancel and edit at any lifecycle stage**.

### Fixed
- Order detail — **Cancel Ticket** now shows for admins on unpaid orders in **`in_production`** (previously only `order` status), matching net/cash auto-release behaviour
- `lib/utils/can-admin-cancel-ticket.ts` — shared gate: no payment received, no evidence pending
- `PATCH /api/tickets/[id]` — validates admin-only cancel on order/in_production stages; blocks when payment exists or is under review

## [2026-05-28] — Collapsible detail sections (Timeline, Pricing, Payment settings)

### Changed
- Quote/order detail overview — **Timeline**, **Pricing**, and **Payment & order settings** are collapsible via `DetailCollapsibleSection`; **default collapsed**
- `components/quotes/quote-detail/detail-layout-primitives.tsx` — shared collapsible header with chevron toggle

### Changed (docs)
- Updated `feature-specs/tickets.md`, `component-architecture.md`, `architecture.md`, `navigation.md`, `session-summary.md`, `types.md`, `TODO.md`, `feature-specs/invoice-payment.md`, `.cursor/rules/folder-structure.mdc`

## [2026-05-28] — Documentation sync: list pagination

### Changed
- Updated `docs/api-contract.md`, `architecture.md`, `component-architecture.md`, `navigation.md`, `types.md`, `TODO.md`, `session-summary.md`
- Updated feature specs: `crm.md`, `leads-sdr.md`, `tickets.md`
- Updated performance docs: `performance-optimization.md`, `performance-anydoer-roadmap.md`
- Updated `.cursor/rules/tab-counts.mdc` — pagination + tab counts interaction

## [2026-05-28] — Leads list pagination

### Changed
- `GET /api/leads/workspace/page-data` — paginated leads list; query params: `search`, `status` / `statuses`, `owner_scope` (SDR all tab), `routed_filter`, `sort`, `sort_dir`, `limit`, `offset`; response includes `pagination` and `routedSubCounts` on routed tab
- `lib/utils/leads-workspace-query.ts` — server-side search, SDR owner scope, routed sub-filter, sort, and pagination slice
- `components/leads/leads-page.tsx` — `ListPagination` (25 default), debounced search; filters/sort moved server-side

## [2026-05-28] — CRM list pagination

### Added
- `lib/utils/fetch-crm-data.ts` — shared CRM customer aggregation, server-side search/status/heat filters, pagination slice
- `GET /api/crm/page-data` — paginated CRM list for all roles; query params: `search`, `status` (`all`|`new`|`known`), `heat` (`all`|`hot`|`warm`|`cold`), `limit`, `offset`; response `{ customers, pagination }`

### Changed
- `components/crm/crm-page.tsx` — server-side filters + `ListPagination` (25 default, 25/50/100); debounced search (300 ms)
- `GET /api/customers` — refactored to use `fetch-crm-data` (full list for merge/search callers; optional `?search=`)

## [2026-05-28] — List pagination on Quotes, Completed, Production

### Changed
- **Quoted Requests** (`/quotes`) — server-side tab, search, date, admin user filter + `ListPagination` (25 default); API `GET /api/quotes/page-data` returns `pagination`
- **Completed** (`/completed`) — server-side search, completion date, admin user filter + pagination
- **Production** (`/production`) — server-side tab, search + pagination (page still used for legacy redirect context)
- Extended `lib/utils/ticket-list-filters.ts` with quotes/completed/production filter parsers
- Refactored `fetch-quotes-data.ts`, `fetch-completed-data.ts`, `fetch-production-data.ts` for filtered paginated queries

### Note
- **Sales** still loads full lists — follow-up

## [2026-05-28] — Orders column sorting

### Changed
- `lib/utils/orders-list-sort.ts` — server-side column sort for Orders list
- Clickable sort headers on `/orders`: **Created by** (A–Z), **Balance Due** (high → low), **Due Date** (overdue first, then soonest), **Status** (In Production first), **Payment** (Unpaid → Partial → Paid); small **filter icon** on sortable columns (highlighted when active)
- `GET /api/orders/page-data` — optional `sort=` query param (`created_by`, `balance_due`, `due_date`, `status`, `payment`); click same header again to reset default sort

## [2026-05-28] — Orders list pagination (template)

### Added
- `lib/utils/pagination.ts` — shared `limit`/`offset` parsing (default **25**, allowed 25 / 50 / 100), range label helper, localStorage page-size key
- `lib/utils/ticket-list-filters.ts` — server-side tab, search, date, and admin user filters for ticket lists (reusable by Quotes / Completed)
- `components/ui/list-pagination.tsx` — **Showing 1–25 of 200**, Previous / Next, rows-per-page selector

### Changed
- `GET /api/orders/page-data` — paginated list + tab counts; query params: `tab`, `search`, `date_from`, `date_to`, `user_id`, `limit`, `offset`; response includes `pagination: { limit, offset, total, hasMore }`
- `GET /api/orders/counts` — accepts same filter params (search, date, admin user) as page-data
- `components/orders/orders-page.tsx` — server-side filters only; tab badges from API counts; debounced search (300 ms)

## [2026-05-28] — Admin team filter includes admin users

### Changed
- `AdminUserFilter` — admins appear in the dropdown (can filter to their own leads/quotes/orders/completed)

## [2026-05-28] — Fix admin team filter not refetching list data

### Fixed
- Quotes, Orders, Completed, and Leads pages — `useCoalescedRefresh` now depends on `filterUserId` / `isAdmin` so changing the team member dropdown triggers a new page-data fetch with `?user_id=`

## [2026-05-28] — Admin team member filter on Leads, Quotes, Orders, Completed

### Added
- `components/ui/admin-user-filter.tsx` — admin-only **All team members** dropdown (SDR / Sales / Accountant)
- `?user_id=` query param on list page-data and counts routes — **admin role only**; ignored for other roles

### Changed
- **Leads** — filter by `sdr_id` (Hold / Rejected / Won / Routed) or `sdr_id` + `locked_by_id` (All Leads tab); tab counts respect filter
- **Quotes / Orders / Completed** — filter by ticket `created_by_id`; tab counts respect filter on server fetch
- Admin list tables — **Created by** column on Quotes, Orders, and Completed when viewing as admin
- `TicketListToolbar` — optional `endAdornment` slot for the user filter

## [2026-05-28] — Dashboard privacy: masked placeholders instead of "Hidden" text

### Changed
- `DashboardHiddenValue` in `components/dashboard/dashboard-privacy.tsx` — EyeOff icon + bullet mask (`$ • • • • •` for currency, `• • •` for counts); screen-reader label remains "Hidden"
- SDR, Sales, and Accountant dashboards — use masked placeholder when values are hidden
- **Docs:** `feature-specs/dashboard.md`, `api-contract.md`, `schema.md`, `component-architecture.md`, `architecture.md`, `feature-specs/admin.md`, `session-summary.md`, `TODO.md`

## [2026-05-28] — Dashboard values privacy (Hide / Show KPIs)

### Added
- Migration `087_user_profiles_dashboard_values_hidden.sql` — `user_profiles.dashboard_values_hidden boolean default false`
- `lib/utils/dashboard-privacy.ts` — read/set flag, server redact helpers
- `GET` / `PATCH /api/user/dashboard-privacy` — per-user preference
- `components/dashboard/dashboard-privacy.tsx` — toggle, confirm modal, `useDashboardPrivacy`, `DashboardHiddenValue`
- Server redaction when hidden: `GET /api/dashboard/kpis`, `GET /api/payments/counts`, `GET /api/admin/team`, `GET /api/admin/sessions`

### Changed
- SDR, Sales, Accountant dashboards — Hide / Show values button; KPI cards use masked placeholders when hidden
- Admin KPI/team/session routes — redact numeric fields when viewer has privacy enabled (Admin UI toggle pending)

## [2026-05-28] — New users: explicit dashboard privacy default

### Fixed
- `POST /api/admin/users/create` — sets `dashboard_values_hidden: false` on `user_profiles` insert (matches DB default; dashboard values visible for new accounts)

## [2026-05-28] — SDR Orders/Quotes scope: created_by_id only

### Changed
- SDR `/orders` list, tab counts, and sidebar badge — `created_by_id` only (matches `/completed`; no `routed_by_id` rows)
- `scopeJobTicketsQuery()` and `applyTicketScope()` — SDR branch uses `eq("created_by_id", userId)`
- **Docs:** `feature-specs/dashboard.md`, `feature-specs/tickets.md`, `navigation.md`, `architecture.md`, `component-architecture.md`, `schema.md`, `api-contract.md`, `rbac.md`, `session-summary.md`

## [2026-05-28] — SDR dashboard: self-closed order revenue only

### Changed
- SDR dashboard — **Orders**, **Received**, and **Balance** restored; credit only quotes the SDR **created**, **converted**, and **collected payment on** (`created_by_id`, not routed to Sales, payment > 0)
- `lib/utils/sdr-dashboard-metrics.ts` — `filterSelfHandledTickets`, `productionReleasedSelfHandled`, `countOrdersCreatedSelfHandled`
- `lib/utils/kpi-help-text.ts` — SDR order help copy updated
- **Docs:** `feature-specs/dashboard.md`, `feature-specs/tickets.md`, `navigation.md`, `architecture.md`, `component-architecture.md`, `schema.md`, `api-contract.md`, `rbac.md`, `session-summary.md`

### Removed
- SDR dashboard — **Sales Win** and routed-lead production attribution (unchanged from prior pass)

## [2026-05-28] — SDR dashboard: hide sales order revenue

### Removed
- SDR dashboard — **Orders**, **Received**, **Balance**, and **Sales Win** KPI cards (sales-attributed production revenue after routing)
- `lib/utils/sdr-dashboard-metrics.ts` — order value / production release queries for SDR role

### Changed
- SDR dashboard — **Lead Claimed** is now the accent card; six activity-only KPIs remain (claimed, created, inbox, rejected, on hold, routed)

## [2026-05-27] — Documentation sync (May 27 feature batch)

### Changed
- **Dashboards & lists** — `feature-specs/dashboard.md`, `component-architecture.md`, `api-contract.md`, `navigation.md`, `session-summary.md`, `TODO.md`: default **Last 30 Days**; SDR/Sales **Orders** merged KPI; Sales omits **Lead Created**
- **Timeline & references** — `feature-specs/tickets.md`, `activity.md`, `order-ticket/lifecycle-flow.md`, `schema.md`, `architecture.md`: QUO/ORD labels, `ticketKindForReference()`, creation activity payload
- **CRM & Realtime** — `feature-specs/crm.md`, `realtime-live-updates.md` (Bug 3, migration **086**), `feature-specs/tickets.md` routed-tab live refresh

## [2026-05-27] — Sales dashboard: remove Lead Created card

### Removed
- Sales dashboard — **Lead Created** KPI (SDRs own lead creation; card was always zero or misleading for Sales)

## [2026-05-27] — SDR/Sales dashboard: merge Orders KPI card

### Changed
- SDR & Sales dashboards — **Orders** card combines former **Total** ($) and **Order Created** (count in subtext: `from N orders converted`); accent styling; % trend remains on dollar value
- `lib/utils/kpi-help-text.ts` — `order_total_with_count_sdr` / `order_total_with_count_sales` help copy

## [2026-05-27] — Default date filter: Last 30 Days

### Changed
- `DashboardDateRangeFilter` default preset **`last_month`** (Last 30 Days) on Admin / SDR / Sales dashboards and Quotes / Orders / Completed list pages
- `GET /api/dashboard/kpis` — fallback presets when omitted: `admin_preset`, `sdr_preset`, `sales_preset` default to `last_month`

## [2026-05-27] — Routed quotes tab live refresh for Sales

### Fixed
- **Routed to Sales** tab — other Sales reps now see claims and new SDR routings without reload; migration `086_job_tickets_routed_realtime_rls.sql` adds `sales_read_routed_tickets` SELECT policy and Realtime-safe `admin_read_all_tickets` (inline `EXISTS`, not `current_user_role()`)
- `quotes-page.tsx` — page-level `job_tickets` + `activities` Realtime when user can see Routed tab; listens to `bazaar:activities-changed`
- SDR high-value route save — dispatches `bazaar:tickets-changed` after successful `POST /api/tickets` (`routed` / `sent`)

### Changed
- `docs/feature-specs/tickets.md`, `realtime-live-updates.md`, `schema.md`, `api-contract.md`, `component-architecture.md`, `architecture.md`, `session-summary.md`, `TODO.md` — routed-tab Realtime (RLS 086, dual refresh paths, deploy checklist)

## [2026-05-27] — Documentation sync (timeline, references, CRM)

### Changed
- `docs/feature-specs/tickets.md`, `activity.md`, `crm.md`, `api-contract.md`, `schema.md`, `component-architecture.md`, `realtime-live-updates.md`, `architecture.md`, `session-summary.md`, `TODO.md` — lifecycle timeline rules, `ticketKindForReference()`, CRM list/realtime notes

## [2026-05-27] — Fix QUO tickets labeled Order created

### Fixed
- Ticket lifecycle timeline — creation node uses **creation activity payload** (`QUO-*`), not the ticket’s current `ORD-*` (orders detail no longer shows “Order created” for an original quote)
- Timeline/history — **QUO-* reference wins** over `ticket_kind` when labeling creation (fixes rows where `ticket_kind` was `order` but reference was still `QUO-…`)
- `POST /api/tickets` / `PATCH /api/tickets/[id]` — `ticketKindForReference()` keeps `ticket_kind` aligned with `QUO-*` / `ORD-*`
- `maybeConvertQuoteToOrder` — aborts convert when `ORD-*` assignment fails (avoids `ticket_kind: order` with a `QUO-*` code)

## [2026-05-27] — Timeline: CRM customer quotes vs lead quotes

### Fixed
- Quote from **CRM customer profile** (no linked lead) — timeline shows **Quote created** using `ticket_kind`, `QUO-*`, and activity payload (not page route); **Customer in CRM** origin node when the contact existed before the quote
- History — **Quote created** when activity payload `ticket_kind` is `quote` even if reference was missing on older rows

## [2026-05-27] — Timeline & history: Quote created for QUO-* tickets

### Fixed
- Order detail timeline no longer shows **Order created** for tickets that are still quotes (`QUO-*` reference); uses `ticketIsQuoteStage()` instead of page context (`Order Total` label)
- History tab — **Quote created** / **Order created** from activity `reference_code`; detail line shows `QUO-…` / `ORD-…` when present

## [2026-05-27] — Routed quote list live update when another Sales rep claims

### Fixed
- Other Sales users on **Routed to Sales** now refresh when a colleague claims a quote (no manual reload) — `activities` Realtime also dispatches `bazaar:tickets-changed` because `job_tickets` events are dropped by RLS once the row is no longer visible
- Claim action also dispatches `bazaar:tickets-changed` on the claimant’s client

## [2026-05-27] — CRM list 500 for standalone customers

### Fixed
- `GET /api/customers` — customers added via **Add Customer** (no leads/tickets yet) no longer crash the list API when building aggregates (`agg` was undefined after filter)
- CRM page — shows an error toast when the customers fetch fails instead of silently showing an empty table

## [2026-05-27] — CRM: stop Chrome autofill on list search

### Fixed
- CRM list search — `autoComplete="off"`, `type="search"`, non-profile `name` so Chrome saved contacts do not fill the filter when adding a customer
- Add Customer modal — `section-bazaar-add-customer` autocomplete tokens + scoped field `name`s; modal wrapped in `<form autoComplete="off">`
- `PhoneInput` / `EmailInput` — optional `autoComplete` and `name` props for form isolation

## [2026-05-27] — Admin dashboard date range filter

### Changed
- Admin dashboard — same **Today / Yesterday / Last 7 Days / Last 30 Days / Custom** filter as Orders, Quotes, and Completed; default **Last 7 Days**
- `GET /api/dashboard/kpis` (admin) — `admin_preset`, `date_from`, `date_to` via `resolveSdrDashboardDateRange`; response includes `range.label` for KPI subtexts; replaces `period=week|month|quarter`

### Changed (docs)
- `docs/api-contract.md`, `docs/component-architecture.md`, `docs/session-summary.md`, `docs/TODO.md`, `docs/navigation.md`, `docs/feature-specs/dashboard.md`, `docs/feature-specs/tickets.md` — aligned with admin dashboard date filter and orders due-today highlight

## [2026-05-27] — Orders: highlight due today

### Changed
- Orders list — rows with **due date today** (not cancelled) use full-width red danger background on every table cell; Due Date shows “Today” label (desktop + mobile)
- `lib/utils/format.ts` — `isDueToday()` helper

## [2026-05-27] — Documentation sync (payments evidence + SMS templates)

### Changed
- `docs/api-contract.md`, `docs/navigation.md`, `docs/schema.md`, `docs/types.md`, `docs/architecture.md`, `docs/component-architecture.md`, `docs/session-summary.md`, `docs/TODO.md`, `docs/email-template-guide.md`, `docs/feature-specs/admin.md`, `docs/feature-specs/tickets.md`, `docs/feature-specs/invoice-payment.md`, `docs/FuturePlan/Performance/performance-optimization.md` — aligned with `payment_evidence_reviewed_at`, Payments Pending/Approved tabs, and admin SMS template editor

## [2026-05-27] — Payments evidence retained + Approved tab

### Added
- `supabase/migrations/085_payment_evidence_reviewed_at.sql` — `payment_evidence_reviewed_at` on `job_tickets`; pending queue index uses reviewed state
- Payments page — **Pending approval** and **Approved** tabs with badge counts; approved rows keep **View evidence**

### Changed
- `record_payment` — no longer clears `payment_evidence_url` / `payment_evidence_submitted_at` / `payment_evidence_amount`; sets `payment_evidence_reviewed_at` on confirm
- `isPaymentEvidencePending()` — uses `payment_evidence_reviewed_at` instead of `payment_paid_at`
- `GET /api/payments/page-data` — returns `orders`, `approvedOrders`, and `counts: { pending, approved }`
- Public submit-payment — resets `payment_evidence_reviewed_at` when customer uploads new proof
- Sidebar `/payments` badge and accountant dashboard pending count — unreviewed evidence only

## [2026-05-27] — Admin SMS templates

### Added
- `supabase/migrations/084_sms_templates.sql` — `sms_templates` table with seeded default bodies
- `lib/integrations/sms-template-catalog.ts`, `render-sms-template.ts`, `load-sms-templates.ts` — template keys, placeholders, render helpers
- `GET` / `PATCH` `/api/admin/sms-templates` — admin CRUD for template text
- `components/admin/sms-templates-section.tsx` — Admin → Settings → **SMS Templates** editor
- Admin overview card and settings tab for SMS Templates

### Changed
- `lib/integrations/send-quote.ts` — Twilio SMS/WhatsApp bodies loaded from DB (fallback to coded defaults)
- Admin settings tab nav and `/admin` overview grid — new SMS Templates entry

## [2026-05-26] — Documentation sync (May 26 changes)

### Changed
- `docs/api-contract.md`, `docs/navigation.md`, `docs/feature-specs/tickets.md`, `docs/feature-specs/crm.md`, `docs/feature-specs/dashboard.md`, `docs/feature-specs/invoice-payment.md`, `docs/session-summary.md`, `docs/TODO.md`, `docs/architecture.md`, `docs/component-architecture.md` — aligned with date filters (Last 7/30 Days), client-side tab badges, CRM Add Customer + Realtime, manual `heat_tag`, public payment amount lock, SDR Completed scoping

## [2026-05-26] — CRM live updates (Realtime)

### Added
- `supabase/migrations/083_enable_customers_realtime.sql` — Realtime on `customers` table
- Sidebar `customers-realtime` channel → `bazaar:customers-changed` event

### Changed
- CRM page — uses `useCoalescedRefresh` on `bazaar:customers-changed`, `bazaar:leads-changed`, and `bazaar:tickets-changed` (same pattern as Orders/Leads); removed manual Refresh button

## [2026-05-26] — CRM Add Customer button

### Added
- CRM page — **Add Customer** button opens modal (contact fields only, no lead/quote); `POST /api/customers`
- `components/crm/add-customer-modal.tsx` — shared add-customer form
- `GET /api/customers` — includes customers with no leads/tickets yet (standalone CRM adds)

## [2026-05-26] — List page tab badges follow date filter

### Changed
- Quotes, Orders, Completed — default date filter **Last 7 Days** on first visit
- Quotes & Orders — tab badge counts derived from date-filtered list rows (match visible data); sidebar nav badges unchanged (all-time)
- `lib/utils/list-page-tab-counts.ts` — shared client-side tab count helpers

## [2026-05-26] — Date filter rolling windows (Last 7 / Last 30 days)

### Changed
- `DashboardDateRangeFilter` / `resolveSdrDashboardDateRange()` — **Last Week** → **Last 7 Days** (today + prior 6 days, inclusive); **Last Month** → **Last 30 Days** (today + prior 29 days, inclusive). Applies to Quotes, Orders, Completed, SDR & Sales dashboards. API preset keys unchanged (`last_week`, `last_month`).

## [2026-05-26] — Completed page date filter

### Added
- Completed page (`/completed`) — `DashboardDateRangeFilter` (default **Last 7 Days**); list filtered by completion date (`updated_at`); sidebar badge stays all-time total

## [2026-05-26] — Order detail sidebar actions reachable after timeline

### Fixed
- Quote/order detail overview layout — removed fixed viewport height that clipped sidebar actions (Customer Link, Copy Link, Resend Link) below Mark Completed after the lifecycle timeline was added; page scrolls normally on desktop

## [2026-05-26] — Public payment amount locked to amount due

### Changed
- Public payment modal (`/q/[token]`) — removed editable “Payment Amount” field; customers pay exactly the amount shown at the top (deposit or balance)
- `POST /api/public/quotes/[token]/submit-payment` — amount computed server-side via `computePublicPaymentDueAmount()` (client cannot override)

## [2026-05-26] — Orders nav badge vs page list alignment

### Fixed
- Orders page — tab badges initially aligned with sidebar using full scoped totals; **superseded same day** by “List page tab badges follow date filter” (badges now match selected date range; sidebar stays all-time)
- Quotes page — same interim fix, then same superseding behaviour

## [2026-05-26] — Quote send activity on create-and-send

### Fixed
- `POST /api/tickets` with `ticket_status: "sent"` (Save & Send) now logs `ticket_sent` in History/timeline — previously only `order_ticket_created` was recorded
- `supabase/migrations/082_backfill_ticket_sent_on_create.sql` — backfills `ticket_sent` for existing sent quotes missing it (e.g. create-and-send before this fix)

## [2026-05-26] — SDR completed orders access

### Added
- `supabase/migrations/081_grant_sdr_completed_page.sql` — idempotent grant of SDR nav access to `/quotes`, `/orders`, `/completed` (no-op if already present; excludes `/settings` — not in `pages` table)

### Changed
- Completed page (`/completed`) — SDR can access and sees only completed orders **they created** (`created_by_id`); routed-to-Sales hand-offs that Sales completed are excluded
- `GET /api/completed/*` — passes role + user into scoped queries via `scopeCompletedTicketsQuery` / `scopedCompletedTicketCount`
- Sidebar completed badge — scoped count for SDR
- `canAccessTicket()` — SDR may read routed hand-offs via `routed_by_id` until status is `completed`; completed detail requires `created_by_id`

### Changed (docs)
- `docs/rbac.md`, `docs/navigation.md`, `docs/api-contract.md`, `docs/security.md`, `docs/architecture.md`, `docs/types.md`, `docs/component-architecture.md`, `docs/feature-specs/tickets.md`, `docs/feature-specs/invoice-payment.md`, `docs/feature-specs/leads-sdr.md`, `docs/session-summary.md`, `docs/TODO.md`, `docs/schema.md` — SDR Completed page access and `created_by_id`-only scoping

## [2026-05-26] — SDR UX, list date filters, dashboard KPIs

### Added
- `components/ui/dashboard-date-range-filter.tsx` — shared Today / Yesterday / Last 7 Days / Last 30 Days / Custom filter (SDR & Sales dashboards, Orders, Quotes, Completed)
- `lib/utils/dashboard-date-range-filter.ts` — range resolution and `created_at` matching helpers

### Changed
- Sales and SDR dashboards — **Total**, **Received**, and **Balance** are separate KPI cards for production-released orders in the selected period
- Sales and SDR dashboard KPI cards — non-accent icons use main brand color (`--color-tab-active`) on badge background
- **Orders**, **Quotes**, and **Completed** list pages — date filter in page header (default **Last 7 Days**); filters **list rows** by `created_at` (quotes/orders) or `updated_at` (completed). **Tab badges on Quotes/Orders follow the selected range**; sidebar nav badges stay all-time scoped totals
- SDR and Sales dashboards — use shared `DashboardDateRangeFilter` component
- Customer profile — **Lead History** section removed; **Quotes & Orders** remains
- Leads page (SDR) — **Directed to Sales** and **Won** tabs open read-only **Verify Drawer** instead of redirecting to customer profile
- Verify drawer — view-only banner when a routed or won lead is opened read-only

### Fixed
- Orders and Quotes date filter — preset buttons were ignored because stored custom draft dates always forced a custom range
- Closing read-only lead modal no longer reloads the list — `useCoalescedRefresh` resumes silently; read-only drawers keep refresh enabled (`enabled: !drawerLead || drawerReadOnly`)

## [2026-05-26] — Timeline typography

### Changed
- Timeline pairs **Payment proof submitted** with **Payment proof approved** when accountant confirmed or deposit was already recorded (staff cash / public payment)
- Staff cash auto-record clears stale payment evidence queue fields; public payment page rejects duplicate deposit proof uploads

## [2026-05-26] — Due date end-of-day rules and validation

### Added
- `lib/utils/due-date.ts` — shared helpers: local creation date, end-of-day overdue check, validation against creation date

### Changed
- Due dates are **end of calendar day** (11:59:59 PM local) — not overdue until that day ends; fixes same-day quotes showing overdue at 8:59 PM
- `isOverdue()` in `lib/utils/format.ts` — uses end-of-day comparison
- Quote lifecycle timeline — creation always first; due date and completion sort **chronologically**; **Lead created** node (with source) prepended when ticket has a linked lead, then **Quote created** / **Order created**
- Completed order detail (`/completed/[id]`) — stats row shows **Completed** date instead of Due Date
- `DatePicker` — optional `minDate` prop; Info form passes creation day when editing
- New quote + quote detail forms — block due date before creation date
- `POST /api/tickets` and `PATCH /api/tickets/[id]` — server-side due date validation

## [2026-05-26] — Security, performance, and code quality audit fixes

### Added
- `components/layout/error-boundary.tsx` — React ErrorBoundary class component with "Try again" button
- `app/(app)/error.tsx` — Next.js global client error page for the app route group
- `components/ui/page-skeleton.tsx` — Shared list-page shimmer skeleton
- `app/(app)/*/loading.tsx` — loading.tsx skeleton files for sales, reports, crm, leads, orders, quotes, payments, completed, activity-log, dashboard, admin
- `supabase/migrations/080_restrict_company_settings_rls.sql` — Drop permissive `authenticated_read_company_settings` policy; add public-safe replacement + `get_company_remittance_settings()` security-definer function for bank/remittance fields
- `README.md` — Project setup, stack overview, and links to key docs

### Changed
- `proxy.ts` — Fail closed (503) when `NEXT_PUBLIC_SUPABASE_URL` is missing instead of silently passing all requests through unauthenticated
- `next.config.ts` — Added `compress: true`, `images.formats` (AVIF/WebP), and HTTP security headers (CSP, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy)
- `lib/supabase/admin.ts` — Added `import "server-only"` to prevent accidental client-side imports
- `app/api/auth/change-password/route.ts` — Replace inline `createClient()` with `createAdminClient()` factory
- `app/api/public/quotes/[token]/submit-payment/route.ts` — Added 10 MB file size cap and MIME type allowlist (JPEG, PNG, WebP, PDF) before `arrayBuffer()` call
- `app/api/leads/[id]/activities/route.ts` — Added `canReadLead()` ownership check (IDOR fix)
- `app/api/activities/route.ts` — Added `canReadLead()` and `canAccessTicket()` checks for lead_id and ticket_id params (IDOR fix)
- `app/api/tickets/[id]/pdf/route.ts` — Wrapped `renderToBuffer` in try/catch; returns 500 JSON on failure
- `app/api/public/quotes/[token]/pdf/route.ts` — Same try/catch for `renderToBuffer`
- `app/api/tickets/route.ts` — Awaited `sendQuoteToCustomer` (was fire-and-forget, risked silent drop on Vercel)
- `app/api/admin/team/route.ts`, `admin/sessions/route.ts`, `admin/sessions/health/route.ts` — Replaced `requireSession()` + manual role check with `requireAdmin()` helper
- `app/(app)/layout.tsx` — Wrapped page content in `<ErrorBoundary>`
- `components/leads/leads-page.tsx` — `VerifyDrawer` and `AddLeadModal` converted to `next/dynamic` (deferred bundle)
- `components/sales/sales-page.tsx` — `SalesDrawer` converted to `next/dynamic`
- `components/quotes/quote-detail.tsx` — Added `useEffect` cleanup for `hvTimerRef` setInterval on unmount
- `components/quotes/new-quote-form.tsx` — Same `hvTimerRef` cleanup on unmount
- `app/api/admin/material-groups/route.ts`, `admin/company/route.ts`, `admin/lookups/route.ts`, `admin/materials/route.ts`, `admin/integrations/*/test/route.ts`, `admin/roles/route.ts`, `admin/product-types/route.ts`, `customers/route.ts`, `leads/manual/route.ts` — Added `.catch(() => ({}))` to all bare `request.json()` calls
- `app/api/leads/[id]/hold/route.ts`, `resume/route.ts`, `reassign/route.ts`, `route.ts` — Same JSON parse safety fix
- `app/api/admin/material-groups/[id]/route.ts`, `admin/materials/[id]/route.ts`, `admin/product-types/[id]/route.ts`, `admin/lookups/[id]/route.ts`, `customers/[id]/route.ts`, `customers/[id]/merge/route.ts`, `admin/roles/[id]/permissions/route.ts` — Same fix
- `.env.local.example` — Commented out Stripe env vars and marked as future enhancement

## [2026-05-26] — Quote/order detail: lifecycle timeline under stats row

### Added
- `TicketLifecycleTimeline` — horizontal timeline (desktop) / vertical list (mobile) under Quote/Order Total stats
- Shows **created → payments & milestones → due date** with exact timestamps, actor (staff or Customer), amount, and payment method
- `lib/utils/ticket-lifecycle-timeline.ts` — builds nodes from ticket activities + `created_at` / `due_date`

## [2026-05-26] — Route: Activity Log moves to `/activity-log`

### Changed
- Activity Log page → **`/activity-log`** (was `/notifications`); **`/notifications`** redirects and stays free for future notification bell
- Nav label **Activity Log** + `ClipboardList` icon (replacing "Notifications" + bell)
- `supabase/migrations/079_rename_notifications_nav_activity_log.sql` — updates `pages.route`, display name, and icon
- `app/(app)/activity-log/page.tsx` — main page; `app/(app)/notifications/page.tsx` — legacy redirect
- `docs/navigation.md`, `docs/feature-specs/notifications.md`, and related docs

## [2026-05-26] — Docs: performance Phase 3, customer link, leads loop fix

### Changed
- `docs/architecture.md`, `docs/session-summary.md`, `docs/types.md`, `docs/component-architecture.md`, `docs/feature-specs/tickets.md`, `docs/feature-specs/leads-sdr.md`, `docs/feature-specs/leads-sales.md`, `docs/realtime-live-updates.md`, `docs/FuturePlan/Performance/*`, `.cursor/rules/tab-counts.mdc` — reflect page-data bundling, session cache, coalesced refetch, customer link on in-production/completed, two-button link row layout

## [2026-05-26] — Quote/order detail: customer portal link buttons

### Changed
- `DetailQuickActions` — **Customer Link** (open `/q/{token}`) + **Copy Link** (clipboard) as two 50/50 buttons on their own row below Mark Completed / Resend Link

### Fixed
- Customer Link + Copy Link now visible for `in_production` and `completed` (not only `sent` / `order`)

## [2026-05-26] — Fix: Leads page infinite reload loop

### Fixed
- `hooks/use-coalesced-refresh.ts` — refresh callback stored in ref so effect does not re-fire every render
- `components/leads/leads-page.tsx`, `components/sales/sales-page.tsx` — pass stable `fetchPageData` to coalesced refresh; lookups lazy-load uses loaded ref

## [2026-05-26] — Performance Phase 3: page-data bundling + session cache (TODO-007)

### Added
- Combined **`GET /api/{feature}/page-data`** routes — one auth pass returns list + tab counts in parallel:
  - `/api/production/page-data`, `/api/orders/page-data`, `/api/quotes/page-data`, `/api/payments/page-data`, `/api/completed/page-data`, `/api/leads/workspace/page-data`, `/api/leads/sales/page-data`
- Dedicated slim count routes: `GET /api/orders/counts`, `GET /api/quotes/counts`
- Shared query helpers: `lib/utils/fetch-*-data.ts`, `lib/utils/leads-workspace-query.ts`, `lib/utils/sidebar-counts-query.ts`
- `lib/auth/session-cache.ts` — 3 s in-process memoization for `requireSession()` during burst loads
- `hooks/use-coalesced-refresh.ts` — debounced mount + realtime refetch (Strict Mode safe)

### Changed
- All tabbed list pages use **one `page-data` request** on load instead of separate list + counts calls
- Coalesced refetch on Production, Orders, Quotes, Payments, Completed, Leads, Sales
- Leads/Sales: lookups + admin user lists **lazy-load** when modal/drawer opens (not on page mount)
- `GET /api/sidebar-counts?routes=…` — counts only for visible nav routes; existing list/count routes kept for compatibility
- Existing list/count route handlers delegate to shared query helpers (DRY)

## [2026-05-26] — Docs: follow-up cron status (Hobby / pending Pro)

### Changed
- `docs/cron-follow-ups.md`, `docs/TODO.md`, `docs/session-summary.md`, `docs/api-contract.md`, `docs/feature-specs/tickets.md`, `docs/types.md` — cron **code is built**; **automatic schedule not active** on Vercel Hobby (free); manual `curl` workaround documented
- `.env.local.example`, `app/api/cron/follow-ups/route.ts` — comments clarify Hobby vs Pro behaviour

## [2026-05-26] — Quote follow-up reminder cron (TODO-006) — code only

### Added
- `GET /api/cron/follow-ups` — endpoint to process due quote reminders via Instantly/Twilio (manual or Vercel Cron)
- `lib/utils/follow-up-schedule.ts`, `lib/utils/process-due-follow-ups.ts`, `lib/utils/initialize-ticket-follow-up.ts`
- `lib/integrations/quote-follow-up-template.ts`, `sendQuoteFollowUpReminder()` in `send-quote.ts`
- `docs/cron-follow-ups.md` — setup guide for Vercel + local testing
- `vercel.json` — daily schedule `0 14 * * *` (2pm UTC) — **runs only on Vercel Pro**
- `CRON_SECRET` in `.env.local.example`

### Changed
- `POST /api/tickets` and `PATCH /api/tickets/[id]` — when quote is sent with follow-ups enabled, seed `follow_up_at` + cycle count

### Note
- Production on **Vercel Hobby**: cron does not auto-fire; use manual trigger until Pro upgrade (see `docs/cron-follow-ups.md`)

## [2026-05-26] — Docs: form validation UX + scheme-less website URLs

### Changed
- `docs/types.md`, `docs/api-contract.md`, `docs/architecture.md`, `docs/schema.md`, `docs/mvp-scope.md`, `docs/TODO.md`, `docs/session-summary.md`, `docs/component-architecture.md` — website validation (scheme optional), scroll-to-field helpers, API coverage for `POST /api/customers` and `POST /api/tickets`
- `docs/feature-specs/leads-sdr.md` — Add Lead per-field validation + scroll behaviour; `AddLeadModal` build status
- `docs/feature-specs/crm.md` — Edit Customer validation UX
- `docs/feature-specs/tickets.md` — New Quote tab validation scroll behaviour

## [2026-05-26] — Validation: scroll invalid fields into view

### Added
- `lib/utils/scroll-field-into-view.ts` — scroll `[data-field-anchor]` wrappers into view and focus the control on validation failure

### Changed
- Add Lead modal, Verify drawer, Edit Customer, New Quote — invalid fields are highlighted and scrolled into view when off-screen

## [2026-05-26] — Add Lead: highlight missing required fields

### Changed
- Add Lead modal — Source, Industry, and First Name show inline error + red border on the missing field instead of a generic message at the bottom

## [2026-05-26] — Website / Social: scheme-less URLs allowed everywhere

### Changed
- `lib/utils/website.ts` — shared `WEBSITE_FIELD_PLACEHOLDER`; error copy no longer implies `https://` is required
- Add Lead, Verify drawer, Edit Customer, New Quote — `type="text"` inputs; placeholders show `example.com or instagram.com/page`
- Edit Customer modal — client-side `validateWebsite()` + `normalizeWebsite()` on save
- `POST /api/customers`, `POST /api/tickets` — validate and normalize optional website before save

### Fixed
- Add Lead modal — removed HTML5 `type="url"` / browser validation that rejected URLs without `http://` or `https://`

## [2026-05-26] — Directed to Sales: working stage sub-filters

### Changed
- Sub-filter pills (Awaiting Claim, In Progress, Quote Sent, On Hold, Dropped) use ticket-aware stage logic aligned with **Stage** badges; all pills always visible
- **Quote Sent** includes sent quotes and waiting-for-customer confirm (linked ticket `sent`)

## [2026-05-26] — Directed to Sales: ticket-aware Lead Status column

### Added
- `lib/utils/lead-routed-ticket-status.ts` — order ref / quote ref / Waiting for Customer / lead status fallback

### Changed
- Directed to Sales **Lead Status** column — shows `ORD-…` when an order exists, `QUO-…` for quotes, **Waiting for Customer** when quote is sent and unconfirmed, else lead status pill
- `GET /api/leads/workspace?routed=true` — embeds linked `job_tickets` on each lead

## [2026-05-26] — Customer profile: SDR Add Lead with prefill

### Added
- `components/leads/add-lead-modal.tsx` — shared Add Lead modal (extracted from leads page)
- Customer profile **Add Lead** button (SDR only) — opens modal with customer name, phone, email, company, industry, website, and authority pre-filled; **Returning Customer** checked; customer link locked

### Changed
- `components/leads/leads-page.tsx` — imports shared `AddLeadModal`

## [2026-05-26] — Leads → customer profile Back navigation

### Added
- `lib/utils/leads-return-path.ts` — `/leads?tab=…` return paths + URL tab parsing
- `lib/utils/customer-profile-href.ts` — `?from=` on customer links; Back label resolves to Leads / Reports / CRM

### Changed
- SDR Won lead click → `/crm/customers/[id]?from=/leads?tab=won` (preserves originating tab)
- Customer profile Back → **Back to Leads** when opened from Leads; returns to the same tab
- Leads page reads `?tab=` from URL and syncs tab selection (Suspense wrapper on `/leads`)

## [2026-05-26] — Leads Directed to Sales: full routed history + stage filters

### Added
- `lib/utils/lead-routed-to-sales-query.ts` — resolve leads by `lead_routed_to_sales` activity
- `lib/utils/lead-routed-pipeline-stage.ts` — stage badges + sub-filter matching (Awaiting Claim, In Progress, Quote Sent, On Hold, Dropped, Won, Rejected)

### Changed
- **Directed to Sales** tab — shows **all** leads the SDR routed to Sales (including Won, Rejected, Dropped), not only unclaimed / in-flight statuses
- `GET /api/leads/workspace?routed=true` — activity-based list; replaces `statuses=Routed+to+Sales,Quoted,Validated`
- `GET /api/leads/workspace/counts` — routed count uses same activity rule
- Sub-filter pills on Directed to Sales tab filter by pipeline **stage**; table adds **Stage** badge column

## [2026-05-26] — Sales dashboard: date filters + expanded KPIs

### Added
- Sales dashboard — same date presets as SDR (Today, Yesterday, Last Week, Last Month, Custom) with period-over-period %
- KPIs: Order Value (first), Lead Claimed, Lead Created (quotes), Order Created, Inbox, Rejected, On Hold
- `lib/utils/sales-dashboard-metrics.ts`

### Changed
- `GET /api/dashboard/kpis` — Sales branch uses `sales_preset` / custom dates (replaces week/month/quarter for Sales)
- `components/sales/sales-dashboard.tsx` — new filter bar + KPI grid

### Removed
- Sales dashboard cards: Cash Collected, New in Pipeline, Active Deals, Won, Pipeline Value (Admin dashboard unchanged)

## [2026-05-26] — SDR dashboard: Order Value first

### Changed
- SDR dashboard KPI grid — **Order Value** is the first (accent) card

## [2026-05-26] — SDR dashboard: date filters + expanded KPIs

### Added
- SDR dashboard presets: **Today**, **Yesterday**, **Last Week**, **Last Month**, **Custom** (with period-over-period % on trend metrics)
- KPIs: Lead Claimed, Lead Created, Order Value, Order Created, Inbox (live), Rejected, On Hold, Routed to Sales, Sales Win
- `lib/utils/sdr-dashboard-date-range.ts`, `lib/utils/sdr-dashboard-metrics.ts` — SDR-only dashboard metrics (routed-to-Sales attribution for orders/wins)

### Changed
- `GET /api/dashboard/kpis` — SDR branch uses `sdr_preset` / `date_from` + `date_to` (replaces week/month/quarter for SDR)
- `components/sales/sdr-dashboard.tsx` — new filter bar + KPI grid

### Removed
- SDR dashboard cards: Sourced Cash, Handled, Quote Value, My Share (Sales/Admin dashboards unchanged)

## [2026-05-26] — Leads Won tab: routed to Sales + production Won

### Changed
- SDR **Won** tab (`GET /api/leads/workspace?won=true`) — only leads with `lead_routed_to_sales` activity **and** `sales_status = Won` (global Won on production release unchanged)
- `lib/utils/lead-sdr-won-filter.ts` — shared filter for list + tab count
- Empty state copy on Won tab updated

## [2026-05-26] — Quote/order overview: Product Interests from linked lead

### Changed
- `LinkedLeadCard` (quote + order overview sidebar) — **Product Interests** section with `ProductName[quantity]` pills when the ticket has a linked lead
- `GET /api/tickets/[id]` — lead join includes `quantities` for interest formatting
- `lib/utils/format-lead-product-interests.ts` — `listLeadProductInterestLabels()` helper

## [2026-05-26] — Documentation sync (full pass)

### Changed
- `navigation.md` — `/crm` list columns + `/reports` section; cross-section Back note
- `session-summary.md` — migration `078_backfill_staff_cash_payment_recorded`
- `TODO.md` — May 26 completed items (leads UX, Reports, CRM)
- `api-contract.md`, `feature-specs/activity.md`, `feature-specs/invoice-payment.md`, `feature-specs/dashboard.md` — `ticket_payment_recorded` vs evidence-submitted contract for cash collected
- `architecture.md` — migration list includes cash backfill

## [2026-05-26] — Documentation sync (Reports + CRM)

### Changed
- `session-summary.md`, `feature-specs/reports.md`, `feature-specs/crm.md`, `component-architecture.md`, `navigation.md`, `types.md` — Reports (cash logging, scorecards display-only, lifecycle links, `?from=/reports` Back) and CRM list (Industry column, company/phone/email actions)

## [2026-05-26] — CRM list: Industry column replaces Heat

### Changed
- CRM customer table — **Industry** column shows lookup label; company name (or **—**) opens profile; phone `tel:` / email `mailto:` links; row click does not navigate

## [2026-05-26] — Reports → order detail: Back returns to Reports

### Added
- `?from=/reports` on Awaiting Collection + Payment Ledger ticket links
- `resolveTicketDetailBackPath()` — Back uses validated `from` param, else lifecycle list fallback

### Changed
- `QuoteDetail` Back button — returns to Reports when opened from Reports; unchanged when opened from Orders/Quotes lists

## [2026-05-26] — Reports: order links use lifecycle routes

### Fixed
- Awaiting Collection + Payment Ledger on `/reports` — external link now opens `/orders/[id]` (or `/quotes/` / `/completed/` by status) instead of `/payments/[id]` (accountant review queue only)
- `lib/utils/ticket-detail-href.ts` — shared lifecycle route helper

## [2026-05-26] — Reports scorecards display-only

### Changed
- Sales / SDR rep scorecard tables on `/reports` — rows no longer click-to-filter (informational only); use the team member dropdown to drill down

## [2026-05-26] — Reports: staff cash deposits count toward cash collected

### Fixed
- Staff **Cash / offline** auto-recorded deposits (receipt ID on save) now log `ticket_payment_recorded` instead of `ticket_payment_evidence_submitted` — Reports scorecards, Payment Ledger, and dashboard **Cash Collected** include these payments (e.g. ORD-2026-002 partial deposits)
- `supabase/migrations/078_backfill_staff_cash_payment_recorded.sql` — backfills missing `ticket_payment_recorded` rows for existing auto-cash deposits (run on live DB)

### Added
- `lib/utils/log-ticket-payment-recorded.ts` — single helper for confirmed payment activities
- `lib/utils/maybe-auto-record-cash-payment.ts` — shared cash auto-record (was duplicated in ticket routes)

### Changed
- `app/api/tickets/route.ts`, `app/api/tickets/[id]/route.ts` — use shared payment logging; accountant `record_payment` uses same helper
- `docs/feature-specs/reports.md` — documents activity-type contract for cash collected

## [2026-05-26] — Documentation sync (leads UX)

### Changed
- Docs synced for May 26 leads UX: `session-summary.md`, `feature-specs/leads-sdr.md`, `feature-specs/leads-sales.md`, `feature-specs/crm.md`, `component-architecture.md`, `navigation.md`, `api-contract.md`, `mvp-scope.md`, `architecture.md`, `order-ticket/integration-plan.md`, `types.md`, `schema.md`, `supabase/README.md`

## [2026-05-26] — Website / Social URL validation on leads

### Added
- `lib/utils/website.ts` — `validateWebsite()` and `normalizeWebsite()` for optional website/social URLs

### Changed
- Add Lead modal and verify drawer — validate Website / Social on blur and save; inline error; auto-prefix `https://` when omitted
- `POST /api/leads/manual` and `PATCH /api/customers/[id]` — server-side website validation

## [2026-05-26] — Leads table: Product Interests with quantity

### Changed
- All Leads table — Product Interests column shows `ProductName[quantity]` (e.g. `Booklets[1111]`) from `interests` + `quantities`
- Sales Pipeline (`/sales`) — Product Interests column on Pipeline, On Hold, and Rejected tabs (desktop + mobile)
- Leads **Directed to Sales** tab — Product Interests column (desktop + mobile)
- Leads **On Hold**, **Rejected**, and **Won** tabs — Product Interests column (desktop + mobile; Won via `LeadHistoryTable`)
- `GET /api/leads/workspace` — includes `quantities` in list select
- `lib/utils/format-lead-product-interests.ts` — shared formatter for lead product rows

## [2026-05-26] — Remove Initial Interest field; use Product Interests only

### Removed
- `leads.initial_interest` column — redundant free-text field; product catalog interests (`interests` jsonb) is the source of truth
- Initial Interest input from verify drawer; API accepts no longer on manual lead create

### Changed
- All Leads table — "Products" column shows selected product interests instead of Initial Interest
- `components/ui/linked-lead-card.tsx` — product interest tags only (no initial_interest tag)
- `supabase/migrations/077_drop_initial_interest.sql` — drops column on existing databases

## [2026-05-24] — Pre-push doc sync

### Changed
- `docs/security.md` — RLS policy changes via `schema.sql`, not deleted migration folder
- `docs/architecture.md`, `docs/component-architecture.md`, `docs/navigation.md`, `docs/session-summary.md` — live `/reports` and integrations wording (Stripe/Zelle out of scope)
- `docs/feature-specs/admin.md`, `docs/email-template-guide.md` — welcome/password-reset templates; admin integrations note
- `docs/schema.md`, `docs/order-ticket/README.md` — historical migration refs vs canonical `schema.sql`

## [2026-05-24] — Owner decision review document (HTML)

### Added
- `docs/order-ticket/owner-decisions-pending.html` — printable HTML for owner sign-off on B6 (quote email vs portal) and B7 (complete with balance due)

### Changed
- `docs/TODO.md`, `docs/order-ticket/open-questions.md` — link to owner review doc

## [2026-05-24] — Welcome / password-reset email design alignment

### Changed
- `lib/integrations/welcome-email-template.ts` — matches quote/order email layout: headline, reference card + badge, amber temp-password row, table-based warning, gold CTA, navy footer (welcome + admin password reset variants)
- `app/api/dev/quote-email-preview/route.ts` — `?template=welcome` and `?template=password-reset` previews (dev only)

## [2026-05-24] — Refresh TODO tracker

### Changed
- `docs/TODO.md` — rewritten: open items only at top; removed stale archived specs for completed work; Reports Phase 1+2 marked done; online payment phases marked out of scope for current stage

## [2026-05-24] — Consolidate Supabase schema into single file

### Changed
- `supabase/schema.sql` — expanded to full current production state (through MFA trusted devices, payment columns, accountant role, quote sequences, etc.)
- Removed 79 numbered files under `supabase/migrations/` — `schema.sql` is now the canonical DDL source
- `supabase/README.md` — how to run schema on fresh projects + `npm run reset-test-data` for local wipes
- `docs/schema.md`, `docs/architecture.md` — document single-file setup instead of migration folder

## [2026-05-24] — API security hardening

### Fixed
- Unauthenticated access to admin catalog/lookup routes — all `/api/admin/{company,lookups,materials,material-groups,product-types}` handlers now require login; mutating routes require admin role
- `GET /api/admin/company` — non-admin users receive only safe fields (tax rate, thresholds, idle timeout); bank/payment details admin-only
- MFA bypass via direct API calls — `requireSession()` and `requireAdmin()` now enforce AAL2 (or valid trusted-device cookie), matching `proxy.ts`
- `GET /api/lookups/products` — requires authenticated session (was open to the internet)
- `GET /api/dev/quote-email-preview` — returns 404 in production
- `GET /api/tickets/[id]/pdf` and `/print` — require MFA-complete session and ticket ownership (was any logged-in user + any ticket ID)
- `POST /api/customers/[id]/merge` — restricted to admin and sales roles (was any logged-in user; deletes a customer record)
- `POST /api/auth/session` end action — rejects spoofed `user_id` when it does not match the session cookie

### Changed
- `lib/auth/require-admin.ts` — builds on `requireSession()` instead of duplicating auth logic
- `lib/auth/mfa-trust.ts` — shared `hasValidMfaTrustFromCookieValue()` for API + proxy
- `lib/utils/ticket-access.ts` — shared ticket read/write access checks for ticket routes, PDF, and print
- `.env.local.example` — removed accidentally committed Stripe key placeholders

### Added
- `docs/security.md` — auth model, browser storage, API vs RLS, Supabase dashboard notes

### Changed (docs)
- `docs/api-contract.md` — auth helpers, MFA error codes, company field scoping, merge/PDF/session/mfa-trust endpoints
- `docs/architecture.md` — auth file tree, proxy vs API auth, link to security doc
- `docs/rbac.md` — API MFA note, merge roles, company/product-types matrix, `mfa_trusted_devices`
- `docs/schema.md` — `company_settings` API vs RLS, `mfa_trusted_devices` table
- `docs/session-summary.md`, `docs/feature-specs/admin.md` — security hardening summary
- `docs/feature-specs/crm.md`, `docs/feature-specs/tickets.md`, `docs/component-architecture.md` — merge roles, PDF/print auth, product lookup auth
- `docs/types.md` — MFA / auth error codes
- `docs/order-ticket/product-catalog.md`, `docs/order-ticket/integration-plan.md` — `GET /api/lookups/products` requires staff session

## [2026-05-24] — Documentation sync (dashboard & reports)

### Changed
- `docs/feature-specs/dashboard.md` — Cash Collected, Team work metrics, removed obsolete SDR table / lead sources sections
- `docs/feature-specs/reports.md` — Released Order Value, awaiting collection, metric glossary
- `docs/api-contract.md` — current KPI shapes; `/api/admin/team` and `/api/reports/summary`
- `docs/types.md`, `docs/session-summary.md`, `docs/feature-specs/invoice-payment.md` — aligned with May 2026 KPI work

### Fixed
- Reports **Awaiting Collection** KPI — surface background with amber border (was solid warning fill); help text uses normal muted color for readability

### Changed
- Admin **Team** roster order: SDR → Sales → Accountant (then alphabetical by name within each role)

## [2026-05-24] — Team cards show per-user dashboard metrics

### Added
- `lib/utils/team-dashboard-metrics.ts` — per-user cash, released value, balance due, pipeline, and SDR activity for admin Team cards
- **Team** cards: second row after sessions — **Sales** (Collected · Released · Balance due) · **SDR** (Handled · Routed · Sourced)

### Removed
- Admin dashboard **SDR Performance** table, **Lead Sources**, and **Rejection Reasons** sections (consolidated into Team + Reports)

### Changed
- Admin dashboard: **Pipeline Value** moved next to **Cash Collected** (top row money metrics)

## [2026-05-24] — KPI help text on dashboards and Reports

### Changed
- Admin dashboard: **Pipeline Value** moved next to **Cash Collected** (top row money metrics)

### Added
- `lib/utils/kpi-help-text.ts` — shared one-line explanations for how each KPI is calculated
- `components/ui/kpi-help-line.tsx` — help text under KPI card values
- Admin, Sales, SDR dashboards, and Reports KPI cards show calculation hints below each number

## [2026-05-24] — Money metrics consolidated on Reports

### Added
- Reports **Released Order Value** KPI — quote totals for orders released to production in the selected period (with order count)

### Changed
- Admin dashboard: removed **Released Order Value** card; cash KPI points to Reports for order value and balances
- Reports KPI row now groups **Cash Collected**, **Released Order Value**, and **Awaiting Collection** with clearer sublabels

## [2026-05-24] — Reports cash KPI shows cents

### Changed
- Reports **Total Cash Collected** (and filtered rep **Cash Collected**) use full currency format with two decimal places (e.g. `$837.00`)

### Fixed
- Reports cash totals used 1-decimal rounding (`$836.60`) while dashboard used cents (`$836.56`) — both now use shared `roundMoney()` (2 decimal places)

## [2026-05-24] — Dashboard KPI alignment with Reports

### Added
- `lib/utils/dashboard-metrics.ts` — shared cash collected + production release value helpers (same logic as Reports)
- Admin dashboard **Cash Collected** card (matches Reports)
- Sales dashboard **Cash Collected** card (rep-attributed payments)
- SDR dashboard **Sourced Cash** card (SDR-attributed payments)

### Changed
- `GET /api/dashboard/kpis` — money metrics use recorded payments and `production_released_at` (not ticket `created_at`)
- Admin: **Total Revenue** renamed to **Released Order Value**; primary accent card is **Cash Collected**
- Sales: **Won Value** renamed to **Released Order Value**; **Cash Collected** is primary money metric
- Won counts filter by production release date in the selected period
- Shared period bounds via `getDashboardPeriodBounds()` (start → end of today, same as Reports presets)

### Fixed
- Reports team member filter dropdown — empty `()` after names when Supabase returned `roles` as an array

### Changed
- Reports time/date filters moved into a **Report filters** modal (button in header); team member dropdown stays inline
- `components/reports/reports-filters-modal.tsx` — extensible modal for future filter types

### Changed
- Reports filter modal uses shared `DatePicker` (react-day-picker) instead of native browser date inputs
- `DatePicker` — optional `inModal` prop for correct z-index inside dialogs

### Changed
- Reports filter modal — preset buttons (Week / Month / Quarter) now update From/To dates immediately

## [2026-05-24] — Reports custom date range + reset filters

### Added
- Custom **From / To** date pickers with **Apply range** on Reports page
- **Reset filters** button — clears dates, member filter, returns to This Month
- `lib/utils/reports-date-range.ts` — shared date range resolution for API + UI

### Changed
- `GET /api/reports/summary` accepts `date_from` & `date_to` (YYYY-MM-DD) in addition to week/month/quarter presets
- All period-scoped queries now use start **and** end of range (custom ranges fully bounded)
- Info banner shows selected range and whether filtering whole team or one member

## [2026-05-24] — Orders list: Received and Balance Due columns

### Changed
- `components/orders/orders-page.tsx` — desktop table and mobile cards show Total, Received, and Balance Due (`—` when no order total or no payment recorded)

## [2026-05-24] — Reports awaiting collection (outstanding balances)

### Added
- `awaiting_collection` in reports API — live snapshot of balance still due on open orders
- `lib/utils/reports-awaiting-collection.ts`, `components/reports/awaiting-collection-section.tsx`
- KPI card and breakdown by order status (quote sent, in production, completed, etc.)

### Changed
- Reports KPI row includes **Awaiting Collection** alongside cash collected
- Rep filter applies to outstanding balances on their attributed orders

## [2026-05-24] — Reports Phase 2 (rep scorecards + payment ledger)

### Added
- Sales rep cash scorecard — payments attributed to sales owner / quote creator
- SDR sourced-cash scorecard — payments on routed leads + leads routed count
- Expandable payment ledger with per-order payment line items and link to `/payments/[id]`
- Team member filter (`user_id` query param) for bonus review
- `lib/utils/reports-attribution.ts`, `lib/utils/reports-period-bucket.ts`
- `components/reports/rep-scorecard-table.tsx`, `components/reports/payment-ledger-section.tsx`

### Changed
- `GET /api/reports/summary` — rep scorecards, payment ledger, team filter
- `components/reports/reports-page.tsx` — redesigned layout with KPI cards, team tables, ledger, company overview
- `docs/feature-specs/reports.md` — Phase 2 rep attribution documented

## [2026-05-24] — Reports page Phase 1 (offline cash + funnel)

### Added
- `GET /api/reports/summary` — admin-only reports API (cash collected, win rate, quote funnel)
- `lib/utils/get-period-start.ts` — shared period helper
- `docs/feature-specs/reports.md` — reports spec

### Changed
- `components/reports/reports-page.tsx` — live reports with period selector; cash by method, funnel, win rate (replaces Stripe placeholder)
- Admin-only access message for non-admin roles

## [2026-05-24] — Remove Stripe/Zelle from admin Integrations tab

### Removed
- Admin → Settings → Integrations: Stripe and Zelle “Coming soon” cards (no API integration planned for now)

### Changed
- `components/admin/integrations-section.tsx` — shows Twilio and Instantly only

## [2026-05-24] — Remember device for 30 days (skip 2FA)

### Added
- Login page **Remember this device for 30 days** checkbox — after one successful 2FA verify, skips authenticator on that browser for 30 days
- `mfa_trusted_devices` table + `supabase/migrations/081_mfa_trusted_devices.sql`
- `lib/auth/mfa-trust.ts`, `lib/auth/remember-mfa-client.ts`, `POST/DELETE /api/auth/mfa-trust`

### Changed
- `proxy.ts` — honors trusted-device cookie before redirecting to `/verify-2fa`
- `verify-2fa`, `setup-2fa` — create trust cookie when remember option was checked at login
- Sidebar + mobile nav sign out — revokes trusted device for the browser

## [2026-05-24] — Admin per-user 2FA toggle

### Fixed
- `supabase/migrations/080_user_mfa_required.sql` — `DROP VIEW` before recreate (Postgres rejects mid-list column insert on `CREATE OR REPLACE VIEW`)

### Added
- `user_profiles.mfa_required` — admin can require or skip TOTP per user (default `true`)
- `supabase/migrations/080_user_mfa_required.sql`
- `lib/auth/mfa-required.ts` — shared MFA requirement helper
- Admin → Users: **2FA** column with confirmation dialog before enabling/disabling

### Changed
- `proxy.ts` — skips `/setup-2fa` and `/verify-2fa` when `mfa_required = false`; single profile fetch per request
- `app/api/admin/users/[id]/route.ts` — PATCH accepts `mfa_required`; blocks admin from disabling own 2FA
- `app/(auth)/setup-2fa/page.tsx`, `app/(auth)/verify-2fa/page.tsx` — redirect away when 2FA not required
- `docs/rbac.md`, `supabase/schema.sql` — document new column

## [2026-05-24] — Offline card payment integration plan

### Added
- `docs/feature-specs/offline-card-payment.md` — planned merchant-terminal card flow (PCI rules, PDF/online authorization, `/payments` queue, staff workflow)

### Changed
- `docs/feature-specs/invoice-payment.md` — Phase C-alt row linking to offline card payment spec

## [2026-05-24] — Documentation sync (mobile UX, detail actions, loading)

### Changed
- `docs/component-architecture.md` — mobile list cards, global loading, overview layout, `DetailQuickActions` sidebar actions
- `docs/feature-specs/tickets.md` — quote detail layout, action placement, mobile stats, loading overlay, customer lookup labels
- `docs/session-summary.md` — May 24 UI polish section
- `docs/architecture.md` — `GlobalLoadingProvider`, `mobile-list-card` in component tree
- `docs/crm-logic-overview.html` — mobile detail + list UX summary

## [2026-05-24] — Global loading overlay for slow saves

### Added
- `components/layout/global-loading-provider.tsx` — app-wide loading overlay with `useGlobalLoading()` (`showLoading`, `hideLoading`, `runWithLoading`) and preset messages in `GLOBAL_LOADING_MESSAGES`

### Changed
- Root layout wraps app in `GlobalLoadingProvider`
- Customer info card on quote/order detail — industry and quote source show lookup labels (e.g. “Retail Apparel”, “Walk-in”) instead of raw values like `retail_apparel` / `walk_in`
- Quote detail — Cancel Ticket, Send/Resend Quote, and Convert to Order moved under the customer info card in `DetailQuickActions` (same stack as Customer Link, Mark Completed, etc.); removed duplicate bottom action bar
- **New quote** — Save Draft / Save & Send Quote show full-screen loading with contextual message
- **Quote detail** — save, send, convert, complete, and release-to-production actions show loading overlay
- **Payments** — Confirm payment shows loading overlay

## [2026-05-24] — Fix order detail scroll trap (double scroll)

### Fixed
- `MobileListCard` — use a clickable `div` instead of `button` so nested action buttons (View, Confirm, etc.) no longer cause hydration errors
- Quote/order detail overview — inner panel scroll scoped to `xl+` only; mobile/tablet use single page scroll so you can scroll back up after reaching the bottom
- Removed `overscroll-contain` that blocked scroll chaining between nested panels
- Horizontal badge/stats rows use `touch-pan-x` so sideways swipe does not steal vertical scroll on touch devices

### Changed
- Order detail stats row on mobile — full-width Order Total, then 2×2 grid for Received, Balance Due, Due Date, and Payment

## [2026-05-24] — Mobile card layout for ticket list pages

### Added
- `components/ui/mobile-list-card.tsx` — shared `MobileListCard`, skeleton/empty states, and `TicketListToolbar` (scrollable tabs + full-width search)

### Changed
- **Quotes, Orders, In Production, Completed, Payments** list pages — tables hidden below `lg`; each row renders as a stacked card on mobile (no horizontal scroll)
- `.cursor/rules/mobile-table-cards.mdc` — breakpoint aligned to `lg` (matches leads/sales and MobileNav)

## [2026-05-24] — Quote & order detail redesign

### Changed
- Quote/order detail **mobile layout** — two-row header with swipeable status badges; full-width total stat + horizontal stats scroll; side-by-side action buttons; tighter padding; line items stack price below specs on small screens
- `components/quotes/quote-detail.tsx` — overview layout: stats + customer/actions stay fixed on desktop; only the Overview/History panel scrolls
- `components/quotes/quote-detail/detail-layout-primitives.tsx`, `ticket-stats-row.tsx`, `detail-quick-actions.tsx` — shared redesign building blocks
- `components/ui/linked-lead-card.tsx`, `customer-info-card.tsx` — avatar, tags, production strip
- `components/quotes/quote-detail/ticket-overview-sections.tsx`, `order-payment-summary.tsx`, `line-items-form.tsx` — section titles, pricing table, data grids, spec-pill line items
- `components/quotes/quote-detail/quote-stage-overview.tsx`, `production-detail-overview.tsx` — slim contextual notices (stats/actions moved out)
- `components/quotes/quote-detail/ticket-skeleton.tsx` — loading state matches new layout

## [2026-05-24] — Lifecycle flow diagram (lead → production)

### Added
- `docs/order-ticket/lifecycle-flow.md` — mermaid + ASCII flowcharts for quote-until-payment, confirm gate, payments queue, order conversion, production release, and Won timing
- `docs/order-ticket/lifecycle-flow.html` — browser-rendered version with all mermaid diagrams, tables, and ASCII reference (matches `lifecycle-flow.md`)

## [2026-05-24] — Fix production TypeScript build

### Fixed
- `app/api/tickets/route.ts` — quote list query result typed for dynamic Supabase select string
- `lib/utils/lookups.ts` — `lookupLabel` accepts `{ value, label }` options (fixes customer profile industry display)

## [2026-05-24] — Documentation sync (quote-until-payment + balance flow)

### Changed
- `docs/feature-specs/invoice-payment.md`, `docs/feature-specs/tickets.md`, `docs/api-contract.md` — quote-until-payment, balance on public link, admin-only convert, orders list status, public confirm UX
- `docs/session-summary.md`, `docs/component-architecture.md`, `docs/navigation.md`, `docs/architecture.md`, `docs/crm-logic-overview.html` — aligned with May 23–24 workflow changes

## [2026-05-23] — Public quote page: price confirmation display fix

### Fixed
- **Public quote link** (`/q/[token]`) — Step 1 title no longer always reads **Quote price confirmed** when confirmation is still pending; shows **Confirm quote price** until the customer accepts
- Step 1 subtitle distinguishes **Not required** / **Confirmed** / **Customer must confirm the quote** (not lumped together)
- Payment summary **Price confirmation** row shows **Required — pending** vs **Confirmed** vs **Not required**

## [2026-05-23] — Balance payment validation UX + completion flow polish

### Changed
- **Orders list** — in-production orders with pending balance payment evidence show **Awaiting payment confirmation** (same as deposit flow); row stays on Orders, appears in Payments queue for accountant review
- **Public quote link** — balance submission while in production shows **Balance payment under review** copy; Step 3 shows review / paid-in-full states; polling updates when accountant confirms
- **Payment confirmed email/SMS** — when balance is confirmed on an already in-production order, messaging says **paid in full** (not “now in production”)
- **Mark Completed** — pickup email on complete still uses same `/q/{token}` URL (unchanged)

### Added
- **TODO-009** / open-questions **B7** — owner question: intended flow when admin marks completed with balance still due

## [2026-05-23] — Balance payments on public link + admin complete guard

### Changed
- **Public quote link** (`/q/[token]`) — in-production orders with remaining balance show **Pay remaining balance** under the **In production** checklist step (same pay modal as balance due)
- **`POST /api/public/quotes/[token]/submit-payment`** — balance/cash payments no longer overwrite deposit amount; follow-up payments allowed on `order` and `in_production`
- **Mark Completed** — accountants blocked when balance due (unchanged); **admin** must confirm via modal when completing with outstanding balance; API requires `acknowledge_outstanding_balance: true`

## [2026-05-23] — Quote stays quote until payment

### Added
- `lib/utils/maybe-convert-quote-to-order.ts` — central order conversion gate (payment recorded, net terms on confirm, or admin override)
- `lib/utils/quote-list-status.ts` — quote list badges: **Confirmed — awaiting deposit**, **Awaiting payment confirmation**

### Changed
- **Public confirm** — sets `client_confirmed` only; quote remains on `/quotes` until payment (net terms still convert + auto-release on confirm)
- **Public payment submit** — wire/ACH evidence keeps ticket as quote; cash + receipt records deposit then converts; confirm required before pay
- **Accountant `record_payment`** — converts quote → order then releases to production when gates pass
- **Payments queue** — includes `sent` quotes with pending evidence (not only orders)
- **Admin manual convert** — highlighted banner and status pill with admin name + missing customer confirm and/or missing payment
- `lib/utils/manual-convert-meta.ts`, `lib/utils/order-list-status.ts` — admin override labels on orders list and detail

## [2026-05-23] — Quoted Requests Due Now column

### Added
- **Quoted Requests** (`/quotes`) — **Due Now** column shows partial deposit amount when configured; `—` when full payment, net terms, or no payment strategy selected
- `lib/utils/quote-list-due-now.ts` — shared list display helper

### Changed
- `lib/utils/ticket-list-select.ts` — quote list select includes payment strategy / deposit fields
- `app/api/tickets/route.ts` — uses shared `TICKET_QUOTE_LIST_SELECT` (removed duplicate inline select)

## [2026-05-23] — Orders page default tab is All

### Changed
- `/orders` — default tab changed from **Pending Payment** to **All** (no `?tab=` in URL)

## [2026-05-23] — Admin-only convert to order with confirmation modal

### Changed
- **Convert to Order** — only **admin** can manually convert (SDR/Sales button hidden; API returns 403)
- Admin convert shows confirmation modal listing missing send fields, missing customer confirmation, and whether production may auto-release
- Orders list + order detail — **Admin converted — customer confirm missing** when admin converted while `ticket_require_client_confirm` was on and customer never confirmed
- `ticket_converted` activity payload records `require_client_confirm`, `client_confirmed`, and `converted_by_role`

### Added
- `lib/utils/admin-convert-preview.ts`, `lib/utils/manual-convert-meta.ts`

## [2026-05-23] — Owner question: sent-quote email vs portal mismatch

### Added
- `docs/TODO.md` — **TODO-008** (owner decision): quote email snapshot vs live `/q/{token}` after post-send edits; options: link-only email, resend prompt, lock after send
- `docs/order-ticket/open-questions.md` — **B6** cross-reference

## [2026-05-23] — Documentation sync with May 23 workflow changes

### Changed
- `docs/navigation.md`, `docs/api-contract.md`, `docs/rbac.md`, `docs/component-architecture.md`, `docs/feature-specs/*` — mirror production merge into `/orders`, SDR Won → customer profile, shared `LeadHistoryTable`, order list status labels, payment review UX, activity log Quote/Order column, and `GET /api/activities` reference-code resolution

## [2026-05-23] — Activity log shows quote/order reference

### Changed
- Admin **Activity Log** — lead-only events show last 8 chars of lead UUID when no quote/order ref; ticket events still show `QUO-…` / `ORD-…` or ticket UUID suffix

### Changed
- Admin **Activity Log** (`/notifications` → Order / Lead Activity) — new **Quote / Order** column with `QUO-…` / `ORD-…` from linked ticket or payload; falls back to last 8 chars of ticket UUID
- `GET /api/admin/activity-log` — enriches rows with `ticket_ref`; expanded action labels for ticket events

## [2026-05-23] — Order history tab with ORD reference URLs

### Fixed
- `GET /api/activities?ticket_id=ORD-…` — resolves reference codes to ticket UUID (same as `/api/tickets/[id]`); History tab was empty despite activities in the DB

## [2026-05-23] — Lead History drops SDR Status column

### Changed
- `LeadHistoryTable` — removed **SDR Status** (stale `Quoted` after production); **Status** column shows `sales_status` only (Won, Quote Sent, etc.)

## [2026-05-23] — Customer lead history shows order refs for SDR

### Fixed
- Customer profile **Lead History** — quote/order refs loaded via nested `job_tickets` on `GET /api/customers/[id]` (same as Won tab); no longer depends on scoped `/api/tickets` list, which hid sales-owned orders from SDRs

## [2026-05-23] — Shared LeadHistoryTable component

### Added
- `components/leads/lead-history-table.tsx` — single Lead History table (desktop + mobile) used on customer profile and Leads Won tab

### Changed
- `components/crm/customer-profile.tsx` — Lead History via `LeadHistoryTable` (Quote / Order column, source labels)
- `components/leads/leads-page.tsx` — Won tab uses same component

### Removed
- `components/leads/lead-history-ticket-refs.tsx` — folded into `LeadHistoryTable`

## [2026-05-23] — Lead history quote/order refs and source labels

### Changed
- Customer **Lead History** and Leads **Won** tab — new **Quote / Order** column (reference codes only, no amounts); source shows lookup label (e.g. Phone call) instead of raw value
- `GET /api/leads/workspace?won=true` — nested tickets return `reference_code`, `ticket_kind`, `ticket_status` only (no totals)
- `lib/utils/lead-history-display.ts` — shared ref/source helpers for lead history tables

## [2026-05-23] — SDR Won tab matches customer lead history

### Changed
- Leads **Won** tab — same columns as customer **Lead History** (SDR Status, Sales Status, Source, Urgency, Created); no order ref or amounts
- `GET /api/leads/workspace?won=true` — same lead fields as customer profile lead history (no ticket join; order totals never sent to the browser)

## [2026-05-23] — SDR Won leads open customer profile

### Changed
- Leads workspace — SDR clicking a **Won** lead (including from **Directed to Sales** if won) navigates to `/crm/customers/[id]` instead of the editable verify drawer

## [2026-05-23] — Combined pricing & payment summary on order review

### Changed
- Order detail (payment under review) — **Pricing & payment** single card merges quote breakdown with deposit/submitted/remaining amounts; order total and remaining use larger accent typography
- Overview **Pricing** section hidden during payment review (quote tax/discount metadata moves to **Quote details**)

## [2026-05-23] — Orders: show evidence-pending to ticket owner

### Changed
- `/orders` — orders awaiting accountant payment confirmation are visible again for the owning sales/SDR user (scoped tickets); status **Awaiting payment confirmation**, payment pill **Awaiting review**
- Order detail — evidence-pending orders show read-only payment review card for sales/SDR (no Confirm button); accountants still confirm on `/payments` or order detail
- Payment evidence file link hidden from sales/SDR on order detail; only accountant/admin can open `/api/tickets/[id]/evidence`
- Order detail with payment under review — grouped layout: **Payment review** card with full **Payment summary** (deposit due, amount submitted, remaining after confirmation) plus **Order settings** below; removed duplicate evidence sections
- Tab/sidebar order counts include evidence-pending `order` rows
- `PATCH /api/tickets/[id]` — `record_payment` restricted to accountant and admin

## [2026-05-23] — Order detail in-production UI

### Changed
- Order detail overview — **Payment & Order Settings** section now shows full read-only config: payment strategy/channels, **Send quote via**, destination, **Quote follow-up schedule**, plus payment status (was compact summary only)
- Order detail (`/orders/[id]`) — **In Production** shown only in the header badge; removed from bottom action bar and production overview card; **Mark Completed** uses primary CTA button styling; **Resend invoice link** shows Mail / SMS / both icons from ticket outreach channel

## [2026-05-23] — Orders list status labels

### Changed
- `GET /api/orders/orders` — returns ready-to-display `status_label` and `status_tone` per row (customer confirm, rep convert, in production, cancelled); no DB change
- `lib/utils/order-list-status.ts` — shared label logic from `client_confirmed` + activities
- Orders page Status column — renders `status_label` from API (no client-side confirm/convert inference)

## [2026-05-23] — Merge In Production into Orders page

### Added
- `supabase/migrations/079_remove_production_page.sql` — removes `/production` from sidebar nav

### Changed
- `/orders` — new **In Production** tab with count badge; rows show **In Production** status pill
- `GET /api/orders/orders` — includes `ticket_status = in_production` alongside order and cancelled
- Sidebar `/orders` badge — pending payment + in production counts combined
- `/production` and `/production/[id]` — redirect to `/orders?tab=in_production` and `/orders/[id]`
- `proxy.ts` — legacy `/production` URL redirects before RBAC
- Quote detail — **In Production** header badge and back link when status is `in_production`

### Removed
- Standalone **In Production** sidebar nav item (page consolidated into Orders)

## [2026-05-23] — New Quote customer sidebar: company, website, decision maker

### Added
- `components/quotes/customer-sidebar-card.tsx` — shared read-only customer card for New Quote sidebar

### Changed
- `components/quotes/new-quote-form.tsx` — customer card shows company, website, and decision maker; visible for CRM and locked lookup customers
- `lib/utils/new-quote-from-customer.ts` — passes `authority` in Add Quote URL

## [2026-05-23] — New Quote: prefill Send quote via from customer

### Changed
- `components/quotes/quote-payment-config.tsx`, `new-quote-form.tsx` — Send quote via destination pre-fills phone/email from customer contact; channel change refreshes from customer (user can still edit)

## [2026-05-23] — CRM profile: source only on quote rows

### Changed
- `components/crm/customer-profile.tsx` — removed Quote Source from company contact grid; source remains on individual quote/order rows

## [2026-05-23] — Documentation sync (customer attributes + quote flows)

### Changed
- `docs/feature-specs/tickets.md`, `docs/component-architecture.md` — quote entry modes; source on ticket vs lead; Decision Maker removed from quote form
- `docs/feature-specs/crm.md` — Edit Customer industry select + authority; Add Quote flow with Info-tab source
- `docs/feature-specs/leads-sdr.md` — authority stored on customer
- `docs/architecture.md` — customer attribute ownership table
- `docs/crm-logic-overview.html`, `docs/session-summary.md`, `docs/order-ticket/README.md` — flow diagrams aligned

## [2026-05-23] — CRM Edit Customer industry select

### Changed
- `components/crm/customer-profile.tsx` — Edit Customer uses admin **Industry** lookup select (label shown, value stored); profile grid shows industry label

## [2026-05-23] — Decision Maker on customer record

### Added
- `supabase/migrations/078_customer_authority.sql` — `customers.authority`; backfill from latest lead; drops unused `job_tickets.quote_authority`
- `lib/utils/authority.ts` — `normalizeAuthority`, `authorityLabel`

### Changed
- Decision Maker is stored on **`customers.authority`**, not per-lead or per-quote
- `app/api/leads/manual/route.ts`, `app/api/leads/[id]/route.ts`, `app/api/customers/route.ts`, `app/api/customers/[id]/route.ts` — read/write authority on customer
- `components/leads/verify-drawer.tsx`, `components/leads/leads-page.tsx` — pre-fill and save authority via customer
- `components/crm/customer-profile.tsx` — Decision Maker in contact grid and Edit modal
- `components/sales/sales-drawer.tsx` — shows `customer.authority`
- `app/api/leads/workspace/route.ts` — customer join includes `authority`

## [2026-05-23] — Remove Decision Maker from quote flow

### Changed
- `components/quotes/new-quote-form.tsx` — Decision Maker removed from Customer and Info tabs; only Source stored on quote
- `app/api/tickets/route.ts`, quote detail customer card, CRM profile — no longer read/write `quote_authority` on tickets

## [2026-05-23] — Quote source on Info tab when customer pre-filled

### Changed
- `components/quotes/new-quote-form.tsx` — Source + Decision Maker shown on **Info** tab when Customer tab is skipped (CRM / linked lead); CRM Add Quote now saves `quote_source` on the ticket (not lead `source`)
- `lib/utils/new-quote-from-customer.ts` — passes `customer_id`, `industry`, and `website` in URL params for richer pre-fill

## [2026-05-23] — CRM customer profile: Add Quote + quote source

### Added
- `lib/utils/new-quote-from-customer.ts` — shared URL builder for CRM → New Quote pre-fill

### Changed
- `components/crm/customer-profile.tsx` — **Add Quote** button next to Edit; contact grid shows Company, Quote Source, Decision Maker; quote/order rows show source
- `components/crm/crm-page.tsx` — uses shared `newQuoteUrlFromCustomer` helper
- `app/api/tickets/route.ts` — list join includes `lead.source` for CRM profile display

## [2026-05-23] — Documentation sync (direct quote source + approval gate)

### Changed
- `docs/schema.md`, `docs/types.md` — `quote_source`, `quote_authority` on `job_tickets`; migration 077
- `docs/api-contract.md` — lookup enrichment (`latest_source`/`latest_authority`); `POST /api/tickets` body (`from_quote_page`, `quote_source`); approval gate on public payment submit
- `docs/feature-specs/tickets.md`, `docs/feature-specs/crm.md`, `docs/feature-specs/invoice-payment.md` — Customer tab pre-fill, direct quote source, approval gate
- `docs/session-summary.md`, `docs/component-architecture.md`, `docs/architecture.md`, `docs/order-ticket/README.md`, `docs/crm-logic-overview.html` — aligned with Quotes-page source-on-ticket behavior

## [2026-05-23] — Direct quote customer pre-fill and quote source

### Added
- `supabase/migrations/077_quote_source.sql` — `quote_source` and `quote_authority` columns on `job_tickets` for Quotes-page creates

### Changed
- `app/api/customers/lookup/route.ts` — enriches matches with latest lead or direct-quote source/authority for pre-fill
- `components/quotes/new-quote-form.tsx` — selecting an existing customer pre-fills all fields (including source, industry, website, decision maker); passes `customer_id`; sends `from_quote_page` + `quote_source`/`quote_authority` instead of creating a lead
- `app/api/tickets/route.ts` — stores source on the ticket for direct Quotes-page creates; skips auto-lead creation in that path
- `components/quotes/quote-detail/customer-info-card.tsx` — shows source, decision maker, industry, and website for direct quotes without a linked lead

## [2026-05-23] — Honor customer approval gate for all payment types

### Fixed
- `lib/utils/compute-checkout.ts` — when `ticket_require_client_confirm` is on, production waits for `client_confirmed` from the public page; cash/full/deposit payment alone no longer skips approval
- `app/api/tickets/route.ts`, `app/api/tickets/[id]/route.ts` — cash auto-record no longer simulates confirmed when approval is required
- `app/api/public/quotes/[token]/submit-payment/route.ts` — payment submit no longer sets `client_confirmed` or converts to order before customer confirms
- `app/(public)/q/[token]/page.tsx` — public checklist always shows confirm step first when approval is required
- `components/quotes/quote-payment-config.tsx`, `order-payment-summary.tsx` — gate preview and summary match the stricter rule

## [2026-05-23] — Quote Customer tab matches lead fields

### Changed
- `components/quotes/new-quote-form.tsx` — Customer step now includes Source *, Industry *, Decision Maker?, and Website / Social (same as Add Lead); Source and Industry required before advancing
- `app/api/tickets/route.ts` — POST saves industry/website on customer upsert; **lead/CRM flows** may create a linked lead with source/authority when no existing lead (superseded for Quotes page by `quote_source` on ticket — see entry above)

## [2026-05-23] — Fix admin password-reset email delivery

### Fixed
- `lib/utils/resolve-app-url.ts` — shared login URL builder; prefers `NEXT_PUBLIC_APP_URL`, falls back to admin request origin (avoids `localhost` links in production emails)
- `lib/integrations/send-welcome-email.ts` — login button always uses `/login`; logs and returns `loginUrl` for verification
- `app/api/admin/users/[id]/route.ts` — passes request origin into welcome/reset emails; `email_delivery.login_url` in API response
- `app/api/admin/users/create/route.ts` — same await + `email_delivery` on welcome email
- `components/admin/users-section.tsx` — toast confirms email sent or shows failure reason; browser `console.info` on delivery result; edit dialog notes reset email is sent when Instantly is configured

## [2026-05-23] — Documentation sync

### Changed
- Feature specs, API contract, RBAC, schema, dashboard, navigation, session summary, architecture, TODO, and CRM logic overview updated for Won-on-production, quote send validation, accountant ticket read access, hold modal UX, urgency mapping, and `npm run reset-test-data`

## [2026-05-23] — Full test database reset script

### Added
- `supabase/migrations/076_full_test_reset.sql` — dev-only SQL wipe (DB tables + sequence counters; no storage)
- `scripts/full-test-reset.mjs` — `npm run reset-test-data` clears payment-evidence bucket via Storage API then wipes DB

### Fixed
- Lead view/verify drawer — urgency select now maps DB values (`High`/`Medium`/`Low`) to lookup select values (`high`/`medium`/`low`) so saved urgency displays correctly when reopening a lead

## [2026-05-23] — SDR hold modal full-screen

### Changed
- Lead verify drawer — putting a lead on hold hides contact/lead form and tabs; hold UI fills the modal body

## [2026-05-23] — Receipt ID numbers only

### Changed
- Receipt ID fields (cash / offline) accept digits only — numeric keyboard on mobile, non-numeric characters stripped on input
- Send validation rejects Receipt ID values that are not all digits

## [2026-05-23] — Quote send validation

### Added
- `lib/utils/validate-quote-send.ts` — shared validation for required fields before sending a quote

### Changed
- Quote send validation — Receipt ID required when cash/offline is selected; Send Quote disabled with warning banner until complete

## [2026-05-23] — Quote detail action bar layout

### Changed
- Quote detail bottom bar — Cancel Ticket on the left; Send/Resend Quote and Convert to Order grouped on the right
- Convert to Order uses verify button styling (solid navy/gold) instead of success pill appearance

## [2026-05-23] — Accountant order detail access

### Fixed
- `GET /api/tickets/[id]` — accountants can open any order from `/orders` (was 403 unless payment evidence or in-production)

## [2026-05-23] — Won credit on production release

### Added
- `lib/utils/mark-lead-won-on-production.ts` — shared helper to mark linked leads Won when a ticket enters production
- `supabase/migrations/075_won_on_production_release.sql` — backfill Won status to match production release

### Changed
- Lead `sales_status: "Won"` (SDR Won tab) is set only when the linked ticket is released to `in_production`, not at order conversion
- Sales dashboard Won KPIs count tickets in `in_production` or `completed` only (not pending `order` status)
- Admin dashboard revenue and won-leads metrics aligned to production release; fixed won-leads count using lead query instead of ticket array length
- Leads Won tab empty state and ticket display prefer in-production tickets

### Removed
- Early Won marking on manual order conversion, public quote confirm, and payment submit (before production gates pass)

## [2026-05-22] — Quote reference codes (QUO-YYYY-NNNN)

### Added
- `supabase/migrations/074_quote_reference_codes.sql` — `quote_sequence_counters`, `increment_quote_sequence` RPC, backfill for existing quotes
- `lib/utils/reference-codes.ts` — shared helpers for QUO/ORD formatting, ticket lookup by reference, and detail URL paths

### Changed
- `POST /api/tickets` — assigns `QUO-YYYY-NNNN` on quote creation; order conversion replaces QUO with `ORD-YYYY-NNN`
- Ticket API routes (`GET/PATCH`, PDF, print, evidence) — accept UUID or reference code in the URL segment
- Quotes list and CRM customer profile — navigate via `QUO-*` reference; new **Quote #** column on quotes table
- Quote detail header — shows `QUO-*` as primary identifier instead of truncated UUID

### Fixed
- Migration `074` — RLS policy uses `current_user_role() = 'admin'` (not `is_admin()`, which does not exist in this project)

## [2026-05-22] — Revert temporary MFA bypass

### Removed
- `lib/auth/mfa-disabled.ts` and `MFA_DISABLED` env bypass — 2FA enforced again via `proxy.ts`

## [2026-05-22] — Finalize performance docs and TODO status

### Changed
- `docs/TODO.md` — TODO-007 marked **[DONE]** for Phase 1–2; Phase 3+ as open item with any-doer roadmap link
- `docs/architecture.md` — links to completed spec + future any-doer roadmap
- `docs/api-contract.md` — SQL head-count notes on `tickets/counts` and `production/counts`
- `docs/order-ticket/integration-plan.md` — quotes/orders page fetch paths aligned with Phase 1–2

## [2026-05-22] — Performance any-doer roadmap doc

### Added
- `docs/FuturePlan/Performance/performance-anydoer-roadmap.md` — page-by-page future optimizations (combined page-data APIs, coalesced refetch, session memoization, SWR, pagination, infra)

## [2026-05-22] — Sync docs with performance Phase 1–2

### Changed
- `docs/FuturePlan/Performance/performance-optimization.md` — marked Phase 1–2 complete; dev Strict Mode + coalesce notes
- `docs/architecture.md` — scoped list APIs, new routes/utils, migration 073, performance section
- `docs/api-contract.md` — `GET /api/orders/orders`, `GET /api/leads/[id]`, `GET /api/customers`, slim quote list
- `docs/schema.md` — migration `073_performance_indexes.sql`
- `docs/realtime-live-updates.md` — sidebar-only tickets channel, debounce, coalesced refetch pattern
- `docs/component-architecture.md`, `docs/feature-specs/tickets.md` — updated fetch paths and realtime
- `docs/TODO.md` — TODO-007 complete; TODO-006 no longer blocks performance work

## [2026-05-22] — Performance Phase 2: slim list payloads

### Added
- `lib/utils/ticket-list-select.ts`, `lib/utils/lead-list-select.ts` — shared slim column definitions
- `lib/utils/fetch-lead.ts` — fetch full lead for drawers via `GET /api/leads/[id]`
- `lib/utils/lead-access.ts` — shared lead read authorization for detail API

### Changed
- `app/api/tickets/route.ts` — quote list uses slim select (no `quote_skus` / notes); scoped to quote-stage statuses
- `app/api/leads/workspace/route.ts` — slim lead + customer columns for list tables
- `app/api/customers/route.ts` — slim customer fields + lightweight lead/ticket aggregates (no nested `customers(*)`)
- `app/api/leads/[id]/route.ts` — includes sales_owner/locked_by joins; expanded read access for sales pipeline
- `components/leads/leads-page.tsx`, `components/sales/sales-page.tsx` — fetch full lead on drawer open
- `components/crm/crm-page.tsx` — silent CRM refresh on realtime (no skeleton flash)
- `components/orders/production-page.tsx` — coalesce mount/realtime refetches (fixes duplicate `orders` + `counts` in dev)

## [2026-05-22] — Performance Phase 1: scoped orders API and SQL counts

### Added
- `app/api/orders/orders/route.ts` — slim orders list (order/cancelled only, no `quote_skus`)
- `lib/utils/db-counts.ts` — shared `countExact()` + ticket role scoping helpers
- `supabase/migrations/073_performance_indexes.sql` — partial indexes for orders, production, leads counts

### Changed
- `components/orders/orders-page.tsx` — fetches `/api/orders/orders` instead of full `/api/tickets`
- `app/api/tickets/counts/route.ts`, `app/api/sidebar-counts/route.ts`, `app/api/production/counts/route.ts`, `app/api/leads/workspace/counts/route.ts`, `app/api/leads/sales-counts/route.ts` — SQL head counts instead of loading rows into Node.js
- `components/quotes/quotes-page.tsx` — removed duplicate Supabase realtime channel (sidebar broadcasts `bazaar:tickets-changed`)
- `components/layout/sidebar.tsx` — debounced sidebar badge refetch (~300ms)

## [2026-05-22] — 2FA QR code shows user name in authenticator app

### Changed
- `app/(auth)/setup-2fa/page.tsx` — TOTP QR label is now `BazaarPrinting:{full name}` (falls back to email prefix) instead of duplicating the issuer name

## [2026-05-21] — Document performance optimization as future work

### Added
- `docs/FuturePlan/Performance/performance-optimization.md` — scoped lists, SQL counts, realtime, and index plan (deferred until follow-up reminder cron, TODO-006)

### Changed
- `docs/TODO.md` — added TODO-007 (performance); TODO-006 marked as prerequisite

> **Superseded (2026-05-22):** TODO-007 Phase 1–2 implemented; performance no longer deferred on TODO-006. See changelog entries `Performance Phase 1` and `Performance Phase 2`.

## [2026-05-21] — Fix PaymentConfig type errors in API routes

### Fixed
- `app/api/public/quotes/[token]/submit-payment/route.ts`, `app/api/tickets/route.ts`, `app/api/tickets/[id]/route.ts` — minimal checkout configs use `as PaymentConfig` (matches `maybe-auto-release-production.ts`) so production build type-check passes
- `lib/integrations/send-quote.ts` — `sendPaymentConfirmed` accepts `PaymentConfirmedTicket`; `customerDisplayName` uses a minimal ticket shape
- `components/quotes/quote-detail.tsx` — add missing `payment_evidence_amount` on local `Ticket` type
- `components/quotes/quote-detail/order-payment-summary.tsx`, `quote-stage-overview.tsx`, `ticket-overview-sections.tsx` — TypeScript fixes for payment overview props and imports

## [2026-05-21] — Sales drawer: remove duplicate Notes label

### Fixed
- `components/sales/sales-drawer.tsx` — removed redundant "Notes" field label under the "Sales Notes" section heading (matches SDR verify drawer pattern)

## [2026-05-21] — Sales drawer: notes-only until quote exists

### Changed
- `components/sales/sales-drawer.tsx` — Sales modal body is **Sales Notes** only before a quote exists; removed Assigned To / Sales Status rows (status pill stays in header); Quote Total appears only when `quote_total > 0`

## [2026-05-21] — Sales drawer: read-only status and quote total

### Changed
- `components/sales/sales-drawer.tsx` — Sales Status and Quote Total are read-only (updated automatically when quotes/orders are created); only **Sales Notes** remains editable

## [2026-05-21] — Sales drawer shows lookup labels for routed leads

### Fixed
- `components/sales/sales-drawer.tsx` — Industry and Source read-only fields now show human-readable labels (e.g. "Cannabis/CBD", "Walk-in") instead of stored values (`cannabis_cbd`, `walk_in`)
- `lib/utils/lookups.ts` — shared `lookupLabel()` helper for lookup value → label resolution

## [2026-05-21] — Folder structure rule + shared format helpers

### Added
- `.cursor/rules/folder-structure.mdc` — always-on rule: feature folders, `QuoteDetail` context pattern, DRY checklist before new files
- `lib/utils/format.ts` — canonical `relativeTime`, `formatDate`, `formatDateTime`, `displayContactName`, due-date helpers

### Changed
- `components/orders/*` — list + detail overview pages import from `lib/utils/format.ts` instead of local copies
- `.cursor/rules/tab-counts.mdc` — fixed example paths to `components/leads/leads-page.tsx` etc.
- `docs/component-architecture.md` — folder layout + anti-duplication section

## [2026-05-21] — Documentation audit: sync docs with shipped code

### Changed
- Fixed `/orders` tab names across docs: **All | Pending Payment | Cancelled** (default tab = Pending Payment) — was incorrectly documented as "Active"
- Updated `tickets.md` API route table, `dashboard.md` (Accountant dashboard), `rbac.md` (resend_invoice), `schema.md` (migration 070, OrderDrawer → quote forms), `admin.md` (Accountant system role), `TODO.md` (order lifecycle done state), `order-ticket/README.md` (historical archive notice)
- Added `/tickets` redirect stub and `/overview` alias notes to `navigation.md`

## [2026-05-21] — Documentation sync for order lifecycle session

### Changed
- Updated `docs/feature-specs/tickets.md`, `invoice-payment.md`, `api-contract.md`, `component-architecture.md`, `activity.md`, `notifications.md`, `schema.md`, `types.md`, `email-template-guide.md`, `architecture.md`, and `realtime-live-updates.md` to reflect payments queue, production/completed pages, payment evidence workflow, net terms auto-release, unified ticket detail overview, public portal phases, and new customer notification templates

## [2026-05-21] — Fix customer link preview while logged in

### Fixed
- **Customer link** on quote detail redirected logged-in staff to `/sales` — `/q/{token}` is now treated as public in `proxy.ts` (RBAC no longer blocks staff preview)
- **Copy** on customer link showed no feedback — button now shows **Copied!** / **Copy failed** with clipboard fallback

## [2026-05-21] — Completed order detail route

### Added
- `/completed/[id]` — dedicated completed-order detail page (same overview layout as production); Completed list rows link here instead of `/orders/[id]`

### Changed
- Public order page — pickup address and company address open **Google Maps** on click (same text styling); phone, email, and website in header/footer are clickable (`tel:` / `mailto:` / link) without visual changes

## [2026-05-21] — Public page shows ready for pickup when completed

### Fixed
- Public order page (`/q/{token}`) still showed **In production** after staff marked order **Completed** — now shows **Ready for pickup** banner with shop address and phone; invoice badge updates to **Ready for Pickup**
- Accountant **Mark Completed** rejected paid-in-full orders — PATCH handler was not loading payment fields on the ticket, so the paid check always failed (admin was unaffected)

## [2026-05-21] — Pickup notification when order marked completed

### Added
- **Order ready notification** — when staff marks an in-production order **Completed**, customer receives email/SMS (same channel as the quote) that the order is ready for pickup at the print shop
- `lib/integrations/order-ready-template.ts` + `sendOrderReadyToCustomer()` — includes company pickup address and phone
- History logs `ticket_order_ready_sent` / `ticket_order_ready_failed`

## [2026-05-21] — Accountant can mark paid production orders complete

### Changed
- **Mark Completed** on `/production/[id]` — visible to accountants when order is in production and **paid in full** (admin unchanged)
- `PATCH /api/tickets/[id]` — validates accountant may only set `ticket_status: completed` on paid-in-full in-production orders

## [2026-05-21] — Resend invoice link from production detail

### Added
- **Resend invoice link** on `/production/[id]` — emails/SMS the customer their permanent `/q/{token}` portal link (works when paid in full, unpaid, or net terms)
- `lib/integrations/invoice-link-template.ts` + `sendInvoiceLinkToCustomer()` — neutral order/invoice email (not a payment demand)
- `PATCH /api/tickets/[id]` with `{ resend_invoice: true }` — logs `ticket_invoice_resent` in History

## [2026-05-21] — Unified ticket detail overview layout

### Added
- `components/quotes/quote-detail/ticket-detail-overview.tsx` — routes to the correct snapshot card by stage
- `components/quotes/quote-detail/ticket-overview-sections.tsx` — shared read-only sections (line items, pricing, payment)
- `components/quotes/quote-detail/quote-stage-overview.tsx` — snapshot card for sent / order / quote stages

### Changed
- `/quotes/[id]`, `/orders/[id]`, `/payments/[id]`, and `/production/[id]` now share the same **Overview + History** layout and section structure when not editing a draft

## [2026-05-21] — Quotes tab All badge count fix

### Fixed
- Quotes page **All** tab badge now counts only draft + sent + approved — no longer includes tickets already in production (or completed/orders)

## [2026-05-21] — Net terms auto-release to production

### Added
- `lib/utils/maybe-auto-release-production.ts` — shared production gate (net terms, cash, etc.)
- `supabase/migrations/072_net_terms_auto_production.sql` — backfill net-terms tickets stuck in sent/order

### Fixed
- Net terms with **no client confirmation** now auto-release to **In Production** on send/create (unpaid, payment due per net label)
- Public **Confirm & Accept** on net-terms quotes releases to production after confirmation
- Public page: net terms with confirmation required shows the confirm step first; payment step shows **Net terms — payment due within X days** (not "Fully paid"); optional **Pay early** on no-confirm net orders
- Quotes list excludes `in_production` and `completed` tickets

### Changed
- `app/api/tickets/route.ts`, `app/api/tickets/[id]/route.ts`, `app/api/public/quotes/[token]/confirm/route.ts` — call auto-release after create/update/confirm

## [2026-05-21] — Payment review detail page

### Added
- `app/(app)/payments/[id]/page.tsx` — dedicated payment review detail (stays under Payments nav)
- `components/orders/payment-detail-overview.tsx` — review snapshot with evidence link and Confirm payment action

### Changed
- `components/orders/payments-page.tsx` — row click opens `/payments/[id]`; removed confusing **Order** button that sent users to `/orders`
- `components/quotes/quote-detail.tsx` — `context="payment"` streamlined overview for accountant review

## [2026-05-21] — Orders vs Payments queue separation

### Fixed
- Orders with customer-submitted payment proof no longer appear on `/orders` — they show only on `/payments` until the accountant confirms
- Order detail shows **Payment under review** badge instead of **Unpaid** while evidence is pending
- `/orders` sidebar badge and tab counts exclude evidence-pending tickets (same filter as the list)

## [2026-05-21] — Public page payment validation UX + confirmation email

### Added
- `lib/integrations/payment-confirmed-template.ts` — email template when accountant confirms customer payment proof
- `sendPaymentConfirmed()` in `lib/integrations/send-quote.ts` — email/SMS to customer after payment validation; includes link to track order status
- Public page polls every 30s while payment is under review so the link updates to **In production** after accountant confirms

### Changed
- `app/(public)/q/[token]/submit-payment/route.ts` — logs full customer journey in History: quote confirmed, status changes, payment proof, production release
- `app/(public)/q/[token]/confirm/route.ts` — logs `order_ticket_status_changed` when customer confirms quote
- `app/api/tickets/[id]/route.ts` — accountant payment confirm logs production release + status change with clear payloads
- `components/quotes/quote-detail/history-section.tsx` — human-readable labels for payment/production events; shows **Customer** instead of **System** for public-page actions

### Changed
- `app/(public)/q/[token]/page.tsx` — payment step shows amber **under review** state (not green "Fully paid"); production step shows "Awaiting payment confirmation" until validated
- `components/public/public-quote-document.tsx` — invoice status pill **Payment Under Review** while evidence is pending
- `components/orders/payments-page.tsx` — redesigned `/payments` table: separate columns, pending badge, larger action buttons, relative submit time
- `components/orders/production-detail-overview.tsx` — production order snapshot (totals, payment, due date, Mark Completed)
- `components/quotes/quote-detail.tsx` — `/production/[id]` uses streamlined **Overview** layout (no duplicate payment/delivery sections, no locked banner)
- `components/quotes/quote-detail/order-payment-summary.tsx` — `compact` mode for production detail; evidence link via signed API route
- `app/api/tickets/[id]/route.ts` — sends confirmation email/SMS on `record_payment` when confirming submitted evidence; logs `ticket_payment_confirmed_sent` activity

### Fixed
- Public payment summary no longer shows paid amounts until accountant confirms; shows **Amount submitted** + **Awaiting validation** instead
- PDF download (`/api/public/quotes/[token]/pdf`) and on-page invoice totals show **Payment Under Review — NOT PAID** banner while evidence is pending; no **Paid in Full** row until accountant confirms

## [2026-05-21] — Payment evidence queue + accountant confirm

### Fixed
- `app/api/public/quotes/[token]/submit-payment/route.ts` — wire / ACH / Zelle / check / card submissions no longer auto-mark tickets paid; evidence is queued for accountant review instead
- `app/(public)/q/[token]/page.tsx` — after evidence submit, portal shows **Payment under review** until accountant confirms (not the pay-again flow)
- Migration `071_payment_evidence_amount.sql` — stores customer-claimed amount; backfills tickets incorrectly marked paid on evidence submit

### Changed
- `app/api/payments/pending/route.ts`, `app/api/payments/counts/route.ts`, `app/api/sidebar-counts/route.ts` — pending evidence includes orders in production awaiting balance confirmation
- `components/orders/payments-page.tsx` — **Confirm** button records payment via `record_payment` and shows claimed amount
- `app/api/tickets/[id]/route.ts` — clears `payment_evidence_amount` after accountant confirms

### Fixed
- `app/(public)/q/[token]/page.tsx` — customer payment CTA wording by strategy: **Pay in full** (full payment), **Pay deposit now** (partial), **Pay remaining balance** (balance due); modal title matches button

## [2026-05-21] — Public page status pills deduplication

### Fixed
- `components/public/public-quote-document.tsx` — status row shows at most three pills (**Order**, **Rush**, one workflow status); removed duplicate Rush by title and redundant **Balance Due** pill alongside **Active · Balance Due**

## [2026-05-21] — Public page + PDF invoice layout with deposit breakdown

### Added
- `components/public/public-quote-document.tsx` — PDF/shadow-style document view (company header, INVOICE/QUOTE, Bill To, line items with Specification column, right-aligned totals)
- `lib/utils/invoice-payment-summary.ts` — shared deposit/balance calculation for web page and PDF

### Changed
- `app/(public)/q/[token]/page.tsx` — redesigned to match PDF invoice layout; status pills (ORDER, RUSH, ACTIVE · BALANCE DUE); portal below document
- `lib/pdf/invoice-pdf.tsx` — after Total, shows **Deposit Due Now** / **Deposit Paid** + **Balance Due** when partial payment applies; **Paid in Full** when complete
- `app/api/public/quotes/[token]/pdf/route.ts` + `app/api/tickets/[id]/pdf/route.ts` — pass payment fields and per-ticket channel labels to PDF

## [2026-05-21] — One-link public portal (phase-driven UI)

### Changed
- `app/(public)/q/[token]/page.tsx` — merged checkout + balance payment into single **`QuotePortalSection`**: one permanent link (`/q/{public_token}`) adapts its banner, checklist, CTA, and greeting based on `computePortalState()` phase (`needs_confirm` → `needs_payment` → `balance_due` → `fully_paid`, etc.)
- Resending a balance reminder uses the same URL — customer sees "Pay your remaining balance" instead of the pre-production deposit flow
- Status badge, greeting subtitle, and checklist title all derive from the same portal phase

## [2026-05-21] — Public page voluntary balance payment (in production)

### Added
- `BalancePaymentSection` on `/q/[token]` — **Pay your remaining balance** card with **Do the payment** button for orders already in production (or whenever deposit is paid but balance remains)
- Shared `PublicPayModal` — reused for deposit, balance, and checkout flows

### Fixed
- Checkout section hid **Do the payment** once deposit was recorded (`paymentStepDone`) even when balance remained — now shows **Pay remaining balance** when deposit is paid but order isn't fully paid
- `POST /api/public/quotes/[token]/submit-payment` — accepts `in_production` tickets for balance payments; allows follow-up submissions when a prior payment was already recorded

## [2026-05-21] — Public page payment schedule when deposit is paid

### Fixed
- `app/(public)/q/[token]/page.tsx` — **Payment Schedule** block after pricing: when deposit is already paid, shows amber **Balance Remaining** ($825.19) with "Balance due upon completion / delivery" instead of **Deposit Due Now**; deposit-received confirmation shown above
- Checkout payment summary and pay modal now use `deposit_paid_at` / `depositPaid` (not just `amountPaid > 0`) so cash-recorded deposits display correctly

### Added
- `PaymentScheduleBlock` on public quote page — visible for partial strategy including in-production orders (checkout checklist remains hidden once in production)

## [2026-05-21] — Payment summary clarity + follow-up start date persistence

### Fixed
- `components/quotes/quote-detail/order-payment-summary.tsx` — when deposit is paid on a partial strategy, hide **Deposit due** and **Total received** (redundant with **Deposit paid**); show **Balance due** only for the remaining amount
- `components/quotes/quote-payment-config.tsx` — follow-up reminder start date now persists as `quote_reminder_date` (was local UI state only)

### Changed
- `components/quotes/quote-detail.tsx` — loads/saves `quote_reminder_date` in payment draft
- `components/quotes/new-quote-form.tsx` — includes `quote_reminder_date` in POST body

## [2026-05-21] — Production/order detail: full payment & follow-up summary

### Added
- `components/quotes/quote-detail/order-payment-summary.tsx` — read-only card showing all stored payment, delivery, follow-up, and production fields (deposit paid, balance due, receipt ID, channels, reminder schedule, production released date, evidence link)

### Changed
- `components/quotes/quote-detail.tsx` — shows **Payment & Production** section on `/production/[id]`, `/orders/[id]`, and any order/in-production/completed ticket in view mode

## [2026-05-21] — Production detail route + accountant read access

### Added
- `app/(app)/production/[id]/page.tsx` — detail view for in-production orders under `/production/{id}` (reuses `QuoteDetail` with `context="production"`)

### Changed
- `components/orders/production-page.tsx` — row click and View button now navigate to `/production/{id}` instead of `/orders/{id}`; sidebar stays on In Production
- `components/quotes/quote-detail.tsx` — `context="production"` Back button returns to `/production`; public `/q/[token]` unchanged
- `app/api/tickets/[id]/route.ts` — accountant can `GET` tickets with `ticket_status` `in_production` or `completed` (read-only production/completed workflow; evidence-review rule unchanged)

## [2026-05-21] — Fix missing payment_status column + partial deposit backfill

### Fixed
- `supabase/migrations/070_payment_status_columns.sql` — adds `payment_status` and `prepayment_status` to `job_tickets` if missing (migrations 053/054 were never applied to some environments); backfills existing tickets with deposit recorded to `partial` / `paid`
- `app/api/tickets/route.ts` + `app/api/tickets/[id]/route.ts` — `maybeAutoRecordCashPayment` now sets `payment_status = "partial"` and `prepayment_status = "paid"` when a partial cash deposit is auto-recorded

## [2026-05-21] — Fix Save & Send button + API 500 errors

### Fixed
- `components/quotes/new-quote-form.tsx`
  - **Save & Send button was silently doing nothing**: validation was checking an old `quoteDestination` state variable that was never synced from the `QuotePaymentConfig` section. The user typed their email in the "Send quote via" section (which updates `paymentDraft.ticket_dest_email`) but the gate checked an unreachable legacy field. Fixed by replacing the old validation with one that reads from `paymentDraft` and shows the error via the visible `setError()` toast. Also removed a TypeScript compile error that blocked form rendering (`"whatsapp"` compared against type `"sms" | "email" | "both"`)
  - **Stale `quote_payment_types` / `follow_up_cycles` / `follow_up_frequency` in POST body**: these old state vars (`paymentTypes`, `followUpCycles`, `followUpFreq`) were hardcoded at their initial values and never updated. They are now fully replaced by `paymentDraft` fields (`ticket_partial_channels`, `ticket_full_channels`, `ticket_follow_up_count`, `ticket_follow_up_freq`). Removed all dead state declarations and the now-redundant `togglePayment` function
  - Removed all debug `console.log` and fetch instrumentation added during investigation
- `app/api/tickets/route.ts` + `app/api/tickets/[id]/route.ts`
  - **500 Internal Server Error on POST**: `maybeAutoRecordCashPayment` called `.catch()` on the Supabase activities insert. Supabase JS v2 returns a `PromiseLike` (not a native `Promise`) — it has `.then()` but not `.catch()`. Changed to a simple fire-and-forget call (no `.catch()` chained)
  - Removed `try/catch` wrapper and debug fetch instrumentation added during investigation

## [2026-05-21] — Public quote page: payment modal + submission fix

### Changed
- `app/(public)/q/[token]/page.tsx`
  - **Payment modal**: replaced inline expanding payment panel with a proper overlay modal. Clicking "Do the payment" (checklist step 2 or full-width CTA) now opens a fixed-position modal matching the shadow app's `#payModal`
  - Modal contains: amount-due box, payment method `<select>` dropdown, numbered-step instruction panels (WireAch/Zelle/Check/Cash), amount input, upload hint, error message, Cancel + Submit Payment buttons. Backdrop click dismisses the modal. Changing method clears the evidence file
  - **Fixed submission bug**: `handleSubmitPayment` was posting to the wrong endpoint (`/pay`) with wrong field names (`channel`, `evidence`, `receipt_id`). Corrected to `/submit-payment` with fields `method`, `file`, `receiptId` and response field `autoReleased`
  - **PDF label**: "Save PDF" becomes "Download Invoice" when the ticket is an order or in production

## [2026-05-21] — Internal orders page: remove "To Start Production" checklist

### Changed
- `components/quotes/quote-detail.tsx` — replaced the two-column "To Start Production" checklist + payment summary widget with a compact standalone **Payment** card:
  - Removed: numbered step checklist (Quote Confirmed / Payment Collected / Production Released) — this now lives only on the customer-facing `/q/[token]` page
  - Kept: payment summary rows (Quote total, Deposit due, Amount paid, Remaining), payment evidence link, "Record Payment" CTA (role-restricted), block reason warning, and "Cancel Ticket" button

## [2026-05-21] — Public quote page: shadow-app two-column checklist layout

### Changed
- `app/(public)/q/[token]/page.tsx` — replaced sequential confirm/pay step flow with a two-column "To Start Production Checklist + Payment Summary" layout matching the shadow application:
  - Left column: numbered checklist (1. Quote price confirmed → inline "Confirm & Accept Quote" button when pending; 2. Payment → "Do the payment" toggle button; 3. Ready for production)
  - Right column: Payment Summary (Strategy, Quote total, Paid, Remaining in amber when unpaid, Due now, Channels, Price confirmation)
  - Full-width dark navy "Do the payment" button below the two-column panel
  - Expanding payment panel (channel picker + WireAch/Zelle/Check/Cash numbered-step instructions) toggled by the CTA
  - New `StepBadge` component (numbered circle, green checkmark when done)
  - Net terms: shows simple info card (unchanged from before)

## [2026-05-21] — Public quote page: numbered-step payment panels, remove card

### Changed
- `app/(public)/q/[token]/page.tsx` — full rewrite of customer-facing payment panels:
  - **Wire / ACH**: two-step flow — bank account details (with copy buttons) → upload screenshot
  - **Zelle**: two-step flow — Zelle contact + unique quote ref for memo → upload screenshot
  - **Check**: two-step flow — payable-to / mail instructions → upload check / deposit photo
  - **Cash**: single step — order reference display + receipt ID input (no upload needed)
  - New `PayStep` numbered-step wrapper component (circle badge, title, description, optional content)
  - New `PanelProps` shared interface for wire/ach/zelle/check panels
  - `CardContactPanel` fallback shown when card channel selected — explains in-person payment with company phone/email
- **Card removed from `EVIDENCE_CHANNELS`** and submission blocked for card channel (PCI compliance — no card data collected or stored)

## [2026-05-21] — Production & Completed pages, permission unlock

### Added
- `supabase/migrations/069_production_and_completed_pages.sql` — seeds `/production` (In Production) and `/completed` (Completed) pages; grants both to `accountant` and `admin` roles
- `app/(app)/production/page.tsx` + `components/orders/production-page.tsx` — new In Production page with "All in Production" / "Balance Due" tabs, payment indicator pills (Paid in Full / Balance Due $X / Net Terms), and real-time updates via `bazaar:tickets-changed`
- `app/api/production/orders/route.ts` — returns all `in_production` tickets for the page
- `app/api/production/counts/route.ts` — returns `{ all, balance_due }` tab badge counts
- `app/(app)/completed/page.tsx` + `components/orders/completed-page.tsx` — new Completed Orders page with search and payment status indicators
- `app/api/completed/orders/route.ts` — returns all `completed` tickets
- `app/api/completed/counts/route.ts` — returns single count for sidebar badge

### Changed
- `components/admin/roles-section.tsx` — permission editing unlocked for all non-Admin system roles (SDR, Sales, Accountant). Only the Admin role remains permission-locked (full unrestricted access). System roles can still not be deleted; only their page permissions are now editable by an Admin in the UI without requiring a DB migration.
- `components/orders/orders-page.tsx` — tabs narrowed to **All** (order + cancelled) / **Pending Payment** / **Cancelled**; default tab is now "Pending Payment"; page subtitle updated; `in_production` and `completed` tickets removed from this page
- `app/api/tickets/counts/route.ts` — added `in_production` and `completed` counts to the response; accountant role now bypasses `created_by_id` scope (same as admin)
- `app/api/sidebar-counts/route.ts` — added `/payments`, `/production`, `/completed` sidebar badge counts for `accountant` and `admin` roles; accountant now correctly skips the `created_by_id` ticket scope filter

## [2026-05-21] — Customer payment flow, Accountant role, auto-production gate

### Added
- `supabase/migrations/068_accountant_role_and_payment_evidence.sql` — adds `payment_evidence_url` + `payment_evidence_submitted_at` to `job_tickets`; seeds `accountant` system role + `/payments` page + role permissions
- `app/api/public/quotes/[token]/submit-payment/route.ts` — public multipart upload endpoint: stores file in Supabase Storage `payment-evidence` bucket, records payment, auto-releases production when gates are met (mirrors shadow app `maybeAutoStartProduction`)
- `app/api/tickets/[id]/evidence/route.ts` — generates 60-second signed URL for payment evidence file; restricted to accountant and admin
- `app/api/payments/counts/route.ts` — KPI counts for Accountant dashboard (pending evidence, in production, completed this month)
- `app/api/payments/pending/route.ts` — orders with evidence submitted but payment not yet confirmed
- `app/(app)/payments/page.tsx` — Accountant work queue page (route `/payments`)
- `components/orders/payments-page.tsx` — table of orders awaiting payment evidence review
- `components/admin/accountant-dashboard.tsx` — Accountant-specific dashboard with KPI cards and quick-action banner

### Changed
- `app/(public)/q/[token]/page.tsx` — full 3-step checkout: (1) confirm quote price, (2) select payment channel + follow per-channel instructions (Wire/ACH bank details, Zelle contact, Check, Card, Cash) + upload evidence, (3) submitted confirmation state; net-terms banner; channel pill selector; copy buttons for all banking details; file drag-and-drop upload widget
- `app/api/public/quotes/[token]/route.ts` — extended select to return all `ticket_*` payment config columns + `payment_evidence_url` / `payment_evidence_submitted_at`
- `app/api/tickets/[id]/route.ts` — added auto-production-release logic in `record_payment` action (runs `computeCheckout` after every payment recording; if `canReleaseProduction = true`, immediately sets `ticket_status = in_production` and `production_released_at`); accountant can now read/write payment fields on any order; evidence columns added to allowed fields
- `components/quotes/quote-detail.tsx` — evidence row with "View file ↗" link in payment summary panel; Record Payment button restricted to accountant/admin when evidence is present (other roles see "Awaiting accountant review")
- `components/admin/dashboard-page.tsx` — added `accountant` role branch routing to `AccountantDashboard`
- `components/layout/sidebar.tsx` — added `roleLabel` for `accountant`
- `lib/auth/resolve-default-home.ts` — accountant defaults to `/payments`

## [2026-05-21] — Update schema.md + architecture.md for migrations 065–066 and new utils

### Changed
- `docs/schema.md` — added all columns from migration 065 (`company_settings` payment remittance: `bank_name`, `bank_account_name`, `bank_account_number`, `bank_routing_number`, `zelle_phone`, `zelle_email`) and migration 066 (`job_tickets` per-ticket payment config + payment recording: 17 new `ticket_*` / `payment_*` / `deposit_*` columns); clarified legacy column section
- `docs/architecture.md` — corrected migration count to 66 (001–066); added `lib/utils/compute-checkout.ts` and `lib/utils/email.ts` to file tree
- `docs/feature-specs/invoice-payment.md` — added Phase B++ row marking `QuotePaymentConfig`, checkout stepper, payment recording, and Admin Payment tab as built

## [2026-05-21] — Update all documentation to reflect new component folder structure

### Changed
- `docs/architecture.md` — rewrote entire `components/` file tree section to show all feature sub-folders (`admin/`, `auth/`, `crm/`, `layout/`, `leads/`, `orders/`, `quotes/`, `reports/`, `sales/`, `ui/`, `print/`) with all moved files
- `docs/component-architecture.md` — updated all component file paths in dashboard architecture, SDR vs Sales architecture, role-specific components table, page-by-page breakdown (leads, sales, quotes, orders, crm, reports), realtime listeners table, and idle timer section; added shared sub-component trees for `new-quote-form` and `quote-detail`
- `docs/feature-specs/dashboard.md`, `docs/feature-specs/tickets.md`, `docs/feature-specs/invoice-payment.md`, `docs/feature-specs/leads-sales.md` — all component path references updated to new feature-folder paths
- `docs/navigation.md` — updated mobile-nav reference
- `docs/api-contract.md`, `docs/schema.md`, `docs/realtime-live-updates.md`, `docs/FuturePlan/`, `docs/Notification/`, `docs/order-ticket/`, `docs/session-summary.md`, `docs/TODO.md` — all component path references updated via bulk replacement

## [2026-05-21] — Reorganize remaining root components into feature folders

### Changed
- `components/auth/otp-input.tsx` — moved from root; `app/(auth)/setup-2fa` and `verify-2fa` imports updated
- `components/leads/verify-drawer.tsx` — moved from root; `leads-page.tsx` import updated
- `components/leads/hold-sub-form.tsx` — moved from root; `verify-drawer.tsx` import updated
- `components/admin/admin-dashboard.tsx` — moved from root; `dashboard-page.tsx` import updated
- `components/admin/dashboard-page.tsx` — moved from root; `app/(app)/dashboard` and `overview` imports updated
- Root-level `.tsx` files are now all thin barrel re-exports pointing to feature folders

## [2026-05-20] — Component refactoring: shared forms, feature folders, quote-detail split

### Added
- `components/quotes/shared/types.ts` — shared `ProductType`, `LookupOption`, `SkuLookups` types
- `components/quotes/shared/utils.ts` — shared `emptySkuRow`, `renderLookupOptions`, `priorityStyle`, `quickDate` utilities
- `components/quotes/shared/info-form.tsx` — unified `InfoForm` component (replaces `InfoTab` + `InfoSection`), supports `editing` prop for read-only view
- `components/quotes/shared/sku-row.tsx` — unified `SkuRow` component (replaces `SkuRow` in new-quote + `EditableSkuRow` in quote-detail)
- `components/quotes/shared/line-items-form.tsx` — unified `LineItemsForm` component (replaces `LineItemsTab` + `LinesSection`)
- `components/quotes/shared/quote-form.tsx` — unified `QuoteForm` component (replaces `QuoteTab` + `QuoteSection`) using `QuotePaymentConfig`
- `components/quotes/quote-detail/history-section.tsx` — extracted `HistorySection` with activity timeline
- `components/quotes/quote-detail/ticket-skeleton.tsx` — extracted `TicketSkeleton` loading state
- `components/quotes/quote-detail/customer-info-card.tsx` — extracted `CustomerInfoCard` sidebar card
- Feature folders: `components/leads/`, `components/sales/`, `components/crm/`, `components/orders/`, `components/reports/`, `components/layout/`, `components/quotes/`

### Changed
- `components/quotes/new-quote-form.tsx` — slimmed from 2088→1251 lines; removed all local component/utility duplicates; uses shared `InfoForm`, `LineItemsForm`, `QuoteForm`
- `components/quotes/quote-detail.tsx` — slimmed from 2935→1368 lines; removed `InfoSection`, `LinesSection`, `EditableSkuRow`, `QuoteSection`, `HistorySection`, `TicketSkeleton`, `CustomerInfoCard`; migrated `QuoteSection` to use `QuotePaymentConfig` (new payment config system)
- All page-level components moved from root `components/` to feature sub-folders; root-level files replaced with barrel re-exports for backward compatibility
- `app/(app)/layout.tsx` — updated imports to `components/layout/sidebar`, `mobile-nav`, `idle-timer`
- `app/layout.tsx` — updated imports to `components/layout/theme-provider`, `global-event-handlers`
- `app/(app)/quotes/new/page.tsx`, `quotes/[id]/page.tsx`, `orders/[id]/page.tsx`, `quotes/page.tsx` — updated to `components/quotes/`
- `app/(app)/leads/page.tsx`, `sales/page.tsx`, `orders/page.tsx`, `crm/page.tsx`, `reports/page.tsx`, `crm/customers/[id]/page.tsx` — updated to feature sub-folders

## [2026-05-21] — Checkout stepper + record payment modal in quote-detail (Step 5)

### Added
- `components/quotes/quote-detail.tsx` — 3-step "To Start Production" checkout stepper (Confirm Price → Deposit/Payment → Release to Production) driven by `computeCheckout`
- Payment summary sidebar panel showing quote total, deposit due, balance, amount paid, remaining, and status label
- "Record Payment" modal: method selector (Cash/Wire/ACH/Zelle/Check/Card), amount input, receipt ID — calls `record_payment` PATCH action
- "Release to Production" step action button — calls `release_production` PATCH action
- `PAY_CHANNELS_FOR_MODAL` constant for consistent channel options in the modal
- New `ticket_*` payment config and `payment_*` recording fields added to the local `Ticket` interface
- `computeCheckout` + `PaymentConfig` imported and wired to the ticket's live DB columns

### Changed
- Replaced old ad-hoc deposit-status segmented control, offline-payment segmented control, and `PaymentLinkBar` with the unified checkout stepper for `order` / `in_production` / `completed` statuses

## [2026-05-21] — Ticket API payment actions + allowed fields (Step 4)

### Changed
- `app/api/tickets/[id]/route.ts` — added all 15 `ticket_*` payment config columns and 9 `payment_*` recording columns to `ALLOWED_FIELDS` so PATCH can persist them
- Order-status lock widened: non-admins can now update payment recording fields and `production_released_at` without needing admin access
- Added `record_payment` PATCH action: records deposit / balance / full payment, maintains running `payment_amount_received` total, sets `payment_status` to `partial` or `paid`, logs `ticket_payment_recorded` activity
- Added `release_production` PATCH action: stamps `production_released_at`, logs `ticket_production_released` activity

## [2026-05-20] — Per-ticket payment config panel (Step 3)

### Added
- `supabase/migrations/066_per_ticket_payment_config.sql` — 25 new columns on `job_tickets` for per-ticket payment strategy, deposit config, channels, quote delivery, follow-up schedule, and payment recording
- `components/quotes/quote-payment-config.tsx` — new `QuotePaymentConfig` React component (mirrors `payment.html`): payment strategy cards (Partial / Full / Net), deposit %, deposit handling, channel checkboxes, net terms picker, client-confirmation toggle, quote delivery (SMS / Email / Both), follow-up schedule
- `TicketPaymentDraft` TypeScript interface and `PAYMENT_CONFIG_DEFAULTS` exported from the new component
- Per-ticket payment config fields added to `JobTicket` type in `lib/types/index.ts`

### Changed
- `components/quotes/new-quote-form.tsx` — replaced the old "Order Flow" section (Quote First / Direct Order toggle, Payment Methods, Prepayment, Follow-up) with `<QuotePaymentConfig>`; submit payload now includes all `ticket_*` payment config fields alongside the legacy columns

## [2026-05-20] — Payment settings tab + remittance config

### Added
- `supabase/migrations/065_payment_remittance.sql` — adds `bank_name`, `bank_account_name`, `bank_account_number`, `bank_routing_number`, `zelle_phone`, `zelle_email` columns to `company_settings`
- **Payment** tab in Admin → Settings (`/admin/settings/payment`) with `CreditCard` icon
- **Bank / Wire & ACH Details** section in `PaymentSection` — 4 editable fields (bank name, account name, account number, routing number)
- **Zelle Contact** section in `PaymentSection` — phone and email fields (fill one or both)

### Changed
- `components/admin/settings-tab-nav.tsx` — added Payment tab entry
- `app/(app)/admin/settings/[tab]/page.tsx` — wired `PaymentSection` to the new `payment` tab
- `app/api/public/quotes/[token]/route.ts` — company SELECT now returns the 6 remittance fields so the public quote page can display payment instructions

---

## [2026-05-19] — Fix Sales dashboard KPI accuracy

### Fixed
- `app/api/dashboard/kpis/route.ts` (Sales branch):
  - **Active Deals** was undercounting — removed the incorrect `status === "Routed to Sales"` guard that excluded leads that had progressed to `"Quoted"` status after a quote was sent. Now counts any lead with `sales_status` of `"Ongoing"` or `"Quote Sent"` regardless of lead status.
  - **Won** count was not period-filtered — was reading all-time `leads.sales_status === "Won"` while `won_value` was period-filtered. Both now derive from the same `job_tickets` query (orders in the selected period), so count and value are always in sync.

---

## [2026-05-19] — Prevent past date selection in quote date pickers

### Changed
- `components/ui/date-picker.tsx`: Added `disablePast` prop — when true, all dates before today are greyed out and unselectable in the calendar
- `components/quotes/new-quote-form.tsx`: Due Date and First Reminder pickers now use `disablePast`
- `components/quotes/quote-detail.tsx`: Due Date and First Reminder pickers now use `disablePast`

---

## [2026-05-19] — Cycles follow-up field changed to select

### Changed
- `components/quotes/new-quote-form.tsx`: Follow-up Schedule "Cycles" field changed from a free-entry number input to a `<select>` with fixed options 1–5
- `components/quotes/quote-detail.tsx`: Same change on the quote detail edit form

---

## [2026-05-19] — Prevent leading zeros in numeric inputs

### Fixed
- `components/quotes/new-quote-form.tsx`: Width, Height, Unit Price, and Line Total switched to `type="text" inputMode="decimal"` with local raw string state so decimal values like `0.9` work correctly; Quantity switched to `type="text" inputMode="numeric"`; Shipping and Tax Rate use `onKeyDown` + `onChange` stripping to block leading zeros
- `components/quotes/quote-detail.tsx`: Same fixes for all equivalent numeric inputs in the SKU editor and Adjustments panel
- `components/leads/leads-page.tsx`: Quantity field in Add/Edit Lead form no longer allows leading zeros

## [2026-05-19] — SDR read-only view for routed quotes

### Added
- `supabase/migrations/060_add_routed_by_id_to_tickets.sql` — adds `routed_by_id uuid` column to `job_tickets` to preserve the original SDR's identity after Sales claims the ticket (claiming changes `created_by_id`)
- `components/quotes/quotes-page.tsx`: SDRs now see a **Routed to Sales** tab showing quotes they created that exceeded the threshold; tab shows a "View" button (not Claim) per row
- `components/quotes/quote-detail.tsx`: when SDR views one of their routed quotes, a warning banner explains it's read-only and the Edit button + action bar are hidden

### Changed
- `app/api/tickets/route.ts` (`POST`): sets `routed_by_id = userId` when `ticket_status = "routed"`
- `app/api/tickets/route.ts` (`GET`): SDR query now includes `routed_by_id = userId` so routed (and claimed) tickets remain visible to the original SDR
- `components/quotes/quotes-page.tsx`: routed tab banner text is role-aware (SDR vs Sales/Admin)

---

## [2026-05-19] — Fix HVT modal OK button and add Cancel

### Fixed
- `components/quotes/new-quote-form.tsx`: OK button in the High-Value Threshold modal did nothing — `handleSaveRef.current` was `null` because the modal fires from `validateAndAdvance` (before `handleSave` is ever called). Fixed by setting `handleSaveRef.current = handleSave` before showing the modal.

### Changed
- `components/quotes/new-quote-form.tsx`: Added **Cancel — Edit Amount** button to `HighValueModal` so the SDR can dismiss the modal and adjust the quote total instead of being forced to route to Sales.
- `components/quotes/quote-detail.tsx`: Added **Cancel — Edit Amount** button to the inline HVT modal on the quote detail page for the same reason.

---

## [2026-05-19] — Fix all SDR dashboard KPI numbers

### Fixed
- `app/api/dashboard/kpis/route.ts` — complete rewrite of the SDR KPI queries:
  - **Handled / Routed / Rejected / Quote Value / Share %**: switched from `leads.updated_at >= periodStart` to querying the `activities` table (`created_at`). The old approach counted any lead touched by sales or admin in the period, even if the SDR processed it months ago. Activities are timestamped when the SDR actually performed the action.
  - **On Hold**: was derived from a full-table `sdr_id = userId` scan filtered in JS; now a direct count query with `is_inbox = false, sdr_id = userId, status = 'On Hold'` — no inbox leads bleed in.
  - **Share %**: denominator was all workspace leads updated in period (including unowned rows); now it's distinct leads touched by ANY SDR via the same activity types, giving an apples-to-apples comparison.
  - **Inbox**: (from prior fix) changed from `is_inbox = true` to unclaimed workspace leads matching the sidebar badge logic.

---

## [2026-05-19] — Fix SDR dashboard inbox count

### Fixed
- `app/api/dashboard/kpis/route.ts`: SDR "Inbox" card was always showing 0 — it was querying `is_inbox = true` (AI inbox), but "leads waiting to be claimed" are workspace leads (`is_inbox = false`, status Pending/Validated, no lock). Changed query to match the sidebar `/leads` badge logic: `is_inbox = false AND status IN ('Pending','Validated') AND locked_by_id IS NULL`

---

## [2026-05-19] — Session 2: UI polish, dashboard improvements, bug fixes

### Fixed
- `app/api/leads/workspace/route.ts`: Won tab was always empty — broken PostgREST join (`created_by:user_profiles!job_tickets_created_by_id_fkey`) used a FK that points to `auth.users`, not `user_profiles`. Replaced with a separate `user_profiles` lookup after fetch; "Closed By" column now resolves correctly
- `app/globals.css`: `--color-bg` was set to `#ffffff0c` (4% opacity transparent) instead of `#ffffff` — fixed so light mode background is truly white
- `components/leads/leads-page.tsx` + `components/leads/verify-drawer.tsx`: `Select` `onValueChange` typed `string | null` caused TS build error — resolved with `?? ""`

### Changed

#### Design tokens (`app/globals.css`)
- `--color-bg` (light): `#f8fafc` → `#ffffff` (pure white page background)
- `--color-surface` (light): `#FFFFFF` → `#FAFAFA` (subtle card lift)
- `--color-text-muted` (light): `#888888` → `#666666` (better contrast)
- `--color-warning` (light): `#D97706` → `#B45309` (deeper amber, more readable)

#### Order detail page (`components/quotes/quote-detail.tsx`)
- Combined three separate bottom cards (Cancel Ticket bar, Order Progress, Deposit) into one unified card with divider-separated rows for `ticket_status === "order"`
- Deposit and Payment status selectors replaced with connected segmented controls (`rounded-md` bordered group) — clearly interactive vs badge-style pills
- Deposit row shows amount as prominent value (`$116.85 due now`) beside the control
- "Cancel Ticket" upgraded to a proper bordered danger button (`danger-bg / danger-border / danger`)
- "Mark In Production" uses navy verify-button style as the primary progression action
- Pricing Summary background changed from `--color-badge-bg` to `--color-bg`

#### Admin dashboard (`components/admin/admin-dashboard.tsx`)
- Team section now fetches `/api/admin/team` + `/api/admin/sessions` (7-day) in parallel, merged by user ID — single source of truth for team status
- Team cards show: real-time online dot (`currently_active`), role pill, Sessions / Active time / Last seen stats row, idle sign-out warning badge, active deals (sales only)
- Removed standalone "Active Users" and "Idle Sign-outs" KPI cards — info now lives in the enriched Team cards; KPI grid is a clean 2×3
- Total Leads KPI card: added "In Pipeline" (amber), "Quoted" (blue), "Ordered" (navy) sub-stats alongside Open/Claimed — all period-filtered so the breakdown adds up to the total
- `AdminKpis` type extended with `pipeline_leads`, `quoted_leads`, `ordered_leads`

#### Dashboard KPIs API (`app/api/dashboard/kpis/route.ts`)
- Added three new period-filtered lead counts: `pipeline_leads` (`Routed to Sales` + `Ongoing`), `quoted_leads` (`Quote Sent`), `ordered_leads` (`Won`)
- Removed session stats fetch (no longer needed — moved to Team section)

---

## [2026-05-19] — Dashboard Team section merged with User Activity data

### Changed
- `components/admin/admin-dashboard.tsx` → `TeamSection`: now fetches both `/api/admin/team` and `/api/admin/sessions` (7-day range) in parallel and merges by user ID
- Team cards upgraded: avatar + real `currently_active` online dot + role pill + Sessions / Active time / Last seen stats row + idle auto-signout warning badge + active deals (sales only)
- "Active now" badge shown next to the Team heading when any member has a live session

---

## [2026-05-19] — Order page: segmented controls for Deposit/Payment, improved Cancel button

### Changed
- `components/quotes/quote-detail.tsx`: Replaced round-pill badge-style Deposit and Payment status buttons with connected segmented controls (`rounded-md`, bordered group) — clearly interactive, not ambiguous as status indicators
- Deposit row now shows the deposit amount as a prominent value (`$116.85 due now`) next to the control
- "Cancel Ticket" upgraded from bare text link to a proper bordered danger button (`danger-bg / danger-border`)
- "Mark In Production" uses the primary navy/verify button style for higher visual weight

---

## [2026-05-19] — Combine order-status cards into one

### Changed
- `components/quotes/quote-detail.tsx`: For `ticket_status === "order"` (pre-confirmation), the three separate bottom cards (Cancel Ticket bar, Order Progress, Deposit) are now merged into a single card with divider-separated rows. Draft/sent states are unaffected. The offline Payment status row is also folded in if applicable.

---

## [2026-05-19] — New Quote & Quote Detail UI overhaul + prepayment visibility

### Changed

#### New Quote form (`components/quotes/new-quote-form.tsx`)
- **Info tab layout** — Title and Priority now share a 50/50 row; Due Date and Rush Order share a second 50/50 row (previously all stacked full-width)
- **Priority control** — changed from rounded pill buttons to a segmented control (same pattern as Discount type), keeping per-priority colors (Low=neutral, Normal=navy, High=purple, Urgent=red)
- **Due Date quick picks** — removed "+1w" button; Today / Tomorrow / +3d remaining; active button highlights navy when its date matches the selected value (calendar or click)
- **Rush Order** — redesigned from a large card to a compact inline toggle row matching input height
- **Required fields** — Title and Due Date now block tab advance if empty (red inline errors); Priority asterisk added for clarity
- **Tab navigation guard** — clicking a future tab triggers current-tab validation instead of jumping freely; past tabs click-back freely and show a green step badge; future tabs dimmed at 50% opacity with `cursor: not-allowed`
- **Sales Permit required** — when Tax Exempt is toggled on, Sales Permit # becomes required (red asterisk + inline error) before save or advance

#### Quote Detail (`components/quotes/quote-detail.tsx`)
- **Edit mode layout** — Info section redesigned to match the new-quote-form: Title/Priority 50/50 row, Due Date/Rush 50/50 row, same segmented Priority control, same quick picks, compact Rush toggle
- **Title and Due Date required in edit** — save blocked with inline errors if either is blank
- **Discount display fix** — read-only Pricing Summary was hardcoding `discount_amount: 0`; now derived as `subtotal + shipping − pre_tax_total` so the Discount row shows the correct amount
- **Discount field format** — read-only fields now show `10%` (percent) or `$700` (fixed) instead of bare number or "X fixed"
- **Prepayment in Pricing Summary** — when partial prepayment is saved, the Pricing Summary card shows a "Partial Payment" section below the Total with Due Now (green) and Balance Due Later (amber)
- **Prepayment in read-only fields** — new "Prepayment" field shows `Partial — 25%`, `Partial — $500`, or `Full Payment`
- **Payment methods multi-select** — Card Payment + Zelle can be selected together simultaneously; Offline is mutually exclusive (selecting it clears others, and vice versa); buttons are now independent toggles with a gap rather than a connected segmented bar; hint text "Select all that apply · Offline is exclusive" added

#### Quote email (`lib/integrations/quote-email-template.ts`, `lib/integrations/send-quote.ts`)
- **Payment Schedule section** — when partial prepayment is set, a "Payment Schedule — X% deposit" section appears in the email after the pricing total, with amber "Deposit Due Now" and "Balance Remaining" rows
- `TicketForSend` now carries `prepayment_type` and `prepayment_value`; both passed to `buildQuoteEmail`

#### Public quote page (`app/(public)/q/[token]/page.tsx`)
- **Direct Order CTA** — changed from active "Confirm & Accept Order" to a disabled "Continue to Payment" button with an amber notice: "Online payment is coming soon — a representative will contact you with payment instructions"
- **Quote First CTA** — unchanged: "Confirm & Accept Quote" (active)
- **Direct Order greeting** — updated copy to mention that a rep will be in touch with payment instructions

---

## [2026-05-18] — Product Interests row-based UI (Add Lead + Verify Drawer)

### Added
- `supabase/migrations/059_add_has_design_to_leads.sql` — new `has_design jsonb NOT NULL DEFAULT '{}'` column on `leads` to store per-product design flag

### Changed
- `components/leads/leads-page.tsx` — replaced flat toggle-chip Product Interests section with a dynamic row-based UI; each row has a product single-select (excluding already-chosen products), a quantity number input, and a Has Design yes/no toggle; rows can be added with "+ Add Product Interest" and removed individually
- `components/leads/verify-drawer.tsx` — same row-based Product Interests UI applied to the edit drawer; seeded from existing `lead.interests`, `lead.quantities`, and `lead.has_design`; read-only mode shows rows without edit controls
- `app/api/leads/manual/route.ts` — accepts and inserts `has_design` payload
- `app/api/leads/[id]/route.ts` — added `has_design` to `TRACKED_FIELDS` and the current-lead select query used for change detection
- `lib/types/index.ts` — added `has_design: Record<string, boolean>` to the `Lead` interface

## [2026-05-18] — Automatic password reset email

### Changed
- `lib/integrations/welcome-email-template.ts` — added `isReset` flag; when true, sends a "Your password has been reset" subject and body instead of the new-user welcome variant
- `lib/integrations/send-welcome-email.ts` — accepts and passes through `isReset` param; updated doc comment to cover both use cases
- `app/api/admin/users/[id]/route.ts` — after a successful admin password reset, automatically fires a branded password-reset email to the user (via Instantly AI, fire-and-forget). Email includes their new temp password, a login CTA, and a note to change it immediately

## [2026-05-18] — Input validation before DB save + number field bounds

### Changed
- `components/leads/verify-drawer.tsx` — phone + email validated (format check) before saving; errors shown inline on the inputs
- `components/crm/customer-profile.tsx` — phone + email validated before PATCH; errors shown inline
- `components/leads/leads-page.tsx` — optional email validated (format) in manual lead submit flow; inline error shown
- `components/quotes/new-quote-form.tsx` — customer phone/email format validated on tab advance; quote destination validated for email/phone format on send; discount %, tax rate %, and prepayment % capped at 100 via `max={100}`
- `components/quotes/quote-detail.tsx` — discount %, tax rate %, and prepayment % fields capped at 100
- `components/admin/users-section.tsx` — email format validated before user create POST
- `components/admin/company-section.tsx` — phone validated on save; fixed stale `hasErrors` bug by computing all field errors synchronously in `handleSave`; tax rate and rush surcharge % capped at 100; `FieldInput` component extended with optional `min`/`max` props

## [2026-05-18] — Save PDF on public quote page + email/page data consistency

### Added
- `app/api/public/quotes/[token]/pdf/route.ts` — public PDF download endpoint (no auth required); uses the same `InvoicePDF` renderer as the internal quote page, looked up by `public_token`
- `app/(public)/q/[token]/page.tsx` — "Save PDF" button with printer icon in the reference card row, linking to the new public PDF endpoint

### Fixed
- `lib/integrations/send-quote.ts` — email now uses the pre-computed stored pricing values (`quote_subtotal`, `quote_pre_tax_total`, `quote_tax_amount`, `quote_final_total`) instead of recomputing via `computePricing`. This ensures the email and public page always show identical numbers. Discount amount derived as `subtotal + shipping − pre_tax_total` (same formula as the public page).

## [2026-05-18] — Branded welcome email for new users

### Added
- `lib/integrations/welcome-email-template.ts` — branded HTML email matching the quote email design (navy header, gold CTA, company footer) showing the user's email + temp password
- `lib/integrations/send-welcome-email.ts` — sends the welcome email via Instantly AI (same transport as quotes)
- `components/admin/users-section.tsx` — "Send welcome email" checkbox on the Add User form (checked by default); passes `send_welcome_email` flag to the API
- `app/api/admin/users/create/route.ts` — when `send_welcome_email` is true, fetches company settings and fires the welcome email fire-and-forget via Instantly

## [2026-05-17] — Lock system roles in Admin → Roles panel

### Changed
- `components/admin/roles-section.tsx` — removed "New Role" button; system roles (SDR, Sales Rep, Admin) now show a locked message instead of editable checkboxes — page permissions for system roles cannot be changed from the UI

## [2026-05-17] — Feature spec documentation audit and update

### Changed
- `docs/feature-specs/leads-sdr.md`
  - "Directed to Sales" tab API updated from `?status=Routed+to+Sales` to `?statuses=Routed+to+Sales,Quoted,Validated`
  - Documented that rows are clickable and open the Verify Drawer in read-only mode (previously said "no drawer opens")
  - Added sub-filter pills table (All / Awaiting Claim / In Progress / Quote Sent / On Hold / Dropped)
  - Added "Lead Status" and "Sales Rep" columns to the table column list
  - Admin "View" action renamed to "Edit" action (opens in edit mode, no lock acquired)
  - Admin "Reassign" button updated to "Assign / Reassign" with dynamic label
  - Build status table updated to reflect all the above

- `docs/feature-specs/lead-locking.md`
  - "Admin View Mode" → "Admin Edit Mode" — Admin opens in edit mode (no lock), can save changes
  - Removed outdated "Future — Admin Edit Override" note (the feature is built)
  - Updated lock lifecycle diagram: "Admin clicks View" → "Admin clicks Edit"

- `docs/feature-specs/leads-sales.md`
  - "Sales Drawer" → "Sales Modal" (centered modal, `780px` max-width, `80vh`)
  - Claim behavior: modal now opens immediately after claim (not just row update)
  - Close button documented as inline with other action buttons, just before Save
  - Build status table updated

- `docs/api-contract.md`
  - Added `statuses` query param (comma-separated) to `GET /api/leads/workspace`
  - Updated SDR scoping description to mention `statuses` param and Won-lead exclusion

- `docs/rbac.md`
  - "Leads: View button (Admin — no lock, always read-only)" → "Edit button (Admin — no lock, opens in edit mode)"
  - Lock acquisition table: Admin row updated to edit mode

## [2026-05-17] — Quote visibility E2E matrix and test scenarios added to crm-logic-overview.html

### Added
- `docs/crm-logic-overview.html` — new "Quote / Ticket Visibility & Edit Rights" section under the Test Coverage Guide:
  - **API Scope Rules table** — exact GET / PATCH / claim permissions per role, sourced directly from `app/api/tickets/route.ts` and `app/api/tickets/[id]/route.ts`
  - **Quote Visibility Matrix** — 8-row table mapping every ticket status × every role to view/edit/forbidden; includes HVT routed flow and post-claim SDR access loss
  - **Lead Status Sync table** — documents when `POST /api/tickets` mutates the linked lead (Quoted / Validated / Won) and the downstream effect on Sales Pipeline and SDR tabs
  - **SDR quote E2E scenarios (Q1–Q8)** — edit vs view-only on own quotes, HVT modal trigger, routed-then-claimed access loss (403), and cross-SDR 403
  - **Sales quote E2E scenarios (Q9–Q16)** — own/other-sales 403, HVT claim flow, lead status sync after ticket creation, order conversion, and customer confirmation
  - **Admin quote E2E scenarios (Q17–Q20)** — full list visibility, order lock override, PATCH LOCKED enforcement for non-admins

## [2026-05-17] — Comprehensive E2E test coverage guide added to crm-logic-overview.html

### Added
- `docs/crm-logic-overview.html` — new "Test Coverage Guide" section:
  - **Lead Visibility Matrix** — 13-row table mapping every lead DB state to which role sees it, where, and whether it's editable vs read-only
  - **SDR E2E scenarios (S1–S9)** — tests SDR visibility, lock exclusion, soft-lock attribution persistence, and read-only enforcement on Directed to Sales
  - **Sales E2E scenarios (P1–P8)** — tests pipeline scope (own + unclaimed only), Quoted-status exclusion from Sales page, claim-then-open, On Hold and Rejected tab scope
  - **Admin E2E scenarios (A1–A8)** — tests editability without lock, assign/reassign/unassign, terminal override, and won-tab all-leads visibility
  - **Cross-role lifecycle scenarios (L1–L7)** — full journey from lead creation to Won, concurrent claim race condition, sdr_id protection, session-refresh resilience, Won exclusion from active tabs, and counts badge accuracy
- Deleted leftover `.cursor/debug-0b4363.log` file

## [2026-05-17] — Documentation accuracy audit + debug instrumentation cleanup

### Fixed
- `app/api/leads/workspace/route.ts` — removed leftover `import fs` + `_dbgLog` debug instrumentation that was never cleaned up (dead code, no functional impact, but should not ship)
- `docs/crm-logic-overview.html` — full accuracy audit against source code; corrected 6 documentation errors:
  1. **"Directed to Sales" serverStatuses** — added `"Validated"` to the listed statuses (code sends `Routed to Sales,Quoted,Validated`)
  2. **All Leads tab scope** — documented that the tab only renders `status = "Pending"` or `"Validated"` leads (server returns all non-inbox leads; client filters to those two statuses)
  3. **Sales Pipeline tab scope** — added prominent warning that the Sales page only fetches `status = "Routed to Sales"`; once a quote is created and the lead status advances to `"Quoted"`, the lead exits the Sales Pipeline page and is tracked through Tickets
  4. **Admin Assign/Reassign trigger** — corrected: button label and "Unassign" option are driven by `locked_by_id` (not `sdr_id`)
  5. **Soft-lock model** — documented that closing the lead drawer does NOT release `locked_by_id`; lock is only released on Route or Reject
  6. **"In Progress" sub-filter condition** — corrected to `!!sales_owner_id AND (sales_status === "Ongoing" OR sales_status === null)`

## [2026-05-17] — Documentation update: crm-logic-overview + CHANGELOG reflect all May 17 changes

### Changed
- `docs/crm-logic-overview.html`:
  - **User Roles** — SDR abilities: added "Track routed leads through full sales pipeline (read-only)"; Admin abilities: added Edit any lead, Assign/Reassign SDR
  - **SDR Workflow** — new "SDR Workspace Tabs" table and "Directed to Sales — Full Pipeline Visibility" card documenting sub-filters (Awaiting Claim, In Progress, Quote Sent, On Hold, Dropped) and read-only access rules
  - **Sales Workflow** — new "Claim Behaviour" card explaining immediate modal open, permanent `sales_owner_id` assignment, and SDR `sdr_id` attribution preservation
  - **Record Locking** — new "Lead Lock vs SDR Attribution" table clarifying `locked_by_id` vs `sdr_id` semantics
  - **Admin Override section** — renamed to "Admin Lead Management & Override"; added two-column cards for Admin Lead Editing and Admin SDR Assignment; terminal override table moved inside the section
  - Footer last-updated text updated to reflect all May 17 changes

## [2026-05-17] — Fix: sales user claiming a lead no longer overwrites sdr_id

### Fixed
- `app/api/leads/[id]/lock/route.ts` — lock API now only sets `sdr_id = userId` when the caller has role `sdr`; sales users acquiring a lock to open a lead were silently overwriting the original SDR's `sdr_id`, causing the lead to vanish from the SDR's "Directed to Sales" scoped tab (`scope=mine` filters on `sdr_id`)

## [2026-05-17] — SDR full pipeline visibility in "Directed to Sales" tab

### Changed
- `app/api/leads/workspace/route.ts` — added `?statuses=` param (comma-separated) so the routed tab can query multiple statuses (`Routed to Sales,Quoted`) server-side
- `app/api/leads/workspace/counts/route.ts` — routed badge count now includes `Quoted` leads (not just `Routed to Sales`), so the tab badge stays accurate after a quote is created
- `components/leads/leads-page.tsx`:
  - "Directed to Sales" tab now fetches `Routed to Sales` + `Quoted` leads (SDR keeps visibility after sales creates a quote)
  - Added **sub-filter pills** inside the tab: All · Awaiting Claim · In Progress · Quote Sent — each with a live count badge
  - Added **Lead Status** column to the table so SDR can see whether a lead is still "Routed to Sales" or has advanced to "Quoted"
  - **Unclaimed** badge (amber) in Sales Rep column when no sales rep has picked up the lead yet
  - Rows and mobile cards are now **clickable** — opens the lead read-only in the VerifyDrawer so SDR can review full context when a customer calls back

## [2026-05-17] — Convert SalesDrawer from slide-in panel to centered modal

### Changed
- `components/sales/sales-drawer.tsx` — replaced fixed right-side slide-in panel (`max-w-[600px]`, full height, `borderLeft`) with a centered modal overlay (`max-w-[780px]`, `80vh`, `border-radius: 12px`, all-border) matching the `VerifyDrawer` pattern; interior content unchanged

## [2026-05-17] — Admin lead editing and SDR assignment

### Added
- Admin can now **assign unclaimed leads** to any SDR directly from the All Leads table — an "Assign" button appears on every unclaimed row; claimed rows show "Reassign"
- "Unassign" option in the modal is only shown when the lead already has an SDR; Confirm is disabled until an SDR is selected for fresh assignments

### Changed
- `components/leads/leads-page.tsx` — admin action column: "View" renamed to "Edit"; Assign/Reassign button always visible regardless of `locked_by_id`; Reassign/Assign modal title and SDR picker updated dynamically
- `components/leads/verify-drawer.tsx` — when opened by an admin (`isAdmin=true`), the drawer is now editable (not read-only) and the footer shows "Close" + "Save Changes" instead of SDR workflow buttons (Route to Sales, Hold, Reject)

## [2026-05-17] — Documentation audit + clean build confirmed

### Changed
- `docs/TODO.md` — marked Reports placeholder page as `[DONE]`; added section with migration/activation notes
- `docs/session-summary.md` — `/reports` added to navigation table; migration 058 added to migrations table; Reports row added to build queue as ✅ Done
- `docs/component-architecture.md` — added `/reports` section describing `reports-page.tsx` structure
- `docs/crm-logic-overview.html` — replaced "What's Left?" reports open-question card with actual status table showing all 7 planned reports and Stripe dependency
- `npx next build` verified clean (all 22 routes, zero TS errors)

## [2026-05-17] — Reports placeholder page

### Added
- `supabase/migrations/058_add_reports_page.sql` — adds `/reports` to the `pages` table (section: main, sort_order: 9)
- `app/(app)/reports/page.tsx` — thin server wrapper
- `components/reports/reports-page.tsx` — placeholder page explaining all 7 planned report types, each with a dependency note (most require Stripe), plus a "Go to Dashboard" CTA for what's available now. One report (Win Rate & Close Time) is flagged as buildable without payment data.

### Changed
- Admin must grant `/reports` access to roles via Admin → Roles & Permissions after running the migration

## [2026-05-17] — Dashboard fixes, admin overrides, order lifecycle

### Fixed
- `app/api/dashboard/kpis/route.ts` — **TODO-004**: Revenue and won-value KPIs now sum `job_tickets.quote_final_total` (actual final prices) instead of `leads.quote_total` (stale snapshot). Pipeline value also reads from `job_tickets`. Applies to both Sales and Admin dashboard variants.

### Added
- `components/quotes/quote-detail.tsx` — **TODO-005**: "Mark In Production" / "Mark Completed" lifecycle buttons visible to admin on orders. Advances `ticket_status`: `order → in_production → completed`. Completed orders show a green "Order completed" badge. Uses existing `handleSave(undefined, extraFields)` path.
- `components/admin/admin-dashboard.tsx` — **Dashboard session KPIs**: two new KPI cards — "Active Users" (users with an open session right now) and "Idle Sign-outs" (auto sign-outs in the last 7 days). Data sourced from `/api/admin/sessions`.

### Changed
- `components/sales/sales-drawer.tsx` — **TODO-001**: Added `isAdmin` prop. When admin views a terminal lead (Won / Dropped / Rejected) an amber "Admin override" banner replaces the red lock banner, and the drawer is fully editable. Won leads show a caution note to handle the linked ticket separately.
- `components/leads/verify-drawer.tsx` — **TODO-001**: Same admin override pattern for rejected leads. Non-admin users still see the red lock banner and a read-only drawer.
- `components/sales/sales-page.tsx` — passes `isAdmin={isAdmin}` to `<SalesDrawer />`
- `components/leads/leads-page.tsx` — passes `isAdmin={isAdmin}` to `<VerifyDrawer />`

## [2026-05-17] — User session tracking + idle sign-out

### Added
- `supabase/migrations/056_add_idle_timeout_to_company_settings.sql` — `session_idle_timeout_minutes` int (default 20, min 5, max 480) on `company_settings`
- `supabase/migrations/057_create_user_sessions.sql` — `user_sessions` table with indexes and RLS; one row per login session, tracks sign-in/out times and sign-out reason
- `app/api/auth/session/route.ts` — `POST /api/auth/session` — logs session start (after MFA) and end (manual/auto/deactivated); closes stale open sessions on new login
- `app/api/admin/sessions/route.ts` — `GET /api/admin/sessions` — returns per-user KPI summary + paginated session history; filterable by user and date range; admin only
- `components/layout/idle-timer.tsx` — client component mounted in app layout; reads timeout from company settings; tracks mouse/keyboard/touch activity; shows blocking warning modal 2 min before sign-out; auto sign-outs with session logging
- `app/(public)/policy/page.tsx` — plain-English security & privacy policy page at `/policy`; no auth required; explains session logging and admin visibility
- `components/admin/user-activity-section.tsx` — admin view with per-user KPI cards (sessions, active time, auto sign-out count, currently active indicator) + filterable session history table (today / 7d / 30d + user filter)

### Changed
- `app/(app)/layout.tsx` — mounts `<IdleTimer />` so it runs on every app page
- `app/(auth)/verify-2fa/page.tsx` — calls `POST /api/auth/session { action: "start" }` after successful MFA verify (fire-and-forget)
- `components/layout/sidebar.tsx` — calls `POST /api/auth/session { action: "end", reason: "manual" }` before sign-out
- `components/layout/mobile-nav.tsx` — same session-end call as sidebar
- `components/admin/company-section.tsx` — added "Session & Security" section with idle timeout input and link to `/policy`
- `app/api/admin/company/route.ts` — added `session_idle_timeout_minutes` to `ALLOWED_FIELDS`
- `lib/types/index.ts` — added `session_idle_timeout_minutes` to `CompanySettings`; added `UserSession`, `UserSessionSummary`, `SignOutReason` types
- `app/(app)/notifications/page.tsx` — converted to 2-tab layout: "Order / Lead Activity" (existing) + "User Activity" (new)
- `proxy.ts` — `/policy` added to `isPublic` paths (no auth required)

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
- `components/quotes/quote-detail.tsx` — mobile-responsive overhaul:
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
- `components/quotes/quote-detail.tsx`: `PaymentLinkBar` now has a 3-way channel selector (Email / SMS / WhatsApp), a destination input pre-filled with the original channel destination, and a "Send Payment Link" button. Rep can switch channels before sending (e.g. originally emailed, now want to WhatsApp).
- `app/api/tickets/[id]/route.ts`: `send_payment_reminder` now accepts `reminder_channel` and `reminder_destination` overrides, passed to `sendPaymentReminder()`.

## [2026-05-16] — Payment link bar on confirmed orders

### Added
- `components/quotes/quote-detail.tsx`: **Payment link bar** shown on all confirmed (customer-approved) orders where payment is not yet complete. Visible to all roles regardless of record lock. Contains:
  - Copyable public URL (`/q/[token]`) to paste into any channel
  - "Resend via Email/SMS" button that re-sends the original quote email (the same link the customer already has) and logs a `ticket_payment_reminder_sent` activity
  - Payment method label (Offline / Zelle / Card)
- `app/api/tickets/[id]/route.ts`: `send_payment_reminder: true` body flag triggers re-delivery and activity log without touching the ticket fields.
- `components/quotes/quote-detail.tsx`: History tab shows `ticket_payment_reminder_sent` events ("Payment reminder sent").

## [2026-05-16] — SDR/Sales Won tracking + Won tab

### Added
- `components/leads/leads-page.tsx`: New **Won** tab shows all leads where `sales_status = "Won"` — the leads that became real orders. Shows customer name, company, order reference code, final amount, who closed it, and when.
- `app/api/leads/workspace/counts/route.ts`: `won` count added to the counts response, scoped to the SDR's own leads (admins see all).
- `app/api/leads/workspace/route.ts`: `?won=true` query param returns won leads with linked ticket data (reference code, amount, closer name).

### Changed
- `app/api/public/quotes/[token]/confirm/route.ts`: When a customer confirms a quote, the linked lead's `sales_status` is now automatically set to `"Won"`. Covers Case 1 (SDR routed → Sales closed), Case 2 (SDR did it directly), and skips Case 3 (direct order, no lead).
- `app/api/tickets/[id]/route.ts`: Same auto-update when a rep manually clicks "Convert to Order".

## [2026-05-16] — HubSpot-style "Convert to Order" flow

### Changed
- `components/quotes/quote-detail.tsx`: "Mark Won" button renamed to **"Convert to Order"** and now targets `ticket_status = "order"` (not the orphan `approved` status).
- `app/api/tickets/[id]/route.ts`: When a ticket is manually converted to `order` status, the API now auto-generates an `ORD-YYYY-NNN` reference code (same as customer confirmation path) and flips `ticket_kind` to `"order"`.
- `app/api/tickets/[id]/route.ts`: Manual conversion logs a dedicated `ticket_converted` activity (distinct from `ticket_client_confirmed`), so History always shows who converted it.
- `components/quotes/quote-detail.tsx`: Header badge is now three-way — **"Confirmed by Customer"** (green, customer clicked link), **"Converted to Order"** (blue, sales rep converted manually), or the regular status pill for quotes still in progress.
- `components/quotes/quote-detail.tsx`: History tab handles `ticket_converted` activity type with label "Converted to order" and the generated reference code.

## [2026-05-16] — Confirmed by Customer badge + edit lock

### Changed
- `components/quotes/quote-detail.tsx`: Header status badge replaced with a green "✓ Confirmed by Customer" badge when `client_confirmed = true`, instead of the generic "order" pill.
- `components/quotes/quote-detail.tsx`: Edit button is now hidden for **all users** (including admin) once the customer has confirmed. Admin can still cancel via the bottom action bar.

## [2026-05-16] — Record locking after customer approval

### Changed
- `components/quotes/quote-detail.tsx`: Once a quote is customer-approved and becomes an order (`ticket_status` is `order`, `in_production`, or `completed`), the record is now locked for all non-admin users. SDR and Sales roles cannot edit or cancel the ticket.
- `components/quotes/quote-detail.tsx`: Admins retain full control — they can still edit and cancel orders.
- `components/quotes/quote-detail.tsx`: A warning banner ("This record is locked…") is shown to non-admin users when viewing a locked order, explaining that only an admin can make changes.

## [2026-05-16] — Log quote resend in history

### Fixed
- `app/api/tickets/[id]/route.ts`: Resending a quote (clicking "Resend Quote" when status is already `sent`) now always logs a `ticket_sent` activity, not just on the first send. The payload includes `resend: true` to distinguish it.
- `components/quotes/quote-detail.tsx`: History shows "Quote resent to customer" (vs "Quote sent to customer") when `payload.resend` is `true`

## [2026-05-16] — Short reference ID visible on quote detail and searchable

### Changed
- `components/quotes/quote-detail.tsx`: Title row now shows `/ #XXXXXXXX` (first 8 chars of ticket UUID, uppercased) next to the quote/order title so customers and staff can reference the same ID seen on the PDF
- `components/quotes/quotes-page.tsx`: Search now also matches the short 8-char ID so you can search `1649D8D7` and find the quote
- `lib/integrations/send-quote.ts`: Email now shows the short ID as the quote reference when no `reference_code` exists (quotes), matching the PDF filename
- `app/api/dev/quote-email-preview/route.ts`: Preview now passes a realistic short ID for testing

## [2026-05-16] — Rich history events for quote sent and customer confirmed

### Changed
- `app/api/tickets/[id]/route.ts`: When `ticket_status` changes to `"sent"`, now logs a dedicated `ticket_sent` activity with `channel`, `destination`, and `recipient` in the payload instead of the generic `order_ticket_status_changed`
- `app/api/public/quotes/[token]/confirm/route.ts`: Customer confirmation now logs `ticket_client_confirmed` instead of `order_ticket_status_changed`, with `via: "public_link"` and the generated `reference_code`
- `components/quotes/quote-detail.tsx` History tab: updated `ACTIVITY_META` labels ("Quote sent to customer", "Customer confirmed quote") and `activityDetail` to show channel + recipient for sent events and order reference for confirmation

## [2026-05-16] — Allow editing orders with no payment made

### Changed
- `components/quotes/quote-detail.tsx`: Edit button now shows on orders when `payment_status` is `"unpaid"` (or unset); locks once payment is `"partial"` or `"paid"`

## [2026-05-15] — Merge Info / Line Items / Quote tabs into single Info tab

### Changed
- `components/quotes/quote-detail.tsx`: collapsed the three edit tabs (Info, Line Items, Quote) into a single **Info** tab; History remains its own tab
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
- `components/orders/orders-page.tsx` — row click and "View" button now navigate to `/orders/${id}` instead of `/quotes/${id}`, so the sidebar highlights Orders (not Quotes) when viewing an order.

## [2026-05-15] — New Quote: phone-first customer lookup on Step 1

### Changed
- `components/quotes/new-quote-form.tsx` — Customer tab redesigned:
  - Field order is now **Phone | Email → First Name | Last Name → Company**
  - Phone is always editable and acts as the search key: after 600ms of no typing (with ≥7 digits), calls `GET /api/customers/lookup?phone=…`
  - If an existing customer is found: all other fields auto-fill and lock (read-only, visually dimmed). A green "✓ Existing customer: Name" banner appears with a **Clear** button to reset.
  - If no match: all fields remain editable and required fields are validated before advancing.

## [2026-05-14] — Payment status on orders (Unpaid / Partial / Paid)

### Added
- `supabase/migrations/053_add_payment_status_to_tickets.sql` — adds `payment_status` column (`unpaid` default, `partial`, `paid`) to `job_tickets`. Run in Supabase dashboard SQL editor.
- `components/orders/orders-page.tsx` — new **Payment** column with color-coded pill: red Unpaid, amber Partial, green Paid.
- `components/quotes/quote-detail.tsx` — payment status bar on order detail page; SDR/admin can click Unpaid / Partial / Paid to update instantly without re-opening edit mode.

### Changed
- `lib/types/index.ts` — added `payment_status` to `JobTicket` type.
- `app/api/tickets/[id]/route.ts` — added `payment_status` to `ALLOWED_FIELDS`; relaxed order-lock so non-admin users can update `payment_status` even after a ticket is in order status.

## [2026-05-14] — Fix: Orders count badge showing 0 in sidebar

### Fixed
- `app/api/sidebar-counts/route.ts` — `/orders` badge now counts by `ticket_status = "order"` instead of `ticket_kind = "order"`. Covers both old tickets (kind=quote, status=order) and new tickets (kind=order, status=order).
- `app/api/tickets/counts/route.ts` — `orders` count fixed the same way so the Orders tab badge on the Orders page is also accurate.

## [2026-05-14] — Resend Quote button + fix disappearing Send button

### Changed
- `components/quotes/quote-detail.tsx` — when a quote is already in `sent` status, a **Resend Quote** button is shown instead of hiding the action entirely. Clicking it re-sends the quote to the customer via the same channel.
- `app/api/tickets/[id]/route.ts` — removed the `existing.ticket_status !== "sent"` guard so `sendQuoteToCustomer` is triggered on every PATCH that sets status to `"sent"`, enabling resends.

## [2026-05-14] — Fix: Approved Quotes No Longer Appear in Quoted Requests

### Fixed
- `app/api/public/quotes/[token]/confirm/route.ts` — now also sets `ticket_kind = "order"` (alongside `ticket_status = "order"`) when a customer confirms. This removes the ticket from the `?kind=quote` API filter used by the Quotes page.
- `components/quotes/quotes-page.tsx` — added defensive filter to exclude any ticket with `ticket_status === "order"` from all tabs, covering tickets confirmed before this fix.

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
- `components/quotes/quote-detail.tsx` — "Send Quote" button now shows a `Mail` icon (lucide-react) to the left of the label, making it immediately clear the quote is sent via email.
- `components/quotes/quote-detail.tsx` — "Send Via" and the contact destination field (email / phone / location) in the **Send Quote to Customer** and **Send Payment Link** sections now show a required `*` asterisk. Saving a draft quote or clicking **Send Quote** blocks and shows an inline error if the destination field is blank; error clears as soon as the user types. Added `quoteDestinationError` state; validation added inside `handleSave` before `setSaving(true)`.
- `components/quotes/new-quote-form.tsx` — Same required-field enforcement for the **Send Quote to Customer** / **Send Payment Link** sections in the Quote tab. `quoteDestinationError` prop added to `QuoteTabProps`; validation added in `validateAndAdvance` (when leaving the Quote tab) and in `handleSave` (when status is `"sent"`). Error clears on input via wrapped setter `clearQuoteDestinationError`. Both `EmailInput` and `PhoneInput` receive the `error` prop; plain text input gets a red border + `<p role="alert">` message.

## [2026-05-14] — PDF download for quotes and orders

### Added
- `lib/pdf/invoice-pdf.tsx` — `@react-pdf/renderer` React component (`InvoicePDF`) that produces a styled PDF: company header (logo or text name, address, phone, email, website), Bill To, Prepared By, line items table (product, spec, qty, unit price, line total), pricing summary (subtotal → shipping → discount → pre-tax → tax → total), payment methods, delivery channel, special requirements, gold-accent footer. Supports QUOTE and INVOICE document types.
- `app/api/tickets/[id]/pdf/route.ts` — authenticated GET endpoint; fetches ticket + company settings, renders PDF with `renderToBuffer`, returns `application/pdf` + `Content-Disposition: attachment; filename="Quote-REF.pdf"`. One click in the browser downloads the file directly.
- `app/api/tickets/[id]/print/route.ts` — (kept) HTML fallback; returns a fully styled standalone HTML invoice with `@media print` rules and auto-print script when loaded in an iframe.

### Changed
- `components/quotes/quote-detail.tsx` — replaced the iframe-based print hack with a plain `<a href="/api/tickets/[id]/pdf" download>` link. No JavaScript needed.
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
- `components/quotes/quote-detail.tsx` — SDR users editing an existing `draft` quote now trigger the same High-Value Threshold blocking modal as the new-quote flow. If the final total exceeds the threshold, a non-dismissible modal with a 30-second countdown appears; on "OK" or timeout the quote is saved as `routed` and the SDR is redirected to `/quotes`. Applies regardless of whether the draft was created from a lead, the CRM, or the Quotes page.

## [2026-05-13] — Backfill routed status for pre-migration SDR quotes

### Added
- `supabase/migrations/051_backfill_routed_status.sql` — one-time backfill that finds `draft` quotes created by SDR users whose `quote_final_total` exceeds the company's `high_value_threshold`, and sets their `ticket_status` to `routed` so Sales can see and claim them in the new "Routed to Sales" tab



### Added
- `lib/types/index.ts` — added `'routed'` to `TicketStatus` union
- `components/quotes/quotes-page.tsx` — "Routed to Sales" tab (visible only to `sales` and `admin` roles); dedicated table layout showing SDR name, total, and a "Claim" button; routed tickets hidden from all other tabs; amber badge on the tab
- `app/api/tickets/[id]/route.ts` — `claim_ownership: true` in PATCH body triggers a claim flow: validates ticket is `routed`, updates `ticket_status → draft` and `created_by_id → claimant`, logs activity. GET now also allows `sales`/`admin` to view `routed` tickets they don't own.
- `app/api/tickets/counts/route.ts` — added `routed` count for `sales`/`admin` roles
- `app/api/sidebar-counts/route.ts` — `/quotes` badge for `sales`/`admin` now includes unclaimed routed ticket count

### Changed
- `components/quotes/new-quote-form.tsx` — high-value HV redirect saves ticket as `'routed'` instead of `'draft'`; `handleSave` signature updated to accept `"routed"`
- `app/api/tickets/route.ts` — GET: `sales` users now receive their own tickets **or** tickets with `ticket_status = 'routed'`; routed tickets are enriched with `created_by_name` (SDR display name from `user_profiles`)



### Added
- `components/quotes/new-quote-form.tsx` — when an SDR user clicks "Next" from Line Items and the quote total exceeds the company's High-Value Threshold, a blocking modal appears with a 30-second animated countdown ring. On "OK" or countdown expiry the draft is auto-saved and the user is redirected to `/quotes` so a Sales rep can claim it. The user cannot dismiss the modal in any other way.
- Fetches current user's role on mount via Supabase `user_profiles` so the check only applies to `sdr` users.



### Changed
- `components/crm/crm-page.tsx` — added "Add Quote" (`FilePlus`) button next to "View" in both table row and card view; clicking it navigates to `/quotes/new` with customer fields pre-filled as query params
- `components/quotes/new-quote-form.tsx` — reads `first_name`, `last_name`, `email`, `phone`, `company` from URL search params to pre-fill the Customer tab; automatically skips to the Info tab when arriving with customer data already filled

## [2026-05-13] — Fix sidebar counts; move "Won" to Quotes page

### Fixed
- `app/api/sidebar-counts/route.ts` — sidebar badge for "Quoted Requests" was always 0 because `ticketQuery()` returns data rows (not a count), so switched to `(data ?? []).length`. Also added `approved` to the `/quotes` badge statuses.

### Changed
- `components/quotes/quotes-page.tsx` — renamed "Approved" tab to **"Won"** (customer accepted quote).
- `components/orders/orders-page.tsx` — removed "Won" / `approved` tab and status from Orders; `approved` tickets now live exclusively on the Quotes page. Orders page now only shows `order` and `cancelled`.
- `app/api/sidebar-counts/route.ts` — `/quotes` badge includes `draft + sent + approved`; `/orders` badge counts only `ticket_status = "order"`.

## [2026-05-13] — Use admin-panel lookups for priority, channel, payment, follow-up freq

### Changed
- `components/quotes/quote-detail.tsx` — fetches `ticket_priority`, `quote_channel`, `ticket_payment`, `follow_up_freq` from `/api/lookups`; hardcoded arrays (`PRIORITY_OPTIONS`, `CHANNEL_OPTIONS`, `PAYMENT_OPTIONS`, `FOLLOW_UP_FREQ`) kept only as fallbacks. `InfoSection` and `QuoteSection` now receive these as props.

### Added
- `supabase/migrations/050_add_urgent_priority.sql` — seeds `('ticket_priority', 'urgent', 'Urgent', 3)` so "Urgent" appears in priority dropdowns from the admin panel



### Changed
- `components/quotes/quote-detail.tsx` — Quote tab now renders two distinct flows:
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
- `components/quotes/new-quote-form.tsx` — quote delivery destination now renders `EmailInput` when channel is Email, `PhoneInput` when SMS/WhatsApp, plain text input otherwise
- `components/quotes/quote-detail.tsx` — same conditional-component pattern for quote destination as above; label also updated to reflect In-person / SMS / WhatsApp channels

## [2026-05-13] — Add Integrations section to Admin panel

### Added
- `components/admin/integrations-section.tsx` — placeholder page showing Stripe and Zelle cards with "Coming soon" badges, planned feature bullets, and disabled "Configure" buttons
- `app/(app)/admin/settings/[tab]/page.tsx` — registered `integrations` as a supported tab
- `app/(app)/admin/page.tsx` — added Integrations overview card with `Plug` icon
- `components/admin/settings-tab-nav.tsx` — added Integrations tab link

---

## [2026-05-12] — Guard inactive/deleted lookup values in all selects

### Changed
- `components/quotes/new-quote-form.tsx` + `components/quotes/quote-detail.tsx` — replaced `withSavedValue` helper with `renderLookupOptions`. If a saved value is no longer in the active list (deactivated or hard-deleted), it is re-injected as `"<label> (inactive)"` with the HTML `value` attribute set to the **original label string** so the stored data is never silently wiped on save. Applied to all SKU and Quote tab selects.

---

## [2026-05-12] — Quote tab dropdowns (Priority, Channel, Payment, Follow-up) now dynamic

### Changed
- `components/quotes/new-quote-form.tsx` — removed hardcoded `PRIORITY_OPTIONS`, `CHANNEL_OPTIONS`, `PAYMENT_OPTIONS`, `FOLLOW_UP_FREQ` constants and dead `PREPAY_OPTIONS`. All four are now loaded via `/api/lookups?categories=ticket_priority,quote_channel,ticket_payment,follow_up_freq` in the same single request that already fetches SKU lookups. Added `QuoteLookups` type. `InfoTab` and `QuoteTab` accept the lookup arrays as props.

---

## [2026-05-12] — SKU dropdowns now fully admin-managed (no more hardcoded options)

### Changed
- `components/quotes/new-quote-form.tsx` + `components/quotes/quote-detail.tsx` — Lamination, Color Mode, Sides, Roll Direction, and Add-on Finishings are now loaded at runtime from `/api/lookups?categories=lamination,color_mode,sides,roll_direction,finishing`. Hardcoded option arrays removed. Fallback to built-in values if API data is not yet loaded.
- Admin → Dropdown Options now shows all 5 SKU categories under **Order / Quote** section (Color Mode, Sides, Roll Direction were registered via migration 048; Add-on Finishings / Lamination were already present)

---

## [2026-05-12] — Match shadow project SKU field order; add Line Item Comment

### Changed
- `components/quotes/new-quote-form.tsx` — `SkuRow` fields reordered to match shadow project: Product Type / Material → Width / Height → Color Mode / Sides → Quantity / Unit Price → **Lamination / Roll Direction** (side-by-side, always visible). Roll Direction is no longer conditional. Added line-price banner and Line Item Comment textarea. Add-on Finishings section split into UV Coating / Foil / Perforation checkboxes + Design on file / Die Cut row.
- `components/quotes/quote-detail.tsx` — `EditableSkuRow` updated with same field order and new fields. Read-only card now shows comment.
- `lib/utils/ticket-math.ts` — `QuoteSku` extended with `comment?: string`

---

## [2026-05-12] — Add Color Mode, Sides, Roll Direction to SKU form

### Added
- `supabase/migrations/048_add_sku_lookup_values.sql` — seeds three new admin-managed lookup categories: `color_mode`, `sides`, `roll_direction`
- `app/api/admin/lookups/route.ts` — registers the three new categories in `CATEGORY_META` so they appear under Admin → Dropdown Options → Order / Quote

### Changed
- `lib/utils/ticket-math.ts` — `QuoteSku` interface extended with `color_mode`, `sides`, `roll_direction` optional fields
- `components/quotes/new-quote-form.tsx` — SKU row now renders Color Mode + Sides in a 2-column grid row, and Roll Direction (conditionally, for roll-based product types)

---

## [2026-05-12] — Close shadow project gaps in new-quote-form

### Changed
- `components/quotes/new-quote-form.tsx`
  - SKU description is now auto-derived on every field change: `productType – material – lamination` (shadow project rule; needed for PDF)
  - Quote destination input now uses `type="tel"` for SMS and WhatsApp channels (was `type="text"`)
  - Prepayment section now shows **Due now / Balance** split below the input, using the shadow project's prepayment formula

## [2026-05-12] — Clickable phone and email across all lead/customer cards

### Changed
- `components/quotes/new-quote-form.tsx` — phone → `tel:` link, email → `mailto:` link in LeadInfoCard; both styled in accent color with hover opacity
- `components/quotes/quote-detail.tsx` — same in LinkedLeadCard
- `components/crm/customer-profile.tsx` — phone and email in the contact fields grid are now `tel:` / `mailto:` links

## [2026-05-12] — Quote detail page Linked Lead card shows full context

### Changed
- `components/quotes/quote-detail.tsx` — `LinkedLeadCard` shows industry, returning customer badge, source, urgency, product interests + quantities, and SDR notes. Updated `Lead` interface to include `source`, `sdr_comment`, `is_returning_customer`, `interests`, `quantities`, `customer.industry`. *(May 2026: removed deprecated `initial_interest` / "What they need".)*

## [2026-05-12] — New quote lead info card shows full lead context

### Changed
- `components/quotes/new-quote-form.tsx` — `LeadInfoCard` shows lead data: name + company + industry, returning customer badge, phone, email, lead source, urgency, product interests + quantities (bullet list), SDR notes. Updated `LeadInfo` interface to include `sdr_comment`, `is_returning_customer`, `interests`, `quantities`, `customer.industry`, `customer.website`. *(May 2026: removed deprecated `initial_interest` field.)*

## [2026-05-12] — Fix: GET /api/leads/[id] was missing

### Fixed
- `app/api/leads/[id]/route.ts` — added `GET` handler; previously only `PATCH` existed. Without this, `new-quote-form.tsx` could never fetch the lead on page load, so `customer_id` was always null on created tickets and the lead info card was always empty.

## [2026-05-12] — CRM customer profile shows Quotes & Orders

### Changed
- `components/crm/customer-profile.tsx` — replaced "Order History" placeholder with a live list of quotes and orders for the customer; fetches `GET /api/tickets?customer_id=<id>` in parallel with the customer data; each row shows kind icon, title, Rush badge, reference code, relative date, total, and status pill; clicking a row navigates to `/quotes/[id]`
- `app/api/tickets/route.ts` — added `customer_id` query param filter so the CRM can fetch tickets scoped to a specific customer

## [2026-05-12] — Fix: tickets API DB_ERROR on user_profiles join

### Fixed
- `app/api/tickets/route.ts` — removed `created_by:user_profiles!job_tickets_created_by_id_fkey` from the SELECT; `created_by_id` references `auth.users`, not `user_profiles`, so PostgREST had no FK path and returned a 500. Creator name is not shown in the list view so the join was unnecessary.
- `app/api/tickets/[id]/route.ts` — same bad join removed; creator profile is now fetched with a separate `user_profiles` query after the ticket is loaded. Also fixed `lead:leads(...)` select — removed `first_name`, `last_name`, `industry`, `notes` which don't exist on the `leads` table (those live on `customers`); the invalid column names caused Supabase to return null even when the ticket existed, producing a false 404.

## [2026-05-12] — Fix: Save Draft redirects to Quoted Requests list

### Changed
- `components/quotes/new-quote-form.tsx` — after saving: **Save Draft** → `/quotes` (list), **Save & Send Quote** → `/quotes/[id]` (detail page for immediate follow-up)

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
- `components/quotes/quotes-page.tsx` — Quoted Requests list; tabs: All / Draft / Sent / Approved with count badges on all tabs; search by contact, company, title or reference; columns: Contact, Title, Channel, Total, Status, Follow-up (red if overdue), Created; clicking any row or View button navigates to `/quotes/[id]`; listens to `bazaar:tickets-changed` for realtime silent refresh
- `components/orders/orders-page.tsx` — Orders list; tabs: All / Active / Won / Cancelled with count badges; search; columns: Order #, Contact, Title (with Rush lightning bolt), Total, Priority (colour-coded), Due Date (orange = due soon, red = overdue), Status, Created; navigates to `/quotes/[id]` (same ticket record); realtime via `bazaar:tickets-changed`

### Changed
- `app/(app)/quotes/page.tsx` — replaced spec preview placeholder with `<QuotesPage />`
- `app/(app)/orders/page.tsx` — replaced spec preview placeholder with `<OrdersPage />`
- `app/api/sidebar-counts/route.ts` — added `/quotes` count (active non-cancelled quote tickets) and `/orders` count (sent/order-status tickets) so the sidebar nav badges populate for those two pages

## [2026-05-12] — Enable Realtime on job_tickets

### Added
- `supabase/migrations/047_enable_job_tickets_realtime.sql` — `REPLICA IDENTITY FULL` + `ALTER PUBLICATION supabase_realtime ADD TABLE public.job_tickets`; same pattern as migrations 035/036 for `leads`/`activities`. Without this, the sidebar's `tickets-realtime` channel would subscribe successfully but never receive any events from the DB.

## [2026-05-12] — Quote/Order realtime refresh + full lifetime history

### Changed
- `components/quotes/quote-detail.tsx`
  - Listens to `bazaar:tickets-changed` and `bazaar:leads-changed` events (broadcast by sidebar realtime subscriptions) — silently re-fetches the ticket + linked lead whenever either changes; edit-state is not clobbered if the user is actively editing
  - History tab now fetches the **complete lifetime** of the record (all lead activities from `leads` + all ticket activities from `job_tickets`) via `GET /api/activities?ticket_id=xxx&include_linked_lead=true`
  - History redesigned: vertical timeline, date separators, per-event icons, human-readable labels, **Lead / Ticket source badge** on each row so you can see exactly when the lead became a quote and then an order
  - History section listens to `bazaar:activities-changed` to auto-append new entries without a full page reload
- `components/quotes/new-quote-form.tsx` — lead info card now silently refreshes when `bazaar:leads-changed` fires (another user may update the lead while the form is open)
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
- `components/quotes/new-quote-form.tsx` — full 3-tab (Info → Line Items → Quote) create form; shows lead info card on the left; pre-fills contact email from lead; Save Draft + Save & Send Quote footer actions
- `app/(app)/quotes/[id]/page.tsx` — server shell for quote detail/edit page
- `components/quotes/quote-detail.tsx` — 4-tab (Info | Line Items | Quote | History) view/edit component; read-only by default, edit mode toggled by Edit button; status-aware action bar (Send Quote / Mark Won / Cancel Ticket); linked lead card in sidebar; skeleton loader

### Changed
- `components/leads/verify-drawer.tsx` — "Create Quote / Order" button is now live: saves the lead silently then navigates to `/quotes/new?lead_id=<id>`; added `useRouter` + `handleCreateQuote`
- `components/sales/sales-drawer.tsx` — same: "Create Quote / Order" now saves sales fields silently then navigates to `/quotes/new?lead_id=<id>`
- `docs/order-ticket/integration-plan.md` — Phase 6 updated to document the design change from modal (OrderDrawer) to dedicated pages (`/quotes/new` + `/quotes/[id]`)

## [2026-05-12] — Fix: rejection from Sales clears sales_status

### Fixed
- `components/sales/sales-drawer.tsx` — `handleRejectConfirm` now also patches `sales_status: null` alongside `status: "Rejected"`. Previously `sales_status` was left as "Ongoing" even after rejection, causing it to display incorrectly anywhere the sales status was shown.

---

## [2026-05-12] — Disable backdrop click-to-close on lead drawers

### Changed
- `components/leads/verify-drawer.tsx` — backdrop `onClick` removed; clicking outside the modal no longer closes it. Users must use Save, Route to Sales, On Hold, Reject, or the ✕ header button.
- `components/sales/sales-drawer.tsx` — same change; backdrop is now a visual overlay only.

---

## [2026-05-12] — Restore Save button in Verify Drawer

### Fixed
- `components/leads/verify-drawer.tsx` — re-added the **Save** button to the footer action bar. The `handleSave` function was already implemented but had no button wired to it. Save appears as the first action (navy/verify style), followed by Route to Sales, On Hold / Resume, and Reject. Save goes through `promptThenRun` so the "update customer profile?" prompt still fires when contact fields change.

---

## [2026-05-12] — Lead forms use DB-driven dropdown options

### Changed
- `components/leads/leads-page.tsx`:
  - Expanded `/api/lookups` fetch to include `urgency`, `route_reason`, `sales_drop_reason` in addition to existing `source`, `industry`, `hold_reason`, `reject_reason`
  - Replaced hardcoded `URGENCY_OPTIONS` with `lookups.urgency` from DB (prepends a static "Not Defined" entry)
- `components/leads/verify-drawer.tsx`:
  - Removed hardcoded `URGENCY_OPTIONS` and `REJECT_REASONS` constants
  - Urgency select now uses `lookups.urgency` passed from `leads-page`
  - Rejection reason select now uses `lookups.reject_reason` passed from `leads-page`
  - `HoldSubForm` now receives `reasons={lookups.hold_reason}` instead of using a hardcoded constant
- `components/leads/hold-sub-form.tsx`:
  - Removed `HOLD_REASONS` import from `lib/constants/hold-reasons`
  - Added required `reasons: LookupValue[]` prop — caller provides DB-driven hold reasons
- `components/sales/sales-drawer.tsx`:
  - Removed hardcoded `SALES_HOLD_REASONS` and `REJECT_REASONS` constants
  - Added `lookups: LookupMap` prop
  - Hold radio grid now uses `lookups.hold_reason`; reject dropdown uses `lookups.reject_reason`
- `components/sales/sales-page.tsx`:
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
- `components/layout/sidebar.tsx` — added `MessageSquareQuote` to `ICON_MAP` so the Quoted Requests nav link renders with the correct icon (was falling back to the Dashboard icon)

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
- `components/crm/crm-page.tsx` — added `bazaar:leads-changed` event listener so the customer list silently re-fetches whenever any lead is updated (e.g. an SDR routes a lead, making that customer visible in the CRM for the first time)

## [2026-05-11] — Filter CRM page to routed leads only

### Fixed
- `app/api/customers/route.ts` — CRM contact list now only returns customers that have at least one lead with `status = "Routed"` or a non-null `sales_status`. Customers whose leads are still Pending, On Hold (SDR), or Rejected no longer appear in the CRM page.

## [2026-05-11] — Remove Quote/Order placeholder tabs from lead drawers

### Changed
- `components/leads/verify-drawer.tsx` — removed placeholder "Quote" tab; SDR drawer now has only "Lead Info" and "History" tabs. Added disabled "Create Quote / Order" footer button (enabled in Tickets phase).
- `components/sales/sales-drawer.tsx` — removed placeholder "Order / Quote" tab; Sales drawer now has only "Lead Info" and "History" tabs. Added disabled "Create Quote / Order" footer button (enabled in Tickets phase).

## [2026-05-10] — Add call/email action buttons to phone & email inputs

### Changed
- `components/ui/phone-input.tsx` — added optional `showAction` prop; when enabled and a full 10-digit number is present, renders a fused Phone icon link (`tel:+1…`) at the right edge of the input
- `components/ui/email-input.tsx` — added optional `showAction` prop; when enabled and a value is present, renders a fused Mail icon link (`mailto:…`) at the right edge of the input
- `components/leads/leads-page.tsx` — enabled `showAction` on both Phone and Email inputs in the Add Lead modal
- `components/leads/verify-drawer.tsx` — enabled `showAction` on both Phone and Email inputs in the View/Claim modal

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
- `components/leads/verify-drawer.tsx` — Validate button and `doValidate`/`handleValidate` functions removed entirely. SDRs now go directly from any status to Route to Sales, On Hold, or Reject.

### Changed
- `docs/feature-specs/leads-sdr.md` — Footer Actions table updated; Validate row marked as removed.

> **Note:** The `Validated` status value is kept in the DB schema and TypeScript types for backward compatibility with existing leads that already carry that status. No migration needed.

## [2026-05-10] — Remove validation gate before Route to Sales

### Changed
- `components/leads/verify-drawer.tsx` — "Route to Sales" button is now always enabled; SDR can route directly from `Pending` without validating first. Removed the disabled state and tooltip that enforced validation.
- `docs/feature-specs/leads-sdr.md` — updated Footer Actions table, build status table, and validation-gate paragraph to reflect the new behaviour.

## [2026-05-10] — Remove Save button and X close from claimed-lead modal

### Changed
- `components/leads/verify-drawer.tsx` — removed the **Save** button; form edits are now persisted as part of each action (Validate, Route to Sales, On Hold, Reject, Resume). Hold and Resume now call `patchLead(buildLeadPayload())` before their own API request so no field edits are lost.
- `components/leads/verify-drawer.tsx` — **X close button** is now hidden when the SDR has the lead claimed (edit mode). It remains visible in read-only mode (locked by another SDR, or rejected lead). The SDR must take a real action to exit.
- `docs/feature-specs/leads-sdr.md` — Footer Actions table updated to reflect removed Save/Close buttons and new auto-save-on-action behaviour.

## [2026-05-10] — Convert Verify Drawer to centered modal

### Changed
- `components/leads/verify-drawer.tsx` — replaced the right-side slide-in panel with a centered modal window (`max-w-[780px]`, `max-h-90vh`, `border-radius: 12px`); all content, tabs, actions, and lock logic unchanged

## [2026-05-10] — Add Initial Interest field to leads *(removed May 2026 — see `077_drop_initial_interest`)*

### Added
- `supabase/migrations/039_add_initial_interest_to_leads.sql` — adds `initial_interest text` column to the `leads` table (nullable, no constraints)
- `initial_interest` field in Add Lead modal (`components/leads/leads-page.tsx`) — optional free-text input below Urgency, full-width, not required
- `initial_interest` column in the All Leads table — shows value truncated with tooltip, or "—" when empty; also shown in mobile cards
- `initial_interest: string | null` added to `Lead` interface in `lib/types/index.ts`

### Changed
- `app/api/leads/manual/route.ts` — accepts and persists `initial_interest` on lead creation
- `docs/schema.md` — documented new `initial_interest` column in the `leads` table

## [2026-05-10] — Require validation before routing lead to Sales

### Changed
- `components/leads/verify-drawer.tsx` — "Route to Sales" button is now disabled when `status = 'Pending'`; hovering shows the tooltip "Lead must be validated before sending to Sales"
- `docs/feature-specs/leads-sdr.md` — updated Footer Actions table and Build Status table to reflect the validation gate; corrected stale routing path descriptions

## [2026-05-10] — Update docs to reflect all Realtime and dashboard changes

### Changed
- `docs/api-contract.md` — corrected admin KPI response shape: added `open_leads`, `claimed_leads`, `sdr_performance`, `rejection_reasons`, `source_breakdown`; removed stale `active_sdr_count` / `active_sales_count` fields that never existed.
- `docs/component-architecture.md` — added Realtime Listeners table listing all components that listen to `bazaar:leads-changed`; added `bazaar:leads-changed` row to the Data Fetching Strategy table.
- `docs/session-summary.md` — added May 10 entry covering all Realtime fixes, badge count fix, dashboard sub-counts, and doc updates.

## [2026-05-10] — Add Open / Claimed breakdown to Total Leads dashboard card

### Changed
- `app/api/dashboard/kpis/route.ts` — admin KPI response now includes `open_leads` (unclaimed `Pending/Validated` workspace leads, current snapshot) and `claimed_leads` (same status but owned by an SDR).
- `components/admin/admin-dashboard.tsx` — `KpiCard` accepts a new optional `subStats` prop that renders colored pill badges below the subtext. The **Total Leads** card uses it to show `Open: X` (green) and `Claimed: X` (gold) inline inside the card. Dashboard now also listens to `bazaar:leads-changed` and silently re-fetches KPIs when any lead changes (no skeleton flash).

### Fixed
- `app/api/sidebar-counts/route.ts` — `/leads` badge was counting all `Pending/Validated` leads including ones already claimed. Both SDR and admin now count only `locked_by_id IS NULL` leads. The badge represents "new leads waiting to be picked up", not leads already being worked. Simplified the SDR/admin split into a single shared query.

## [2026-05-10] — Fix Realtime not delivering lead-change events to admin

### Fixed
- `supabase/migrations/038_fix_leads_rls_for_realtime.sql` — replaced `current_user_role()` (a `SECURITY DEFINER` function) in all three `leads` SELECT RLS policies with inline `EXISTS` subqueries. `SECURITY DEFINER` functions run as their owner (`postgres`) in the Supabase Realtime evaluation context, causing `auth.uid()` to return `NULL`, which made every subscriber's RLS check fail and every event to be silently dropped even when the WebSocket was `SUBSCRIBED`.
- `components/layout/sidebar.tsx` — moved Realtime channel setup inside `getSession().then()` so the JWT is guaranteed to be present before the WebSocket handshake. Previously, `.subscribe()` was called synchronously while `setAuth` was still pending an async `getSession()` resolve, meaning channels opened without a JWT and Realtime silently rejected all events. Also removed the manual `setAuth` + `onAuthStateChange` handler — `createBrowserClient` handles token refresh automatically.

### Changed
- `docs/realtime-live-updates.md` — fully rewritten with both bug post-mortems, inline subquery RLS templates for all roles, JWT timing rules, complete debugging checklist, and a step-by-step checklist for adding Realtime to future entities (orders, etc.).

## [2026-05-10] — Admin can reassign/unassign Sales rep from pipeline leads

### Added
- `app/api/leads/[id]/reassign` — extended to accept `role: "sales"` param; updates `sales_owner_id` instead of `locked_by_id`/`sdr_id`; logs `lead_reassigned` activity with `role: "sales"` in payload

### Changed
- `components/sales/sales-page.tsx` — admin action column in the Pipeline tab now shows **View + Reassign** buttons (desktop table and mobile cards); added reassign modal with Sales rep dropdown (fetched from `/api/admin/users?role=sales`); added `handleSalesReassign` function that calls the reassign endpoint with `role: "sales"`

## [2026-05-10] — Remove Quick Actions from all dashboards

### Changed
- `components/sales/sdr-dashboard.tsx` — removed Quick Actions section and `QuickAction` component; removed unused `Link`, `LayoutDashboard`, `ArrowRight` imports
- `components/sales/sales-dashboard.tsx` — same removal; removed unused `Link`, `ArrowRight` imports

## [2026-05-10] — Align table/card breakpoint with sidebar (sm→lg)

### Changed
- `components/leads/leads-page.tsx` — table/mobile-card toggle changed from `sm` (640px) to `lg` (1024px)
- `components/sales/sales-page.tsx` — same breakpoint fix (all three pipeline tabs)
- `components/crm/crm-page.tsx` — same breakpoint fix
- `components/crm/customer-profile.tsx` — same breakpoint fix
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
- `components/layout/sidebar.tsx` — replaced `setInterval(60s)` polling with two Supabase Realtime subscriptions: `leads` table (badge counts + `bazaar:leads-changed`) and `activities` table (`bazaar:activities-changed`)
- `app/api/sidebar-counts/route.ts` — uncommented sidebar badge count queries (SDR: pending leads count on `/leads`; Sales: unclaimed + active deals on `/sales`; Admin: same combined view)
- `components/sales/sales-page.tsx` — added `bazaar:leads-changed` listener with drawer-aware deferral: silent table re-fetch when drawer is closed, deferred until drawer closes when open
- `components/leads/leads-page.tsx` — added `bazaar:leads-changed` listener for silent background table re-fetch (skipped when drawer is open)
- `app/(app)/admin/settings/[tab]/page.tsx` — replaced "Broadcast Notifications" spec preview with the real `<ActivityLogSection />` component
- `docs/Notification/Notification.md` — updated to reflect V1 implementation (sidebar badges + Realtime, not bell system)
- `docs/feature-specs/notifications.md` — updated to reflect V1 scope and future V2 plan

### Removed
- `docs/FuturePlan/Notification/Notification.md` — deleted (exact duplicate of `docs/Notification/Notification.md`)

## [2026-05-09] — Enhance Dashboard with live statistics

### Added
- `components/sales/sdr-dashboard.tsx` — two new KPI cards: **Quote Value** (sum of `quote_total` for the SDR's leads this period) and **My Share %** (this SDR's handled leads ÷ all SDR leads in period)
- `components/admin/admin-dashboard.tsx` — three new sections:
  - **SDR Performance Table** — one row per SDR showing Handled, Routed, Rejected, Quote Value, and Share % for the selected period. Sorted by most handled. Only visible to admins.
  - **Rejection Reasons** — horizontal bar breakdown of the top rejection reason values across all leads. Uses `var(--color-danger)` bars.
  - **Lead Sources** — horizontal bar breakdown of lead source distribution across all leads. Uses `var(--color-accent)` bars.
- Both breakdown sections hide automatically when there is no data (no empty states to manage).

### Changed
- `app/api/dashboard/kpis/route.ts` — SDR response now includes `quote_value` and `share_pct`. Admin response now includes `sdr_performance[]`, `rejection_reasons[]`, and `source_breakdown[]`. No breaking changes to existing fields.

## [2026-05-09] — Rename Sales Pipeline "Rejected (SDR)" tab to "Rejected"

### Changed
- `components/sales/sales-page.tsx` — tab label changed from `"Rejected (SDR)"` to `"Rejected"`. The confusing "(SDR)" suffix implied SDRs rejected these leads, when the opposite is true — these are leads the Sales team rejected. Logic unchanged: admin sees all sales-rejected leads; each sales rep sees only their own.

## [2026-05-09] — SDR History tab, Sales Notes field, and TODO doc

### Added
- `components/leads/verify-drawer.tsx` — **History tab** (third tab alongside Lead Info and Quote). Lazy-loads `GET /api/leads/[id]/activities` on first open. Renders the same vertical timeline as the Sales Drawer — colored dots, human-readable labels, actor name, relative timestamp, skeleton loader. Full activity history is preserved even after a lead moves to Sales, so SDRs and admins can always see the complete chain of events.
- `supabase/migrations/034_add_sales_notes_to_leads.sql` — adds `sales_notes text` column to the `leads` table.
- `components/sales/sales-drawer.tsx` — **Sales Notes** textarea in the Sales Fields section. Sales reps can now write their own internal notes (separate from the SDR's Verify Lead Comment). Notes are saved via `PATCH /api/leads/[id]` and automatically logged to the activity timeline as `lead_edited` (field: `sales_notes`).
- `docs/TODO.md` — new deferred-items file. First entry: **TODO-001 Admin Override for Terminal Leads**, with full problem description, fix sketch, and a note that Won/Dropped must be handled separately after the Tickets phase.

### Changed
- `app/api/leads/[id]/route.ts` — added `"sales_notes"` to `TRACKED_FIELDS` so any change to sales notes is automatically logged as a `lead_edited` activity entry.
- `lib/types/index.ts` — added `sales_notes: string | null` to the `Lead` interface.

## [2026-05-09] — Lead History tab in Sales Drawer

### Added
- `app/api/leads/[id]/activities/route.ts` — `GET` endpoint that returns the full activity timeline for a lead (newest first), joining `user_profiles` so every entry includes the actor's name.
- `components/sales/sales-drawer.tsx` — new **History** tab (third tab alongside Lead Info and Order / Quote) that renders a vertical timeline of all activity events for the open lead. Loads lazily on first open. Shows: event label, optional notes (rejection/hold), actor name, and relative timestamp. Skeleton loader while fetching; empty-state when no events exist.

### Changed
- `app/api/leads/[id]/route.ts` — `lead_rejected` activity payload now includes `from: prevStatus` so the timeline can display "Rejected from Sales pipeline" vs "Rejected from SDR pipeline".
- `lib/types/index.ts` — added `'lead_sales_claimed'` and `'lead_edited'` to the `ActivityType` union (both were already written by API routes but missing from the type).

## [2026-05-09] — Fix Sales Pipeline Rejected tab showing SDR rejections

### Fixed
- **Sales Pipeline Rejected tab was mixing two unrelated rejection types**: it showed all leads with `status = "Rejected"` — including leads rejected by SDRs before they ever reached sales — instead of only leads rejected *from* the sales pipeline.
- `app/api/leads/[id]/route.ts` — PATCH route now automatically saves `prev_status = current.status` whenever a lead is moved to `status = "Rejected"`, mirroring the same pattern already used by the hold route. This allows downstream queries to distinguish "SDR rejected" (`prev_status ≠ "Routed to Sales"`) from "rejected from sales" (`prev_status = "Routed to Sales"`).
- `app/api/leads/workspace/route.ts` — added support for `?prev_status=` query param so callers can filter leads by their previous status.
- `app/api/leads/sales-counts/route.ts` — `rejected` badge count now filters by `prev_status = "Routed to Sales"` so the badge reflects only sales-pipeline rejections, not all system rejections.
- `components/sales/sales-page.tsx` — `fetchRejectedLeads` now requests `/api/leads/workspace?status=Rejected&prev_status=Routed+to+Sales` so the Rejected tab lists only leads that were in the sales pipeline before being rejected.

## [2026-05-09] — Split dashboard into per-role components

### Added
- `components/sales/sdr-dashboard.tsx` — standalone SDR dashboard (KPIs + quick actions)
- `components/sales/sales-dashboard.tsx` — standalone Sales dashboard (KPIs + quick actions)
- `components/admin/admin-dashboard.tsx` — standalone Admin dashboard (KPIs + team grid + quick actions)

### Changed
- `components/admin/dashboard-page.tsx` — now a thin role-router; detects role via Supabase then renders the appropriate dashboard component; shows skeleton while role loads

## [2026-05-09] — Sortable columns + close drawer on save

### Changed
- `components/leads/leads-page.tsx` — **Urgency** and **Created** column headers on the All Leads desktop table are now clickable sort toggles; active column shows `↑`/`↓` arrow, inactive columns show a faint `⇅` hint
- `components/leads/leads-page.tsx` — Mobile All Leads view gains a **cycling sort pill** (tap to cycle: Newest first → Oldest first → Urgency: High first); no extra dropdowns or selects
- `components/leads/verify-drawer.tsx` — Drawer now closes automatically after **Save** (same behaviour as Validate, Route, Reject, and Hold)
- `components/leads/leads-page.tsx` — SDR action button on All Leads renamed **Claim** for unclaimed leads and **View** for already-claimed leads; visually distinct styles (filled vs outlined) reinforce the difference

## [2026-05-09] — Owner column + My Leads filter on All Leads tab

### Changed
- `components/leads/leads-page.tsx` — All Leads table now shows an **Owner** column (visible to all roles) that displays the assigned SDR's name, "You" for the current user's own leads, or an "Unclaimed" badge for unowned leads; replaces the previous admin-only "Working" column
- `components/leads/leads-page.tsx` — Added **My Leads / All Leads** segmented toggle on the All Leads tab; visible to SDR users only; filters client-side to show only the SDR's own claimed leads when "My Leads" is selected

## [2026-05-09] — Directed to Sales tab: info-only redesign + admin scope fix

### Changed
- `components/leads/leads-page.tsx` — Directed to Sales tab is now a status-tracking view with no action buttons or drawer; added **Phone** and **Sales Rep** columns; "Unclaimed" pill shown when `sales_status` is null
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
- `components/leads/leads-page.tsx` — admin view of All Leads table now shows a **Reassign** button alongside View when a lead has an owner (`locked_by_id` is set); clicking opens a modal with a dropdown of active SDRs plus an "Unassign" option; on confirm the row updates in place and counts refresh. Added `sdrList`, `reassignLead`, `reassignUserId`, `reassigning` state and a `handleReassign` function.

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
- `components/leads/verify-drawer.tsx` — removed `unlockRef`, the cleanup `useEffect`, and the unlock call from `handleClose`; closing the drawer no longer releases the lead. `doValidate` no longer calls unlock and no longer removes the lead from the list — the row updates in place with Validated status. `doRoute` and `doReject` still call unlock (ownership truly ends). `doHold` no longer sets `unlockRef`.

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
- `components/leads/leads-page.tsx` — added `userId` state (alongside `isAdmin`); added a "Working" column to the All Leads desktop table (admin only) showing which SDR has each lead open; same field shown on mobile cards for admin

## [2026-05-09] — Admin view-only access in leads pipeline

### Changed
- `components/leads/leads-page.tsx` — admin users now see a **View** button (no lock acquired) instead of Verify on all tabs; SDRs still see Verify / Work as before. Added `handleViewLead` function (opens drawer read-only without calling the lock endpoint) and role detection via `user_profiles`.

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
- `components/admin/dashboard-page.tsx` — replaced invalid inline `ringColor: "var(--color-surface)"` style property (not a standard CSS property) with `outline: "2px solid var(--color-surface)"` to achieve the same visual ring effect without causing TypeScript build failure

---

## [2026-05-09] — Admin dashboard team section

### Added
- `app/api/admin/team/route.ts` — admin-only endpoint returning all active users with role, claimed active deal count (sales), and `last_sign_in_at` from Supabase auth
- `components/admin/dashboard-page.tsx` — `TeamSection` component rendered below admin KPI cards showing avatar initial, name, role, active deals (sales only), and online indicator (green = signed in within 8 h)

## [2026-05-09] — Dedicated admin Overview page and routing

> Note: `/overview` was subsequently removed from the sidebar nav (see `031_remove_overview_from_nav.sql` entry above). The page file remains for future customization.

### Added
- `app/(app)/overview/page.tsx` — admin-only overview page (currently renders shared DashboardPage; ready to be customized independently)
- `supabase/migrations/030_add_admin_overview_page.sql` — inserts `/overview` into pages table (sort_order -1) and grants admin role_permissions

## [2026-05-09] — User profile card in sidebar and mobile nav

### Added
- `app/(app)/profile/page.tsx` — placeholder profile page ("coming soon")
- `components/layout/sidebar.tsx` — user profile card at the top of the nav (avatar initial, full name, role label, chevron); collapsed state shows avatar only; links to `/profile`
- `components/layout/mobile-nav.tsx` — same user profile card inside the slide-in drawer

### Changed
- `components/admin/dashboard-page.tsx` — removed user card (moved to nav)

## [2026-05-09] — Dashboard user greeting card + profile page

### Added
- `app/(app)/profile/page.tsx` — placeholder profile page ("coming soon") linked from the greeting card
- `components/admin/dashboard-page.tsx` — user greeting card at the top of the dashboard showing avatar initial, full name, and role; clicking navigates to `/profile`

## [2026-05-09] — Fix sidebar Sales Pipeline badge count

### Fixed
- `app/api/sidebar-counts/route.ts` — Sales Pipeline badge is now role-scoped: sales reps see unclaimed leads + their own active deals; admins see total active deals across all reps. Previously showed a global unfiltered count.

## [2026-05-09] — Sales pipeline: admin View button + role-based filtering + owner name

### Changed
- `components/sales/sales-page.tsx` — admin users now see a read-only "View" button on all pipeline leads instead of "Claim"/"Open"; fetches role on mount via `user_profiles.roles(name)`

## [2026-05-09] — Sales pipeline: role-based filtering + owner name display

### Added
- `supabase/migrations/029_fix_sales_owner_fk.sql` — re-points `leads.sales_owner_id` FK from `auth.users` to `public.user_profiles(id)`, enabling PostgREST to join owner profile data in a single query

### Changed
- `app/api/leads/workspace/route.ts` — joins `sales_owner:user_profiles(id,full_name)` via PostgREST; sales role now filtered to unclaimed + owned leads only; admins still see all
- `app/api/leads/sales-counts/route.ts` — same role-based filter applied to tab badge counts
- `lib/types/index.ts` — added `sales_owner?: { id, full_name } | null` to `Lead` interface
- `components/sales/sales-page.tsx` — Owner column now shows the actual sales rep name instead of "Claimed"; passes `currentUserId` to drawer
- `components/sales/sales-drawer.tsx` — Sales Fields section now includes a read-only "Assigned To" field showing owner name, "You", or "Unclaimed"

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
- `components/sales/sales-page.tsx` — count badges now show on **all** tabs before the user clicks; counts fetched from API on mount and refreshed on `bazaar:refresh-counts` event; Refresh button also triggers count refresh

## [2026-05-07] — Fix mobile navigation menu

### Fixed
- `components/layout/mobile-nav.tsx` — rewrote mobile drawer to load role-based pages from Supabase (same as sidebar), replacing the hardcoded `[Dashboard, Settings]` stub that showed wrong items for SDR/Sales/Admin roles
- Mobile nav now shows sidebar badge counts (Leads, Sales) and refreshes them via the `bazaar:refresh-counts` event, matching desktop sidebar behavior
- Active-route detection matches sidebar logic (exact match for `/dashboard`, prefix match for all others)

## [2026-05-07] — Design System Tokenization

### Added
- `components/ui/urgency-pill.tsx` — reusable `<UrgencyPill urgency={...} />` component; replaces 5 copies of inline urgency ternary logic across leads, sales, and CRM pages
- `.cursor/rules/color-tokens.mdc` — Cursor rule enforcing CSS variable usage; documents all available tokens and `<StatusPill>` / `<UrgencyPill>` components with good/bad examples
- New semantic tokens in `app/globals.css` (light + dark): `--color-success-bg/border`, `--color-warning-bg/border/text-deep`, `--color-info-bg/text/border/text-deep`, `--color-neutral-bg/text/border`, `--color-danger-text-deep`

### Changed
- `components/ui/status-pill.tsx` — all status styles now reference CSS vars (no hardcoded hex)
- `components/crm/crm-page.tsx`, `components/crm/customer-profile.tsx` — customer status and heat tag style objects converted to CSS vars
- `components/leads/verify-drawer.tsx`, `components/sales/sales-drawer.tsx` — banners, borders, buttons all tokenized
- `components/leads/leads-page.tsx`, `components/sales/sales-page.tsx` — urgency pills replaced with `<UrgencyPill>`, all hex replaced with vars
- `components/admin/roles-section.tsx` — danger colors tokenized
- `components/layout/sidebar.tsx` — badge colors tokenized
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
- `components/crm/crm-page.tsx` — CRM list: customer table with search, status filter (All / New / Known), heat tag filter, desktop table + mobile cards, click-to-navigate
- `components/crm/customer-profile.tsx` — customer profile page: header with status/heat badges, contact fields grid, Edit Customer modal (PhoneInput, EmailInput, heat tag select), Lead History table, Order History placeholder
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
- `components/admin/dashboard-page.tsx` — client component: period selector (This Week / This Month / This Quarter), 6 role-scoped KPI cards with icons and accent highlight on primary card, Quick Actions grid (role-specific links), 300ms minimum skeleton display
- `app/(app)/dashboard/page.tsx` — updated from null stub to render `<DashboardPage />`

---

## [2026-05-07] — Phase 5: Sales Pipeline page

### Added
- `components/sales/sales-drawer.tsx` — right-side drawer for Sales reps: read-only contact info, editable Sales fields (sales_status, quote_total), lock on open / unlock on close, Sales-specific hold sub-form (4 reasons), reject sub-form (sets `status = 'Rejected'`), Order/Quote tab placeholder
- `components/sales/sales-page.tsx` — full Sales Pipeline client component: 3 tabs (Pipeline, On Hold, Rejected), Claim/Open actions, Resume from hold, desktop table + mobile card layout, lazy-fetch for Rejected tab, userId lookup for ownership display
- `app/(app)/sales/page.tsx` — updated from placeholder to render `<SalesPage />`
- `app/api/leads/[id]/claim/route.ts` — `POST /api/leads/[id]/claim` → sets `sales_owner_id` to session user, `sales_status = 'Ongoing'`; 409 if already claimed

---

## [2026-05-07] — Phase 3 SDR Leads page refinements & bug fixes

### Added
- `components/ui/phone-input.tsx` — custom phone input with `(xxx) xxx-xxxx` auto-format; stores digits-only
- `components/ui/email-input.tsx` — email input with blur-time format validation
- `components/ui/status-pill.tsx` — reusable `StatusPill` component for all lead/sales statuses
- `components/leads/hold-sub-form.tsx` — hold reason sub-form with 2-column radio grid + notes + date picker
- `components/leads/verify-drawer.tsx` — full Verify Drawer (lock-on-open, release-on-close, validate / hold / route / reject actions)
- `components/leads/leads-page.tsx` — SDR Leads page with tab filters, desktop table, mobile cards, Add Lead modal
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
- `components/leads/hold-sub-form.tsx` — inline hold reason / notes / date sub-form used in Verify Drawer
- `components/leads/verify-drawer.tsx` — right-side slide-in drawer for working a lead: lock on open, Validate / Route to Sales / Hold / Reject / Save actions, "Update customer?" prompt, read-only banner when locked by another user
- `components/leads/leads-page.tsx` — full SDR Leads client component: four tabs (All Leads, On Hold, Directed to Sales, Rejected), Add Lead modal with 600ms debounce customer dedup (single match banner, multi-match picker), desktop table + mobile card layout, Verify Drawer integration, optimistic removal on action
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
- `components/layout/sidebar.tsx` — fully rewritten as DB-driven role-aware nav; fetches allowed pages from `role_permissions` join at runtime; supports all 10 Lucide icons mapped by name; shows "Admin" section label; collapses correctly

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
- `components/auth/otp-input.tsx` — reusable 6-box OTP input with auto-advance on input, backspace navigation, and full paste support

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
- `components/layout/mobile-nav.tsx` — mobile top bar (56px, navy) with hamburger button; full-height slide-in drawer with nav items, dark mode toggle, sign out; closes on route change; locks body scroll while open

### Changed
- `app/(app)/layout.tsx` — sidebar hidden below `lg` breakpoint; mobile nav shown on mobile only; page padding `px-4` mobile / `px-6` desktop

---

## [2026-05-06] — Sidebar navigation

### Changed
- Navigation switched from horizontal tab bar to **collapsible left sidebar** matching Pulse V2 pattern
- `components/layout/sidebar.tsx` — navy background (`var(--color-topbar)`), expanded 224px / collapsed 56px, active item uses gold/orange accent, collapse state persisted in `localStorage` key `bazaar-sidebar-collapsed`, dark mode toggle + sign out + collapse button at bottom
- `app/(app)/layout.tsx` — uses sidebar instead of topbar + tab nav
- Removed old `components/layout/sidebar.tsx` and `components/layout/mobile-nav.tsx` (horizontal tab versions)
- Updated `.cursor/rules/ui-design-system.mdc` to reflect sidebar layout

---

## [2026-05-06] — BazaarPrinting UI design system applied

### Added
- `components/topbar.tsx` — navy/charcoal topbar, gold/orange `BAZAARPRINTING CRM` logo, theme toggle
- `components/tab-nav.tsx` — horizontal tab bar with active gold/orange underline, count badge support

### Changed
- `app/globals.css` — replaced generic Tailwind variables with full BazaarPrinting token set (19 CSS variables, light + dark), skeleton shimmer animation
- `app/layout.tsx` — font swapped Roboto → **Inter**; `NextTopLoader` uses `var(--color-accent)`
- `components/layout/theme-provider.tsx` — localStorage key changed from `bazar-crm-theme` to `bazaar-theme`
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
- `components/layout/theme-provider.tsx` — light/dark toggle, localStorage
- `docs/` folder for project documentation
