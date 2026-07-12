import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

// ─────────────────────────────────────────────────────────────────────────────
// Command Center — shared server-side data layer.
//
// Hayk 2026-07-11 — Section 1 of the unified vision. This module reads the
// SHARED local Postgres (the same local Supabase the workflow board uses) and
// threads a customer's whole life across BOTH systems:
//   • CRM side   → customers, leads, job_tickets (quotes + orders + payments)
//   • Workflow   → orders (board cards), board_columns (live stage),
//                  activity_log, job_notifications
//
// READ-ONLY. SELECTs only. Additive. Nothing live is touched.
//
// Data-model notes discovered on the live local DB (2026-07-11):
//   • job_tickets.total is usually NULL — the real figure is quote_final_total.
//   • The workflow `orders` set and the CRM `job_tickets` set link to LARGELY
//     DISJOINT customers in the current seed (no customer has both). The code
//     still threads both so a single customer with both would render correctly.
//   • activity_log currently only carries "created" actions; job_notifications
//     is empty. Both are threaded defensively and simply contribute nothing when
//     empty — never crash.
// ─────────────────────────────────────────────────────────────────────────────

// ── Money / total helpers ────────────────────────────────────────────────────

function num(v: unknown): number {
  if (v === null || v === undefined) return 0;
  const n = typeof v === "number" ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : 0;
}

/** The customer-facing total for a ticket: quote_final_total wins, else total. */
function ticketTotal(t: TicketRow): number {
  const fin = num(t.quote_final_total);
  return fin > 0 ? fin : num(t.total);
}

// ── Row shapes (only the columns we read) ────────────────────────────────────

export type CustomerRow = {
  id: string;
  name: string | null;
  company: string | null;
  email: string | null;
  phone: string | null;
  created_at: string | null;
  key_account_sales_rep_id: string | null;
  tax_exempt_last_permit_number: string | null;
  tax_exempt_last_reviewed_at: string | null;
};

export type LeadRow = {
  id: string;
  customer_id: string | null;
  source: string | null;
  brand: string | null;
  status: string | null;
  sales_status: string | null;
  sdr_id: string | null;
  sales_owner_id: string | null;
  quote_total: number | null;
  quote_channel: string | null;
  urgency: string | null;
  is_returning_customer: boolean | null;
  sdr_comment: string | null;
  sales_notes: string | null;
  follow_up_at: string | null;
  follow_up_notes: string | null;
  created_at: string | null;
};

export type TicketRow = {
  id: string;
  ticket_kind: string | null;
  ticket_status: string | null;
  customer_id: string | null;
  linked_lead_id: string | null;
  created_by_id: string | null;
  reference_code: string | null;
  title: string | null;
  quote_channel: string | null;
  quote_destination: string | null;
  total: number | null;
  quote_final_total: number | null;
  payment_type: string | null;
  payment_status: string | null;
  payment_method_used: string | null;
  payment_amount_received: number | null;
  payment_paid_at: string | null;
  deposit_amount: number | null;
  deposit_paid_at: string | null;
  deposit_method: string | null;
  balance_paid_at: string | null;
  order_source: string | null;
  priority: string | null;
  due_date: string | null;
  tax_exempt: boolean | null;
  sales_permit_number: string | null;
  sales_permit_submitted_at: string | null;
  sales_permit_reviewed_at: string | null;
  client_confirmed: boolean | null;
  follow_up_at: string | null;
  stripe_receipt_url: string | null;
  stripe_card_brand: string | null;
  stripe_card_last4: string | null;
  cancelled_at: string | null;
  refund_status: string | null;
  created_at: string | null;
  updated_at: string | null;
};

export type OrderRow = {
  id: string;
  customer_id: string | null;
  column_id: string | null;
  title: string | null;
  description: string | null;
  specs: Record<string, unknown> | null;
  priority: string | null;
  due_date: string | null;
  created_by: string | null;
  created_at: string | null;
  updated_at?: string | null;
};

export type BoardColumnRow = {
  id: string;
  name: string | null;
  kind: string | null;
};

export type ActivityRow = {
  id: string;
  order_id: string | null;
  actor: string | null;
  action: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string | null;
};

export type NotificationRow = {
  id: string;
  order_id: string | null;
  type: string | null;
  channel: string | null;
  status: string | null;
  customer_response: string | null;
  customer_note: string | null;
  responded_at: string | null;
  created_at: string | null;
};

// ── Index (list) row ─────────────────────────────────────────────────────────

export type IndexRow = {
  id: string;
  name: string;
  company: string | null;
  email: string | null;
  phone: string | null;
  leadCount: number;
  quoteCount: number;
  orderCount: number; // CRM order tickets + workflow board cards
  openBalance: number;
  lastActivity: string | null; // ISO
};

// ── Timeline event ───────────────────────────────────────────────────────────

export type EventSource =
  | "inquiry"
  | "quote"
  | "order"
  | "payment"
  | "permit"
  | "production";

export type TimelineEvent = {
  source: EventSource;
  at: string; // ISO timestamp
  title: string;
  detail: string;
  who: string | null;
};

export type CustomerDetail = {
  customer: CustomerRow;
  repName: string | null;
  isReturning: boolean;
  totals: {
    quoted: number;
    ordered: number;
    paid: number;
    openBalance: number;
    orderCount: number;
  };
  taxExempt: { onFile: boolean; permit: string | null };
  events: TimelineEvent[];
  rightNow: {
    openQuotes: { count: number; value: number };
    activeOrders: Array<{
      code: string;
      title: string;
      stage: string;
      balance: number;
      source: "crm" | "workflow";
    }>;
    openBalance: number;
    nextAction: { at: string; label: string } | null;
    awaitingApproval: string[]; // order codes/titles in an approval/waiting stage
  };
};

// ── Small classifiers ────────────────────────────────────────────────────────

