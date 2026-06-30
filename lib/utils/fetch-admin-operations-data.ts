import type { createAdminClient } from "@/lib/supabase/admin";
import {
  countOperationsFilters,
  getAdminDealStageLabel,
  matchesOperationsFilter,
  primaryOperationsTicket,
  resolveOperationsStageContext,
  resolveOperationsTicketRefs,
  type OperationsFilter,
  type OperationsLead,
  type OperationsLinkedTicket,
  type OperationsOwnerHighlight,
} from "@/lib/utils/admin-deal-stage";
import { isoTimestampInDashboardRange } from "@/lib/utils/dashboard-date-range-filter";
import type { SdrDashboardDateRange } from "@/lib/utils/sdr-dashboard-date-range";
import type { PaginationParams } from "@/lib/utils/pagination";
import { displayContactName } from "@/lib/utils/format";
import { excludeRefundedTickets } from "@/lib/utils/exclude-refunded-tickets";
import { isOrderReferenceCode } from "@/lib/utils/reference-codes";
import { jobTicketCustomerEmbed } from "@/lib/utils/ticket-list-select";

type AdminClient = ReturnType<typeof createAdminClient>;

function opsDebug(label: string, data: Record<string, unknown>) {
  if (process.env.NODE_ENV === "development") {
    console.log(`[operations/fetch] ${label}`, data);
  }
}

/** Synthetic lead ids for quote tickets without linked_lead_id. */
export const OPERATIONS_TICKET_ONLY_LEAD_PREFIX = "__ticket__:";

export function isOperationsTicketOnlyLeadId(leadId: string): boolean {
  return leadId.startsWith(OPERATIONS_TICKET_ONLY_LEAD_PREFIX);
}

const OPERATIONS_TICKET_FIELDS =
  "id, reference_code, ticket_kind, ticket_status, linked_lead_id, created_at, updated_at, created_by_id, client_confirmed, ticket_require_client_confirm, payment_evidence_url, payment_evidence_submitted_at, payment_evidence_reviewed_at, payment_paid_at, deposit_paid_at, payment_amount_received, deposit_amount, tax_exempt, sales_permit_storage_path, sales_permit_reviewed_at, contact_name, contact_company";

const OPERATIONS_UNLINKED_QUOTE_SELECT =
  `${OPERATIONS_TICKET_FIELDS}, ${jobTicketCustomerEmbed("id, first_name, last_name, company, phone, email")}`;

const OPERATIONS_LEAD_SELECT = `
  id, status, sales_status, is_inbox, locked_by_id, sales_owner_id, sdr_id, created_at,
  customer:customers(id, first_name, last_name, company, phone, email),
  sales_owner:user_profiles!leads_sales_owner_id_fkey(id, full_name)
`;

export type OperationsListFilters = {
  stage?: OperationsFilter;
  search?: string;
  dateRange?: SdrDashboardDateRange | null;
  userId?: string | null;
};

export type OperationsDealRow = {
  lead_id: string;
  customer_name: string;
  company: string | null;
  stage: string;
  /** Ticket ref when stage is driven by QUO/ORD row; null when lead-only stage. */
  stage_ticket_ref: string | null;
  stage_from_ticket: boolean;
  /** Highlights SDR vs Sales rep column for who owns this step. */
  owner_highlight: OperationsOwnerHighlight;
  sdr_name: string | null;
  sales_owner_name: string | null;
  quote_ref: string | null;
  quote_id: string | null;
  quote_created_at: string | null;
  order_ref: string | null;
  order_id: string | null;
  order_created_at: string | null;
  lead_created_at: string;
  /** When quote ref is derived from ORD-* (converted ticket), link using the live ref. */
  quote_nav_ref?: string | null;
  /** Quote exists without a linked lead — detail drawer disabled. */
  ticket_only?: boolean;
};

type LeadCustomer = {
  first_name?: string | null;
  last_name?: string | null;
  company?: string | null;
  phone?: string | null;
  email?: string | null;
};

type ProfileRef = { id: string; full_name: string | null };

