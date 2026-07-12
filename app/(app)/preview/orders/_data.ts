import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type {
  Order,
  OrderLineItem,
  OrderStatus,
  PaymentStatus,
  Priority,
  PaymentEntry,
  TimelineEntry,
  BoardStage,
  QuoteRecord,
} from "./_shared";

// ─────────────────────────────────────────────────────────────────────────────
// Orders preview — REAL server-side data layer. Hayk 2026-07-12.
//
// Reads the SHARED local Postgres (same DB the workflow board + command-center
// read) and returns the connected orders in the exact `Order` shape the existing
// Orders UI already renders. READ-ONLY. SELECTs only. Additive. No writes.
//
// A "connected" order = a workflow board card (orders) whose specs.quote_ref
// matches a CRM quote/order ticket (job_tickets.reference_code). The current
// clean seed has 8 such pairs (passports 301–308). Anything without a linked
// ticket is skipped — we never fabricate.
// ─────────────────────────────────────────────────────────────────────────────

function num(v: unknown): number {
  if (v === null || v === undefined) return 0;
  const n = typeof v === "number" ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : 0;
}

/** Never surface the `stub_<uuid>@local.invalid` placeholder profile names. */
function cleanName(n: string | null | undefined): string | null {
  if (!n) return null;
  if (/^stub_[0-9a-f-]+@local\.invalid$/i.test(n.trim())) return null;
  return n.trim() || null;
}

