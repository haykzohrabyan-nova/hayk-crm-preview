import type { createAdminClient } from "@/lib/supabase/admin";

type AdminClient = ReturnType<typeof createAdminClient>;

type LeadRow = {
  id: string;
  status: string;
  sales_status: string | null;
  is_inbox: boolean;
  locked_by_id: string | null;
};

type TicketRow = {
  linked_lead_id: string | null;
  ticket_status: string;
  refund_status: string;
};

export interface AdminLeadBreakdown {
  total_leads: number;
  open_leads: number;
  claimed_leads: number;
  pipeline_leads: number;
  quoted_leads: number;
  ordered_leads: number;
  rejected_leads: number;
  cancelled_leads: number;
  refunded_leads: number;
  inbox_leads: number;
}

const EMPTY: AdminLeadBreakdown = {
  total_leads: 0,
  open_leads: 0,
  claimed_leads: 0,
  pipeline_leads: 0,
  quoted_leads: 0,
  ordered_leads: 0,
  rejected_leads: 0,
  cancelled_leads: 0,
  refunded_leads: 0,
  inbox_leads: 0,
};

function ticketOutcome(tickets: TicketRow[]): "refunded" | "cancelled" | null {
  if (tickets.some((t) => t.refund_status === "partial" || t.refund_status === "full")) {
    return "refunded";
  }
  if (tickets.some((t) => t.ticket_status === "cancelled")) {
    return "cancelled";
  }
  return null;
}

function classifyLead(lead: LeadRow, tickets: TicketRow[]): keyof Omit<AdminLeadBreakdown, "total_leads"> {
  const outcome = ticketOutcome(tickets);
  if (outcome === "refunded") return "refunded_leads";
  if (outcome === "cancelled") return "cancelled_leads";

  if (lead.status === "Rejected" || lead.sales_status === "Rejected") {
    return "rejected_leads";
  }
  if (lead.sales_status === "Won") return "ordered_leads";
  if (lead.sales_status === "Quote Sent") return "quoted_leads";
  if (lead.status === "Routed to Sales") return "pipeline_leads";

  if (!lead.is_inbox && (lead.status === "Pending" || lead.status === "Validated")) {
    return lead.locked_by_id ? "claimed_leads" : "open_leads";
  }
  if (lead.is_inbox) return "inbox_leads";

  return "open_leads";
}

/** Period-scoped lead counts for the admin Total Leads card — mutually exclusive buckets. */
export async function buildAdminLeadBreakdown(
  admin: AdminClient,
  periodStartIso: string,
  periodEndIso: string,
): Promise<AdminLeadBreakdown> {
  const { data: leads, error: leadsErr } = await admin
    .from("leads")
    .select("id, status, sales_status, is_inbox, locked_by_id")
    .gte("created_at", periodStartIso)
    .lte("created_at", periodEndIso);

  if (leadsErr) throw leadsErr;

  const rows = (leads ?? []) as LeadRow[];
  if (rows.length === 0) return { ...EMPTY };

  const leadIds = rows.map((l) => l.id);
  const { data: tickets, error: ticketsErr } = await admin
    .from("job_tickets")
    .select("linked_lead_id, ticket_status, refund_status")
    .in("linked_lead_id", leadIds);

  if (ticketsErr) throw ticketsErr;

  const ticketsByLead = new Map<string, TicketRow[]>();
  for (const ticket of (tickets ?? []) as TicketRow[]) {
    if (!ticket.linked_lead_id) continue;
    const list = ticketsByLead.get(ticket.linked_lead_id) ?? [];
    list.push(ticket);
    ticketsByLead.set(ticket.linked_lead_id, list);
  }

  const breakdown: AdminLeadBreakdown = { ...EMPTY, total_leads: rows.length };

  for (const lead of rows) {
    const bucket = classifyLead(lead, ticketsByLead.get(lead.id) ?? []);
    breakdown[bucket] += 1;
  }

  return breakdown;
}