type RawLead = OperationsLead & {
  customer?: LeadCustomer | LeadCustomer[] | null;
  sales_owner?: ProfileRef | ProfileRef[] | null;
  contact_name?: string | null;
  contact_company?: string | null;
};

async function fetchProfileNames(
  admin: AdminClient,
  userIds: string[],
): Promise<Map<string, string | null>> {
  const map = new Map<string, string | null>();
  if (userIds.length === 0) return map;

  const { data } = await admin
    .from("user_profiles")
    .select("id, full_name")
    .in("id", userIds);

  for (const row of data ?? []) {
    map.set(row.id as string, (row.full_name as string | null) ?? null);
  }
  return map;
}

function unwrapOne<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function leadMatchesUser(lead: RawLead, userId: string): boolean {
  return (
    lead.sdr_id === userId ||
    lead.sales_owner_id === userId ||
    lead.locked_by_id === userId
  );
}

function leadMatchesSearch(lead: RawLead, row: OperationsDealRow, search: string): boolean {
  const q = search.toLowerCase();
  if (row.customer_name.toLowerCase().includes(q)) return true;
  if (row.company?.toLowerCase().includes(q)) return true;
  if (row.quote_ref?.toLowerCase().includes(q)) return true;
  if (row.order_ref?.toLowerCase().includes(q)) return true;
  if (row.stage.toLowerCase().includes(q)) return true;
  const customer = unwrapOne(lead.customer);
  if (customer?.email?.toLowerCase().includes(q)) return true;
  if (customer?.phone?.includes(q)) return true;
  return false;
}

function buildDealRow(
  lead: RawLead,
  orderConvertedAt: Map<string, string>,
  sdrNames: Map<string, string | null>,
): OperationsDealRow {
  const customer = unwrapOne(lead.customer);
  const ticketOnly = isOperationsTicketOnlyLeadId(lead.id);
  const primary = primaryOperationsTicket(lead);
  const { quote, order } = resolveOperationsTicketRefs(lead);
  const stage = getAdminDealStageLabel(lead, primary);
  const { stageFromTicket, stageTicketRef, ownerHighlight } = resolveOperationsStageContext(
    lead,
    primary,
  );

  const quoteRef = quote?.reference_code?.trim() || null;
  const orderRef = order?.reference_code?.trim() || null;
  const orderTicketId = order?.id ?? null;
  const quoteDerivedFromOrder =
    !!quote &&
    !!order &&
    quote.id === order.id &&
    !!quoteRef &&
    !!orderRef &&
    isOrderReferenceCode(orderRef);
  const quoteNavRef = quoteDerivedFromOrder ? orderRef : quoteRef;

  const customerName = ticketOnly
    ? displayContactName(
        customer ?? {
          first_name: lead.contact_name?.split(" ")[0] ?? null,
          last_name: lead.contact_name?.split(" ").slice(1).join(" ") || null,
          company: lead.contact_company ?? null,
        },
        { preferPerson: true },
      )
    : displayContactName(customer, { preferPerson: true });

  return {
    lead_id: lead.id,
    customer_name: customerName,
    company: customer?.company?.trim() || lead.contact_company?.trim() || null,
    stage,
    stage_ticket_ref: stageTicketRef,
    stage_from_ticket: stageFromTicket,
    owner_highlight: ownerHighlight,
    sdr_name: (lead.sdr_id ? sdrNames.get(lead.sdr_id) : null) ?? null,
    sales_owner_name: unwrapOne(lead.sales_owner)?.full_name ?? null,
    quote_ref: quoteRef,
    quote_id: quote?.id ?? null,
    quote_created_at: quote?.created_at ?? null,
    quote_nav_ref: quoteNavRef,
    order_ref: orderRef,
    order_id: orderTicketId,
    order_created_at: orderTicketId
      ? (orderConvertedAt.get(orderTicketId) ?? order?.updated_at ?? order?.created_at ?? null)
      : null,
    lead_created_at: lead.created_at,
    ticket_only: ticketOnly || undefined,
  };
}