function initials(name: string | null | undefined): string {
  if (!name) return "—";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// Deterministic avatar tint from a name (stable across renders).
const AVATAR_COLORS = ["#22c55e", "#f97316", "#3b82f6", "#a78bfa", "#e11d48", "#0ea5e9"];
function colorFor(name: string | null | undefined): string {
  if (!name) return "#94a3b8";
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

function fmtMMDD(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${mm}/${dd}/${d.getFullYear()}`;
}

function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d
    .toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    })
    .replace(",", " ·");
}

function fmtRelative(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return "";
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "";
  const diff = now - t;
  const past = diff >= 0;
  const s = Math.abs(diff) / 1000;
  const label = (v: number, unit: string) => `${v} ${unit}${v === 1 ? "" : "s"} ${past ? "ago" : "from now"}`;
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

// ── Row shapes (only the columns we read) ────────────────────────────────────

type CustomerRow = {
  id: string;
  name: string | null;
  company: string | null;
  email: string | null;
  phone: string | null;
};

type LeadRow = {
  id: string;
  customer_id: string | null;
  source: string | null;
  quote_channel: string | null;
  is_returning_customer: boolean | null;
  created_at: string | null;
};

type TicketRow = {
  id: string;
  reference_code: string | null;
  customer_id: string | null;
  linked_lead_id: string | null;
  title: string | null;
  quote_final_total: number | null;
  total: number | null;
  payment_status: string | null;
  payment_type: string | null;
  payment_method_used: string | null;
  payment_amount_received: number | null;
  payment_paid_at: string | null;
  deposit_amount: number | null;
  deposit_paid_at: string | null;
  deposit_method: string | null;
  balance_paid_at: string | null;
  ticket_kind: string | null;
  ticket_status: string | null;
  order_source: string | null;
  tax_exempt: boolean | null;
  priority: string | null;
  due_date: string | null;
  created_by_id: string | null;
  created_at: string | null;
  product_lines: unknown;
};

type OrderRow = {
  id: string;
  tenant_id: string | null;
  customer_id: string | null;
  column_id: string | null;
  title: string | null;
  description: string | null;
  specs: Record<string, unknown> | null;
  priority: string | null;
  due_date: string | null;
  created_by: string | null;
  created_at: string | null;
};

type ColumnRow = { id: string; tenant_id: string; name: string | null; kind: string | null; position: number | null };
type ActivityRow = { id: string; order_id: string | null; actor: string | null; action: string | null; metadata: Record<string, unknown> | null; created_at: string | null };
type AssetRow = { id: string; order_id: string | null; file_name: string | null; mime_type: string | null; size: number | null };

// ── Classifiers / helpers ────────────────────────────────────────────────────

function ticketTotal(t: TicketRow): number {
  const fin = num(t.quote_final_total);
  return fin > 0 ? fin : num(t.total);
}

function spec<T = unknown>(o: OrderRow, key: string): T | null {
  const s = o.specs;
  if (!s || typeof s !== "object") return null;
  return ((s as Record<string, unknown>)[key] ?? null) as T | null;
}

function mapPriority(p: string | null | undefined): Priority {
  switch ((p ?? "").toLowerCase()) {
    case "high": return "High";
    case "rush": return "Rush";
    case "low": return "Low";
    default: return "Normal";
  }
}

function mapPayment(t: TicketRow): PaymentStatus {
  if (t.tax_exempt) return "Tax Exempt";
  switch ((t.payment_status ?? "").toLowerCase()) {
    case "paid": return "Paid";
    case "partial": return "Partial";
    case "unpaid": return "Unpaid";
    default: return "Unpaid";
  }
}

// Map a live board column to the coarse status bucket the tabs / kanban / colors
// already use. The REAL stage name is carried separately (order.stageName).
function stageBucket(name: string | null | undefined, kind: string | null | undefined): OrderStatus {
  const k = (kind ?? "").toLowerCase();
  const n = (name ?? "").toLowerCase();
  if (k === "archive" || n === "archive") return "Delivered";
  if (k === "done" || n.includes("ready for prod")) return "Ready to Ship";
  return "In Production";
}

const LINE_SPEC_LABELS: Record<string, string> = {
  print: "Print",
  style: "Style",
  finish: "Finish",
  blank: "Blank",
  interior: "Interior",
  stock: "Stock",
  string: "String",
  material: "Material",
};

function mapLine(raw: unknown, i: number): OrderLineItem {
  const pl = (raw ?? {}) as Record<string, unknown>;
  const unitStr = String(pl.unit ?? "").replace(/[$,]/g, "");
  const specs: { label: string; value: string }[] = [];
  for (const [key, val] of Object.entries(pl)) {
    if (["qty", "unit", "product", "material", "lineTotal"].includes(key)) continue;
    if (val === null || val === undefined) continue;
    const label = LINE_SPEC_LABELS[key] ?? key.charAt(0).toUpperCase() + key.slice(1);
    const value = typeof val === "boolean" ? (val ? "Yes" : "No") : String(val);
    specs.push({ label, value });
  }
  return {
    id: `l${i + 1}`,
    productName: String(pl.product ?? "Item"),
    materialName: pl.material != null ? String(pl.material) : undefined,
    quantity: num(pl.qty),
    unitPrice: num(unitStr),
    extended: num(pl.lineTotal),
    specs: specs.length ? specs : undefined,
  };
}

function actionMeta(action: string | null): { icon: string; tint: string; title: string } {
  switch ((action ?? "").toLowerCase()) {
    case "created": return { icon: "📦", tint: "#8b5cf6", title: "Order created" };
    case "uploaded": return { icon: "📎", tint: "#3b82f6", title: "File uploaded" };
    case "emailed": return { icon: "✉", tint: "#22c55e", title: "Customer emailed" };
    case "texted": return { icon: "💬", tint: "#22c55e", title: "Customer texted" };
    case "replied": return { icon: "✓", tint: "#16a34a", title: "Customer replied" };
    case "approved": return { icon: "✓", tint: "#16a34a", title: "Proof approved" };
    case "moved": return { icon: "🎯", tint: "#06b6d4", title: "Moved stage" };
    default: return { icon: "•", tint: "#64748b", title: action ? action[0].toUpperCase() + action.slice(1) : "Update" };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC: load the live production board stages (position order), for the
// Workflow Progress rail. Uses the tenant of the connected orders.
// ─────────────────────────────────────────────────────────────────────────────
export async function loadBoardStages(): Promise<BoardStage[]> {
  const admin = createAdminClient();
  const tenant = await connectedTenantId(admin);
  if (!tenant) return [];
  const { data } = await admin
    .from("board_columns")
    .select("id, tenant_id, name, kind, position")
    .eq("tenant_id", tenant)
    .order("position", { ascending: true });
  return ((data ?? []) as ColumnRow[]).map((c) => ({ name: c.name ?? "—", kind: c.kind ?? null }));
}

// Find the tenant that owns the connected (ticket-linked) orders.
async function connectedTenantId(admin: ReturnType<typeof createAdminClient>): Promise<string | null> {
  const { data } = await admin
    .from("orders")
    .select("tenant_id, specs")
    .not("specs->>quote_ref", "is", null)
    .limit(1);
  const row = (data ?? [])[0] as { tenant_id: string | null } | undefined;
  return row?.tenant_id ?? null;
}

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC: the connected orders, mapped to the existing `Order` UI shape.
// ─────────────────────────────────────────────────────────────────────────────
export async function loadOrders(): Promise<Order[]> {
  const admin = createAdminClient();

  const [ordersRes, ticketsRes] = await Promise.all([
    admin
      .from("orders")
      .select("id, tenant_id, customer_id, column_id, title, description, specs, priority, due_date, created_by, created_at"),
    admin
      .from("job_tickets")
      .select(
        "id, reference_code, customer_id, linked_lead_id, title, quote_final_total, total, payment_status, payment_type, payment_method_used, payment_amount_received, payment_paid_at, deposit_amount, deposit_paid_at, deposit_method, balance_paid_at, ticket_kind, ticket_status, order_source, tax_exempt, priority, due_date, created_by_id, created_at, product_lines",
      ),
  ]);

  const allOrders = (ordersRes.data ?? []) as OrderRow[];
  const allTickets = (ticketsRes.data ?? []) as TicketRow[];

  const ticketByRef = new Map<string, TicketRow>();
  for (const t of allTickets) if (t.reference_code) ticketByRef.set(t.reference_code, t);

  // Keep only orders that link to a CRM ticket (the connected set).
  type Pair = { order: OrderRow; ticket: TicketRow };
  const pairs: Pair[] = [];
  for (const o of allOrders) {
    const ref = spec<string>(o, "quote_ref");
    if (!ref) continue;
    const ticket = ticketByRef.get(ref);
    if (!ticket) continue;
    pairs.push({ order: o, ticket });
  }
  if (pairs.length === 0) return [];

  // Newest first, by the board card's creation time (real).
  pairs.sort((a, b) => Date.parse(b.order.created_at ?? "") - Date.parse(a.order.created_at ?? ""));

  // ── Lifetime rollups per customer (across ALL their tickets) ────────────────
  const lifetime = new Map<string, { orders: number; value: number }>();
  for (const t of allTickets) {
    if (!t.customer_id) continue;
    const kind = (t.ticket_kind ?? "").toLowerCase();
    const rec = lifetime.get(t.customer_id) ?? { orders: 0, value: 0 };
    // Every quote-to-order ticket counts once toward lifetime spend.
    rec.value += ticketTotal(t);
    if (kind === "order" || kind === "quote") rec.orders += 1;
    lifetime.set(t.customer_id, rec);
  }

  // ── Reference data ──────────────────────────────────────────────────────────
  const customerIds = Array.from(new Set(pairs.map((p) => p.order.customer_id).filter(Boolean) as string[]));
  const orderIds = pairs.map((p) => p.order.id);
  const columnIds = Array.from(new Set(pairs.map((p) => p.order.column_id).filter(Boolean) as string[]));
  const tenantIds = Array.from(new Set(pairs.map((p) => p.order.tenant_id).filter(Boolean) as string[]));
  const personIds = new Set<string>();
  for (const p of pairs) {
    if (p.order.created_by) personIds.add(p.order.created_by);
    if (p.ticket.created_by_id) personIds.add(p.ticket.created_by_id);
  }

  const [custRes, leadsRes, colsRes, actsRes, assetsRes] = await Promise.all([
    customerIds.length
      ? admin.from("customers").select("id, name, company, email, phone").in("id", customerIds)
      : Promise.resolve({ data: [] as CustomerRow[] }),
    customerIds.length
      ? admin.from("leads").select("id, customer_id, source, quote_channel, is_returning_customer, created_at").in("customer_id", customerIds)
      : Promise.resolve({ data: [] as LeadRow[] }),
    tenantIds.length
      ? admin.from("board_columns").select("id, tenant_id, name, kind, position").in("tenant_id", tenantIds).order("position", { ascending: true })
      : Promise.resolve({ data: [] as ColumnRow[] }),
    orderIds.length
      ? admin.from("activity_log").select("id, order_id, actor, action, metadata, created_at").in("order_id", orderIds).order("created_at", { ascending: true })
      : Promise.resolve({ data: [] as ActivityRow[] }),
    orderIds.length
      ? admin.from("assets").select("id, order_id, file_name, mime_type, size").in("order_id", orderIds)
      : Promise.resolve({ data: [] as AssetRow[] }),
  ]);

  const custMap = new Map<string, CustomerRow>();
  for (const c of (custRes.data ?? []) as CustomerRow[]) custMap.set(c.id, c);

  const leadByCustomer = new Map<string, LeadRow>();
  for (const l of (leadsRes.data ?? []) as LeadRow[]) {
    if (l.customer_id && !leadByCustomer.has(l.customer_id)) leadByCustomer.set(l.customer_id, l);
  }

  const cols = (colsRes.data ?? []) as ColumnRow[];
  const colById = new Map<string, ColumnRow>();
  for (const c of cols) colById.set(c.id, c);
  // Ordered stage list (per tenant — the seed is a single tenant).
  const orderedStages = cols
    .slice()
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
    .map((c) => ({ id: c.id, name: c.name ?? "—", kind: c.kind ?? null }));

  const actsByOrder = new Map<string, ActivityRow[]>();
  for (const a of (actsRes.data ?? []) as ActivityRow[]) {
    if (!a.order_id) continue;
    const arr = actsByOrder.get(a.order_id) ?? [];
    arr.push(a);
    actsByOrder.set(a.order_id, arr);
    if (a.actor) personIds.add(a.actor);
  }

  const assetsByOrder = new Map<string, AssetRow[]>();
  for (const a of (assetsRes.data ?? []) as AssetRow[]) {
    if (!a.order_id) continue;
    const arr = assetsByOrder.get(a.order_id) ?? [];
    arr.push(a);
    assetsByOrder.set(a.order_id, arr);
  }

  // Resolve people → real names (guarded against stubs).
  const profMap = new Map<string, string>();
  if (personIds.size) {
    const { data: profs } = await admin.from("profiles").select("id, full_name").in("id", Array.from(personIds));
    for (const p of (profs ?? []) as Array<{ id: string; full_name: string | null }>) {
      const nm = cleanName(p.full_name);
      if (nm) profMap.set(p.id, nm);
    }
  }
  const nameOf = (id: string | null | undefined): string | null => (id ? profMap.get(id) ?? null : null);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // ── Build the Order objects ─────────────────────────────────────────────────
  const orders: Order[] = pairs.map(({ order: o, ticket: t }) => {
    const customer = o.customer_id ? custMap.get(o.customer_id) : undefined;
    const lead = o.customer_id ? leadByCustomer.get(o.customer_id) : undefined;
    const col = o.column_id ? colById.get(o.column_id) : undefined;
    const stageName = col?.name ?? "—";
    const stageKind = col?.kind ?? null;
    const stageIndex = orderedStages.findIndex((s) => s.id === o.column_id);

    const passport = String(spec<string | number>(o, "passport") ?? "") || (t.reference_code ?? "").replace(/\D+/g, "").slice(-3);
    const crmOrderNo = spec<string>(o, "crm_order_number") ?? (passport ? `ORD-2026-${passport.padStart(4, "0")}` : undefined);

    const rep = nameOf(o.created_by) ?? nameOf(t.created_by_id) ?? (spec<string>(o, "owner") ?? null);
    const total = ticketTotal(t);
    const received = num(t.payment_amount_received);
    const balanceDue = Math.max(0, Math.round((total - received) * 100) / 100);

    const bucket = stageBucket(stageName, stageKind);
    const isFinished = stageKind === "archive" || stageName.toLowerCase() === "archive";
    const dueOverdue = !!(t.due_date && new Date(t.due_date) < today && !isFinished);

    // Line items from the ticket's product_lines jsonb.
    const rawLines = Array.isArray(t.product_lines) ? (t.product_lines as unknown[]) : [];
    const lineItems: OrderLineItem[] = rawLines.map(mapLine);

    // Payment ledger — real, derived from the ticket's deposit/balance fields.
    const payments: PaymentEntry[] = [];
    const method = (t.payment_method_used || t.deposit_method || "Other") as PaymentEntry["method"];
    const dep = num(t.deposit_amount);
    if (dep > 0 && t.deposit_paid_at) {
      payments.push({ method, amount: dep, date: fmtMMDD(t.deposit_paid_at), ref: "Deposit", status: "Completed" });
    }
    if (t.balance_paid_at && received > dep) {
      payments.push({ method, amount: Math.round((received - dep) * 100) / 100, date: fmtMMDD(t.balance_paid_at), ref: "Balance", status: "Completed" });
    }
    if (!dep && !t.balance_paid_at && t.payment_paid_at && received > 0) {
      payments.push({ method, amount: received, date: fmtMMDD(t.payment_paid_at), ref: "Payment", status: "Completed" });
    }

    // Timeline — real activity_log events (ascending).
    const acts = actsByOrder.get(o.id) ?? [];
    const timeline: TimelineEntry[] = acts.map((a) => {
      const meta = actionMeta(a.action);
      const md = (a.metadata ?? {}) as Record<string, unknown>;
      let sub = "";
      if ((a.action ?? "").toLowerCase() === "moved" && md.from && md.to) {
        sub = `${md.from} → ${md.to}`;
      } else if (md.note) {
        sub = String(md.note);
      }
      const who = nameOf(a.actor);
      if (who) sub = sub ? `${sub} · ${who}` : who;
      return { icon: meta.icon, tint: meta.tint, title: meta.title, sub: sub || undefined, at: fmtDateTime(a.created_at), actor: who ?? undefined };
    });
    const lastActivityAt = acts.length ? fmtDateTime(acts[acts.length - 1].created_at) : fmtDateTime(o.created_at);

    // Real files (currently none seeded → honest empty).
    const assets = assetsByOrder.get(o.id) ?? [];
    const attachments = assets.map((a) => a.file_name ?? "file");

    const life = o.customer_id ? lifetime.get(o.customer_id) : undefined;
    const returning = !!lead?.is_returning_customer;

    const quote: QuoteRecord = {
      ref: t.reference_code ?? "Quote",
      date: fmtDateTime(t.created_at),
      total,
      status: (t.ticket_status ?? "").toLowerCase() === "" ? mapPayment(t) : (t.ticket_status ?? mapPayment(t)),
    };

    const ord: Order = {
      refId: passport || o.id.slice(-3),
      quoteRefId: t.reference_code ?? "—",
      contact: customer?.name?.trim() || "(unnamed customer)",
      company: customer?.company ?? "",
      createdBy: rep ?? "—",
      ownerAvatar: initials(rep),
      ownerColor: colorFor(rep),
      title: t.title || o.title || "Order",
      lineItems,
      total,
      received,
      balanceDue,
      priority: mapPriority(t.priority ?? o.priority),
      dueDate: fmtMMDD(t.due_date ?? o.due_date),
      dueOverdue,
      status: bucket,
      payment: mapPayment(t),
      createdAgo: fmtRelative(o.created_at),
      createdDate: fmtMMDD(o.created_at),
      attachmentsCount: attachments.length,
      attachments,
      files: [],
      customer: {
        phone: customer?.phone ?? "",
        email: customer?.email ?? "",
        lifetimeOrders: life?.orders ?? 0,
        lifetimeValue: Math.round((life?.value ?? 0) * 100) / 100,
        returning,
      },
      communications: [], // No inbound comms data yet — honest empty state in the UI.
      payments,
      timeline,
      // Real-data extensions
      stageName,
      stageKind,
      stageIndex: stageIndex >= 0 ? stageIndex : undefined,
      crmOrderNo,
      quote,
      quoteHistory: [quote],
      lastActivityAt,
    };
    return ord;
  });

  // `pairs` was already sorted newest-first; `orders` preserves that order.
  return orders;
}