function isQuoteKind(t: TicketRow): boolean {
  return (t.ticket_kind ?? "").toLowerCase() === "quote";
}
function isOrderKind(t: TicketRow): boolean {
  return (t.ticket_kind ?? "").toLowerCase() === "order";
}
function isCancelled(t: TicketRow): boolean {
  return (
    (t.ticket_status ?? "").toLowerCase() === "cancelled" || !!t.cancelled_at
  );
}
/** Open balance owed on a single CRM order ticket. */
function ticketOpenBalance(t: TicketRow): number {
  if (!isOrderKind(t) || isCancelled(t)) return 0;
  const bal = ticketTotal(t) - num(t.payment_amount_received);
  return bal > 0 ? Math.round(bal * 100) / 100 : 0;
}

function niceChannel(c: string | null | undefined): string {
  if (!c) return "";
  const map: Record<string, string> = {
    email: "email",
    sms: "text",
    phone: "phone call",
    phone_call: "phone call",
    call: "phone call",
    ig: "Instagram",
    instagram: "Instagram",
    whatsapp: "WhatsApp",
    website: "the website",
    web: "the website",
    portal: "the portal",
  };
  return map[c.toLowerCase()] ?? c;
}

function titleCaseStage(name: string | null | undefined): string {
  if (!name) return "In production";
  return name;
}

// Guard against the `stub_<uuid>@local.invalid` placeholder profiles Hayk saw:
// a resolved name that is a stub is treated as "no name" so the UI never prints
// the raw stub string. Real reps (Marianna, Gary, Ernesto, Manny…) pass through.
function cleanName(n: string | null | undefined): string | null {
  if (!n) return null;
  if (/^stub_[0-9a-f-]+@local\.invalid$/i.test(n.trim())) return null;
  return n;
}

/** Passport number from a QUO/ORD reference code, e.g. "QUO-2026-0305" → "305". */
function parsePassport(ref: string | null | undefined): string | null {
  if (!ref) return null;
  const m = ref.match(/0*(\d{3,})\s*$/);
  return m ? m[1] : null;
}

// ─────────────────────────────────────────────────────────────────────────────
// INDEX — list of customers with activity, aggregated server-side.
// ─────────────────────────────────────────────────────────────────────────────

export async function loadIndex(q?: string): Promise<{
  rows: IndexRow[];
  totalActive: number;
}> {
  const admin = createAdminClient();

  // Pull the (small) activity tables in full and aggregate in memory. These are
  // tiny seeds (leads ~52, tickets ~103, orders ~40), so this is cheap and lets
  // us thread CRM + workflow counts without N+1 per-customer queries.
  const [leadsRes, ticketsRes, ordersRes] = await Promise.all([
    admin.from("leads").select("id, customer_id, created_at"),
    admin
      .from("job_tickets")
      .select(
        "id, customer_id, ticket_kind, ticket_status, total, quote_final_total, payment_amount_received, cancelled_at, created_at, updated_at",
      ),
    admin.from("orders").select("id, customer_id, created_at, updated_at"),
  ]);

  const leads = (leadsRes.data ?? []) as Array<Pick<LeadRow, "id" | "customer_id" | "created_at">>;
  const tickets = (ticketsRes.data ?? []) as TicketRow[];
  const orders = (ordersRes.data ?? []) as Array<
    Pick<OrderRow, "id" | "customer_id" | "created_at"> & { updated_at?: string | null }
  >;

  type Agg = {
    leadCount: number;
    quoteCount: number;
    orderCount: number;
    openBalance: number;
    lastActivity: number; // epoch ms
  };
  const agg = new Map<string, Agg>();
  const bump = (cid: string | null | undefined, when: string | null | undefined) => {
    if (!cid) return null as Agg | null;
    let a = agg.get(cid);
    if (!a) {
      a = { leadCount: 0, quoteCount: 0, orderCount: 0, openBalance: 0, lastActivity: 0 };
      agg.set(cid, a);
    }
    if (when) {
      const t = Date.parse(when);
      if (Number.isFinite(t) && t > a.lastActivity) a.lastActivity = t;
    }
    return a;
  };

  for (const l of leads) {
    const a = bump(l.customer_id, l.created_at);
    if (a) a.leadCount += 1;
  }
  for (const t of tickets) {
    const a = bump(t.customer_id, t.updated_at ?? t.created_at);
    if (!a) continue;
    if (isQuoteKind(t)) a.quoteCount += 1;
    if (isOrderKind(t)) a.orderCount += 1;
    a.openBalance += ticketOpenBalance(t);
  }
  for (const o of orders) {
    const a = bump(o.customer_id, o.updated_at ?? o.created_at);
    if (a) a.orderCount += 1; // workflow board card also counts as an order
  }

  const ids = Array.from(agg.keys());
  if (ids.length === 0) return { rows: [], totalActive: 0 };

  // Fetch the referenced customers (chunk the .in() to stay safe on size).
  const custMap = new Map<string, CustomerRow>();
  const chunk = 300;
  for (let i = 0; i < ids.length; i += chunk) {
    const slice = ids.slice(i, i + chunk);
    const { data } = await admin
      .from("customers")
      .select("id, name, company, email, phone")
      .in("id", slice);
    for (const c of (data ?? []) as CustomerRow[]) custMap.set(c.id, c);
  }

  let rows: IndexRow[] = ids.map((id) => {
    const a = agg.get(id)!;
    const c = custMap.get(id);
    return {
      id,
      name: c?.name?.trim() || "(unnamed customer)",
      company: c?.company ?? null,
      email: c?.email ?? null,
      phone: c?.phone ?? null,
      leadCount: a.leadCount,
      quoteCount: a.quoteCount,
      orderCount: a.orderCount,
      openBalance: Math.round(a.openBalance * 100) / 100,
      lastActivity: a.lastActivity ? new Date(a.lastActivity).toISOString() : null,
    };
  });

  const totalActive = rows.length;

  // Server-side search over name / company / phone / email.
  const term = (q ?? "").trim().toLowerCase();
  if (term) {
    rows = rows.filter((r) =>
      [r.name, r.company, r.phone, r.email]
        .filter(Boolean)
        .some((f) => String(f).toLowerCase().includes(term)),
    );
  }

  rows.sort((a, b) => {
    const ta = a.lastActivity ? Date.parse(a.lastActivity) : 0;
    const tb = b.lastActivity ? Date.parse(b.lastActivity) : 0;
    return tb - ta;
  });

  return { rows: rows.slice(0, 50), totalActive };
}

