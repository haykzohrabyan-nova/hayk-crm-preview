# BazarCRM — TypeScript Types

Canonical types. These will live in `lib/types/index.ts`. All Route Handlers, server components, and client components import from this file — no inline type definitions.

---

## User & Auth

```typescript
/** System role slugs — custom roles have arbitrary string names */
export type SystemRoleName = 'sdr' | 'sales' | 'admin'

export interface Role {
  id: string
  name: string             // slug, e.g. 'sdr', 'manager', 'viewer'
  display_name: string     // human label, e.g. 'SDR', 'Manager'
  is_system: boolean       // system roles cannot be deleted or renamed
  created_at: string
}

export interface Page {
  id: string
  route: string            // e.g. '/leads', '/crm'
  display_name: string     // e.g. 'Leads (SDR)', 'CRM'
  icon: string | null      // Lucide icon name
  section: 'main' | 'admin' | 'bottom'
  sort_order: number
  created_at: string
}

export interface RolePermission {
  role_id: string
  page_id: string
  // Joined (optional)
  role?: Role
  page?: Page
}

export interface UserProfile {
  id: string                    // uuid — matches auth.users.id
  role_id: string               // FK to roles.id
  full_name: string | null
  avatar_url: string | null
  is_active: boolean
  must_change_password: boolean // true = force /change-password on next login
  created_at: string
  updated_at: string
  // From user_profiles_with_role view (joined)
  role_name?: string            // e.g. 'sdr', 'manager'
  role_display_name?: string    // e.g. 'SDR', 'Manager'
  role_is_system?: boolean
}
```

---

## LookupValue

A single option from a dropdown. Returned by `GET /api/lookups`.

```typescript
export type LookupCategory =
  // Lead-form categories (seeded migration 020)
  | 'source'
  | 'industry'
  | 'urgency'
  | 'hold_reason'
  | 'reject_reason'
  | 'route_reason'
  | 'sales_drop_reason'
  // Order / Quote categories (seeded migrations 044 + 048)
  | 'lamination'
  | 'finishing'
  | 'color_mode'
  | 'sides'
  | 'roll_direction'
  | 'quote_channel'
  | 'follow_up_freq'
  | 'ticket_priority'
  | 'order_source'
  | 'ticket_payment'

export interface LookupValue {
  id: string
  category: LookupCategory
  value: string        // machine key stored in DB (e.g. 'facebook')
  label: string        // display label (e.g. 'Facebook')
  sort_order: number
  is_active: boolean
  created_at: string
}

// Grouped response from GET /api/lookups
export type LookupMap = Partial<Record<LookupCategory, LookupValue[]>>
```

---

## Customer

A customer profile. Multiple profiles can share the same phone or email — this is intentional. The SDR decides which profile to link to a lead.

```typescript
export type HeatTag = 'hot' | 'warm' | 'cold'

export interface Customer {
  id: string
  first_name: string | null
  last_name: string | null
  email: string | null
  phone: string | null     // digits-only, e.g. "8585552277"
  company: string | null
  industry: string | null
  website: string | null
  authority: string | null   // 'yes' | 'no' — decision maker
  heat_tag: HeatTag | null
  created_at: string
  updated_at: string
}

/** Lookup result — what the dedup modal shows */
export interface CustomerLookupResult {
  customers: Customer[]
  count: number
}
```

---

## Lead