function linkedTicketsForDate(lead: OperationsLead) {
  return (lead.tickets ?? []).filter(
    (t) => !t.linked_lead_id || t.linked_lead_id === lead.id,
  );
}

/** Match Quotes / Orders / Completed list pages — lead OR linked ticket activity in range. */
export function leadMatchesOperationsDateRange(
  lead: OperationsLead,
  range: SdrDashboardDateRange,
  orderConvertedAt: Map<string, string>,
): boolean {
  if (isoTimestampInDashboardRange(lead.created_at, range)) return true;

  const tickets = linkedTicketsForDate(lead);
  const { quote, order } = resolveOperationsTicketRefs(lead);

  if (quote?.created_at && isoTimestampInDashboardRange(quote.created_at, range)) {
    return true;
  }

  if (
    quote &&
    ["sent", "approved"].includes(quote.ticket_status ?? "") &&
    quote.updated_at &&
    isoTimestampInDashboardRange(quote.updated_at, range)
  ) {
    return true;
  }

  if (order) {
    const orderDate =
      orderConvertedAt.get(order.id) ??
      order.created_at ??
      order.updated_at;
    if (orderDate && isoTimestampInDashboardRange(orderDate, range)) {
      return true;
    }
  }

  for (const ticket of tickets) {
    if (ticket.ticket_status === "completed" && ticket.updated_at) {
      if (isoTimestampInDashboardRange(ticket.updated_at, range)) return true;
    }
    if (
      ticket.created_at &&
      !quote &&
      !order &&
      isoTimestampInDashboardRange(ticket.created_at, range)
    ) {
      return true;
    }
  }

  return false;
}

function orderTicketInOperationsRange(
  ticket: OperationsLinkedTicket,
  range: SdrDashboardDateRange,
  orderConvertedAt: Map<string, string>,
): boolean {
  const converted = orderConvertedAt.get(ticket.id);
  if (converted && isoTimestampInDashboardRange(converted, range)) return true;
  if (ticket.created_at && isoTimestampInDashboardRange(ticket.created_at, range)) {
    return true;
  }
  if (
    ["order", "in_production"].includes(ticket.ticket_status ?? "") &&
    ticket.updated_at &&
    isoTimestampInDashboardRange(ticket.updated_at, range)
  ) {
    return true;
  }
  return false;
}

function quoteTicketInOperationsRange(
  ticket: OperationsLinkedTicket,
  range: SdrDashboardDateRange,
): boolean {
  if (ticket.created_at && isoTimestampInDashboardRange(ticket.created_at, range)) {
    return true;
  }
  if (
    ["sent", "approved"].includes(ticket.ticket_status ?? "") &&
    ticket.updated_at &&
    isoTimestampInDashboardRange(ticket.updated_at, range)
  ) {
    return true;
  }
  return false;
}

/** Match Completed list — completion activity uses ticket `updated_at`. */
function completedTicketInOperationsRange(
  ticket: OperationsLinkedTicket,
  range: SdrDashboardDateRange,
): boolean {
  return (
    ticket.ticket_status === "completed" &&
    !!ticket.updated_at &&
    isoTimestampInDashboardRange(ticket.updated_at, range)
  );
}

async function fetchOrderConversionLeadIds(
  admin: AdminClient,
  range: SdrDashboardDateRange,
): Promise<string[]> {
  const { data: activities, error: actErr } = await admin
    .from("activities")
    .select("ticket_id")
    .eq("type", "ticket_converted")
    .gte("created_at", range.startIso)
    .lte("created_at", range.endIso);

  if (actErr) throw actErr;

  const ticketIds = [
    ...new Set((activities ?? []).map((a) => a.ticket_id as string | null).filter(Boolean)),
  ] as string[];
  if (ticketIds.length === 0) return [];

  const { data: tickets, error } = await admin
    .from("job_tickets")
    .select("linked_lead_id")
    .in("id", ticketIds)
    .not("linked_lead_id", "is", null);

  if (error) throw error;

  return (tickets ?? [])
    .map((t) => t.linked_lead_id as string | null)
    .filter((id): id is string => !!id);
}