// ─────────────────────────────────────────────────────────────────────────────
// DETAIL — one customer, threaded timeline + right-now snapshot.
// ─────────────────────────────────────────────────────────────────────────────

export async function loadCustomerDetail(
  customerId: string,
): Promise<CustomerDetail | null> {
  const admin = createAdminClient();

  const { data: cust } = await admin
    .from("customers")
    .select(
      "id, name, company, email, phone, created_at, key_account_sales_rep_id, tax_exempt_last_permit_number, tax_exempt_last_reviewed_at",
    )
    .eq("id", customerId)
    .maybeSingle();

  if (!cust) return null;
  const customer = cust as CustomerRow;

  const [leadsRes, ticketsRes, ordersRes] = await Promise.all([
    admin
      .from("leads")
      .select(
        "id, customer_id, source, brand, status, sales_status, sdr_id, sales_owner_id, quote_total, quote_channel, urgency, is_returning_customer, sdr_comment, sales_notes, follow_up_at, follow_up_notes, created_at",
      )
      .eq("customer_id", customerId),
    admin
      .from("job_tickets")
      .select("*")
      .eq("customer_id", customerId),
    admin
      .from("orders")
      .select(
        "id, customer_id, column_id, title, description, priority, due_date, created_by, created_at",
      )
      .eq("customer_id", customerId),
  ]);

  const leads = (leadsRes.data ?? []) as LeadRow[];
  const tickets = (ticketsRes.data ?? []) as TicketRow[];
  const orders = (ordersRes.data ?? []) as OrderRow[];

  // ── Resolve people names (profiles) ────────────────────────────────────────
  const personIds = new Set<string>();
  if (customer.key_account_sales_rep_id) personIds.add(customer.key_account_sales_rep_id);
  for (const l of leads) {
    if (l.sdr_id) personIds.add(l.sdr_id);
    if (l.sales_owner_id) personIds.add(l.sales_owner_id);
  }
  for (const o of orders) if (o.created_by) personIds.add(o.created_by);

  // ── Workflow board stage + production events ────────────────────────────────
  const orderIds = orders.map((o) => o.id);
  const columnIds = Array.from(
    new Set(orders.map((o) => o.column_id).filter(Boolean) as string[]),
  );

  const [colsRes, actsRes, notifsRes] = await Promise.all([
    columnIds.length
      ? admin.from("board_columns").select("id, name, kind").in("id", columnIds)
      : Promise.resolve({ data: [] as BoardColumnRow[] }),
    orderIds.length
      ? admin
          .from("activity_log")
          .select("id, order_id, actor, action, metadata, created_at")
          .in("order_id", orderIds)
      : Promise.resolve({ data: [] as ActivityRow[] }),
    // job_notifications is currently empty in the seed; query defensively and
    // degrade gracefully if the table/columns ever change.
    orderIds.length
      ? admin
          .from("job_notifications")
          .select(
            "id, order_id, type, channel, status, customer_response, customer_note, responded_at, created_at",
          )
          .in("order_id", orderIds)
      : Promise.resolve({ data: [] as NotificationRow[] }),
  ]);

  const cols = (colsRes.data ?? []) as BoardColumnRow[];
  const acts = (actsRes.data ?? []) as ActivityRow[];
  const notifs = (notifsRes.data ?? []) as NotificationRow[];

  const colMap = new Map(cols.map((c) => [c.id, c]));
  for (const a of acts) if (a.actor) personIds.add(a.actor);

  // Resolve profiles in one shot.
  const profMap = new Map<string, string>();
  if (personIds.size) {
    const { data: profs } = await admin
      .from("profiles")
      .select("id, full_name")
      .in("id", Array.from(personIds));
    for (const p of (profs ?? []) as Array<{ id: string; full_name: string | null }>) {
      if (p.full_name) profMap.set(p.id, p.full_name);
    }
  }
  const nameOf = (id: string | null | undefined): string | null =>
    id ? cleanName(profMap.get(id) ?? null) : null;

  // ── Lifetime totals ─────────────────────────────────────────────────────────
  let quoted = 0;
  let ordered = 0;
  let paid = 0;
  let openBalance = 0;
  let orderCount = 0;
  for (const t of tickets) {
    if (isQuoteKind(t)) quoted += ticketTotal(t);
    if (isOrderKind(t)) {
      if (!isCancelled(t)) {
        ordered += ticketTotal(t);
        orderCount += 1;
      }
      paid += num(t.payment_amount_received);
      openBalance += ticketOpenBalance(t);
    }
  }
  orderCount += orders.length; // workflow board cards

  const isReturning =
    leads.some((l) => l.is_returning_customer) || orderCount > 1;

  // ── Build timeline events ────────────────────────────────────────────────────
  const events: TimelineEvent[] = [];
  const push = (
    source: EventSource,
    at: string | null | undefined,
    title: string,
    detail: string,
    who: string | null,
  ) => {
    if (!at) return;
    events.push({ source, at, title, detail, who });
  };

  // 1) Inquiry / lead events
  for (const l of leads) {
    const via = niceChannel(l.quote_channel) || niceChannel(l.source);
    const bits: string[] = [];
    if (l.source) bits.push(`Came in via ${l.source}`);
    if (l.brand) bits.push(`Brand: ${l.brand}`);
    if (l.urgency) bits.push(`Urgency: ${l.urgency}`);
    push(
      "inquiry",
      l.created_at,
      l.is_returning_customer ? "Returning customer inquiry" : "New inquiry received",
      bits.join(" · ") || "New lead created",
      nameOf(l.sdr_id) ?? nameOf(l.sales_owner_id),
    );
    if (l.sdr_comment) {
      push("inquiry", l.created_at, "SDR note", l.sdr_comment, nameOf(l.sdr_id));
    }
    if (l.sales_notes) {
      push("inquiry", l.created_at, "Sales note", l.sales_notes, nameOf(l.sales_owner_id));
    }
    if (l.sales_status || l.status) {
      push(
        "inquiry",
        l.created_at,
        `Status: ${[l.status, l.sales_status].filter(Boolean).join(" · ")}`,
        via ? `Reached out over ${via}` : "Lead progressed",
        nameOf(l.sales_owner_id) ?? nameOf(l.sdr_id),
      );
    }
    if (l.follow_up_at) {
      push(
        "inquiry",
        l.follow_up_at,
        "Follow-up scheduled",
        l.follow_up_notes || "SDR set a follow-up reminder",
        nameOf(l.sdr_id) ?? nameOf(l.sales_owner_id),
      );
    }
  }

  // 2) Quote + 3) Order + 4) Payment + 5) Permit events (all from job_tickets)
  for (const t of tickets) {
    const code = t.reference_code || (isQuoteKind(t) ? "Quote" : "Order");
    const total = ticketTotal(t);
    const money = fmtMoney(total);
    const via = niceChannel(t.quote_channel);

    if (isQuoteKind(t)) {
      push(
        "quote",
        t.created_at,
        `Quote created — ${code}`,
        [t.title, money !== "$0.00" ? money : null, via ? `sent over ${via}` : null]
          .filter(Boolean)
          .join(" · "),
        null,
      );
      if ((t.ticket_status ?? "").toLowerCase() === "sent" && t.updated_at) {
        push("quote", t.updated_at, `Quote sent — ${code}`, `${money} quote delivered${via ? ` via ${via}` : ""}`, null);
      }
      if (t.client_confirmed) {
        push("quote", t.updated_at ?? t.created_at, `Quote approved — ${code}`, `Customer confirmed the ${money} quote`, null);
      }
      if ((t.ticket_status ?? "").toLowerCase() === "cancelled") {
        push("quote", t.cancelled_at ?? t.updated_at, `Quote cancelled — ${code}`, "This quote was cancelled", null);
      }
    }

    if (isOrderKind(t)) {
      push(
        "order",
        t.created_at,
        `Order placed — ${code}`,
        [t.title, money !== "$0.00" ? money : null, t.order_source ? `source: ${t.order_source}` : null, t.priority ? `${t.priority} priority` : null]
          .filter(Boolean)
          .join(" · "),
        null,
      );
      if (isCancelled(t)) {
        push("order", t.cancelled_at ?? t.updated_at, `Order cancelled — ${code}`, t.refund_status ? `Refund status: ${t.refund_status}` : "This order was cancelled", null);
      }
    }

    // 4) Payments
    if (num(t.deposit_amount) > 0 && t.deposit_paid_at) {
      push(
        "payment",
        t.deposit_paid_at,
        `Deposit paid — ${code}`,
        `${fmtMoney(num(t.deposit_amount))}${t.deposit_method ? ` by ${t.deposit_method}` : ""}`,
        null,
      );
    }
    if (t.balance_paid_at) {
      push("payment", t.balance_paid_at, `Balance paid — ${code}`, `Order paid in full${t.payment_method_used ? ` by ${t.payment_method_used}` : ""}`, null);
    }
    if (t.payment_paid_at && !t.deposit_paid_at && !t.balance_paid_at) {
      const rec = fmtMoney(num(t.payment_amount_received));
      push(
        "payment",
        t.payment_paid_at,
        `Payment received — ${code}`,
        [rec, t.payment_method_used ? `by ${t.payment_method_used}` : null, t.stripe_card_last4 ? `card ····${t.stripe_card_last4}` : null, t.stripe_receipt_url ? "receipt on file" : null]
          .filter(Boolean)
          .join(" · "),
        null,
      );
    }

    // 5) Permit / tax-exempt
    if (t.sales_permit_submitted_at) {
      push("permit", t.sales_permit_submitted_at, "Resale permit submitted", t.sales_permit_number ? `Permit #${t.sales_permit_number}` : "Tax-exempt permit provided", null);
    }
    if (t.sales_permit_reviewed_at) {
      push("permit", t.sales_permit_reviewed_at, "Resale permit reviewed", t.sales_permit_number ? `Permit #${t.sales_permit_number} verified` : "Permit reviewed", null);
    }
  }

  // Customer-level permit on file (if not already tied to a ticket)
  if (customer.tax_exempt_last_reviewed_at && customer.tax_exempt_last_permit_number) {
    push("permit", customer.tax_exempt_last_reviewed_at, "Tax-exempt status on file", `Permit #${customer.tax_exempt_last_permit_number} on record`, null);
  }

  // 6) Production events (workflow)
  for (const o of orders) {
    const col = o.column_id ? colMap.get(o.column_id) : undefined;
    const stage = titleCaseStage(col?.name);
    push(
      "production",
      o.created_at,
      `Job on the production board — ${o.title ?? "Order"}`,
      `Currently at stage: ${stage}${o.priority ? ` · ${o.priority} priority` : ""}${o.due_date ? ` · due ${o.due_date}` : ""}`,
      nameOf(o.created_by),
    );
  }
  for (const a of acts) {
    const owner = orders.find((o) => o.id === a.order_id);
    const label = friendlyAction(a.action);
    push(
      "production",
      a.created_at,
      `${label} — ${owner?.title ?? "job"}`,
      metaToDetail(a.metadata),
      nameOf(a.actor),
    );
  }
  for (const n of notifs) {
    const owner = orders.find((o) => o.id === n.order_id);
    push(
      "production",
      n.created_at,
      `${friendlyNotif(n.type)} — ${owner?.title ?? "job"}`,
      [n.channel ? `via ${niceChannel(n.channel)}` : null, n.status ? `status: ${n.status}` : null, n.customer_note || n.customer_response].filter(Boolean).join(" · "),
      null,
    );
    if (n.responded_at && (n.customer_response || n.customer_note)) {
      push("production", n.responded_at, `Customer replied — ${owner?.title ?? "job"}`, n.customer_note || n.customer_response || "Customer responded", null);
    }
  }

  // newest first
  events.sort((a, b) => Date.parse(b.at) - Date.parse(a.at));

  // ── Right-now snapshot ───────────────────────────────────────────────────────
  const openQuoteTickets = tickets.filter(
    (t) => isQuoteKind(t) && !isCancelled(t) && !t.client_confirmed,
  );
  const openQuotes = {
    count: openQuoteTickets.length,
    value: Math.round(openQuoteTickets.reduce((s, t) => s + ticketTotal(t), 0) * 100) / 100,
  };

  const activeOrders: CustomerDetail["rightNow"]["activeOrders"] = [];
  const awaitingApproval: string[] = [];

  for (const t of tickets) {
    if (isOrderKind(t) && !isCancelled(t) && (t.ticket_status ?? "").toLowerCase() !== "completed") {
      activeOrders.push({
        code: t.reference_code || "Order",
        title: t.title || "Order",
        stage: prettyTicketStatus(t.ticket_status),
        balance: ticketOpenBalance(t),
        source: "crm",
      });
    }
  }
  for (const o of orders) {
    const col = o.column_id ? colMap.get(o.column_id) : undefined;
    const stage = titleCaseStage(col?.name);
    const kind = (col?.kind ?? "").toLowerCase();
    if (kind !== "done" && kind !== "archive") {
      activeOrders.push({ code: o.title || "Job", title: o.title || "Job", stage, balance: 0, source: "workflow" });
    }
    if (kind === "approval" || /approv|waiting/i.test(stage)) {
      awaitingApproval.push(o.title || "Job");
    }
  }

  // Next action / follow-up
  let nextAction: { at: string; label: string } | null = null;
  const followUps: Array<{ at: string; label: string }> = [];
  for (const t of tickets) {
    if (t.follow_up_at) followUps.push({ at: t.follow_up_at, label: `Follow up on ${t.reference_code || "ticket"}` });
  }
  for (const l of leads) {
    if (l.follow_up_at) followUps.push({ at: l.follow_up_at, label: l.follow_up_notes || "Follow up on inquiry" });
  }
  if (followUps.length) {
    followUps.sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
    nextAction = followUps[0];
  }

  return {
    customer,
    repName: nameOf(customer.key_account_sales_rep_id),
    isReturning,
    totals: {
      quoted: Math.round(quoted * 100) / 100,
      ordered: Math.round(ordered * 100) / 100,
      paid: Math.round(paid * 100) / 100,
      openBalance: Math.round(openBalance * 100) / 100,
      orderCount,
    },
    taxExempt: {
      onFile:
        !!customer.tax_exempt_last_permit_number ||
        tickets.some((t) => t.tax_exempt || t.sales_permit_number),
      permit:
        customer.tax_exempt_last_permit_number ||
        tickets.find((t) => t.sales_permit_number)?.sales_permit_number ||
        null,
    },
    events,
    rightNow: {
      openQuotes,
      activeOrders,
      openBalance: Math.round(openBalance * 100) / 100,
      nextAction,
      awaitingApproval,
    },
  };
}