```typescript
export type LeadStatus =
  | 'Pending'
  | 'Validated'
  | 'Quoted'
  | 'Routed to Sales'
  | 'On Hold'
  | 'Rejected'
  | 'Duplicate'

export type SalesStatus =
  | 'Ongoing'
  | 'Quote Sent'
  | 'Won'
  | 'Dropped'
  | 'On Hold'

export type QuoteChannel = 'SMS' | 'WhatsApp' | 'Email' | 'In-person'

export type LeadUrgency = 'High' | 'Medium' | 'Low'  // DB storage; lookup_values use lowercase keys — map via lib/utils/urgency-form.ts in forms

export interface Lead {
  id: string
  customer_id: string | null    // linked customer profile; set on create or first action
  source: string | null
  brand: string | null
  authority: string | null
  status: LeadStatus
  sales_status: SalesStatus | null
  is_inbox: boolean
  sdr_id: string | null
  assigned_sdr_id: string | null   // future — nullable for now
  sales_owner_id: string | null
  held_by_id: string | null
  interests: Record<string, boolean>
  quantities: Record<string, string>
  has_design: Record<string, boolean>
  quote_total: number | null
  quote_channel: QuoteChannel | null
  quote_destination: string | null  // digits-only for SMS/WhatsApp; email for Email
  hold_reason: string | null
  hold_notes: string | null
  hold_until: string | null
  held_at: string | null
  prev_status: LeadStatus | null
  prev_sales_status: SalesStatus | null
  urgency: LeadUrgency | null
  is_returning_customer: boolean
  sdr_comment: string | null       // "Verify Lead Comment" — internal SDR notes
  rejection_reason: string | null
  rejection_notes: string | null
  sales_notes: string | null       // internal Sales rep notes
  created_at: string               // immutable
  updated_at: string
  // Joined (optional, populated by some queries)
  customer?: Customer
}

/** Products a lead may be interested in */
export const PRODUCT_INTERESTS = [
  'Labels',
  'Boxes',
  'Flyers',
  'Stickers',
  'Jars',
  'Bags',
  'Tubes',
  'Banners',
  'Business Cards',
  'Other',
] as const

export type ProductInterest = typeof PRODUCT_INTERESTS[number]

/** Lead sources */
export const LEAD_SOURCES = [
  'Website',
  'Google',
  'Walk-in',
  'Referral',
  'Instagram',
  'Facebook',
  'Cold Call',
  'Trade Show',
  'Other',
] as const

export type LeadSource = typeof LEAD_SOURCES[number]
```

---

## Job Ticket

