// CRM → Workflow order sender.
// When a quote is accepted + paid in the CRM, it converts to an order and this
// helper POSTs the catalog-aware payload to Workflow's /api/webhook/orders.
//
// Contract: david-integration-handoff/04-order-handoff-contract.md
// Auth: shared secret in x-webhook-secret header (matches ORDER_WEBHOOK_SECRET env).

// Line item shape carried in the CRM → Workflow order webhook.
// Mirrors MasterProductSpec (lib/catalog/master-spec.ts) — same field IDs
// as Website Quote / CRM Quote / CRM Order / Workflow.
export interface OrderLineItem {
  // Product identity (catalog IDs — never free text)
  productId: number;
  productName: string;
  category?: string;
  subcategory?: string;

  // Substrate
  materialId: number;
  materialDisplayName?: string;

  // Dimensions
  widthIn?: number;
  heightIn?: number;
  depthIn?: number;                     // for 3D products (boxes)
  finishedSizeLabel?: string;           // human string, e.g. "4×5 in"

  // Quantity + SKUs
  quantity: number;
  skus?: Array<{ name: string; quantity: number; artworkUrl?: string }>;

  // Print options
  colorMode?: "CMYK" | "Pantone" | "1-Color" | "2-Color";
  sides?: "S1" | "S2";
  rollDirection?: "1" | "2" | "3" | "4" | "None";

  // Finishing + effects (from catalog allowlists)
  laminationIds?: number[];
  finishIds?: number[];
  finishingIds?: number[];              // legacy alias — keep for backwards compat

  // Die
  dielineId?: number | null;
  dielineNotes?: string;

  // Catch-all for any additional field values (populated field-key: value)
  fields?: Record<string, unknown>;

  // Pricing
  unitPrice: number;
  totalPrice: number;
  pricingSnapshot?: {
    framesUsed?: number;
    tierFramePrice?: number;
    frameTiersHash: string;
  };
}

export interface OrderPayload {
  externalId: string;
  quoteType?: "firm" | "comparison";     // Only "firm" quotes fire orders to Workflow.
                                          // Comparison quotes stay in CRM until customer picks a variant → firm quote.
  customer: {
    name: string;
    email: string;
    phone: string;
    company?: string;
  };
  lineItems: OrderLineItem[];
  subtotal: number;
  shipping: number;
  tax: number;
  total: number;
  notes?: string;
  priority?: "Normal" | "Rush";
  needBy?: string;
}

export interface OrderSendResult {
  ok: boolean;
  workflowOrderId?: string;
  error?: string;
  retryable?: boolean;
}

export async function sendOrderToWorkflow(order: OrderPayload): Promise<OrderSendResult> {
  const url = process.env.ORDER_WEBHOOK_URL;
  const secret = process.env.ORDER_WEBHOOK_SECRET;
  if (!url || !secret) {
    return { ok: false, error: "ORDER_WEBHOOK_URL or ORDER_WEBHOOK_SECRET not set", retryable: false };
  }

  const body = {
    schemaVersion: "1.0.0",
    source: "sdr-crm",
    emittedAt: new Date().toISOString(),
    order,
  };

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-webhook-secret": secret,
      },
      body: JSON.stringify(body),
    });

    if (res.ok) {
      const data = await res.json().catch(() => ({}));
      return { ok: true, workflowOrderId: data.orderId };
    }

    const text = await res.text().catch(() => "");
    return {
      ok: false,
      error: `HTTP ${res.status}: ${text.slice(0, 400)}`,
      retryable: res.status >= 500,
    };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
      retryable: true,
    };
  }
}