// ── Presentation helpers (shared with pages) ─────────────────────────────────

export function fmtMoney(n: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n || 0);
}

export function fmtDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).replace(",", " ·");
}

export function fmtRelative(iso: string, now = Date.now()): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "";
  const diff = now - t;
  const past = diff >= 0;
  const s = Math.abs(diff) / 1000;
  const label = (v: number, unit: string) =>
    `${v} ${unit}${v === 1 ? "" : "s"} ${past ? "ago" : "from now"}`;
  if (s < 60) return past ? "just now" : "soon";
  const m = Math.floor(s / 60);
  if (m < 60) return label(m, "min");
  const h = Math.floor(m / 60);
  if (h < 24) return label(h, "hr");
  const d = Math.floor(h / 24);
  if (d < 30) return label(d, "day");
  const mo = Math.floor(d / 30);
  if (mo < 12) return label(mo, "mo");
  return label(Math.floor(mo / 12), "yr");
}

function prettyTicketStatus(s: string | null): string {
  const map: Record<string, string> = {
    in_production: "In production",
    completed: "Completed",
    cancelled: "Cancelled",
    order: "Order placed",
    sent: "Quote sent",
    draft: "Draft quote",
  };
  return map[(s ?? "").toLowerCase()] ?? (s ?? "Open");
}