```typescript
export type TicketKind = 'quote' | 'order'

export type TicketStatus =
  | 'draft'
  | 'sent'
  | 'approved'      // RETIRED — kept for backwards compat only; new code never sets this
  | 'routed'        // SDR quote exceeded high-value threshold — awaiting Sales claim
  | 'order'         // confirmed production order — set by customer confirm OR "Convert to Order" button
  | 'rejected'
  | 'in_production'
  | 'completed'
  | 'cancelled'

/**
 * A single line item inside `job_tickets.quote_skus` (JSONB array).
 * Canonical definition: lib/types/index.ts QuoteSku.
 * Pricing helpers (computePricing, skuLineTotal, formatCurrency) live in
 * lib/utils/ticket-math.ts and use the same interface.
 */
export interface QuoteSku {
  product_type: string              // product name from admin catalog
  description?: string              // auto-derived: productType – material – lamination
  material?: string                 // material name from admin catalog
  lamination?: string               // from `lamination` lookup
  color_mode?: string               // from `color_mode` lookup
  sides?: string                    // from `sides` lookup
  roll_direction?: string           // from `roll_direction` lookup
  width?: number                    // inches
  height?: number                   // inches
  quantity?: number
  unit_price?: number
  design_required?: boolean         // "Design on file" checkbox
  die_cut?: boolean
  spot_uv?: boolean                 // UV Coating add-on
  foil?: boolean
  perforation?: boolean
  comment?: string                  // per-SKU line item free-text note
}

export interface JobTicket {
  id: string
  ticket_kind: TicketKind
  ticket_status: TicketStatus
  customer_id: string | null
  linked_lead_id: string | null
  created_by_id: string | null
  // Denormalized contact fields (copied from lead/customer at creation)
  contact_email: string | null
  contact_name: string | null
  contact_company: string | null
  contact_phone: string | null
  // Info tab
  title: string | null
  reference_code: string | null     // ORD-YYYY-NNN, auto-generated for orders
  priority: string | null           // from `ticket_priority` lookup
  due_date: string | null           // ISO date
  order_source: string | null       // from `order_source` lookup
  quote_source: string | null       // direct Quotes-page creates only (from `source` lookup)
  rush: boolean
  special_requirements: string | null
  notes: string | null
  // Line items
  quote_skus: QuoteSku[]
  design_required: boolean          // auto-set from SKUs: any SKU with design_required=true
  die_cut: boolean                  // auto-set from SKUs: any SKU with die_cut=true
  // Pricing (Quote tab)
  quote_subtotal: number | null
  quote_shipping: number | null
  discount_type: 'percent' | 'fixed' | null
  discount_value: string | null     // stored as text, parsed at runtime
  discount_reason: string | null
  quote_pre_tax_total: number | null
  quote_tax_rate_percent: number | null
  quote_tax_amount: number | null
  quote_final_total: number | null
  tax_exempt: boolean
  sales_permit_number: string | null
  quote_payment_types: string[]     // from `ticket_payment` lookup (multi-select)
  prepayment_type: 'full' | 'percent' | 'fixed' | null
  prepayment_value: string | null   // '100' for full; parsed at runtime for percent/fixed
  prepayment_status: 'pending' | 'paid' // deposit collected flag — Stripe webhook updates this
  // Delivery / follow-up
  quote_channel: string | null      // from `quote_channel` lookup
  quote_destination: string | null  // digits for SMS/WhatsApp; email for Email
  quote_reminder_date: string | null
  follow_up_cycles: number | null
  follow_up_frequency: string | null // from `follow_up_freq` lookup
  follow_up_completed: boolean
  // Status flags
  client_confirmed: boolean
  quote_approval_last_requested_at: string | null
  public_token: string              // UUID — used for public /q/[token] page (no auth)
  payment_status: 'unpaid' | 'partial' | 'paid'  // overall order payment state
  // Per-ticket payment config (migration 066)
  ticket_payment_strategy?: 'partial' | 'full' | 'net' | null
  ticket_deposit_type?: 'percent' | 'fixed' | null
  ticket_deposit_value?: number | null
  ticket_dep_handling?: 'cash' | 'gateway' | null
  ticket_partial_channels?: string[] | null
  ticket_full_channels?: string[] | null
  ticket_require_client_confirm?: boolean | null
  ticket_net_terms_label?: string | null
  // Payment recording
  payment_amount_received?: number | null
  payment_paid_at?: string | null
  payment_method_used?: string | null
  deposit_amount?: number | null
  deposit_paid_at?: string | null
  balance_paid_at?: string | null
  production_released_at?: string | null
  // Payment evidence (migration 068, 071, 085)
  payment_evidence_url?: string | null
  payment_evidence_submitted_at?: string | null
  payment_evidence_reviewed_at?: string | null
  payment_evidence_amount?: number | null
  created_at: string
  updated_at: string
  // Joined (optional)
  customer?: Customer
  lead?: Lead
  // Legacy columns (kept for backwards compat — new code uses quote_* fields)
  subtotal?: number | null
  discount_percent?: number | null
  discount_amount?: number | null
  total?: number | null
  payment_type?: string | null
  prepay_amount?: number | null
  product_lines?: unknown[]
  follow_up_at?: string | null
}
```

---

## Company Settings

```typescript
export interface CompanySettings {
  id: number                          // always 1 — single-row table
  company_name: string
  address_line1: string | null
  address_line2: string | null
  city: string | null
  state: string | null
  zip: string | null
  phone: string | null
  email: string | null
  website: string | null
  logo_url: string | null
  default_tax_rate: number            // percent, e.g. 8.25 = 8.25%
  high_value_threshold: number        // SDR hard-block threshold in $
  rush_surcharge_percent: number | null  // null = rush is badge-only, no price impact
  updated_at: string
}
```

---

## Activity

