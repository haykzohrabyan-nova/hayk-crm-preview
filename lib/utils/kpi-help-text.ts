/** Short explanations shown under dashboard / report KPI cards. */

export const KPI_HELP = {
  cash_collected:
    "Sum of payment amounts recorded in this period (matches Reports).",
  total_leads: "Workspace leads created in this period.",
  inbox_leads: "Inbox leads not yet moved to the SDR workspace.",
  open_leads: "Unclaimed workspace leads waiting for an SDR.",
  routed_to_sales: "Leads currently in Routed to Sales status (live snapshot).",
  won:
    "Orders released to production in this period (count, not dollar value).",
  pipeline_value:
    "Sum of quote totals on draft and sent quotes — live snapshot, not filtered by period.",
  pipeline_value_sales:
    "Sum of quote totals on your draft and sent quotes — live snapshot, not filtered by period.",
  released_order_value:
    "Sum of quote totals when orders were released to production in this period.",
  awaiting_collection:
    "Balance still due on open orders today (quote total minus paid). Not limited to this date range.",
  payments_recorded:
    "Number of individual payment entries logged in this period.",
  quote_win_rate:
    "Quotes sent in this period that reached production, as a percentage.",
  collection_rate: "Cash collected vs booked order value on that rep's orders.",
  sourced_cash:
    "Payments recorded in this period on leads you routed (SDR credit).",
  new_in_pipeline: "Routed leads waiting for a sales rep to claim (live snapshot).",
  active_deals: "Your leads with sales work in progress (Ongoing or Quote Sent).",
  on_hold_sales: "Your deals currently paused (On Hold).",
  on_hold_sdr: "Workspace leads you parked on hold (live snapshot).",
  handled: "Distinct leads you acted on this period (claim, route, hold, or reject).",
  routed: "Leads you routed to sales this period.",
  rejected: "Leads you rejected this period.",
  quote_value_sdr: "Sum of quote_total on leads you handled this period.",
  share_pct: "Your handled leads as a share of all SDR activity this period.",
} as const;
