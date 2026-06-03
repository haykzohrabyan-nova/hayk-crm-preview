/** Short explanations shown under dashboard / report KPI cards. */

export const KPI_HELP = {
  cash_collected:
    "Sum of payment amounts recorded in this period (matches Reports). Excludes cancelled and refunded tickets.",
  total_leads:
    "Workspace leads created in this period. Status badges below are mutually exclusive and sum to this total. Refunded then cancelled orders count as Cancelled.",
  inbox_leads: "Inbox leads not yet moved to the SDR workspace.",
  open_leads: "Unclaimed workspace leads waiting for an SDR.",
  routed_to_sales: "Leads currently in Routed to Sales status (live snapshot).",
  won:
    "Orders released to production in this period (count, not dollar value).",
  pipeline_value:
    "Sum of quote totals on active draft and sent quotes — excludes cancelled and refunded tickets.",
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
  lead_claimed_sdr:
    "QTY of claimed Leads by SDR from all lead sources during the selected period.",
  lead_created_sdr:
    "Leads personally created by SDR, such as walk-ins, referrals, or contacts they met directly.",
  order_total_sdr:
    "Total value of orders you closed yourself (not routed to Sales) in the period — excludes cancelled and refunded.",
  order_total_with_count_sdr:
    "Total value of orders you closed yourself in the period — excludes cancelled and refunded.",
  order_received_sdr:
    "Payments received on your self-closed orders in the period — excludes cancelled and refunded tickets.",
  order_balance_sdr:
    "Remaining unpaid balance on your self-closed orders in the period — excludes cancelled and refunded.",
  order_created_sdr:
    "Quotes you created, converted to orders, and collected payment on — excludes cancelled and refunded.",
  on_hold_sdr_period:
    "Leads that could not be reached or are waiting for a status update.",
  unclaimed_pending_leads_sdr:
    "New leads that have not been claimed, touched or assigned yet.",
  rejected_not_qualified_sdr:
    "Leads rejected because they did not turn into a quote or order, were outside our target segment, or did not have clear project needs.",
  qty_routed_to_sales_sdr:
    "Leads SDR did not quote or close directly and were forwarded to the sales team because they were outside the SDR's quoting criteria.",
  sales_win_sdr:
    "Routed-to-Sales leads whose linked order entered production in the period.",
  lead_claimed_sales: "Distinct routed leads you claimed in the selected period.",
  lead_created_sales: "Quotes you created in the selected period.",
  order_total_sales:
    "Sum of quote totals on your orders released to production in the period — excludes cancelled and refunded.",
  order_total_with_count_sales:
    "Production-released order value in the period — excludes cancelled and refunded; includes how many quotes you converted.",
  order_received_sales:
    "Payments recorded on your production-released orders in the period — excludes cancelled and refunded.",
  order_balance_sales:
    "Quote total minus received on your production-released orders — excludes cancelled and refunded.",
  order_created_sales: "Quotes you converted to orders in the period — excludes cancelled and refunded.",
  inbox_sales: "Routed leads waiting to be claimed (live snapshot).",
  rejected_sales: "Leads you rejected from the sales pipeline in the period.",
  on_hold_sales_period: "Times you put a deal on hold in the selected period.",
} as const;
