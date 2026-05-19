import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireSession } from "@/lib/auth/require-session";
import { sendQuoteToCustomer } from "@/lib/integrations/send-quote";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/** Atomically increment the year counter and return the next sequence number. */
async function nextOrderNumber(admin: ReturnType<typeof createAdminClient>, year: number): Promise<number> {
  // Upsert: insert year=year,last_number=1 if missing; otherwise increment
  const { data, error } = await admin.rpc("increment_order_sequence", { p_year: year });
  if (error) throw new Error(error.message);
  return data as number;
}

// ─── GET /api/tickets ─────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  const { userId, roleName, errorResponse } = await requireSession();
  if (errorResponse) return errorResponse;

  const { searchParams } = request.nextUrl;
  const kind = searchParams.get("kind") ?? ""; // 'quote' | 'order' | ''
  const linkedLeadId = searchParams.get("linked_lead_id") ?? "";
  const customerId = searchParams.get("customer_id") ?? "";
  const search = searchParams.get("search")?.trim().toLowerCase() ?? "";
  const period = searchParams.get("period") ?? ""; // e.g. '30d'

  const admin = createAdminClient();

  let query = admin
    .from("job_tickets")
    .select(
      `*,
       customer:customers(id, first_name, last_name, company, phone, email),
       lead:leads(id, status, sales_status, urgency)`
    )
    .order("created_at", { ascending: false });

  // Scoping:
  // - admin: sees all tickets
  // - sales: sees own tickets + all 'routed' tickets (SDR high-value hand-offs)
  // - everyone else (SDR, etc.): sees own tickets + any they routed to Sales
  //   (routed_by_id = userId covers tickets after Sales claims them, changing created_by_id)
  if (roleName === "admin") {
    // no filter
  } else if (roleName === "sales" && userId) {
    query = query.or(`created_by_id.eq.${userId},ticket_status.eq.routed`);
  } else if (userId) {
    query = query.or(`created_by_id.eq.${userId},routed_by_id.eq.${userId}`);
  }

  if (kind) query = query.eq("ticket_kind", kind);
  if (linkedLeadId) query = query.eq("linked_lead_id", linkedLeadId);
  if (customerId) query = query.eq("customer_id", customerId);

  if (period) {
    const days = parseInt(period.replace("d", "")) || 30;
    const since = new Date(Date.now() - days * 86400_000).toISOString();
    query = query.gte("created_at", since);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message, code: "DB_ERROR" }, { status: 500 });
  }

  let tickets = data ?? [];

  // Enrich routed tickets with the SDR's display name so the UI can show "Routed by <name>"
  const routedTickets = tickets.filter((t) => t.ticket_status === "routed");
  if (routedTickets.length > 0) {
    const creatorIds = [...new Set(routedTickets.map((t) => t.created_by_id).filter(Boolean))];
    const { data: profiles } = await admin
      .from("user_profiles")
      .select("id, full_name")
      .in("id", creatorIds);
    const nameMap = Object.fromEntries((profiles ?? []).map((p) => [p.id, p.full_name ?? "SDR"]));
    tickets = tickets.map((t) =>
      t.ticket_status === "routed"
        ? { ...t, created_by_name: nameMap[t.created_by_id] ?? "SDR" }
        : t
    );
  }

  if (search) {
    tickets = tickets.filter((t) => {
      const name = `${t.customer?.first_name ?? ""} ${t.customer?.last_name ?? ""}`.toLowerCase();
      const company = (t.customer?.company ?? "").toLowerCase();
      const ref = (t.reference_code ?? "").toLowerCase();
      const title = (t.title ?? "").toLowerCase();
      return name.includes(search) || company.includes(search) || ref.includes(search) || title.includes(search);
    });
  }

  return NextResponse.json({ tickets });
}