```typescript
export type ActivityType =
  | 'lead_verified'
  | 'lead_manual_created'
  | 'lead_edited'                   // tracked field changes (no status change)
  | 'lead_status_changed'
  | 'lead_routed_to_sales'
  | 'lead_rejected'                 // payload: { from, reason, notes }
  | 'lead_held'
  | 'lead_resumed'
  | 'lead_merged'
  | 'lead_sales_claimed'            // Sales rep claims an unclaimed routed lead
  | 'contact_edited'
  | 'call_logged'
  | 'email_opened'
  | 'outreach_sent'
  | 'quote_sent'
  | 'quote_approval_requested'
  | 'quote_follow_up_completed'
  | 'quote_follow_up_reset'
  | 'order_ticket_created'
  | 'order_ticket_updated'
  | 'order_ticket_status_changed'   // ticket_status transition (e.g. draft→routed, routed→draft on claim)
  | 'ticket_sent'                   // quote delivered to customer (send or resend). payload: { channel, destination, resend?: true }
  | 'ticket_client_confirmed'       // customer confirmed via /q/[token] public page
  | 'ticket_converted'              // rep clicked "Convert to Order". payload: { from, to: 'order', reference_code }
  | 'ticket_payment_reminder_sent'  // payment reminder sent. payload: { channel, destination }
  | 'ticket_payment_evidence_submitted' // customer uploaded proof on public page. payload: { method, amount, … }
  | 'ticket_payment_recorded'       // staff/accountant recorded payment. payload: { payment_mode, payment_method, payment_amount }
  | 'ticket_payment_confirmed_sent' // confirmation email/SMS after accountant confirms evidence
  | 'ticket_invoice_resent'         // customer portal link resent. payload: { channel, destination }
  | 'ticket_order_ready_sent'       // pickup notification sent on mark completed
  | 'ticket_order_ready_failed'     // pickup notification failed. payload: { error }

export type ActivityChannel = 'SMS' | 'WhatsApp' | 'Email' | 'Call' | 'In-person'

export interface Activity {
  id: string
  contact_id: string | null    // deprecated alias — use customer_id
  customer_id: string | null
  lead_id: string | null
  ticket_id: string | null
  type: ActivityType
  channel: ActivityChannel | null
  by_user_id: string | null
  payload: Record<string, unknown>
  created_at: string
  // Joined (optional)
  by_user?: UserProfile
}
```

---

## Notification

```typescript
export type NotificationType =
  | 'lead_assigned'
  | 'lead_routed'
  | 'follow_up_due'
  | 'quote_approval_requested'
  | 'lead_held_reminder'
  | 'system'

export interface AppNotification {
  id: string
  user_id: string
  type: NotificationType
  title: string
  body: string | null
  read: boolean
  payload: Record<string, unknown>
  created_at: string
}
```

---

## Dashboard KPIs

```typescript
export interface SdrKpis {
  role: 'sdr'
  inbox_count: number
  handled: number
  routed: number
  on_hold: number
  rejected: number
  quote_value: number
  sourced_cash: number
  share_pct: number
}

export interface SalesKpis {
  role: 'sales'
  new_in_pipeline: number
  active_deals: number
  on_hold: number
  won: number
  won_value: number
  cash_collected: number
  pipeline_value: number
}

export interface TeamMemberMetrics {
  handled: number
  routed: number
  rejected: number
  sourced_cash: number
  cash_collected: number
  released_order_value: number
  awaiting_collection: number
  pipeline_value: number
}

export interface AdminKpis {
  role: 'admin'
  total_leads: number
  open_leads: number
  claimed_leads: number
  pipeline_leads: number
  quoted_leads: number
  ordered_leads: number
  inbox_leads: number
  routed_leads: number
  won_leads: number
  cash_collected: number
  pipeline_value: number
  team_member_metrics: Record<string, TeamMemberMetrics>
}

export type DashboardKpis = SdrKpis | SalesKpis | AdminKpis
```

---

## Statistics Period Filter

```typescript
export type StatsPeriod = 'today' | 'week' | 'month' | 'quarter' | 'all' | 'custom'

export interface DateRange {
  from: string | null   // ISO date
  to: string | null     // ISO date
}

export interface PeriodFilter {
  period: StatsPeriod
  range: DateRange
}
```

---

## API Response Wrappers

```typescript
export interface ApiSuccess<T> {
  data: T
  error: null
}

export interface ApiError {
  data: null
  error: {
    message: string
    code: string
  }
}

export type ApiResponse<T> = ApiSuccess<T> | ApiError
```

### Common Route Handler error codes (May 2026)

Returned as `{ error: string, code: string }` with HTTP status:

| HTTP | `code` | When |
|------|--------|------|
| `401` | `UNAUTHENTICATED` | No valid session (`requireSession()`) |
| `403` | `MFA_SETUP_REQUIRED` | TOTP not enrolled (`user_profiles.mfa_required = true`) |
| `403` | `MFA_VERIFY_REQUIRED` | Session AAL1 — must verify at `/verify-2fa` |
| `403` | `FORBIDDEN` | Authenticated but wrong role or out-of-scope resource |
| `404` | `NOT_FOUND` | Resource missing or no access (ticket scope) |

