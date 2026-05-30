import { NextRequest, NextResponse } from "next/server";
import { validateDueDateAgainstCreated } from "@/lib/utils/due-date";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireSession } from "@/lib/auth/require-session";
import { sendQuoteToCustomer } from "@/lib/integrations/send-quote";
import { notifyPublicQuoteUpdatedByTicketId } from "@/lib/integrations/notify-public-quote-updated";
import { initializeTicketFollowUpSchedule } from "@/lib/utils/initialize-ticket-follow-up";
import { maybeAutoRecordCashPayment } from "@/lib/utils/maybe-auto-record-cash-payment";
import { maybeAutoReleaseProduction, AUTO_RELEASE_SELECT } from "@/lib/utils/maybe-auto-release-production";
import { applyTicketScope, fetchQuotesList } from "@/lib/utils/fetch-quotes-data";
import {
  formatOrderReference,
  formatQuoteReference,
  nextOrderNumber,
  nextQuoteNumber,
  ticketKindForReference,
} from "@/lib/utils/reference-codes";
import { normalizeWebsite, validateWebsite } from "@/lib/utils/website";
import {
  aggregateLineFlags,
  fetchTicketLinesBundle,
  parseLineItemsFromBody,
  syncTicketLines,
  ticketHasFilledLineItem,
} from "@/lib/utils/ticket-line-items";
import {
  fetchTicketShippingDestinations,
  resolveShippingFromRequest,
  syncTicketShippingDestinations,
} from "@/lib/utils/ticket-shipping-destinations";


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

  if (isQuoteList) {
    try {
      const { rows } = await fetchQuotesList(admin, roleName, userId!, { search });
      return NextResponse.json({ tickets: rows });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Query failed.";
      return NextResponse.json({ error: message, code: "DB_ERROR" }, { status: 500 });
    }
  }

  type ScopeFn = <T extends { or: (filter: string) => T; eq: (col: string, val: string) => T }>(
    q: T,
  ) => T;
  const applyScope: ScopeFn = (q) => applyTicketScope(q, roleName, userId);

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

  const { data, error } = await applyScope(q);

  if (error) {
    return NextResponse.json({ error: error.message, code: "DB_ERROR" }, { status: 500 });
  }

  return NextResponse.json({ tickets: data ?? [] });
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
    line_items: lineItemsBody,
    notes,
    order_source,
    priority,
    due_date,
    rush = false,
    special_requirements,
    quote_channel,
    quote_destination,
    quote_subtotal,
    quote_shipping = 0,
    requires_shipping = false,
    ship_to_line1,
    ship_to_line2,
    ship_to_city,
    ship_to_state,
    ship_to_zip,
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
    routed_reason,
    routed_notes,
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

  if (ticket_status === "routed" && routed_reason != null && String(routed_reason).trim() === "") {
    return NextResponse.json(
      { error: "A route reason is required when routing to Sales.", code: "VALIDATION_ERROR" },
      { status: 400 },
    );
  }

  const routedNotesTrimmed =
    typeof routed_notes === "string" ? routed_notes.trim() : "";
  const isOtherRoute =
    routed_reason != null &&
    (String(routed_reason).endsWith("_other") || String(routed_reason) === "other");
  if (ticket_status === "routed" && isOtherRoute && !routedNotesTrimmed) {
    return NextResponse.json(
      { error: "Please specify a reason when Other is selected.", code: "VALIDATION_ERROR" },
      { status: 400 },
    );
  }

  const shippingResolved = resolveShippingFromRequest({
    requires_shipping,
    quote_shipping,
    ship_to_line1,
    ship_to_line2,
    ship_to_city,
    ship_to_state,
    ship_to_zip,
    shipping_destinations: body.shipping_destinations,
  });
  if (shippingResolved.zipError) {
    return NextResponse.json({ error: shippingResolved.zipError, code: "VALIDATION_ERROR" }, { status: 400 });
  }
  const shipPayload = shippingResolved.legacy;
  const resolvedQuoteShipping = shipPayload.quote_shipping;
  const shippingDestinationsToSync = shippingResolved.destinations;

  const now = new Date().toISOString();
  if (due_date) {
    const dueErr = validateDueDateAgainstCreated(String(due_date), now);
    if (dueErr) {
      return NextResponse.json({ error: dueErr, code: "VALIDATION_ERROR" }, { status: 400 });
    }
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
  const lineItems = parseLineItemsFromBody(lineItemsBody);
  const lineFlags = aggregateLineFlags(lineItems);
  const hasFilledLine = ticketHasFilledLineItem(lineItems);

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
    const { data: newLead } = await admin
      .from("leads")
      .insert({
        customer_id: resolvedCustomerId,
        source: source.trim(),
        is_inbox: false,
        status: hasFilledLine ? "Quoted" : "Pending",
        sales_status: hasFilledLine ? "Quote Sent" : null,
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

  const resolvedTicketKind = ticketKindForReference(reference_code, ticket_kind) ?? ticket_kind;

  const insertPayload = {
    ticket_kind: resolvedTicketKind,
    ticket_status,
    title: title.trim(),
    reference_code,
    customer_id: resolvedCustomerId,
    linked_lead_id: resolvedLeadId,
    // When an SDR's quote is auto-routed to Sales, preserve their identity so
    // they can still view the ticket in read-only mode after Sales claims it.
    routed_by_id: ticket_status === "routed" ? userId : null,
    routed_reason: ticket_status === "routed" ? (routed_reason?.trim() || null) : null,
    routed_notes: ticket_status === "routed" ? (routedNotesTrimmed || null) : null,
    created_by_id: userId,
    contact_name: contact_name ?? null,
    contact_email: contact_email ?? null,
    contact_company: contact_company ?? null,
    contact_phone: contact_phone ?? null,
    quote_source: isDirectQuotePage ? (quote_source?.trim() || null) : null,
    notes: notes ?? null,
    order_source: order_source ?? null,
    priority: priority ?? null,
    due_date: due_date ?? null,
    rush,
    design_required: lineFlags.design_required,
    die_cut: lineFlags.die_cut,
    special_requirements: special_requirements ?? null,
    quote_channel: quote_channel ?? null,
    quote_destination: quote_destination ?? null,
    quote_subtotal: quote_subtotal ?? null,
    quote_shipping: resolvedQuoteShipping,
    requires_shipping: shipPayload.requires_shipping,
    ship_to_line1: shipPayload.ship_to_line1,
    ship_to_line2: shipPayload.ship_to_line2,
    ship_to_city: shipPayload.ship_to_city,
    ship_to_state: shipPayload.ship_to_state,
    ship_to_zip: shipPayload.ship_to_zip,
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

  let syncedLineItems = null;
  if (lineItems.length > 0) {
    const syncResult = await syncTicketLines(admin, ticket.id, lineItems);
    if (!syncResult.ok) {
      await admin.from("job_tickets").delete().eq("id", ticket.id);
      return NextResponse.json({ error: syncResult.error, code: "VALIDATION_ERROR" }, { status: 400 });
    }
    syncedLineItems = syncResult.line_items;
  }

  try {
    await syncTicketShippingDestinations(
      admin,
      ticket.id,
      shipPayload.requires_shipping,
      shippingDestinationsToSync,
    );
  } catch (err) {
    await admin.from("job_tickets").delete().eq("id", ticket.id);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to save shipping destinations.", code: "DB_ERROR" },
      { status: 500 },
    );
  }

  // Log activity (type name is legacy; payload.ticket_kind + reference_code drive UI labels).
  await admin.from("activities").insert({
    type: "order_ticket_created",
    lead_id: resolvedLeadId,
    customer_id: resolvedCustomerId,
    ticket_id: ticket.id,
    by_user_id: userId,
    payload: {
      ticket_kind: resolvedTicketKind,
      title: ticket.title,
      reference_code,
      ...(ticket_status === "routed" && routed_reason?.trim()
        ? {
            routed_reason: routed_reason.trim(),
            ...(routedNotesTrimmed ? { routed_notes: routedNotesTrimmed } : {}),
          }
        : {}),
    },
    created_at: now,
  });

  if (ticket_status === "sent") {
    await admin.from("activities").insert({
      type: "ticket_sent",
      lead_id: resolvedLeadId,
      customer_id: resolvedCustomerId,
      ticket_id: ticket.id,
      by_user_id: userId,
      payload: {
        channel: quote_channel ?? ticket_quote_channel ?? "unknown",
        destination: quote_destination ?? ticket_dest_email ?? ticket_dest_phone ?? null,
        recipient: contact_name ?? contact_email ?? null,
        resend: false,
      },
      created_at: now,
    });
  }

  // TODO-002: update linked lead status when ticket is created
  if (resolvedLeadId) {
    const newLeadStatus = hasFilledLine ? "Quoted" : "Validated";
    const newSalesStatus = hasFilledLine ? "Quote Sent" : null;

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
      const sendResult = await sendQuoteToCustomer(fullTicket, companyRow);
      if (!sendResult.ok) {
        console.error("[send-quote] POST delivery failed:", sendResult.error, { ticketId: ticket.id });
      }
    }
  }

  const line_items =
    syncedLineItems ?? (await fetchTicketLinesBundle(admin, ticket.id));
  const shipping_destinations = await fetchTicketShippingDestinations(admin, ticket.id);

  notifyPublicQuoteUpdatedByTicketId(admin, (finalTicket ?? ticket).id);

  return NextResponse.json(
    { ticket: { ...(finalTicket ?? ticket), line_items, shipping_destinations } },
    { status: 201 },
  );
}
