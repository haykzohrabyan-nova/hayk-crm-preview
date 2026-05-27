import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireSession } from "@/lib/auth/require-session";
import { sendQuoteToCustomer } from "@/lib/integrations/send-quote";
import { initializeTicketFollowUpSchedule } from "@/lib/utils/initialize-ticket-follow-up";
import { maybeAutoRecordCashPayment } from "@/lib/utils/maybe-auto-record-cash-payment";
import { maybeAutoReleaseProduction, AUTO_RELEASE_SELECT } from "@/lib/utils/maybe-auto-release-production";
import {
  QUOTE_LIST_STATUSES,
  TICKET_QUOTE_LIST_SELECT,
} from "@/lib/utils/ticket-list-select";
import {
  formatOrderReference,
  formatQuoteReference,
  nextOrderNumber,
  nextQuoteNumber,
} from "@/lib/utils/reference-codes";
import { normalizeWebsite, validateWebsite } from "@/lib/utils/website";


// ─── Helpers ──────────────────────────────────────────────────────────────────

function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
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

  const isQuoteList =
    kind === "quote" && !linkedLeadId && !customerId && !period;

  type ScopeFn = <T extends { or: (filter: string) => T }>(q: T) => T;
  const applyScope: ScopeFn = (q) => {
    if (roleName === "admin") return q;
    if (roleName === "sales" && userId) {
      return q.or(`created_by_id.eq.${userId},ticket_status.eq.routed`);
    }
    if (userId) {
      return q.or(`created_by_id.eq.${userId},routed_by_id.eq.${userId}`);
    }
    return q;
  };

  let data: Record<string, unknown>[] | null = null;
  let error: { message: string } | null = null;

  if (isQuoteList) {
    const result = await applyScope(
      admin
        .from("job_tickets")
        .select(TICKET_QUOTE_LIST_SELECT)
        .eq("ticket_kind", "quote")
        .in("ticket_status", [...QUOTE_LIST_STATUSES])
        .order("created_at", { ascending: false }),
    );
    data = (result.data as Record<string, unknown>[] | null) ?? null;
    error = result.error;
  } else {
    let q = admin
      .from("job_tickets")
      .select(
        `*,
         customer:customers(id, first_name, last_name, company, phone, email),
         lead:leads(id, status, sales_status, urgency, source)`,
      )
      .order("created_at", { ascending: false });

    if (kind) q = q.eq("ticket_kind", kind);
    if (linkedLeadId) q = q.eq("linked_lead_id", linkedLeadId);
    if (customerId) q = q.eq("customer_id", customerId);
    if (period) {
      const days = parseInt(period.replace("d", "")) || 30;
      const since = new Date(Date.now() - days * 86400_000).toISOString();
      q = q.gte("created_at", since);
    }

    const result = await applyScope(q);
    data = (result.data as Record<string, unknown>[] | null) ?? null;
    error = result.error;
  }

  if (error) {
    return NextResponse.json({ error: error.message, code: "DB_ERROR" }, { status: 500 });
  }

  let tickets = (data ?? []) as Array<Record<string, unknown> & { ticket_status?: string; created_by_id?: string | null; customer?: { first_name?: string | null; last_name?: string | null; company?: string | null } | { first_name?: string | null; last_name?: string | null; company?: string | null }[] | null }>;

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
      t.ticket_status === "routed" && t.created_by_id
        ? { ...t, created_by_name: nameMap[t.created_by_id] ?? "SDR" }
        : t
    );
  }

  if (search) {
    tickets = tickets.filter((t) => {
      const raw = t.customer;
      const customer = Array.isArray(raw) ? raw[0] : raw;
      const name = `${customer?.first_name ?? ""} ${customer?.last_name ?? ""}`.toLowerCase();
      const company = (customer?.company ?? "").toLowerCase();
      const ref = String(t.reference_code ?? "").toLowerCase();
      const title = String(t.title ?? "").toLowerCase();
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
    industry,
    website,
    source,
    authority,
    from_quote_page = false,
    quote_source,
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
    // Per-ticket payment config (migration 066)
    ticket_payment_strategy,
    ticket_deposit_type,
    ticket_deposit_value,
    ticket_dep_handling,
    ticket_receipt_id,
    ticket_partial_channels,
    ticket_full_channels,
    ticket_require_client_confirm,
    ticket_net_terms_label,
    ticket_quote_channel,
    ticket_dest_phone,
    ticket_dest_email,
    ticket_follow_up_enabled,
    ticket_follow_up_count,
    ticket_follow_up_freq,
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

  let normalizedWebsite: string | null = null;
  if (website != null && String(website).trim()) {
    const websiteErr = validateWebsite(String(website));
    if (websiteErr) {
      return NextResponse.json({ error: websiteErr, code: "VALIDATION_ERROR" }, { status: 400 });
    }
    normalizedWebsite = normalizeWebsite(String(website));
  }

  const admin = createAdminClient();
  const now = new Date().toISOString();

  // ── Upsert customer so they appear in CRM ──────────────────────────────────
  // Only when contact info is provided and no existing customer_id is given.
  let resolvedCustomerId: string | null = customer_id ?? null;
  let resolvedLeadId: string | null = linked_lead_id ?? null;

  const isDirectQuotePage = from_quote_page === true;
  const effectiveSource = isDirectQuotePage ? quote_source : source;

  const isNewCustomerFromContact = !resolvedCustomerId && (contact_email || contact_phone);
  const needsQuoteCustomerMeta =
    isDirectQuotePage && !resolvedLeadId && (isNewCustomerFromContact || resolvedCustomerId);

  if (isNewCustomerFromContact || needsQuoteCustomerMeta) {
    if (!effectiveSource?.trim()) {
      return NextResponse.json({ error: "Source is required.", code: "VALIDATION_ERROR" }, { status: 400 });
    }
    if (!industry?.trim()) {
      return NextResponse.json({ error: "Industry is required.", code: "VALIDATION_ERROR" }, { status: 400 });
    }
  }

  if (resolvedCustomerId && !isNewCustomerFromContact && (industry || normalizedWebsite)) {
    await admin
      .from("customers")
      .update({
        ...(industry ? { industry } : {}),
        ...(normalizedWebsite ? { website: normalizedWebsite } : {}),
        updated_at: now,
      })
      .eq("id", resolvedCustomerId);
  }

  if (isNewCustomerFromContact) {
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
      await admin
        .from("customers")
        .update({
          ...(industry ? { industry } : {}),
          ...(normalizedWebsite ? { website: normalizedWebsite } : {}),
          updated_at: now,
        })
        .eq("id", existing.id);
    } else {
      // Create new customer
      const nameParts = (contact_name ?? "").split(" ");
      const { data: newCustomer } = await admin.from("customers").insert({
        first_name: nameParts[0] ?? null,
        last_name: nameParts.slice(1).join(" ") || null,
        email: contact_email ?? null,
        phone: phoneDigits ?? null,
        company: contact_company ?? null,
        industry: industry ?? null,
        website: normalizedWebsite,
        created_at: now,
        updated_at: now,
      }).select("id").single();
      if (newCustomer) resolvedCustomerId = newCustomer.id;
    }
  }

  // CRM / lead flows: capture source on a new lead. Direct Quotes page stores source on the ticket instead.
  if (!resolvedLeadId && resolvedCustomerId && source?.trim() && !isDirectQuotePage) {
    const hasSkus = Array.isArray(quote_skus) && quote_skus.length > 0;
    const { data: newLead } = await admin
      .from("leads")
      .insert({
        customer_id: resolvedCustomerId,
        source: source.trim(),
        is_inbox: false,
        status: hasSkus ? "Quoted" : "Pending",
        sales_status: hasSkus ? "Quote Sent" : null,
        sdr_id: userId,
      })
      .select("id")
      .single();
    if (newLead) resolvedLeadId = newLead.id;
  }

  // Human-readable reference: QUO-YYYY-NNNN for quotes, ORD-YYYY-NNN for orders
  let reference_code: string | null = null;
  const year = new Date().getFullYear();
  try {
    if (ticket_kind === "order") {
      const seq = await nextOrderNumber(admin, year);
      reference_code = formatOrderReference(year, seq);
    } else if (ticket_kind === "quote") {
      const seq = await nextQuoteNumber(admin, year);
      reference_code = formatQuoteReference(year, seq);
    }
  } catch {
    return NextResponse.json(
      { error: "Failed to generate ticket reference.", code: "SEQUENCE_ERROR" },
      { status: 500 },
    );
  }

  const insertPayload = {
    ticket_kind,
    ticket_status,
    title: title.trim(),
    reference_code,
    customer_id: resolvedCustomerId,
    linked_lead_id: resolvedLeadId,
    // When an SDR's quote is auto-routed to Sales, preserve their identity so
    // they can still view the ticket in read-only mode after Sales claims it.
    routed_by_id: ticket_status === "routed" ? userId : null,
    created_by_id: userId,
    contact_name: contact_name ?? null,
    contact_email: contact_email ?? null,
    contact_company: contact_company ?? null,
    contact_phone: contact_phone ?? null,
    quote_source: isDirectQuotePage ? (quote_source?.trim() || null) : null,
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
    // Per-ticket payment config (migration 066)
    ticket_payment_strategy: ticket_payment_strategy ?? null,
    ticket_deposit_type: ticket_deposit_type ?? null,
    ticket_deposit_value: ticket_deposit_value ?? null,
    ticket_dep_handling: ticket_dep_handling ?? null,
    ticket_receipt_id: ticket_receipt_id ?? null,
    ticket_partial_channels: ticket_partial_channels ?? null,
    ticket_full_channels: ticket_full_channels ?? null,
    ticket_require_client_confirm: ticket_require_client_confirm ?? true,
    ticket_net_terms_label: ticket_net_terms_label ?? null,
    ticket_quote_channel: ticket_quote_channel ?? null,
    ticket_dest_phone: ticket_dest_phone ?? null,
    ticket_dest_email: ticket_dest_email ?? null,
    ticket_follow_up_enabled: ticket_follow_up_enabled ?? false,
    ticket_follow_up_count: ticket_follow_up_count ?? null,
    ticket_follow_up_freq: ticket_follow_up_freq ?? null,
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
    lead_id: resolvedLeadId,
    customer_id: resolvedCustomerId,
    ticket_id: ticket.id,
    by_user_id: userId,
    payload: { ticket_kind, title: ticket.title, reference_code },
    created_at: now,
  });

  // TODO-002: update linked lead status when ticket is created
  if (resolvedLeadId) {
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
      .eq("id", resolvedLeadId);

    await admin.from("activities").insert({
      type: "lead_status_changed",
      lead_id: resolvedLeadId,
      customer_id: resolvedCustomerId,
      ticket_id: ticket.id,
      by_user_id: userId,
      payload: { to: newLeadStatus, reason: "ticket_created" },
      created_at: now,
    });
  }

  // Auto-record cash payment if applicable (partial cash deposit or full cash in person)
  await maybeAutoRecordCashPayment(admin, {
    id:                          ticket.id,
    ticket_payment_strategy:     ticket_payment_strategy ?? null,
    ticket_dep_handling:         ticket_dep_handling ?? null,
    ticket_receipt_id:           ticket_receipt_id ?? null,
    ticket_full_channels:        ticket_full_channels ?? null,
    ticket_partial_channels:     ticket_partial_channels ?? null,
    ticket_deposit_type:         ticket_deposit_type ?? null,
    ticket_deposit_value:        ticket_deposit_value ?? null,
    ticket_require_client_confirm: ticket_require_client_confirm ?? true,
    quote_final_total:           ticket.quote_final_total ?? null,
    deposit_paid_at:             null,
    payment_paid_at:             null,
    linked_lead_id:              linked_lead_id ?? null,
    customer_id:                 ticket.customer_id ?? null,
  }, now, { byUserId: userId });

  // Net terms (no confirm) and other gate-satisfied tickets → production immediately
  const { data: releaseRow } = await admin
    .from("job_tickets")
    .select(AUTO_RELEASE_SELECT.replace(/\s+/g, " "))
    .eq("id", ticket.id)
    .single();
  if (releaseRow) {
    await maybeAutoReleaseProduction(admin, releaseRow as unknown as import("@/lib/utils/maybe-auto-release-production").AutoReleaseTicket, now, {
      byUserId: userId,
      via: ticket_status === "sent" ? "quote_sent" : "ticket_create",
    });
  }

  const { data: finalTicket } = await admin
    .from("job_tickets")
    .select()
    .eq("id", ticket.id)
    .single();

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
      if (fullTicket.ticket_follow_up_enabled) {
        await initializeTicketFollowUpSchedule(admin, ticket.id, fullTicket);
      }
      sendQuoteToCustomer(fullTicket, companyRow).then((result) => {
        if (!result.ok) {
          console.error("[send-quote] POST delivery failed:", result.error, { ticketId: ticket.id });
        }
      });
    }
  }

  return NextResponse.json({ ticket: finalTicket ?? ticket }, { status: 201 });
}