function friendlyAction(a: string | null): string {
  const map: Record<string, string> = {
    created: "Job created",
    moved: "Moved stage",
    uploaded: "File uploaded",
    approved: "Approved",
    texted: "Customer texted",
    emailed: "Customer emailed",
    replied: "Customer replied",
    commented: "Comment added",
  };
  return map[(a ?? "").toLowerCase()] ?? (a ? a[0].toUpperCase() + a.slice(1) : "Production update");
}

function friendlyNotif(t: string | null): string {
  const map: Record<string, string> = {
    missing_info: "Missing info requested",
    approval: "Approval requested",
    ready_to_ship: "Ready-to-ship sent",
  };
  return map[(t ?? "").toLowerCase()] ?? "Customer notification";
}

function metaToDetail(meta: Record<string, unknown> | null): string {
  if (!meta || typeof meta !== "object") return "";
  const from = (meta.from as string) || (meta.from_column as string);
  const to = (meta.to as string) || (meta.to_column as string);
  if (from && to) return `Moved from ${from} → ${to}`;
  if (meta.note) return String(meta.note);
  return "";
}

// ═════════════════════════════════════════════════════════════════════════════
// PER-PROJECT MODEL (Hayk 2026-07-11)
//
// The customer → projects → one-project-thread structure. A "project" is the
// life of a single job: the inquiry (lead) → the quote that became the order
// (job_ticket) → the board card in production (orders) → its activity. They are
// stitched by the shared customer_id and a passport number carried on the board
// card's specs (specs.passport / specs.quote_ref = the ticket reference_code).
//
// READ-ONLY. Additive. Never prints the stub_… placeholder names.
// ═════════════════════════════════════════════════════════════════════════════

