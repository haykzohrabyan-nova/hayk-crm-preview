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
  rejection_reason: string | null
  rejection_notes: string | null
  created_at: string
  updated_at: string
  // Joined (optional)
  customer?: Customer
  locked_by?: UserProfile
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
  customer_id: string | null
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
  customer?: Customer
  lead?: Lead
}

// ─────────────────────────────────────────────────────────────────────────────
// Activity
// ─────────────────────────────────────────────────────────────────────────────

export type ActivityType =
  | 'lead_verified'
  | 'lead_manual_created'
  | 'lead_status_changed'
  | 'lead_routed_to_sales'
  | 'lead_rejected'
  | 'lead_held'
  | 'lead_resumed'
  | 'lead_merged'
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