Full auth model: **`docs/security.md`**.

---

## Form Input Types

```typescript
/** Shape of the Manual Add Lead / Verify Drawer form */
export interface VerifyLeadForm {
  // Contact Info
  phone: string               // digits-only on submit
  email: string
  first_name: string
  last_name: string
  source: LeadSource
  authority: string
  company: string
  industry: string
  website: string
  brand: string
  // Lead specifics
  urgency: LeadUrgency | ''
  is_returning_customer: boolean
  interests: Record<ProductInterest, boolean>
  quantities: Record<ProductInterest, string>
  has_design: Record<ProductInterest, boolean>
  sdr_comment: string         // "Verify Lead Comment"
  // Status transitions (used in Verify Drawer, not manual add)
  status: LeadStatus
  quote_total: string         // string in form, parsed to number on submit
  quote_channel: QuoteChannel | ''
  quote_destination: string
  rejection_reason: string
  rejection_notes: string
}

/** Shape of the Hold form (shared between SDR and Sales) */
export interface HoldForm {
  hold_reason: string
  hold_notes: string
  hold_until: string          // ISO date string from date picker
}

/**
 * Shape used by new-quote-form.tsx and quote-detail.tsx for all editable fields.
 * Numeric values are stored as strings in form state and parsed on submit.
 * Canonical definition: lib/types/index.ts TicketForm.
 */
export interface TicketForm {
  title: string
  ticket_kind: TicketKind
  ticket_status: TicketStatus
  order_source: 'quoted' | 'direct' | ''
  priority: 'Low' | 'Normal' | 'High' | ''
  due_date: string
  special_requirements: string
  rush: boolean
  design_required: boolean
  die_cut: boolean
  // Contact (denormalized)
  customer_id: string | null
  linked_lead_id: string | null
  contact_name: string
  contact_email: string
  contact_phone: string
  contact_company: string
  // Line items
  quote_skus: Partial<QuoteSku>[]
  // Pricing
  quote_shipping: string          // string in form; parsed to number on submit
  discount_enabled: boolean
  discount_type: 'percent' | 'fixed' | ''
  discount_value: string
  discount_reason: string
  quote_tax_rate_percent: string  // string in form; parsed to number on submit
  tax_exempt: boolean
  sales_permit_number: string
  // Payment
  quote_payment_types: string[]   // single-select (enforced client-side), from ticket_payment lookup
  prepayment_mode: 'full' | 'partial'   // UI toggle state; maps to prepayment_type on save
  prepayment_type: 'full' | 'percent' | 'fixed' | ''
  prepayment_value: string
  // Delivery
  quote_channel: string           // from quote_channel lookup
  quote_destination: string
  // Follow-up
  quote_reminder_date: string
  follow_up_cycles: string        // string in form; parsed to number on submit
  follow_up_frequency: 'Daily' | 'Every 2 days' | 'Weekly' | ''
  notes: string
}
```

---

## Client validation helpers (lead & quote forms)

| Helper | Module | Purpose |
|--------|--------|---------|
| `validatePhone()` | `lib/utils/phone.ts` | Required phone on lead create/edit |
| `validateEmail()` | `lib/utils/email.ts` | Optional email format |
| `validateWebsite()` | `lib/utils/website.ts` | Optional website/social URL; empty allowed; **`http://` / `https://` not required** (e.g. `example.com`, `www.10x.am`, `instagram.com/page`) |
| `normalizeWebsite()` | `lib/utils/website.ts` | Prefix `https://` when protocol omitted before save |
| `WEBSITE_FIELD_PLACEHOLDER` | `lib/utils/website.ts` | Shared placeholder: `example.com or instagram.com/page` |
| `scrollToFormField()` | `lib/utils/scroll-field-into-view.ts` | Scroll a `[data-field-anchor="…"]` wrapper into view and focus its control |
| `scrollToFirstFormField()` | `lib/utils/scroll-field-into-view.ts` | Scroll to the first error in a priority-ordered list (New Quote tab validation) |
| `buildInitialFollowUpSchedule()` | `lib/utils/follow-up-schedule.ts` | Seed `follow_up_at` when a quote is sent |
| `processDueQuoteFollowUps()` | `lib/utils/process-due-follow-ups.ts` | Process due quote follow-ups (manual `GET /api/cron/follow-ups` or Vercel Cron on Pro) |
| `formatLeadProductInterests()` | `lib/utils/format-lead-product-interests.ts` | List display: `Booklets[1111], Labels[500]` |