export type ProjectSummary = {
  key: string; // route param — passport number, else ticket/order id
  passport: string | null;
  ref: string; // QUO-2026-0305, or "Board card"
  crmOrderNo: string | null; // ORD-2026-0305
  title: string;
  stage: string; // live board stage, else ticket status
  stageKind: string | null;
  total: number;
  paymentStatus: string | null;
  balance: number;
  channel: string | null; // how it started
  startedAt: string | null; // ISO — lead created, else ticket, else order
  owner: string | null; // real rep name
  hasProduction: boolean; // has a board card
};

export type CustomerProjects = {
  customer: CustomerRow;
  repName: string | null;
  isReturning: boolean;
  totals: CustomerDetail["totals"];
  projects: ProjectSummary[];
};

export type ProjectThread = {
  customerId: string;
  customerName: string;
  key: string;
  passport: string | null;
  ref: string;
  crmOrderNo: string | null;
  title: string;
  stage: string;
  stageKind: string | null;
  total: number;
  balance: number;
  paymentStatus: string | null;
  owner: string | null;
  events: TimelineEvent[]; // ascending (the life story of this one job)
  rightNow: { stage: string; balance: number; nextAction: string | null };
};

type Bundle = {
  customer: CustomerRow;
  leads: LeadRow[];
  tickets: TicketRow[];
  orders: OrderRow[];
  colMap: Map<string, BoardColumnRow>;
  acts: ActivityRow[];
  nameOf: (id: string | null | undefined) => string | null;
};

type Project = {
  key: string;
  passport: string | null;
  ticket?: TicketRow;
  order?: OrderRow;
  lead?: LeadRow;
};

// ── Shared fetch: one customer's whole footprint across both systems ──────────
async function fetchCustomerBundle(customerId: string): Promise<Bundle | null> {
  const admin = createAdminClient();

  const { data: cust } = await admin
    .from("customers")
    .select(
      "id, name, company, email, phone, created_at, key_account_sales_rep_id, tax_exempt_last_permit_number, tax_exempt_last_reviewed_at",
    )
    .eq("id", customerId)
    .maybeSingle();
  if (!cust) return null;
  const customer = cust as CustomerRow;

  const [leadsRes, ticketsRes, ordersRes] = await Promise.all([
    admin
      .from("leads")
      .select(
        "id, customer_id, source, brand, status, sales_status, sdr_id, sales_owner_id, quote_total, quote_channel, urgency, is_returning_customer, sdr_comment, sales_notes, follow_up_at, follow_up_notes, created_at",
      )
      .eq("customer_id", customerId),
    admin.from("job_tickets").select("*").eq("customer_id", customerId),
    admin
      .from("orders")
      .select(
        "id, customer_id, column_id, title, description, specs, priority, due_date, created_by, created_at, updated_at",
      )
      .eq("customer_id", customerId),
  ]);

  const leads = (leadsRes.data ?? []) as LeadRow[];
  const tickets = (ticketsRes.data ?? []) as TicketRow[];
  const orders = (ordersRes.data ?? []) as OrderRow[];

  const columnIds = Array.from(
    new Set(orders.map((o) => o.column_id).filter(Boolean) as string[]),
  );
  const orderIds = orders.map((o) => o.id);

  const [colsRes, actsRes] = await Promise.all([
    columnIds.length
      ? admin.from("board_columns").select("id, name, kind").in("id", columnIds)
      : Promise.resolve({ data: [] as BoardColumnRow[] }),
    orderIds.length
      ? admin
          .from("activity_log")
          .select("id, order_id, actor, action, metadata, created_at")
          .in("order_id", orderIds)
      : Promise.resolve({ data: [] as ActivityRow[] }),
  ]);

  const cols = (colsRes.data ?? []) as BoardColumnRow[];
  const acts = (actsRes.data ?? []) as ActivityRow[];
  const colMap = new Map(cols.map((c) => [c.id, c]));

  // Resolve every referenced person once, through the profiles table, guarded.
  const personIds = new Set<string>();
  if (customer.key_account_sales_rep_id)
    personIds.add(customer.key_account_sales_rep_id);
  for (const l of leads) {
    if (l.sdr_id) personIds.add(l.sdr_id);
    if (l.sales_owner_id) personIds.add(l.sales_owner_id);
  }
  for (const t of tickets) if (t.created_by_id) personIds.add(t.created_by_id);
  for (const o of orders) if (o.created_by) personIds.add(o.created_by);
  for (const a of acts) if (a.actor) personIds.add(a.actor);

  const profMap = new Map<string, string>();
  if (personIds.size) {
    const { data: profs } = await admin
      .from("profiles")
      .select("id, full_name")
      .in("id", Array.from(personIds));
    for (const p of (profs ?? []) as Array<{
      id: string;
      full_name: string | null;
    }>) {
      const nm = cleanName(p.full_name);
      if (nm) profMap.set(p.id, nm);
    }
  }
  const nameOf = (id: string | null | undefined): string | null =>
    id ? profMap.get(id) ?? null : null;

  return { customer, leads, tickets, orders, colMap, acts, nameOf };
}