async function attachTicketsToLeads(admin: AdminClient, leads: RawLead[]): Promise<void> {
  const leadIds = leads.filter((l) => !isOperationsTicketOnlyLeadId(l.id)).map((l) => l.id);
  if (leadIds.length === 0) return;

  const byLead = new Map<string, OperationsLinkedTicket[]>();
  const chunkSize = 500;

  for (let i = 0; i < leadIds.length; i += chunkSize) {
    const chunk = leadIds.slice(i, i + chunkSize);
    const { data, error } = await admin
      .from("job_tickets")
      .select(OPERATIONS_TICKET_FIELDS)
      .in("linked_lead_id", chunk);

    if (error) throw error;

    for (const row of data ?? []) {
      const ticket = row as OperationsLinkedTicket;
      const leadId = ticket.linked_lead_id;
      if (!leadId) continue;
      const list = byLead.get(leadId) ?? [];
      list.push(ticket);
      byLead.set(leadId, list);
    }
  }

  for (const lead of leads) {
    if (isOperationsTicketOnlyLeadId(lead.id)) continue;
    lead.tickets = byLead.get(lead.id) ?? [];
  }
}

type UnlinkedQuoteRow = OperationsLinkedTicket & {
  created_by_id?: string | null;
  contact_name?: string | null;
  contact_company?: string | null;
  customer?: LeadCustomer | LeadCustomer[] | null;
};

async function fetchUnlinkedQuoteLeadsInRange(
  admin: AdminClient,
  range: SdrDashboardDateRange,
): Promise<RawLead[]> {
  const { data, error } = await admin
    .from("job_tickets")
    .select(OPERATIONS_UNLINKED_QUOTE_SELECT)
    .eq("ticket_kind", "quote")
    .in("ticket_status", ["draft", "sent", "approved", "routed"])
    .is("linked_lead_id", null)
    .limit(10000);

  if (error) throw error;

  const tickets = ((data ?? []) as unknown as UnlinkedQuoteRow[]).filter((ticket) =>
    quoteTicketInOperationsRange(ticket, range),
  );

  const creatorIds = [
    ...new Set(tickets.map((t) => t.created_by_id).filter(Boolean)),
  ] as string[];
  const creatorNames = await fetchProfileNames(admin, creatorIds);

  return tickets.map((ticket) => {
      const creatorId = ticket.created_by_id ?? null;
      return {
        id: `${OPERATIONS_TICKET_ONLY_LEAD_PREFIX}${ticket.id}`,
        status: "Quoted",
        sales_status: ticket.ticket_status === "sent" ? "Quote Sent" : null,
        is_inbox: false,
        locked_by_id: null,
        sales_owner_id: creatorId,
        sdr_id: null,
        created_at: ticket.created_at ?? new Date().toISOString(),
        tickets: [ticket],
        customer: ticket.customer,
        contact_name: ticket.contact_name ?? null,
        contact_company: ticket.contact_company ?? null,
        sales_owner: creatorId
          ? { id: creatorId, full_name: creatorNames.get(creatorId) ?? null }
          : null,
      } satisfies RawLead;
    });
}

type UnlinkedOrderRow = OperationsLinkedTicket & {
  created_by_id?: string | null;
  contact_name?: string | null;
  contact_company?: string | null;
  customer?: LeadCustomer | LeadCustomer[] | null;
};

