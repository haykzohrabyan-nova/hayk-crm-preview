import { NextResponse } from "next/server";
import { buildQuoteEmail } from "@/lib/integrations/quote-email-template";

// GET /api/dev/quote-email-preview
// Dev-only route — renders the quote email template in the browser so you can inspect the design.
// NOT used in production. Remove or gate behind NODE_ENV check before going live.

export async function GET() {
  const { html } = buildQuoteEmail({
    customerName: "John Smith",
    title: "Business Cards — Double Sided Gloss",
    referenceCode: "6E8E2B03",
    skus: [
      {
        product_type: "Business Cards",
        material: "16pt Gloss Cover",
        lamination: "Gloss Lamination",
        color_mode: "Full Color (CMYK)",
        sides: "Double Sided",
        width: 3.5,
        height: 2,
        quantity: 500,
        unit_price: 0.12,
        spot_uv: true,
        die_cut: false,
        comment: "Please use the logo file from the last order",
      },
      {
        product_type: "Flyers",
        material: "100lb Gloss Text",
        color_mode: "Full Color (CMYK)",
        sides: "Single Sided",
        width: 8.5,
        height: 11,
        quantity: 250,
        unit_price: 0.38,
      },
    ],
    subtotal: 155,
    shipping: 12.5,
    discountAmount: 10,
    preTaxTotal: 157.5,
    taxAmount: 14.34,
    finalTotal: 171.84,
    taxRate: 9.1,
    paymentTypes: ["card_default", "zelle"],
    confirmUrl: "http://localhost:3000/q/preview-token-not-real",
    company: {
      company_name: "BazaarPrinting",
      logo_url: null,
      address_line1: "1234 Print Ave",
      address_line2: "Suite 100",
      city: "Los Angeles",
      state: "CA",
      zip: "90001",
      phone: "(213) 555-0100",
      email: "sales@bazaarprinting.co",
      website: "https://bazaarprinting.co",
    },
    isOrder: false,
  });

  return new NextResponse(html, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}
