// ─────────────────────────────────────────────────────────────────────────────
// User & Auth
// ─────────────────────────────────────────────────────────────────────────────

export type SystemRoleName = 'sdr' | 'sales' | 'admin'

export interface Role {
  id: string
  name: string
  display_name: string
  is_system: boolean
  created_at: string
}

export interface Page {
  id: string
  route: string
  display_name: string
  icon: string | null
  section: 'main' | 'admin' | 'bottom'
  sort_order: number
  created_at: string
}

export interface RolePermission {
  role_id: string
  page_id: string
  role?: Role
  page?: Page
}

export interface UserProfile {
  id: string
  role_id: string
  full_name: string | null
  avatar_url: string | null
  is_active: boolean
  must_change_password: boolean
  created_at: string
  updated_at: string
  // Joined from user_profiles_with_role view
  role_name?: string
  role_display_name?: string
  role_is_system?: boolean
}

// ─────────────────────────────────────────────────────────────────────────────
// Lookup Values (DB-driven dropdown options)
// ─────────────────────────────────────────────────────────────────────────────

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
  value: string
  label: string
  sort_order: number
  is_active: boolean
  created_at: string
}

export type LookupMap = Partial<Record<LookupCategory, LookupValue[]>>

// ─────────────────────────────────────────────────────────────────────────────
// Customer
// ─────────────────────────────────────────────────────────────────────────────

export type HeatTag = 'hot' | 'warm' | 'cold'

export interface Customer {
  id: string
  first_name: string | null
  last_name: string | null
  email: string | null
  phone: string | null
  company: string | null
  industry: string | null
  website: string | null
  heat_tag: HeatTag | null
  created_at: string
  updated_at: string
}

export interface CustomerLookupResult {
  customers: Customer[]
  count: number
}

// ─────────────────────────────────────────────────────────────────────────────
// Lead
// ─────────────────────────────────────────────────────────────────────────────

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
  customer_id: string | null
  source: string | null
  brand: string | null
  authority: string | null
  status: LeadStatus
  sales_status: SalesStatus | null
  is_inbox: boolean
  sdr_id: string | null
  assigned_sdr_id: string | null
  sales_owner_id: string | null
  held_by_id: string | null
  locked_by_id: string | null
  locked_at: string | null
  interests: Record<string, boolean>
  quantities: Record<string, string>
  quote_total: number | null
  quote_channel: QuoteChannel | null
  quote_destination: string | null
  hold_reason: string | null
  hold_notes: string | null
  hold_until: string | null
  held_at: string | null
  prev_status: LeadStatus | null
  prev_sales_status: SalesStatus | null
  urgency: LeadUrgency | null
  is_returning_customer: boolean
  sdr_comment: string | null
  initial_interest: string | null
  rejection_reason: string | null
  rejection_notes: string | null
  sales_notes: string | null
  created_at: string
  updated_at: string
  // Joined (optional)
  customer?: Customer
  locked_by?: UserProfile
  sales_owner?: { id: string; full_name: string | null } | null
}

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

// ─────────────────────────────────────────────────────────────────────────────
// Job Ticket
// ─────────────────────────────────────────────────────────────────────────────

export type TicketKind = 'quote' | 'order'

export type TicketStatus =
  | 'draft'
  | 'sent'
  | 'approved'
  | 'rejected'
  | 'in_production'
  | 'completed'
  | 'cancelled'
  | 'routed'
  | 'order'

// Ticket-specific payment method keys (stored in quote_payment_types[])
export type PaymentTypeKey = 'card_default' | 'zelle' | 'offline'

// Legacy payment type — kept for backwards compat with old product_lines flow
export type PaymentType = 'Cash' | 'Check' | 'Card' | 'Transfer'

export type TicketPriority = 'Low' | 'Normal' | 'High'
export type OrderSource   = 'quoted' | 'direct'
export type DiscountType  = 'percent' | 'fixed'
export type PrepayType    = 'percent' | 'fixed'
export type FollowUpFreq  = 'Daily' | 'Every 2 days' | 'Weekly'

// ── QuoteSku — one line item inside quote_skus JSONB ─────────────────────────
// Canonical definition also lives in lib/utils/ticket-math.ts (pricing helpers
// import from there). Both must stay in sync.
export interface QuoteSku {
  product_type: string          // product name from admin catalog
  description?: string          // auto-derived: productType – material – lamination
  material?: string             // material name from admin catalog
  lamination?: string           // from `lamination` lookup
  color_mode?: string           // from `color_mode` lookup
  sides?: string                // from `sides` lookup
  roll_direction?: string       // from `roll_direction` lookup
  width?: number                // inches
  height?: number               // inches
  quantity?: number
  unit_price?: number
  design_required?: boolean     // "Design on file" checkbox
  die_cut?: boolean
  spot_uv?: boolean             // UV Coating add-on
  foil?: boolean
  perforation?: boolean
  comment?: string              // per-SKU line item free-text note
}

// ── Legacy ProductLine — kept for backwards compat ───────────────────────────
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

// ── JobTicket — full DB row + optional joins ──────────────────────────────────
export interface JobTicket {
  id: string
  ticket_kind: TicketKind
  ticket_status: TicketStatus
  customer_id: string | null
  linked_lead_id: string | null
  created_by_id: string | null

  // Contact (denormalized)
  contact_email: string | null
  contact_name: string | null
  contact_company: string | null
  contact_phone: string | null

