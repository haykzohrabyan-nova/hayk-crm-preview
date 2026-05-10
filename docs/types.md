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
  | 'source'
  | 'industry'
  | 'urgency'
  | 'hold_reason'
  | 'reject_reason'
  | 'route_reason'
  | 'sales_drop_reason'

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

export type LeadUrgency = 'High' | 'Medium' | 'Low'

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
  | 'approved'
  | 'rejected'
  | 'in_production'
  | 'completed'
  | 'cancelled'

export type PaymentType = 'Cash' | 'Check' | 'Card' | 'Transfer'

export interface ProductLine {
  id: string
  description: string
  quantity: number
  unit_price: number
  material: string | null
  finish: string | null
  size: string | null
  line_total: number
}

export interface QuoteSku {
  id: string
  sku: string
  description: string
  quantity: number
  unit_price: number
  line_total: number
}

export interface JobTicket {
  id: string
  ticket_kind: TicketKind
  ticket_status: TicketStatus
  contact_id: string | null
  linked_lead_id: string | null
  created_by_id: string | null
  contact_email: string | null
  contact_name: string | null
  contact_company: string | null
  subtotal: number | null
  discount_percent: number | null
  discount_amount: number | null
  total: number | null
  payment_type: PaymentType | null
  prepay_amount: number | null
  product_lines: ProductLine[]
  quote_skus: QuoteSku[]
  rush: boolean
  follow_up_at: string | null
  follow_up_completed: boolean
  client_confirmed: boolean
  quote_approval_last_requested_at: string | null
  notes: string | null
  created_at: string
  updated_at: string
  // Joined (optional)
  contact?: Contact
  lead?: Lead
}
```

---

## Activity

```typescript
export type ActivityType =
  | 'lead_verified'
  | 'lead_manual_created'
  | 'lead_edited'           // tracked field changes (no status change)
  | 'lead_status_changed'
  | 'lead_routed_to_sales'
  | 'lead_rejected'         // payload: { from, reason, notes }
  | 'lead_held'
  | 'lead_resumed'
  | 'lead_merged'
  | 'lead_sales_claimed'    // Sales rep claims an unclaimed routed lead
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
  | 'ticket_client_confirmed'

export type ActivityChannel = 'SMS' | 'WhatsApp' | 'Email' | 'Call' | 'In-person'

export interface Activity {
  id: string
  contact_id: string | null
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
  period: string
  leads_handled: number
  leads_verified: number
  leads_routed: number
  leads_rejected: number
  leads_on_hold: number
  quote_value: number
  handled_share_percent: number
}

export interface SalesKpis {
  period: string
  leads_in_pipeline: number
  leads_won: number
  leads_dropped: number
  pipeline_value: number
  won_value: number
  order_count: number
}

export interface AdminKpis {
  period: string
  total_leads: number
  inbox_leads: number
  routed_leads: number
  won_leads: number
  total_revenue: number
  pipeline_value: number
  active_sdr_count: number
  active_sales_count: number
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

/** Shape of the ticket builder form */
export interface TicketBuilderForm {
  ticket_kind: TicketKind
  contact_id: string | null
  linked_lead_id: string | null
  contact_email: string
  contact_name: string
  contact_company: string
  product_lines: ProductLine[]
  quote_skus: QuoteSku[]
  subtotal: number
  discount_percent: number
  discount_amount: number
  total: number
  payment_type: PaymentType | ''
  prepay_amount: number
  rush: boolean
  follow_up_at: string
  notes: string
}
```