// ── Group a bundle into discrete projects ────────────────────────────────────
function ticketCreatedById(t: TicketRow): string | null {
  return t.created_by_id ?? null;
}

function orderSpec<T = unknown>(o: OrderRow | undefined, key: string): T | null {
  const s = o?.specs;
  if (!s || typeof s !== "object") return null;
  const v = (s as Record<string, unknown>)[key];
  return (v ?? null) as T | null;
}

function groupProjects(b: Bundle): Project[] {
  const projects: Project[] = [];
  const usedOrders = new Set<string>();
  const singlePair = b.tickets.length === 1 && b.orders.length === 1;

  for (const t of b.tickets) {
    let order = b.orders.find(
      (o) =>
        !usedOrders.has(o.id) &&
        orderSpec<string>(o, "quote_ref") === t.reference_code,
    );
    if (!order) {
      const pp = parsePassport(t.reference_code);
      order = b.orders.find(
        (o) =>
          !usedOrders.has(o.id) &&
          pp != null &&
          String(orderSpec<string | number>(o, "passport") ?? "") === pp,
      );
    }
    if (!order && singlePair) order = b.orders[0];
    if (order) usedOrders.add(order.id);

    const lead = b.leads.find((l) => l.id === t.linked_lead_id);
    const passport =
      (order ? String(orderSpec<string | number>(order, "passport") ?? "") : "") ||
      parsePassport(t.reference_code) ||
      null;
    projects.push({
      key: passport || t.id,
      passport: passport || null,
      ticket: t,
      order,
      lead,
    });
  }

  // Board-only cards with no matching ticket become their own projects.
  for (const o of b.orders) {
    if (usedOrders.has(o.id)) continue;
    const passport = String(orderSpec<string | number>(o, "passport") ?? "") || null;
    projects.push({ key: passport || o.id, passport, order: o });
  }

  return projects;
}

function projectStage(b: Bundle, p: Project): { name: string; kind: string | null } {
  if (p.order) {
    const col = p.order.column_id ? b.colMap.get(p.order.column_id) : undefined;
    return { name: titleCaseStage(col?.name), kind: col?.kind ?? null };
  }
  return { name: prettyTicketStatus(p.ticket?.ticket_status ?? null), kind: null };
}

function projectTotals(p: Project): {
  total: number;
  balance: number;
  paymentStatus: string | null;
} {
  if (p.ticket) {
    const total = ticketTotal(p.ticket);
    const balance = ticketOpenBalance(p.ticket);
    return { total, balance, paymentStatus: p.ticket.payment_status };
  }
  const billing = orderSpec<Record<string, unknown>>(p.order, "billing");
  return {
    total: num(billing?.total),
    balance: num(billing?.balance),
    paymentStatus: (billing?.payment_status as string) ?? null,
  };
}

function projectOwner(b: Bundle, p: Project): string | null {
  return (
    b.nameOf(ticketCreatedById(p.ticket ?? ({} as TicketRow))) ??
    b.nameOf(p.order?.created_by) ??
    b.nameOf(p.lead?.sdr_id) ??
    (orderSpec<string>(p.order, "owner") ?? null) // specs.owner is a plain name, safe
  );
}

function projectChannel(p: Project): string | null {
  if (p.lead)
    return niceChannel(p.lead.source) || niceChannel(p.lead.quote_channel) || null;
  return niceChannel(p.ticket?.quote_channel) || null;
}

function toSummary(b: Bundle, p: Project): ProjectSummary {
  const stage = projectStage(b, p);
  const money = projectTotals(p);
  return {
    key: p.key,
    passport: p.passport,
    ref: p.ticket?.reference_code || "Board card",
    crmOrderNo:
      orderSpec<string>(p.order, "crm_order_number") ||
      (p.passport ? `ORD-2026-${p.passport.padStart(4, "0")}` : null),
    title:
      p.ticket?.title ||
      p.order?.title ||
      (p.passport ? `Project ${p.passport}` : "Project"),
    stage: stage.name,
    stageKind: stage.kind,
    total: money.total,
    paymentStatus: money.paymentStatus,
    balance: money.balance,
    channel: projectChannel(p),
    startedAt: p.lead?.created_at || p.ticket?.created_at || p.order?.created_at || null,
    owner: projectOwner(b, p),
    hasProduction: !!p.order,
  };
}

function nextActionFor(
  stageKind: string | null,
  stageName: string,
  balance: number,
  paymentStatus: string | null,
): string {
  const s = stageName.toLowerCase();
  if (paymentStatus === "unpaid") return "Collect deposit to release production";
  if (stageKind === "approval" || /approv|waiting|replied/.test(s))
    return "Follow up on customer approval";
  if (balance > 0) return `Collect remaining balance ${fmtMoney(balance)}`;
  if (stageKind === "done") return "Release to production";
  if (stageKind === "archive" || /archive/.test(s)) return "Delivered — no action needed";
  return "Continue production";
}

// ── Public: the projects list for a customer ─────────────────────────────────
export async function loadCustomerProjects(
  customerId: string,
): Promise<CustomerProjects | null> {
  const b = await fetchCustomerBundle(customerId);
  if (!b) return null;

  const projects = groupProjects(b)
    .map((p) => toSummary(b, p))
    .sort((a, x) => {
      const ta = a.startedAt ? Date.parse(a.startedAt) : 0;
      const tx = x.startedAt ? Date.parse(x.startedAt) : 0;
      return tx - ta;
    });

  // Lifetime totals (mirror loadCustomerDetail).
  let quoted = 0,
    ordered = 0,
    paid = 0,
    openBalance = 0,
    orderCount = 0;
  for (const t of b.tickets) {
    if (isQuoteKind(t)) quoted += ticketTotal(t);
    if (isOrderKind(t)) {
      if (!isCancelled(t)) {
        ordered += ticketTotal(t);
        orderCount += 1;
      }
      paid += num(t.payment_amount_received);
      openBalance += ticketOpenBalance(t);
    }
  }
  orderCount += b.orders.length;

  const isReturning =
    b.leads.some((l) => l.is_returning_customer) || projects.length > 1;

  return {
    customer: b.customer,
    repName: b.nameOf(b.customer.key_account_sales_rep_id),
    isReturning,
    totals: {
      quoted: Math.round(quoted * 100) / 100,
      ordered: Math.round(ordered * 100) / 100,
      paid: Math.round(paid * 100) / 100,
      openBalance: Math.round(openBalance * 100) / 100,
      orderCount,
    },
    projects,
  };
}