  // Identity
  title: string | null
  reference_code: string | null   // ORD-YYYY-NNN (orders only)
  public_token: string            // UUID used for the public customer-facing quote URL /q/[token]
  payment_status: 'unpaid' | 'partial' | 'paid'
  prepayment_status: 'pending' | 'paid'

  // Quote delivery
  quote_channel: string | null
  quote_destination: string | null

  // Pricing (new columns — used by OrderDrawer)
  quote_subtotal: number | null
  quote_shipping: number | null
  discount_type: DiscountType | null
  discount_value: string | null
  discount_reason: string | null
  quote_pre_tax_total: number | null
  quote_tax_rate_percent: number | null
  quote_tax_amount: number | null
  quote_final_total: number | null
  tax_exempt: boolean
  sales_permit_number: string | null

  // Payment
  quote_payment_types: PaymentTypeKey[]
  prepayment_type: PrepayType | null
  prepayment_value: string | null

  // Follow-up scheduling
  quote_reminder_date: string | null
  follow_up_cycles: number | null
  follow_up_frequency: FollowUpFreq | null

  // Order-specific
  order_source: OrderSource | null
  due_date: string | null
  priority: TicketPriority | null
  special_requirements: string | null
  design_required: boolean
  die_cut: boolean

  // Line items
  quote_skus: QuoteSku[]

  // Flags & dates
  rush: boolean
  follow_up_completed: boolean
  client_confirmed: boolean
  quote_approval_last_requested_at: string | null
  notes: string | null
  created_at: string
  updated_at: string

  // Legacy columns (nullable — backwards compat only)
  subtotal: number | null
  discount_percent: number | null
  discount_amount: number | null
  total: number | null
  payment_type: PaymentType | null
  prepay_amount: number | null
  product_lines: ProductLine[]
  follow_up_at: string | null

  // Optional joins
  customer?: Customer
  lead?: Lead
  created_by?: { id: string; full_name: string | null }
}

// ── TicketForm — OrderDrawer form state (all strings for controlled inputs) ───
export interface TicketForm {
  title: string
  ticket_kind: TicketKind
  ticket_status: TicketStatus
  order_source: OrderSource | ''
  priority: TicketPriority | ''
  due_date: string
  special_requirements: string
  rush: boolean
  design_required: boolean
  die_cut: boolean

  // Contact
  customer_id: string | null
  linked_lead_id: string | null
  contact_name: string
  contact_email: string
  contact_phone: string
  contact_company: string

  // Line items
  quote_skus: Partial<QuoteSku>[]

  // Quote pricing
  quote_shipping: string          // string for input; parsed to number
  discount_enabled: boolean
  discount_type: DiscountType | ''
  discount_value: string
  discount_reason: string
  quote_tax_rate_percent: string  // string for input; parsed to number
  tax_exempt: boolean
  sales_permit_number: string

  // Payment
  quote_payment_types: PaymentTypeKey[]
  prepayment_type: PrepayType | ''
  prepayment_value: string

  // Quote delivery
  quote_channel: string
  quote_destination: string

  // Follow-up
  quote_reminder_date: string
  follow_up_cycles: string        // string for input; parsed to number
  follow_up_frequency: FollowUpFreq | ''

  notes: string
}

// ─────────────────────────────────────────────────────────────────────────────
// Company Settings
// ─────────────────────────────────────────────────────────────────────────────

export interface CompanySettings {
  id: number
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
  default_tax_rate: number
  high_value_threshold: number
  rush_surcharge_percent: number | null
  updated_at: string
}

// ─────────────────────────────────────────────────────────────────────────────
// Activity
// ─────────────────────────────────────────────────────────────────────────────

export type ActivityType =
  | 'lead_verified'
  | 'lead_manual_created'
  | 'lead_edited'
  | 'lead_status_changed'
  | 'lead_routed_to_sales'
  | 'lead_rejected'
  | 'lead_held'
  | 'lead_resumed'
  | 'lead_merged'
  | 'lead_sales_claimed'
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
  customer_id: string | null
  lead_id: string | null
  ticket_id: string | null
  type: ActivityType
  channel: ActivityChannel | null
  by_user_id: string | null
  payload: Record<string, unknown>
  created_at: string
  by_user?: UserProfile
}

// ─────────────────────────────────────────────────────────────────────────────
// Notification
// ─────────────────────────────────────────────────────────────────────────────

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

// ─────────────────────────────────────────────────────────────────────────────
// Dashboard KPIs
// ─────────────────────────────────────────────────────────────────────────────

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

// ─────────────────────────────────────────────────────────────────────────────
// API Response Wrappers
// ─────────────────────────────────────────────────────────────────────────────

export interface ApiError {
  error: string
  code: string
}

// ─────────────────────────────────────────────────────────────────────────────
// Form Input Types
// ─────────────────────────────────────────────────────────────────────────────

export interface VerifyLeadForm {
  phone: string
  email: string
  first_name: string
  last_name: string
  source: string
  authority: string
  company: string
  industry: string
  website: string
  brand: string
  urgency: LeadUrgency | ''
  is_returning_customer: boolean
  interests: Record<string, boolean>
  quantities: Record<string, string>
  sdr_comment: string
  status: LeadStatus
  quote_total: string
  quote_channel: QuoteChannel | ''
  quote_destination: string
  rejection_reason: string
  rejection_notes: string
}

export interface HoldForm {
  hold_reason: string
  hold_notes: string
  hold_until: string
}