async function fetchUnlinkedOrderLeadsInRange(
  admin: AdminClient,
  range: SdrDashboardDateRange,
): Promise<RawLead[]> {
  const { data, error } = await admin
    .from("job_tickets")
    .select(OPERATIONS_UNLINKED_QUOTE_SELECT)
    .eq("ticket_kind", "order")
    .in("ticket_status", ["order", "in_production"])
    .is("linked_lead_id", null)
    .limit(10000);

  if (error) throw error;

  const rows = (data ?? []) as unknown as UnlinkedOrderRow[];
  const orderConvertedAt = await fetchOrderConvertedDates(admin, rows.map((t) => t.id));

  const tickets = rows.filter((ticket) =>
    orderTicketInOperationsRange(ticket, range, orderConvertedAt),
  );

  const creatorIds = [
    ...new Set(tickets.map((t) => t.created_by_id).filter(Boolean)),
  ] as string[];
  const creatorNames = await fetchProfileNames(admin, creatorIds);

  return tickets.map((ticket) => {
    const creatorId = ticket.created_by_id ?? null;
    return {
      id: `${OPERATIONS_TICKET_ONLY_LEAD_PREFIX}${ticket.id}`,
      status: "Quoted",
      sales_status: null,
      is_inbox: false,
      locked_by_id: null,
      sales_owner_id: creatorId,
      sdr_id: null,
      created_at:
        orderConvertedAt.get(ticket.id) ??
        ticket.updated_at ??
        ticket.created_at ??
        new Date().toISOString(),
      tickets: [ticket],
      customer: ticket.customer,
      contact_name: ticket.contact_name ?? null,
      contact_company: ticket.contact_company ?? null,
      sales_owner: creatorId
        ? { id: creatorId, full_name: creatorNames.get(creatorId) ?? null }
        : null,
    } satisfies RawLead;
  });
}

type UnlinkedCompletedRow = OperationsLinkedTicket & {
  created_by_id?: string | null;
  contact_name?: string | null;
  contact_company?: string | null;
  customer?: LeadCustomer | LeadCustomer[] | null;
};

async function fetchUnlinkedCompletedLeadsInRange(
  admin: AdminClient,
  range: SdrDashboardDateRange,
): Promise<RawLead[]> {
  let query = admin
    .from("job_tickets")
    .select(OPERATIONS_UNLINKED_QUOTE_SELECT)
    .eq("ticket_status", "completed")
    .is("linked_lead_id", null)
    .gte("updated_at", range.startIso)
    .lte("updated_at", range.endIso)
    .limit(10000);

  query = excludeRefundedTickets(query);

  const { data, error } = await query;
  if (error) throw error;

  const rows = (data ?? []) as unknown as UnlinkedCompletedRow[];
  const tickets = rows.filter((ticket) => completedTicketInOperationsRange(ticket, range));

  const creatorIds = [
    ...new Set(tickets.map((t) => t.created_by_id).filter(Boolean)),
  ] as string[];
  const creatorNames = await fetchProfileNames(admin, creatorIds);

  return tickets.map((ticket) => {
    const creatorId = ticket.created_by_id ?? null;
    return {
      id: `${OPERATIONS_TICKET_ONLY_LEAD_PREFIX}${ticket.id}`,
      status: "Quoted",
      sales_status: null,
      is_inbox: false,
      locked_by_id: null,
      sales_owner_id: creatorId,
      sdr_id: null,
      created_at: ticket.updated_at ?? ticket.created_at ?? new Date().toISOString(),
      tickets: [ticket],
      customer: ticket.customer,
      contact_name: ticket.contact_name ?? null,
      contact_company: ticket.contact_company ?? null,
      sales_owner: creatorId
        ? { id: creatorId, full_name: creatorNames.get(creatorId) ?? null }
        : null,
    } satisfies RawLead;
  });
}

async function fetchAllLeads(admin: AdminClient): Promise<RawLead[]> {
  const { data, error } = await admin
    .from("leads")
    .select(OPERATIONS_LEAD_SELECT)
    .order("created_at", { ascending: false })
    .limit(100000);

  if (error) throw error;
  return (data ?? []) as RawLead[];
}

async function fetchLeadsByIds(admin: AdminClient, ids: string[]): Promise<RawLead[]> {
  if (ids.length === 0) return [];

  const { data, error } = await admin
    .from("leads")
    .select(OPERATIONS_LEAD_SELECT)
    .in("id", ids);

  if (error) throw error;
  return (data ?? []) as RawLead[];
}