// ── Public: the full life thread of ONE project ──────────────────────────────
export async function loadProjectThread(
  customerId: string,
  projectRef: string,
): Promise<ProjectThread | null> {
  const b = await fetchCustomerBundle(customerId);
  if (!b) return null;

  const all = groupProjects(b);
  const p =
    all.find((x) => x.key === projectRef) ||
    all.find((x) => x.passport === projectRef) ||
    all.find((x) => x.ticket?.reference_code === projectRef) ||
    all.find((x) => x.ticket?.id === projectRef || x.order?.id === projectRef);
  if (!p) return null;

  const stage = projectStage(b, p);
  const money = projectTotals(p);
  const events: TimelineEvent[] = [];
  const push = (
    source: EventSource,
    at: string | null | undefined,
    title: string,
    detail: string,
    who: string | null,
  ) => {
    if (!at) return;
    events.push({ source, at, title, detail, who });
  };

  // 1) Inquiry — how it started
  if (p.lead) {
    const via = projectChannel(p);
    const bits: string[] = [];
    if (p.lead.source) bits.push(`Came in via ${p.lead.source}`);
    if (p.lead.urgency) bits.push(`${p.lead.urgency} urgency`);
    push(
      "inquiry",
      p.lead.created_at,
      p.lead.is_returning_customer
        ? "Returning customer reached out"
        : "New inquiry received",
      bits.join(" · ") || (via ? `Reached out over ${via}` : "New lead created"),
      b.nameOf(p.lead.sdr_id),
    );
    if (p.lead.sdr_comment)
      push("inquiry", p.lead.created_at, "Rep note", p.lead.sdr_comment, b.nameOf(p.lead.sdr_id));
  }

  // 2) Quote sent + 3) Order placed (both carried on the ticket)
  if (p.ticket) {
    const t = p.ticket;
    const code = t.reference_code || "Quote";
    const money2 = fmtMoney(ticketTotal(t));
    const via = niceChannel(t.quote_channel);
    push(
      "quote",
      t.created_at,
      `Quote sent — ${code}`,
      [t.title, money2, via ? `over ${via}` : null].filter(Boolean).join(" · "),
      b.nameOf(ticketCreatedById(t)),
    );
    const crmNo = orderSpec<string>(p.order, "crm_order_number");
    push(
      "order",
      // order placed just after the quote; if a board card exists use its creation time
      p.order?.created_at || t.created_at,
      `Order placed${crmNo ? ` — ${crmNo}` : ""}`,
      [
        "Quote approved and converted to an order",
        t.order_source ? `source: ${t.order_source}` : null,
        t.priority ? `${t.priority} priority` : null,
      ]
        .filter(Boolean)
        .join(" · "),
      b.nameOf(ticketCreatedById(t)),
    );

    // 4) Payments
    if (num(t.deposit_amount) > 0 && t.deposit_paid_at)
      push(
        "payment",
        t.deposit_paid_at,
        "Deposit paid",
        `${fmtMoney(num(t.deposit_amount))}${t.deposit_method ? ` by ${t.deposit_method}` : ""}`,
        null,
      );
    if (t.balance_paid_at)
      push(
        "payment",
        t.balance_paid_at,
        "Balance paid — paid in full",
        `${money2}${t.payment_method_used ? ` by ${t.payment_method_used}` : ""}`,
        null,
      );
    if (t.payment_paid_at && !t.deposit_paid_at && !t.balance_paid_at)
      push(
        "payment",
        t.payment_paid_at,
        "Payment received",
        `${fmtMoney(num(t.payment_amount_received))}${t.payment_method_used ? ` by ${t.payment_method_used}` : ""}`,
        null,
      );
  }

  // 5) Production events for this project's board card
  if (p.order) {
    push(
      "production",
      p.order.created_at,
      "Job opened on the production board",
      `Card created${p.order.due_date ? ` · due ${p.order.due_date}` : ""}`,
      b.nameOf(p.order.created_by),
    );
    const acts = b.acts
      .filter((a) => a.order_id === p.order!.id)
      .sort((a, x) => Date.parse(a.created_at ?? "") - Date.parse(x.created_at ?? ""));
    for (const a of acts) {
      // skip the synthetic "created" (already shown above) to avoid duplication
      if ((a.action ?? "").toLowerCase() === "created") continue;
      push(
        "production",
        a.created_at,
        friendlyAction(a.action),
        metaToDetail(a.metadata),
        b.nameOf(a.actor),
      );
    }
  }

  // ascending — read it as the job's life story
  events.sort((a, x) => Date.parse(a.at) - Date.parse(x.at));

  return {
    customerId,
    customerName: b.customer.name?.trim() || "(unnamed customer)",
    key: p.key,
    passport: p.passport,
    ref: p.ticket?.reference_code || "Board card",
    crmOrderNo: orderSpec<string>(p.order, "crm_order_number"),
    title: p.ticket?.title || p.order?.title || `Project ${p.passport ?? ""}`.trim(),
    stage: stage.name,
    stageKind: stage.kind,
    total: money.total,
    balance: money.balance,
    paymentStatus: money.paymentStatus,
    owner: projectOwner(b, p),
    events,
    rightNow: {
      stage: stage.name,
      balance: money.balance,
      nextAction: nextActionFor(stage.kind, stage.name, money.balance, money.paymentStatus),
    },
  };
}