### Field validation UX (May 2026)

When a required or invalid field fails validation:

1. **Inline error** under the field + **red border** on the input/select (not a generic message at the bottom of the form)
2. **Scroll into view** — if the field is off-screen (e.g. Source at top while user scrolled to Product Interests), the scroll container smooth-scrolls to the field and focuses it

Applies to: **Add Lead modal**, **Verify drawer**, **Edit Customer modal**, **New Quote form** (all tabs).

Markup pattern: wrap each validatable field in `<div data-field-anchor="source">` (or `phone`, `firstName`, `customerSource`, `title`, etc.) inside the scrollable form container.

---

## Performance helpers (list pages — May 2026)

| Helper | Module | Purpose |
|--------|--------|---------|
| `useCoalescedRefresh()` | `hooks/use-coalesced-refresh.ts` | Debounce mount + `bazaar:*-changed` refetch; `enabled` pause for editable modals; **silent resume** when re-enabled; read-only drawers on leads page use `enabled: !drawerLead \|\| drawerReadOnly` |
| `DashboardDateRangeFilter` | `components/ui/dashboard-date-range-filter.tsx` | SDR/Sales/Admin dashboards + Quotes/Orders/Completed lists; `lib/utils/dashboard-date-range-filter.ts` resolves presets + `isoTimestampInDashboardRange()` |
| `getCachedSession()` / `setCachedSession()` | `lib/auth/session-cache.ts` | In-process ~3 s memoization inside `requireSession()` |
| `fetchProductionOrders()` / `fetchProductionTabCounts()` | `lib/utils/fetch-production-data.ts` | Production list + counts (page-data route) |
| `fetchOrdersList()` / `fetchOrdersTabCounts()` | `lib/utils/fetch-orders-data.ts` | Orders list + tab counts |
| `fetchQuotesList()` / `fetchQuotesTabCounts()` | `lib/utils/fetch-quotes-data.ts` | Quotes list + quote-stage counts |
| `fetchPendingPaymentOrders()` | `lib/utils/fetch-payments-data.ts` | Payments pending evidence list |
| `fetchCompletedOrders()` / `fetchCompletedTabCounts()` | `lib/utils/fetch-completed-data.ts` | Completed list + counts — SDR scoped by `created_by_id` via `scopeCompletedTicketsQuery()` |
| `scopeCompletedTicketsQuery()` / `scopedCompletedTicketCount()` | `lib/utils/db-counts.ts` | Completed-only scope — SDR `created_by_id` only; Admin/Accountant unscoped |
| `fetchLeadsWorkspace()` / `fetchLeadsWorkspaceTabCounts()` / `fetchLeadsSalesTabCounts()` | `lib/utils/leads-workspace-query.ts` | Leads/sales workspace list + tab counts |
| `fetchSidebarCounts()` | `lib/utils/sidebar-counts-query.ts` | Role-scoped sidebar badges (`?routes=`) |
| `copyTextToClipboard()` / `publicQuoteUrl()` | `lib/utils/copy-to-clipboard.ts` | **Copy Link** button + public portal URL on quote/order detail |

---

## Navigation helpers (detail Back)

| Helper | Module | Purpose |
|--------|--------|---------|
| `ticketLifecycleHref()` | `lib/utils/ticket-detail-href.ts` | `/orders/` / `/quotes/` / `/completed/` by ticket status |
| `ticketLifecycleHrefWithReturn()` | `lib/utils/ticket-detail-href.ts` | Lifecycle URL + `?from=` (Reports uses `REPORTS_RETURN_PATH`) |
| `resolveTicketDetailBackPath()` | `lib/utils/ticket-detail-href.ts` | Back target: validated `from`, else list fallback |
| `appendReturnPath()` | `lib/utils/ticket-detail-href.ts` | Safe internal return query param |
| `logTicketPaymentRecorded()` | `lib/utils/log-ticket-payment-recorded.ts` | Inserts canonical payment activity for Reports cash |
