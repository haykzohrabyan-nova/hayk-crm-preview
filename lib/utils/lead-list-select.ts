/** Slim lead + customer columns for workspace / sales list tables. */

export const LEAD_WORKSPACE_LIST_SELECT = `
  id,
  customer_id,
  status,
  sales_status,
  source,
  urgency,
  initial_interest,
  created_at,
  updated_at,
  locked_by_id,
  sales_owner_id,
  sdr_id,
  hold_reason,
  hold_until,
  held_at,
  rejection_reason,
  prev_status,
  customer:customers(id, first_name, last_name, company, phone, email),
  sales_owner:user_profiles!leads_sales_owner_id_fkey(id, full_name),
  locked_by:user_profiles!leads_locked_by_id_fkey(id, full_name)
`.trim();

export const LEAD_WON_LIST_SELECT = `
  id,
  customer_id,
  status,
  sales_status,
  source,
  urgency,
  initial_interest,
  created_at,
  updated_at,
  customer:customers(id, first_name, last_name, company, phone, email),
  sales_owner:user_profiles!leads_sales_owner_id_fkey(id, full_name),
  tickets:job_tickets(id, reference_code, quote_final_total, ticket_status, created_by_id)
`.trim();

export const LEAD_DETAIL_SELECT = `
  *,
  customer:customers(id, first_name, last_name, company, phone, email, industry, website),
  sales_owner:user_profiles!leads_sales_owner_id_fkey(id, full_name),
  locked_by:user_profiles!leads_locked_by_id_fkey(id, full_name)
`.trim();
