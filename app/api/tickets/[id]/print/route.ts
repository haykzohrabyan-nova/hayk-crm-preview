import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { formatCurrency, type QuoteSku } from "@/lib/utils/ticket-math";
import { formatPhone } from "@/lib/utils/phone";
import type { CompanySettings } from "@/lib/types";
import { resolveTicketId } from "@/lib/utils/reference-codes";

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function esc(s: string | null | undefined): string {
  if (!s) return "";
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: rawId } = await params;

  // ── Auth check ────────────────────────────────────────────────────────────
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll(); },
        setAll() {},
      },
    }
  );
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  // ── Fetch data ────────────────────────────────────────────────────────────
  const admin = createAdminClient();
  const ticketId = await resolveTicketId(admin, rawId);
  if (!ticketId) {
    return new NextResponse("Not found", { status: 404 });
  }
  const [{ data: ticket }, { data: rawCompany }] = await Promise.all([
    admin
      .from("job_tickets")
      .select(
        `id, ticket_kind, ticket_status, title, reference_code, created_at,
         due_date, rush, priority, special_requirements,
         contact_name, contact_email, contact_company, contact_phone,
         quote_skus, quote_subtotal, quote_shipping,
         discount_type, discount_value, discount_reason,
         quote_pre_tax_total, quote_tax_rate_percent, quote_tax_amount, quote_final_total,
         tax_exempt, quote_payment_types, quote_channel, quote_reminder_date, created_by_id,
         customer:customers(first_name, last_name, company, email, phone)`
      )
      .eq("id", ticketId)
      .single(),
    admin.from("company_settings").select("*").eq("id", 1).single(),
  ]);

  if (!ticket) {
    return new NextResponse("Not found", { status: 404 });
  }

  const company = rawCompany as CompanySettings | null;

  // ── Derived values ────────────────────────────────────────────────────────
  const isOrder =
    ticket.ticket_status === "order" ||
    ticket.ticket_status === "in_production" ||
    ticket.ticket_status === "completed";
  const docType = isOrder ? "INVOICE" : "QUOTE";

  const cust = ticket.customer as unknown as {
    first_name: string | null; last_name: string | null;
    company: string | null; email: string | null; phone: string | null;
  } | null;

  const customerName = cust
    ? `${cust.first_name ?? ""} ${cust.last_name ?? ""}`.trim()
    : (ticket.contact_name as string | null) ?? "";
  const customerEmail = cust?.email ?? (ticket.contact_email as string | null) ?? "";
  const customerPhone = cust?.phone ?? (ticket.contact_phone as string | null) ?? "";
  const customerCompany = cust?.company ?? (ticket.contact_company as string | null) ?? "";
  // Fetch creator name separately (created_by_id → user_profiles)
  let repName = "—";
  if (ticket.created_by_id) {
    const { data: profile } = await admin
      .from("user_profiles")
      .select("full_name")
      .eq("id", ticket.created_by_id as string)
      .single();
    repName = profile?.full_name ?? "—";
  }

  const skus: QuoteSku[] = Array.isArray(ticket.quote_skus)
    ? (ticket.quote_skus as QuoteSku[])
    : [];

  const hasDiscount = !!ticket.discount_type && !!ticket.discount_value;
  const discountAmt =
    ticket.quote_subtotal != null &&
    ticket.quote_pre_tax_total != null &&
    ticket.quote_shipping != null
      ? (ticket.quote_subtotal as number) +
        (ticket.quote_shipping as number) -
        (ticket.quote_pre_tax_total as number)
      : null;

  const addressParts = [
    company?.address_line1,
    company?.address_line2,
    [company?.city, company?.state, company?.zip].filter(Boolean).join(", "),
  ].filter(Boolean) as string[];

  const paymentLabels: Record<string, string> = {
    card_default: "Card Payment",
    zelle: "Zelle",
    offline: "Offline / In-person",
  };
  const paymentMethods = ((ticket.quote_payment_types as string[]) ?? [])
    .map((k) => paymentLabels[k] ?? k)
    .join(", ");

  // ── Line items HTML ───────────────────────────────────────────────────────
  const skuRows = skus
    .map((sku, i) => {
      const lineTotal = (sku.quantity ?? 0) * (sku.unit_price ?? 0);
      const specParts = [
        sku.material,
        sku.lamination && sku.lamination !== "None" ? sku.lamination : null,
        sku.color_mode,
        sku.sides,
        sku.roll_direction,
        sku.width && sku.height ? `${sku.width}" × ${sku.height}"` : null,
      ].filter(Boolean);
      const addons = [
        sku.spot_uv && "Spot UV",
        sku.foil && "Foil",
        sku.perforation && "Perforation",
        sku.die_cut && "Die Cut",
        sku.design_required && "Design on file",
      ].filter(Boolean) as string[];

      return `
        <tr>
          <td class="num">${i + 1}</td>
          <td>
            <strong>${esc(sku.product_type) || "—"}</strong>
            ${addons.length ? `<div class="sub">${esc(addons.join(" · "))}</div>` : ""}
            ${sku.comment ? `<div class="note">${esc(sku.comment)}</div>` : ""}
          </td>
          <td class="spec">${esc(specParts.join(" · ")) || "—"}</td>
          <td class="r">${sku.quantity ?? "—"}</td>
          <td class="r">${sku.unit_price != null ? esc(formatCurrency(sku.unit_price)) : "—"}</td>
          <td class="r bold">${lineTotal > 0 ? esc(formatCurrency(lineTotal)) : "—"}</td>
        </tr>`;
    })
    .join("");

  // ── Pricing rows HTML ─────────────────────────────────────────────────────
  const pricingRows = [
    ticket.quote_subtotal != null
      ? `<div class="price-row"><span>Subtotal</span><span>${esc(formatCurrency(ticket.quote_subtotal as number))}</span></div>`
      : "",
    (ticket.quote_shipping as number | null) != null && (ticket.quote_shipping as number) > 0
      ? `<div class="price-row"><span>Shipping</span><span>${esc(formatCurrency(ticket.quote_shipping as number))}</span></div>`
      : "",
    hasDiscount && discountAmt != null && discountAmt > 0
      ? `<div class="price-row danger"><span>Discount${ticket.discount_reason ? ` (${esc(ticket.discount_reason as string)})` : ""}</span><span>−${esc(formatCurrency(discountAmt))}</span></div>`
      : "",
    ticket.quote_pre_tax_total != null
      ? `<div class="price-row"><span>Pre-tax Total</span><span>${esc(formatCurrency(ticket.quote_pre_tax_total as number))}</span></div>`
      : "",
    ticket.tax_exempt
      ? `<div class="price-row"><span>Tax</span><span>Exempt</span></div>`
      : ticket.quote_tax_amount != null
      ? `<div class="price-row"><span>Tax (${ticket.quote_tax_rate_percent ?? 0}%)</span><span>${esc(formatCurrency(ticket.quote_tax_amount as number))}</span></div>`
      : "",
  ]
    .filter(Boolean)
    .join("");

  // ── Full HTML document ────────────────────────────────────────────────────
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${esc(docType)} — ${esc(ticket.title as string | null ?? "Untitled")} — BazaarPrinting</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Inter', Arial, sans-serif;
      font-size: 13px;
      color: #333;
      background: #f3f4f6;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }

    /* ── Screen wrapper ── */
    .page-wrap {
      min-height: 100vh;
      padding: 32px 16px;
    }

    .no-print-bar {
      max-width: 840px;
      margin: 0 auto 16px;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }

    .back-link {
      font-size: 13px;
      color: #888;
      text-decoration: none;
    }

    .print-btn {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 9px 20px;
      background: #1B2B4B;
      color: #E8C97A;
      border: none;
      border-radius: 6px;
      font-size: 13px;
      font-weight: 500;
      cursor: pointer;
      letter-spacing: 0.01em;
    }

    .invoice {
      max-width: 840px;
      margin: 0 auto;
      background: #fff;
      border-radius: 10px;
      box-shadow: 0 4px 32px rgba(0,0,0,0.10);
      padding: 52px;
    }

    /* ── Header ── */
    .header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 32px;
      padding-bottom: 24px;
      border-bottom: 2px solid #1B2B4B;
    }

    .company-name {
      font-size: 20px;
      font-weight: 600;
      color: #1B2B4B;
      letter-spacing: 0.06em;
      margin-bottom: 8px;
    }

    .company-address {
      font-size: 12px;
      color: #666;
      line-height: 1.7;
    }

    .doc-type {
      font-size: 30px;
      font-weight: 700;
      color: #1B2B4B;
      letter-spacing: 0.04em;
      text-align: right;
      margin-bottom: 8px;
      display: flex;
      align-items: center;
      justify-content: flex-end;
      gap: 10px;
    }

    .rush-badge {
      font-size: 11px;
      font-weight: 600;
      background: #FEF3C7;
      color: #D97706;
      padding: 3px 8px;
      border-radius: 4px;
    }

    .doc-meta {
      font-size: 13px;
      color: #444;
      line-height: 2;
      text-align: right;
    }

    .doc-meta .muted { color: #888; }

    /* ── Bill To / Prepared By ── */
    .parties {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 32px;
      margin-bottom: 36px;
    }

    .section-label {
      font-size: 10px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.09em;
      color: #888;
      margin-bottom: 8px;
    }

    .party-name {
      font-size: 15px;
      font-weight: 600;
      color: #1B2B4B;
      margin-bottom: 3px;
    }

    .party-detail {
      font-size: 13px;
      color: #555;
      margin-bottom: 2px;
    }

    .re-line {
      font-size: 13px;
      color: #555;
      margin-top: 6px;
    }

    .re-line .muted { color: #888; }

    /* ── Line items table ── */
    table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 32px;
    }

    thead th {
      text-align: left;
      padding: 8px 10px;
      font-size: 10px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.07em;
      color: #888;
      background: #f8f9fa;
      border-bottom: 1px solid #E5E7EB;
    }

    thead th.r { text-align: right; }

    tbody td {
      padding: 11px 10px;
      font-size: 13px;
      color: #333;
      border-bottom: 1px solid #f0f0f0;
      vertical-align: top;
    }

    tbody tr:last-child td { border-bottom: none; }

    td.num { color: #bbb; font-size: 12px; width: 28px; }
    td.spec { color: #666; font-size: 12px; }
    td.r { text-align: right; }
    td.bold { font-weight: 600; color: #1B2B4B; }

    .sub { font-size: 11px; color: #888; margin-top: 2px; }
    .note { font-size: 11px; color: #aaa; margin-top: 2px; font-style: italic; }

    /* ── Pricing summary ── */
    .pricing-wrap {
      display: flex;
      justify-content: flex-end;
      margin-bottom: 36px;
    }

    .pricing-box {
      width: 300px;
      border-top: 1px solid #E5E7EB;
    }

    .price-row {
      display: flex;
      justify-content: space-between;
      padding: 4px 0;
      font-size: 13px;
    }

    .price-row span:first-child { color: #888; }
    .price-row.danger span { color: #DC2626; }

    .total-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding-top: 10px;
      margin-top: 6px;
      border-top: 2px solid #1B2B4B;
    }

    .total-label { font-size: 16px; font-weight: 700; color: #1B2B4B; }
    .total-value { font-size: 20px; font-weight: 700; color: #1B2B4B; }

    /* ── Details section ── */
    .details {
      padding-top: 20px;
      border-top: 1px solid #E5E7EB;
      margin-bottom: 28px;
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 16px 32px;
    }

    .detail-block { }
    .detail-block.full { grid-column: 1 / -1; }
    .detail-value { font-size: 13px; color: #333; }

    /* ── Footer ── */
    .footer {
      padding-top: 20px;
      border-top: 2px solid #E8C97A;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .footer-thanks { font-size: 13px; color: #888; }
    .footer-website { font-size: 13px; font-weight: 600; color: #1B2B4B; }

    /* ── Print ── */
    @media print {
      body { background: #fff; }
      .no-print-bar { display: none !important; }
      .page-wrap { padding: 0; }
      .invoice {
        max-width: none;
        border-radius: 0;
        box-shadow: none;
        padding: 0;
      }
      @page { margin: 0.5in; size: letter portrait; }
    }
  </style>
</head>
<body>
  <div class="page-wrap">

    <!-- Screen-only action bar -->
    <div class="no-print-bar">
      <a class="back-link" href="javascript:window.close()">← Close</a>
      <button class="print-btn" onclick="window.print()">
        🖨 Print / Save PDF
      </button>
    </div>

    <!-- Invoice document -->
    <div class="invoice">

      <!-- Header -->
      <div class="header">
        <div>
          ${company?.logo_url
            ? `<img src="${esc(company.logo_url)}" alt="${esc(company.company_name)}" style="max-height:64px;max-width:200px;object-fit:contain;margin-bottom:10px;display:block;" />`
            : `<div class="company-name">${esc(company?.company_name || "BAZAARPRINTING")}</div>`
          }
          <div class="company-address">
            ${addressParts.map(esc).join("<br>")}
            ${company?.phone ? `<br>${esc(formatPhone(company.phone))}` : ""}
            ${company?.email ? `<br>${esc(company.email)}` : ""}
            ${company?.website ? `<br>${esc(company.website)}` : ""}
          </div>
        </div>

        <div>
          <div class="doc-type">
            ${esc(docType)}
            ${ticket.rush ? `<span class="rush-badge">⚡ RUSH</span>` : ""}
          </div>
          <div class="doc-meta">
            ${ticket.reference_code ? `<div><span class="muted">Ref: </span><strong>${esc(ticket.reference_code as string)}</strong></div>` : ""}
            <div><span class="muted">Date: </span>${esc(fmtDate(ticket.created_at as string))}</div>
            ${ticket.due_date ? `<div><span class="muted">Due: </span>${esc(fmtDate(ticket.due_date as string))}</div>` : ""}
            ${ticket.priority && ticket.priority !== "Normal" ? `<div><span class="muted">Priority: </span>${esc(ticket.priority as string)}</div>` : ""}
          </div>
        </div>
      </div>

      <!-- Bill To + Prepared By -->
      <div class="parties">
        <div>
          <div class="section-label">Bill To</div>
          ${customerName ? `<div class="party-name">${esc(customerName)}</div>` : ""}
          ${customerCompany ? `<div class="party-detail">${esc(customerCompany)}</div>` : ""}
          ${customerEmail ? `<div class="party-detail">${esc(customerEmail)}</div>` : ""}
          ${customerPhone ? `<div class="party-detail">${esc(formatPhone(customerPhone))}</div>` : ""}
          ${!customerName && !customerEmail && !customerPhone ? `<div style="color:#bbb;font-size:13px">No customer details</div>` : ""}
        </div>
        <div>
          <div class="section-label">Prepared By</div>
          <div class="party-detail" style="font-weight:500;color:#333">${esc(repName)}</div>
          ${ticket.title ? `<div class="re-line"><span class="muted">Re: </span>${esc(ticket.title as string)}</div>` : ""}
        </div>
      </div>

      <!-- Line Items -->
      ${skus.length > 0 ? `
      <table>
        <thead>
          <tr>
            <th>#</th>
            <th>Product</th>
            <th>Specification</th>
            <th class="r">Qty</th>
            <th class="r">Unit Price</th>
            <th class="r">Total</th>
          </tr>
        </thead>
        <tbody>
          ${skuRows}
        </tbody>
      </table>` : ""}

      <!-- Pricing Summary -->
      <div class="pricing-wrap">
        <div class="pricing-box">
          ${pricingRows}
          <div class="total-row">
            <span class="total-label">Total</span>
            <span class="total-value">${ticket.quote_final_total != null ? esc(formatCurrency(ticket.quote_final_total as number)) : "—"}</span>
          </div>
        </div>
      </div>

      <!-- Payment + Details -->
      ${paymentMethods || ticket.special_requirements || ticket.quote_channel ? `
      <div class="details">
        ${paymentMethods ? `
        <div class="detail-block">
          <div class="section-label">Payment Methods</div>
          <div class="detail-value">${esc(paymentMethods)}</div>
        </div>` : ""}
        ${ticket.quote_channel && ticket.quote_channel !== "In-person" ? `
        <div class="detail-block">
          <div class="section-label">Delivery Channel</div>
          <div class="detail-value">${esc(ticket.quote_channel as string)}</div>
        </div>` : ""}
        ${ticket.special_requirements ? `
        <div class="detail-block full">
          <div class="section-label">Special Requirements</div>
          <div class="detail-value">${esc(ticket.special_requirements as string)}</div>
        </div>` : ""}
      </div>` : ""}

      <!-- Footer -->
      <div class="footer">
        <span class="footer-thanks">Thank you for your business!</span>
        ${company?.website ? `<span class="footer-website">${esc(company.website)}</span>` : ""}
      </div>

    </div><!-- /invoice -->
  </div><!-- /page-wrap -->
  <script>
    // Auto-print when loaded inside a hidden iframe
    if (window.self !== window.top) {
      window.onload = function() { window.print(); };
    }
  </script>
</body>
</html>`;

  return new NextResponse(html, {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}