/** Leads whose linked tickets had quote/order/completed activity in the date window. */
async function fetchLinkedLeadIdsWithTicketActivityInRange(
  admin: AdminClient,
  range: SdrDashboardDateRange,
): Promise<string[]> {
  const ids = new Set<string>();

  const conversionLeadIds = await fetchOrderConversionLeadIds(admin, range);
  for (const id of conversionLeadIds) ids.add(id);

  const [quotesCreatedRes, quotesUpdatedRes, ordersCreatedRes, ordersUpdatedRes, completedRes] =
    await Promise.all([
    admin
      .from("job_tickets")
      .select("linked_lead_id")
      .eq("ticket_kind", "quote")
      .not("linked_lead_id", "is", null)
      .gte("created_at", range.startIso)
      .lte("created_at", range.endIso),
    admin
      .from("job_tickets")
      .select("linked_lead_id")
      .eq("ticket_kind", "quote")
      .in("ticket_status", ["sent", "approved"])
      .not("linked_lead_id", "is", null)
      .gte("updated_at", range.startIso)
      .lte("updated_at", range.endIso),
    admin
      .from("job_tickets")
      .select("linked_lead_id")
      .eq("ticket_kind", "order")
      .not("linked_lead_id", "is", null)
      .gte("created_at", range.startIso)
      .lte("created_at", range.endIso),
    admin
      .from("job_tickets")
      .select("linked_lead_id")
      .eq("ticket_kind", "order")
      .in("ticket_status", ["order", "in_production"])
      .not("linked_lead_id", "is", null)
      .gte("updated_at", range.startIso)
      .lte("updated_at", range.endIso),
    admin
      .from("job_tickets")
      .select("linked_lead_id")
      .eq("ticket_status", "completed")
      .not("linked_lead_id", "is", null)
      .gte("updated_at", range.startIso)
      .lte("updated_at", range.endIso),
  ]);

  if (quotesCreatedRes.error) throw quotesCreatedRes.error;
  if (quotesUpdatedRes.error) throw quotesUpdatedRes.error;
  if (ordersCreatedRes.error) throw ordersCreatedRes.error;
  if (ordersUpdatedRes.error) throw ordersUpdatedRes.error;
  if (completedRes.error) throw completedRes.error;

  for (const row of [
    ...(quotesCreatedRes.data ?? []),
    ...(quotesUpdatedRes.data ?? []),
    ...(ordersCreatedRes.data ?? []),
    ...(ordersUpdatedRes.data ?? []),
    ...(completedRes.data ?? []),
  ]) {
    const id = row.linked_lead_id as string | null;
    if (id) ids.add(id);
  }

  return [...ids];
}

function mergeLeadsById(primary: RawLead[], extra: RawLead[]): RawLead[] {
  const byId = new Map<string, RawLead>();
  for (const lead of primary) byId.set(lead.id, lead);
  for (const lead of extra) {
    if (!byId.has(lead.id)) byId.set(lead.id, lead);
  }
  return [...byId.values()].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );
}

async function fetchOrderConvertedDates(
  admin: AdminClient,
  ticketIds: string[],
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (ticketIds.length === 0) return map;

  const { data } = await admin
    .from("activities")
    .select("ticket_id, created_at")
    .eq("type", "ticket_converted")
    .in("ticket_id", ticketIds)
    .order("created_at", { ascending: true });

  for (const row of data ?? []) {
    const tid = row.ticket_id as string | null;
    if (tid && !map.has(tid)) {
      map.set(tid, row.created_at as string);
    }
  }
  return map;
}