// ─── POST /api/tickets ────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  const { userId, roleName, errorResponse } = await requireSession();
  if (errorResponse) return errorResponse;

  const body = await request.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: "Invalid JSON body.", code: "VALIDATION_ERROR" }, { status: 400 });
  }

  const {
    ticket_kind,
    ticket_status = "draft",
    title,
    customer_id,
    linked_lead_id,
    contact_name,
    contact_email,
    contact_company,
    contact_phone,
    quote_skus = [],
    notes,
    order_source,
    priority,
    due_date,
    rush = false,
    design_required = false,
    die_cut = false,
    special_requirements,
    quote_channel,
    quote_destination,
    quote_subtotal,
    quote_shipping = 0,
    discount_type,
    discount_value,
    discount_reason,
    quote_pre_tax_total,
    quote_tax_rate_percent,
    quote_tax_amount,
    quote_final_total,
    tax_exempt = false,
    sales_permit_number,
    quote_payment_types = [],
    prepayment_type,
    prepayment_value,
    quote_reminder_date,
    follow_up_cycles,
    follow_up_frequency,
  } = body;

  if (!ticket_kind || !["quote", "order"].includes(ticket_kind)) {
    return NextResponse.json(
      { error: "ticket_kind must be 'quote' or 'order'.", code: "VALIDATION_ERROR" },
      { status: 400 }
    );
  }

  if (!title?.trim()) {
    return NextResponse.json({ error: "title is required.", code: "VALIDATION_ERROR" }, { status: 400 });
  }

  const admin = createAdminClient();
  const now = new Date().toISOString();

  // ── Upsert customer so they appear in CRM ──────────────────────────────────
  // Only when contact info is provided and no existing customer_id is given.
  let resolvedCustomerId: string | null = customer_id ?? null;

  if (!resolvedCustomerId && (contact_email || contact_phone)) {
    const { digitsOnly } = await import("@/lib/utils/phone").catch(() => ({ digitsOnly: (s: string) => s }));
    const phoneDigits = contact_phone ? digitsOnly(contact_phone) : null;

    // Look for existing customer by email or phone
    let existing = null;
    if (contact_email) {
      const { data } = await admin.from("customers").select("id").ilike("email", contact_email).maybeSingle();
      existing = data;
    }
    if (!existing && phoneDigits) {
      const { data } = await admin.from("customers").select("id").eq("phone", phoneDigits).maybeSingle();
      existing = data;
    }

    if (existing) {
      resolvedCustomerId = existing.id;
    } else {
      // Create new customer
      const nameParts = (contact_name ?? "").split(" ");
      const { data: newCustomer } = await admin.from("customers").insert({
        first_name: nameParts[0] ?? null,
        last_name: nameParts.slice(1).join(" ") || null,
        email: contact_email ?? null,
        phone: phoneDigits ?? null,
        company: contact_company ?? null,
        created_at: now,
        updated_at: now,
      }).select("id").single();
      if (newCustomer) resolvedCustomerId = newCustomer.id;
    }
  }

  // Generate reference_code for orders
  let reference_code: string | null = null;
  if (ticket_kind === "order") {
    const year = new Date().getFullYear();
    try {
      const seq = await nextOrderNumber(admin, year);
      reference_code = `ORD-${year}-${String(seq).padStart(3, "0")}`;
    } catch {
      return NextResponse.json({ error: "Failed to generate order reference.", code: "SEQUENCE_ERROR" }, { status: 500 });
    }
  }

  const insertPayload = {
    ticket_kind,
    ticket_status,
    title: title.trim(),
    reference_code,
    customer_id: resolvedCustomerId,
    linked_lead_id: linked_lead_id ?? null,
    // When an SDR's quote is auto-routed to Sales, preserve their identity so
    // they can still view the ticket in read-only mode after Sales claims it.
    routed_by_id: ticket_status === "routed" ? userId : null,
    created_by_id: userId,
    contact_name: contact_name ?? null,
    contact_email: contact_email ?? null,
    contact_company: contact_company ?? null,
    contact_phone: contact_phone ?? null,
    quote_skus,
    notes: notes ?? null,
    order_source: order_source ?? null,
    priority: priority ?? null,
    due_date: due_date ?? null,
    rush,
    design_required,
    die_cut,
    special_requirements: special_requirements ?? null,
    quote_channel: quote_channel ?? null,
    quote_destination: quote_destination ?? null,
    quote_subtotal: quote_subtotal ?? null,
    quote_shipping: quote_shipping ?? 0,
    discount_type: discount_type ?? null,
    discount_value: discount_value ?? null,
    discount_reason: discount_reason ?? null,
    quote_pre_tax_total: quote_pre_tax_total ?? null,
    quote_tax_rate_percent: quote_tax_rate_percent ?? null,
    quote_tax_amount: quote_tax_amount ?? null,
    quote_final_total: quote_final_total ?? null,
    tax_exempt,
    sales_permit_number: sales_permit_number ?? null,
    quote_payment_types,
    prepayment_type: prepayment_type ?? null,
    prepayment_value: prepayment_value ?? null,
    quote_reminder_date: quote_reminder_date ?? null,
    follow_up_cycles: follow_up_cycles ?? null,
    follow_up_frequency: follow_up_frequency ?? null,
    created_at: now,
    updated_at: now,
  };

  const { data: ticket, error: insertErr } = await admin
    .from("job_tickets")
    .insert(insertPayload)
    .select()
    .single();

  if (insertErr) {
    return NextResponse.json({ error: insertErr.message, code: "DB_ERROR" }, { status: 500 });
  }

  // Log activity
  await admin.from("activities").insert({
    type: "order_ticket_created",
    lead_id: linked_lead_id ?? null,
    customer_id: resolvedCustomerId,
    ticket_id: ticket.id,
    by_user_id: userId,
    payload: { ticket_kind, title: ticket.title, reference_code },
    created_at: now,
  });

  // TODO-002: update linked lead status when ticket is created
  if (linked_lead_id) {
    const hasSkus = Array.isArray(quote_skus) && quote_skus.length > 0;
    const newLeadStatus = hasSkus ? "Quoted" : "Validated";
    const newSalesStatus = hasSkus ? "Quote Sent" : null;

    await admin
      .from("leads")
      .update({
        status: newLeadStatus,
        ...(newSalesStatus ? { sales_status: newSalesStatus } : {}),
        updated_at: now,
      })
      .eq("id", linked_lead_id);

    await admin.from("activities").insert({
      type: "lead_status_changed",
      lead_id: linked_lead_id,
      customer_id: resolvedCustomerId,
      ticket_id: ticket.id,
      by_user_id: userId,
      payload: { to: newLeadStatus, reason: "ticket_created" },
      created_at: now,
    });
  }

  // Fire quote delivery if the ticket was created directly in "sent" status
  if (ticket_status === "sent") {
    const { data: fullTicket } = await admin
      .from("job_tickets")
      .select("*, customer:customers(first_name, last_name, email, phone)")
      .eq("id", ticket.id)
      .single();
    const { data: companyRow } = await admin
      .from("company_settings")
      .select("*")
      .eq("id", 1)
      .single();
    if (fullTicket && companyRow) {
      sendQuoteToCustomer(fullTicket, companyRow).then((result) => {
        if (!result.ok) {
          console.error("[send-quote] POST delivery failed:", result.error, { ticketId: ticket.id });
        }
      });
    }
  }

  return NextResponse.json({ ticket }, { status: 201 });
}
