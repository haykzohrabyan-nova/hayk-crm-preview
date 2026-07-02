// Master Product Specification — the single shared schema referenced by
// Website + CRM Quote + CRM Order + Workflow.
//
// Rule (locked with Hayk + ChatGPT 2026-07-01):
//   There is ONE Product Specification schema. Every system references the
//   same field IDs and database structure for every product-related field.
//   CRM and Workflow may add their own operational fields on top, but
//   SHARED fields must never be renamed or re-derived per system.
//
// This file is the authoritative TypeScript contract. Any change here
// must be mirrored on Bazaar (Prisma), CRM DB, and Workflow DB.

// ─── SHARED — product spec fields (all 4 systems) ───────────
// Website Quote, CRM Quote, CRM Order, Workflow all carry these on every line item.

export interface MasterProductSpec {
  // Product identity (from catalog webhook — never free text)
  productId: number;               // maps to Bazaar Item.id
  productName: string;             // denormalized for display; source of truth is catalog
  category: string;                // top-level (Labels & Stickers, etc.)
  subcategory: string | null;      // catalog subcategory

  // Substrate
  materialId: number;              // maps to Bazaar Material.id
  materialName: string;            // denormalized

  // Dimensions
  widthIn?: number;
  heightIn?: number;
  depthIn?: number;                // only when product is 3D (boxes, containers)
  finishedSizeLabel?: string;      // human string — CRM/Workflow store; Website computes on-the-fly

  // Quantity
  quantity: number;
  skus?: Array<{                   // multi-SKU breakdown when > 1 design per line item
    name: string;
    quantity: number;
    artworkUrl?: string;
  }>;

  // Print options
  colorMode: "CMYK" | "Pantone" | "1-Color" | "2-Color";
  sides: "S1" | "S2";              // Single / Double
  rollDirection?: "1" | "2" | "3" | "4" | "None";  // roll labels/pouches only

  // Finishing + effects (referenced by Bazaar Material.id — resolved to label via catalog)
  laminationIds: number[];         // FINISHING allowlist ids
  finishIds: number[];             // SPECIAL_EFFECTS allowlist ids (Foil, Spot UV, etc.)

  // Die-cut
  dielineId?: number | null;       // when die-cut product
  dielineNotes?: string;

  // Artwork
  artworkFiles: Array<{
    id: string;
    name: string;
    size: string;
    url?: string;
    kind: "ai" | "pdf" | "image" | "file";
  }>;

  // Customer-facing note (rep-writes, shows on quote PDF)
  customerNotes?: string;

  // Due date (shared — customer sees it too)
  dueDate?: string;               // ISO
}

// ─── CRM Quote + Order + Workflow add these ─────────────────
// NOT on Website.

export interface OperationalSpec {
  internalNotes?: string;         // rep-only, hidden from customer
  priority: "Normal" | "High" | "Rush";
}

// ─── CRM-only (Quote + Order) ───────────────────────────────
// NOT on Website. NOT on Workflow (Workflow references these via joined view but doesn't own them).

export interface CRMOrderShape {
  customerId: string;             // link to Customer
  companyId?: string;
  salesRepId: string;
  quoteRefId: string;             // "QO-2026-0189" (or "OR-2026-0189" once converted)
  orderRefId?: string;            // populated on quote acceptance
  paymentStatus: "Paid" | "Partial" | "Tax Exempt" | "Pending Tax Review" | "Unpaid";
  balanceDue: number;
  invoiceRef?: string;
  shippingMethod: "Pickup" | "Ship";
  trackingRef?: string;
  taxRate: number;
  taxExempt: boolean;
  discountMode: "none" | "percent" | "flat";
  discountValue: number;
  approvalStatus?: "Draft" | "Sent" | "Viewed" | "Approved" | "Rejected" | "Expired";
}

// ─── Workflow-only (Print Manager production board) ─────────
// NOT on Website. NOT on CRM Quote.

export interface WorkflowShape {
  assignedDesigner?: string;      // team member code
  designTask?: string;
  proofStatus?: "Not Started" | "In Progress" | "Awaiting Customer" | "Approved" | "Revising";
  customerApprovalStatus?: "N/A" | "Requested" | "Approved" | "Changes Requested";
  productionQueue?: string;       // column on the board
  pressAssignment?: string;       // machine + operator
  finishingAssignment?: string;
  qcStatus?: "Pending" | "Passed" | "Failed";
  shippingStatus?: "N/A" | "Boxed" | "Labeled" | "Shipped";
  activityLog?: Array<{ at: string; author: string; note: string }>;
  productionNotes?: string;
  internalComments?: Array<{ at: string; author: string; note: string }>;
  versionHistory?: Array<{ at: string; author: string; changed: string }>;
}

// ─── The full end-to-end shape ──────────────────────────────

export interface FullQuoteOrOrderLineItem extends MasterProductSpec, OperationalSpec {
  id: string;
  unitPrice: number;              // from Bazaar pricing webhook
  extended: number;
  frameTiersHash?: string;        // audit trail — locks the ladder version used
  overrideEnabled?: boolean;
  overrideReason?: string;
}

// ─── Field ownership map (for docs) ────────────────────────
// Which system OWNS each shared field (where the value is authoritatively set)?
export const FIELD_OWNERSHIP: Record<keyof MasterProductSpec, "catalog" | "sdr" | "sales" | "customer"> = {
  productId: "catalog",
  productName: "catalog",
  category: "catalog",
  subcategory: "catalog",
  materialId: "catalog",
  materialName: "catalog",
  widthIn: "sdr",                 // captured at intake, editable through sales/order
  heightIn: "sdr",
  depthIn: "sdr",
  finishedSizeLabel: "sdr",
  quantity: "sdr",
  skus: "sales",                  // sales rep breaks out SKUs during qualifying/quoting
  colorMode: "sales",
  sides: "sales",
  rollDirection: "sales",
  laminationIds: "sales",
  finishIds: "sales",
  dielineId: "sales",
  dielineNotes: "sales",
  artworkFiles: "customer",       // customer or sdr on their behalf
  customerNotes: "sdr",
  dueDate: "sdr",
};