export async function fetchOperationsLeadPool(
  admin: AdminClient,
  filters: Pick<OperationsListFilters, "dateRange" | "userId">,
): Promise<{ leads: RawLead[]; orderConvertedAt: Map<string, string> }> {
  let leads = await fetchAllLeads(admin);
  opsDebug("allLeads", { count: leads.length });

  if (filters.dateRange) {
    const ticketLeadIds = await fetchLinkedLeadIdsWithTicketActivityInRange(
      admin,
      filters.dateRange,
    );
    opsDebug("ticketActivityLeadIds", { count: ticketLeadIds.length });
    const existingIds = new Set(leads.map((l) => l.id));
    const missingIds = ticketLeadIds.filter((id) => !existingIds.has(id));
    if (missingIds.length > 0) {
      const extraLeads = await fetchLeadsByIds(admin, missingIds);
      leads = mergeLeadsById(leads, extraLeads);
      opsDebug("extraLeadsFromTickets", { added: extraLeads.length, total: leads.length });
    }
  }

  await attachTicketsToLeads(admin, leads);
  const leadsWithTickets = leads.filter((l) => (l.tickets?.length ?? 0) > 0).length;
  opsDebug("ticketsAttached", { leadsWithTickets, totalLeads: leads.length });

  if (filters.dateRange) {
    const unlinkedQuotes = await fetchUnlinkedQuoteLeadsInRange(admin, filters.dateRange);
    opsDebug("unlinkedQuotes", { count: unlinkedQuotes.length });
    if (unlinkedQuotes.length > 0) {
      leads = mergeLeadsById(leads, unlinkedQuotes);
    }

    const unlinkedOrders = await fetchUnlinkedOrderLeadsInRange(admin, filters.dateRange);
    opsDebug("unlinkedOrders", { count: unlinkedOrders.length });
    if (unlinkedOrders.length > 0) {
      leads = mergeLeadsById(leads, unlinkedOrders);
    }

    const unlinkedCompleted = await fetchUnlinkedCompletedLeadsInRange(admin, filters.dateRange);
    opsDebug("unlinkedCompleted", { count: unlinkedCompleted.length });
    if (unlinkedCompleted.length > 0) {
      leads = mergeLeadsById(leads, unlinkedCompleted);
    }
  }

  if (filters.userId) {
    const before = leads.length;
    leads = leads.filter((lead) => leadMatchesUser(lead, filters.userId!));
    opsDebug("userFilter", { userId: filters.userId, before, after: leads.length });
  }

  const allOrderTicketIds = leads.flatMap((lead) => {
    const { order } = resolveOperationsTicketRefs(lead);
    return order?.id ? [order.id] : [];
  });
  const orderConvertedAt = await fetchOrderConvertedDates(admin, [...new Set(allOrderTicketIds)]);

  if (filters.dateRange) {
    const before = leads.length;
    leads = leads.filter((lead) =>
      leadMatchesOperationsDateRange(lead, filters.dateRange!, orderConvertedAt),
    );
    opsDebug("dateFilter", { before, after: leads.length });
  }

  return { leads, orderConvertedAt };
}

export async function fetchAdminOperationsData(
  admin: AdminClient,
  filters: OperationsListFilters,
  pagination?: PaginationParams,
): Promise<{
  deals: OperationsDealRow[];
  counts: Record<OperationsFilter, number>;
  total: number;
}> {
  const { leads, orderConvertedAt } = await fetchOperationsLeadPool(admin, {
    dateRange: filters.dateRange,
    userId: filters.userId,
  });

  const sdrIds = [...new Set(leads.map((l) => l.sdr_id).filter(Boolean))] as string[];
  const sdrNames = await fetchProfileNames(admin, sdrIds);

  let pairs = leads.map((lead) => ({
    lead,
    row: buildDealRow(lead, orderConvertedAt, sdrNames),
  }));

  const counts = countOperationsFilters(leads);
  opsDebug("bucketCounts", { counts });

  const search = filters.search?.trim();
  if (search) {
    pairs = pairs.filter(({ lead, row }) => leadMatchesSearch(lead, row, search));
    opsDebug("searchFilter", { search, remaining: pairs.length });
  }

  const stage = filters.stage ?? "all_active";
  if (stage === "all_active") {
    pairs = pairs.filter(({ lead }) => matchesOperationsFilter(lead, "all_active"));
  } else {
    pairs = pairs.filter(({ lead }) => matchesOperationsFilter(lead, stage));
  }
  opsDebug("stageFilter", { stage, remaining: pairs.length });

  const total = pairs.length;
  let rows = pairs.map(({ row }) => row);

  if (pagination) {
    rows = rows.slice(pagination.offset, pagination.offset + pagination.limit);
  }

  opsDebug("done", { total, pageRows: rows.length, stage: filters.stage ?? "all_active" });

  return { deals: rows, counts, total };
}
