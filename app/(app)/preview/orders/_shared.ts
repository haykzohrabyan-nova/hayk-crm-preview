// Hayk 2026-07-12 — Orders preview SHARED module.
// Client-safe types, helpers, colors, chips, and the LEGACY mock dataset.
// The Orders route (page.tsx) now renders REAL data from the shared local
// Postgres via _data.ts. This mock ORDERS array is retained ONLY because two
// other not-yet-migrated preview pages (payments, new-quote) still import it.
// No "use client" — importable by both server (_data.ts) and client (_client.tsx).
import type { CSSProperties } from "react";

// Hayk 2026-07-01 — Passport number. The numeric core (e.g. "135") rides on
// every downstream artifact: quote (Q-135) → order (ORD-135) → workflow card
// (#135) → invoice (INV-135) → packing slip (PS-135). Same number, never
// re-invented. This helper strips the prefix (Q-, QO-, ORD-, INV-, PS-) and
// any year segment (2026-) so we always land on the 3-digit core.
export const passportCore = (refId: string): string =>
  refId
    // QO before Q — alternation is first-match; /Q|QO/ would strip only
    // the "Q" of "QO-777" and leave "O-777".
    .replace(/^(QO|ORD|INV|PS|Q)-?/i, "")
    .replace(/^\d{4}-/, "")
    .padStart(3, "0");
// ─── Types ────────────────────────────────────────────
export type OrderStatus = "Pending Payment" | "In Production" | "Ready to Ship" | "Shipped" | "Delivered" | "Cancelled" | "Refunded";
export type PaymentStatus = "Paid" | "Partial" | "Tax Exempt" | "Pending Tax Review" | "Unpaid";
export type Priority = "Normal" | "High" | "Rush" | "Low";

export interface OrderLineItem {
  id: string;
  productId?: number;
  productName: string;
  productCategory?: string;
  materialId?: number;
  materialName?: string;
  quantity: number;
  widthIn?: number;
  heightIn?: number;
  sides?: "S1" | "S2";
  colorMode?: "CMYK" | "Pantone";
  finishingIds?: number[];
  finishingLabels?: string[];
  specialEffectIds?: number[];
  specialEffectLabels?: string[];
  unitPrice: number;
  extended: number;
  frameTiersHash?: string;
  comment?: string;
  overrideEnabled?: boolean;
  overrideReason?: string;
  // Real-data specs pulled straight from the job ticket's product_lines jsonb
  // (print, style, finish, stock, etc.) — rendered honestly, only when present.
  specs?: { label: string; value: string }[];
}

export interface Attachment { name: string; sizeKB: number; kind: "pdf" | "ai" | "png" | "jpg" | "dxf"; }
export interface CommEntry { channel: "email_in" | "email_out" | "call_in" | "call_out" | "sms_in" | "sms_out" | "ig_in" | "ig_out" | "note"; author: string; subject?: string; body: string; at: string; attachments?: string[]; }
export interface PaymentEntry { method: "ACH" | "Wire" | "Card" | "Zelle" | "Cash Terminal"; amount: number; date: string; ref: string; status: "Completed" | "Pending Clearance" | "Failed"; }
export interface TimelineEntry { icon: string; tint: string; title: string; sub?: string; at: string; actor?: string; ref?: string; }
export interface CustomerProfile { phone: string; email: string; city?: string; state?: string; lifetimeOrders: number; lifetimeValue: number; returning: boolean; terms?: string; }

// A live production board column (real, in position order).
export interface BoardStage { name: string; kind: string | null; }

// One real quote record (the linked QUO-xxxx job ticket).
export interface QuoteRecord { ref: string; date: string; total: number; status: string }

export interface Order {
  refId: string;                // "114" — 3-digit passport core, rendered as ORD-114
  quoteRefId: string;           // "QO-114" — links back to the source quote
  invoiceRefId?: string;        // "INV-114" — same passport core, auto-derived if omitted
  packingSlipRefId?: string;    // "PS-114" — same passport core, auto-derived if omitted
  contact: string;
  company: string;
  createdBy: string;
  ownerAvatar: string;
  ownerColor: string;
  title: string;
  lineItems: OrderLineItem[];
  total: number;
  received: number;
  balanceDue: number;
  priority: Priority;
  dueDate: string;
  dueOverdue?: boolean;              // true = production/shipping due date passed
  paymentTerms?: string;             // "Net-15" / "Net-30" / "Due on receipt" / "Deposit + balance"
  paymentDueDate?: string;           // "07/15/2026" — when payment is due per terms
  paymentOverdue?: boolean;          // true = past payment terms AND still not fully paid
  status: OrderStatus;
  payment: PaymentStatus;
  createdAgo: string;
  createdDate: string;             // "06/28/2026" — actual date the order was placed
  attachmentsCount: number;
  attachments: string[];           // sample file names, e.g. ["artwork_v3.ai", "dieline.pdf"]
  thumbnailUrl?: string;           // first image asset (proof/artwork) — row thumbnail, like the board cards
  files?: Attachment[];            // richer per-file metadata
  productionNotes?: string;
  shippingMethod?: "Pickup" | "Ship";
  trackingRef?: string;
  refundedAmount?: number;         // set when status is Refunded
  refundReason?: string;
  customer?: CustomerProfile;      // rich customer block
  communications?: CommEntry[];    // per-order email / call / sms / IG log
  payments?: PaymentEntry[];       // per-order payment ledger
  timeline?: TimelineEntry[];      // per-order activity timeline (overrides buildTimeline)
  // ── Real-data extensions (populated by _data.ts from the shared DB) ──
  stageName?: string;              // LIVE board column name (real production stage)
  stageKind?: string | null;       // board column kind (normal/approval/done/exception)
  stageIndex?: number;             // index of the current stage within boardStages
  crmOrderNo?: string;             // ORD-2026-030X (real, from specs)
  quote?: QuoteRecord | null;      // the linked quote (QUO-2026-030X)
  quoteHistory?: QuoteRecord[];    // real quote records (currently the one linked quote)
  lastActivityAt?: string;         // formatted timestamp of the newest activity_log event
}
// ─── Mock dataset ────────────────────────────────────────
// Fixed "today" = 2026-07-01 for consistent age/overdue math.
// Product IDs and material IDs come straight from lib/catalog/catalog-v1.json
// so nothing has to be re-mapped when a quote converts to an order.
export const ORDERS: Order[] = [
  // ─── 1. Boris Boris / Grimeylyfe — In Production, Rush, repeat customer with 12 lifetime orders ───
  {
    refId: "135", quoteRefId: "QO-135",
    contact: "Boris Boris", company: "Grimeylyfe Records",
    createdBy: "Ernesto Navarro", ownerAvatar: "EN", ownerColor: "#22c55e",
    title: "LA Kush 9ml jar combos + matching 2x2 roll labels, soft touch + silver dot foil",
    lineItems: [
      { id: "l1", productId: 111, productName: "1oz Jar + Label Combo", productCategory: "Combos", materialId: 189, materialName: "Semi-Gloss Paper", quantity: 2500, widthIn: 2.5, heightIn: 1.65, sides: "S1", colorMode: "CMYK", finishingIds: [178], finishingLabels: ["Soft Touch Lam"], specialEffectIds: [209], specialEffectLabels: ["Silver Dot Foil"], unitPrice: 1.15, extended: 2875.00, comment: "Match previous batch — die 492" },
      { id: "l2", productId: 1, productName: "Roll Labels", productCategory: "Labels & Stickers", materialId: 184, materialName: "White BOPP", quantity: 5000, widthIn: 2, heightIn: 2, sides: "S1", colorMode: "CMYK", finishingIds: [178], finishingLabels: ["Soft Touch Lam"], specialEffectIds: [209], specialEffectLabels: ["Silver Dot Foil"], unitPrice: 0.42, extended: 2100.00 },
    ],
    total: 4975.00, received: 4975.00, balanceDue: 0,
    priority: "Rush", dueDate: "07/03/2026",
    status: "In Production", payment: "Paid",
    createdAgo: "1d ago", createdDate: "06/30/2026",
    attachmentsCount: 5, attachments: ["Grimeylyfe_LAKush_9ml_V3.ai", "Grimeylyfe_2x2_RollLabel_V2.ai", "Boris_die_492.dxf", "Silver_dot_foil_map.pdf", "Proof_Round2.pdf"],
    files: [
      { name: "Grimeylyfe_LAKush_9ml_V3.ai", sizeKB: 1240, kind: "ai" },
      { name: "Grimeylyfe_2x2_RollLabel_V2.ai", sizeKB: 860, kind: "ai" },
      { name: "Boris_die_492.dxf", sizeKB: 42, kind: "dxf" },
      { name: "Silver_dot_foil_map.pdf", sizeKB: 380, kind: "pdf" },
      { name: "Proof_Round2.pdf", sizeKB: 612, kind: "pdf" },
    ],
    productionNotes: "Rush — Boris confirmed 07/03 deadline for weekend drop. Foil layer needs re-registration on Karlville.",
    shippingMethod: "Ship", trackingRef: "1Z999AA10298475632",
    customer: { phone: "(310) 555-0142", email: "boris@grimeylyfe.co", city: "Los Angeles", state: "CA", lifetimeOrders: 12, lifetimeValue: 83240, returning: true },
    payments: [
      { method: "Wire", amount: 4975.00, date: "06/30/2026", ref: "WIRE-CHASE-88214", status: "Completed" },
    ],
    communications: [
      { channel: "email_in", author: "Boris Boris", subject: "Re: LA Kush drop — same as last batch", body: "Yes exact match to the last batch we ran. Same soft touch, same silver dot foil. Need it by Friday 3rd — we've got a drop on Saturday. Wired the full amount today.", at: "06/30 · 10:14 AM" },
      { channel: "email_out", author: "Ernesto Navarro", subject: "Wire received — order in production", body: "Boris — wire cleared this morning, jars + labels queued on Indigo 6K + Karlville for Wednesday run. Silver dot foil map is locked from your last batch so no reproof needed. Tracking will hit your inbox Thursday.", at: "06/30 · 11:02 AM", attachments: ["ORD-135_confirmation.pdf"] },
      { channel: "sms_out", author: "Ernesto Navarro", body: "Boris — you're all set, running Wed, ships Thursday. -Ernesto", at: "06/30 · 11:04 AM" },
      { channel: "call_in", author: "Boris Boris", body: "Called to confirm foil color matches last run — sent him a Karlville press-check photo, he approved.", at: "07/01 · 9:22 AM" },
    ],
    timeline: [
      { icon: "📝", tint: "#f97316", title: "Quote drafted", sub: "QO-135 · Boris confirmed sizes over the phone", at: "06/29 · 4:12 PM", actor: "Ernesto Navarro" },
      { icon: "✉", tint: "#3b82f6", title: "Quote sent", sub: "Email to boris@grimeylyfe.co", at: "06/29 · 4:15 PM", actor: "Ernesto Navarro" },
      { icon: "👁", tint: "#22c55e", title: "Customer viewed quote", sub: "Opened from mobile", at: "06/29 · 6:44 PM", actor: "Boris Boris" },
      { icon: "✓", tint: "#16a34a", title: "Quote approved", sub: "Boris confirmed via SMS", at: "06/30 · 9:58 AM", actor: "Boris Boris" },
      { icon: "💵", tint: "#16a34a", title: "Wire received — $4,975.00", sub: "Chase wire · confirmation 88214", at: "06/30 · 10:47 AM" },
      { icon: "📦", tint: "#8b5cf6", title: "Order created", sub: "ORD-135 · from QO-135", at: "06/30 · 11:00 AM", ref: "ORD-135" },
      { icon: "🎨", tint: "#a78bfa", title: "Assigned to designer", sub: "Marianna — reusing last batch's approved files", at: "06/30 · 11:20 AM", actor: "Marianna" },
      { icon: "✓", tint: "#16a34a", title: "Files re-approved by customer", sub: "Boris signed off — identical to last batch", at: "06/30 · 2:34 PM", actor: "Boris Boris" },
      { icon: "🏭", tint: "#06b6d4", title: "On press — Indigo 6K", sub: "Labels running · press operator Arsen", at: "07/01 · 8:15 AM", actor: "Arsen" },
      { icon: "🏭", tint: "#06b6d4", title: "Foil layer on Karlville", sub: "Silver dot foil registration re-set for HP 72", at: "07/01 · 10:00 AM", actor: "Arsen" },
    ],
  },
  // ─── 2. Prime Cannabis — In Production, Net-30 past due ───
  {
    refId: "130", quoteRefId: "QO-130",
    contact: "Terrence Blake", company: "Prime Cannabis",
    createdBy: "Maria Hakobyan", ownerAvatar: "MH", ownerColor: "#f97316",
    title: "9-SKU clear label run — matte lam + raised UV highlights, 2000 per SKU",
    lineItems: [
      { id: "l1", productId: 1, productName: "Roll Labels", productCategory: "Labels & Stickers", materialId: 200, materialName: "Clear BOPP", quantity: 18000, widthIn: 2, heightIn: 3, sides: "S1", colorMode: "CMYK", finishingIds: [177], finishingLabels: ["Matte Lam"], specialEffectIds: [230], specialEffectLabels: ["Raised UV 50µ"], unitPrice: 0.31, extended: 5580.00, comment: "9 designs · 2000 each" },
    ],
    total: 5580.00, received: 0, balanceDue: 5580.00,
    paymentTerms: "Net-30", paymentDueDate: "06/10/2026", paymentOverdue: true,
    priority: "High", dueDate: "07/05/2026",
    status: "In Production", payment: "Unpaid",
    createdAgo: "6d ago", createdDate: "06/25/2026",
    attachmentsCount: 4, attachments: ["Prime_9SKU_Master.ai", "Raised_UV_map.pdf", "Print_Ready_v2.pdf", "Reseller_Cert_PrimeCannabis.pdf"],
    files: [
      { name: "Prime_9SKU_Master.ai", sizeKB: 3420, kind: "ai" },
      { name: "Raised_UV_map.pdf", sizeKB: 512, kind: "pdf" },
      { name: "Print_Ready_v2.pdf", sizeKB: 1840, kind: "pdf" },
      { name: "Reseller_Cert_PrimeCannabis.pdf", sizeKB: 218, kind: "pdf" },
    ],
    shippingMethod: "Ship",
    productionNotes: "Ran on Indigo 6K — clean pass. Raised UV cleared, awaiting collections before shipping.",
    customer: { phone: "(213) 555-0177", email: "terrence@primecannabis.co", city: "Long Beach", state: "CA", lifetimeOrders: 6, lifetimeValue: 41200, returning: true },
    payments: [],
    communications: [
      { channel: "email_out", author: "Maria Hakobyan", subject: "Net-30 invoice past due — ORD-130", body: "Hi Terrence — flagging that this invoice is now 21 days past our Net-30 terms. Order is complete and boxed but I can't release until payment clears. Can we get an ETA today?", at: "07/01 · 8:30 AM" },
      { channel: "email_in", author: "Terrence Blake", subject: "Re: Net-30 invoice past due", body: "Maria — sorry for the lag. ACH went out yesterday, should hit your account within 24-48h. I'll forward the confirmation.", at: "07/01 · 10:12 AM" },
      { channel: "note", author: "Maria Hakobyan", body: "Terrence usually pays same-day. This is his first late. Flagged with Hayk — holding shipment until ACH clears.", at: "07/01 · 10:20 AM" },
    ],
  },
  // ─── 3. Amazi Amazi / Trap Snacks — In Production, Net-30 past due, repeat customer ───
  {
    refId: "128", quoteRefId: "QO-128",
    contact: "Amazi Amazi", company: "Trap Snacks",
    createdBy: "Ernesto Navarro", ownerAvatar: "EN", ownerColor: "#22c55e",
    title: "Terp Head 6-SKU snack pouches + display boxes — soft touch + spot UV both sides",
    lineItems: [
      { id: "l1", productId: 30, productName: "Stand Up Pouches", productCategory: "Bags & Pouches", materialId: 184, materialName: "White BOPP", quantity: 2500, widthIn: 5, heightIn: 8, sides: "S2", colorMode: "CMYK", finishingIds: [178], finishingLabels: ["Soft Touch Lam"], specialEffectIds: [230], specialEffectLabels: ["Raised UV 50µ"], unitPrice: 1.42, extended: 3550.00, comment: "6 SKUs · ~427 pcs each" },
      { id: "l2", productId: 171, productName: "Display box", productCategory: "Packaging & Boxes", materialId: 198, materialName: "18pt White SBS", quantity: 500, widthIn: 8, heightIn: 6, sides: "S1", colorMode: "CMYK", finishingIds: [178], finishingLabels: ["Soft Touch Lam"], specialEffectIds: [230], specialEffectLabels: ["Raised UV 50µ"], unitPrice: 3.20, extended: 1600.00 },
    ],
    total: 5150.00, received: 2000.00, balanceDue: 3150.00,
    paymentTerms: "Net-30", paymentDueDate: "06/05/2026", paymentOverdue: true,
    priority: "Normal", dueDate: "07/04/2026",
    status: "In Production", payment: "Partial",
    createdAgo: "5d ago", createdDate: "06/26/2026",
    attachmentsCount: 6, attachments: ["TrapSnacks_Pouch_6SKU.ai", "TrapSnacks_DisplayBox.ai", "TerpHead_die.dxf", "RaisedUV_map_front.pdf", "RaisedUV_map_back.pdf", "Proof_Round1.pdf"],
    files: [
      { name: "TrapSnacks_Pouch_6SKU.ai", sizeKB: 4820, kind: "ai" },
      { name: "TrapSnacks_DisplayBox.ai", sizeKB: 1240, kind: "ai" },
      { name: "TerpHead_die.dxf", sizeKB: 38, kind: "dxf" },
      { name: "RaisedUV_map_front.pdf", sizeKB: 420, kind: "pdf" },
      { name: "RaisedUV_map_back.pdf", sizeKB: 418, kind: "pdf" },
      { name: "Proof_Round1.pdf", sizeKB: 1120, kind: "pdf" },
    ],
    productionNotes: "Pouches ran clean on Karlville. Display boxes queued behind Boris job.",
    shippingMethod: "Ship",
    customer: { phone: "(818) 555-0233", email: "amazi@trapsnacks.co", city: "Van Nuys", state: "CA", lifetimeOrders: 8, lifetimeValue: 52180, returning: true },
    payments: [
      { method: "ACH", amount: 2000.00, date: "06/26/2026", ref: "ACH-BOA-11284", status: "Completed" },
    ],
    communications: [
      { channel: "email_in", author: "Amazi Amazi", subject: "6 SKU snack drop — same terp head die", body: "Ernesto — running the fall drop, same 6 SKUs as spring. Sending $2k deposit today, balance on delivery per usual. Need by 4th of July weekend.", at: "06/26 · 9:14 AM" },
      { channel: "email_out", author: "Ernesto Navarro", subject: "Re: 6 SKU snack drop", body: "Amazi — got it. Deposit received, order queued. Terp head die is still on file. Balance ($3,150) is Net-30, tracking Wed 07/02.", at: "06/26 · 11:05 AM" },
      { channel: "sms_out", author: "Ernesto Navarro", body: "Amazi — heads up your Net-30 hit 06/05, need to settle the $3,150 balance to release shipment. Zelle or ACH works.", at: "07/01 · 8:45 AM" },
      { channel: "sms_in", author: "Amazi Amazi", body: "My bad — Zelle going out this afternoon. Sorry for the delay.", at: "07/01 · 9:02 AM" },
    ],
  },
  // ─── 4. Nicole Han — In Production, Rush, cosmetic labels + pouches ───
  {
    refId: "126", quoteRefId: "QO-126",
    contact: "Nicole Han", company: "Han Beauty Co",
    createdBy: "Manny Carlo", ownerAvatar: "MC", ownerColor: "#3b82f6",
    title: "Serum bottle labels + stand-up pouches for launch — Rush, ship by 07/03",
    lineItems: [
      { id: "l1", productId: 1, productName: "Roll Labels", productCategory: "Labels & Stickers", materialId: 200, materialName: "Clear BOPP", quantity: 5000, widthIn: 2, heightIn: 4, sides: "S1", colorMode: "CMYK", finishingIds: [178], finishingLabels: ["Soft Touch Lam"], specialEffectIds: [206], specialEffectLabels: ["Gold Foil"], unitPrice: 0.58, extended: 2900.00 },
      { id: "l2", productId: 30, productName: "Stand Up Pouches", productCategory: "Bags & Pouches", materialId: 175, materialName: "Silver Virgin (MET PET)", quantity: 1000, widthIn: 4, heightIn: 6, sides: "S2", colorMode: "CMYK", finishingIds: [177], finishingLabels: ["Matte Lam"], specialEffectIds: [206], specialEffectLabels: ["Gold Foil"], unitPrice: 1.35, extended: 1350.00 },
    ],
    total: 4250.00, received: 4250.00, balanceDue: 0,
    priority: "Rush", dueDate: "07/03/2026",
    status: "In Production", payment: "Paid",
    createdAgo: "3d ago", createdDate: "06/28/2026",
    attachmentsCount: 4, attachments: ["HanBeauty_Serum_2x4.ai", "HanBeauty_Pouch_4x6.ai", "Gold_foil_map.pdf", "Nicole_Approved_Proof.pdf"],
    files: [
      { name: "HanBeauty_Serum_2x4.ai", sizeKB: 920, kind: "ai" },
      { name: "HanBeauty_Pouch_4x6.ai", sizeKB: 1180, kind: "ai" },
      { name: "Gold_foil_map.pdf", sizeKB: 340, kind: "pdf" },
      { name: "Nicole_Approved_Proof.pdf", sizeKB: 780, kind: "pdf" },
    ],
    productionNotes: "Rush — Nicole needs for 07/05 launch event. Ran ahead of Boris on Indigo 15K.",
    shippingMethod: "Ship", trackingRef: "1Z999AA10412873441",
    customer: { phone: "(626) 555-0918", email: "nicole@hanbeauty.co", city: "Pasadena", state: "CA", lifetimeOrders: 3, lifetimeValue: 9820, returning: true },
    payments: [
      { method: "Card", amount: 4250.00, date: "06/28/2026", ref: "VISA •••• 4419", status: "Completed" },
    ],
    communications: [
      { channel: "email_in", author: "Nicole Han", subject: "Launch order — need by July 3rd", body: "Manny — pushing our launch to July 5. Can you get labels + pouches to me by the 3rd? Files attached. Going with clear label + gold foil, matte pouch.", at: "06/28 · 10:14 AM", attachments: ["HanBeauty_files.zip"] },
      { channel: "email_out", author: "Manny Carlo", subject: "Re: Launch order — you're set", body: "Nicole — locked in. Rush surcharge is $180 (included). Charged card. Proof coming end of day, ship by 07/03.", at: "06/28 · 11:22 AM" },
      { channel: "ig_in", author: "Nicole Han", body: "You're the best 🙏", at: "06/28 · 11:30 AM" },
      { channel: "call_out", author: "Manny Carlo", body: "Called Nicole to confirm gold foil vs. copper — she confirmed gold. Ran proof.", at: "06/29 · 2:15 PM" },
      { channel: "email_out", author: "Manny Carlo", subject: "Proof — please approve", body: "Attached proof round 1. Give it a look and approve so we can hit press first thing tomorrow.", at: "06/29 · 4:40 PM", attachments: ["Proof_Round1.pdf"] },
      { channel: "email_in", author: "Nicole Han", subject: "Re: Proof", body: "Approved!", at: "06/29 · 5:02 PM" },
    ],
  },
  // ─── 5. Ivy Bloom / Ivy Botanicals — In Production ───
  {
    refId: "124", quoteRefId: "QO-124",
    contact: "Ivy Bloom", company: "Ivy Botanicals",
    createdBy: "Marianna", ownerAvatar: "MA", ownerColor: "#a78bfa",
    title: "Cosmetic bottle labels + Hand Cream boxes — Pantone 2035C match",
    lineItems: [
      { id: "l1", productId: 1, productName: "Roll Labels", productCategory: "Labels & Stickers", materialId: 184, materialName: "White BOPP", quantity: 5000, widthIn: 2.25, heightIn: 3.5, sides: "S1", colorMode: "Pantone", finishingIds: [177], finishingLabels: ["Matte Lam"], specialEffectIds: [], specialEffectLabels: [], unitPrice: 0.44, extended: 2200.00, comment: "Pantone 2035C match on floral illustration" },
      { id: "l2", productId: 189, productName: "Flip-Top Hinged Lid Box", productCategory: "Packaging & Boxes", materialId: 198, materialName: "18pt White SBS", quantity: 1000, widthIn: 4, heightIn: 2.5, sides: "S1", colorMode: "CMYK", finishingIds: [178], finishingLabels: ["Soft Touch Lam"], specialEffectIds: [], specialEffectLabels: [], unitPrice: 2.85, extended: 2850.00 },
    ],
    total: 5050.00, received: 2500.00, balanceDue: 2550.00,
    paymentTerms: "Net-15", paymentDueDate: "06/12/2026", paymentOverdue: true,
    priority: "Normal", dueDate: "07/08/2026",
    status: "In Production", payment: "Partial",
    createdAgo: "4d ago", createdDate: "06/27/2026",
    attachmentsCount: 3, attachments: ["Ivy_Botanicals_Label_V4.ai", "Ivy_HandCream_Box_V2.ai", "Pantone_2035C_swatch.pdf"],
    files: [
      { name: "Ivy_Botanicals_Label_V4.ai", sizeKB: 2140, kind: "ai" },
      { name: "Ivy_HandCream_Box_V2.ai", sizeKB: 1890, kind: "ai" },
      { name: "Pantone_2035C_swatch.pdf", sizeKB: 180, kind: "pdf" },
    ],
    productionNotes: "Pantone match dialed on Indigo 15K — Arsen confirmed 2035C dead on.",
    shippingMethod: "Ship",
    customer: { phone: "(415) 555-0620", email: "ivy@ivybotanicals.com", city: "San Francisco", state: "CA", lifetimeOrders: 2, lifetimeValue: 8300, returning: true },
    payments: [
      { method: "ACH", amount: 2500.00, date: "06/27/2026", ref: "ACH-WELLS-52911", status: "Completed" },
    ],
    communications: [
      { channel: "email_in", author: "Ivy Bloom", subject: "Fall collection — labels + boxes", body: "Hi — running the fall collection. Attached artwork. Pantone match on the floral is critical — 2035C. Boxes go with the hand cream line.", at: "06/26 · 3:12 PM", attachments: ["Ivy_files.zip"] },
      { channel: "email_out", author: "Marianna", subject: "Re: Fall collection", body: "Ivy — got it. Quote attached. Pantone 2035C is on Indigo 15K's approved swatch library so we're good. Turnaround 10 business days.", at: "06/26 · 5:20 PM", attachments: ["QO-124.pdf"] },
      { channel: "email_in", author: "Ivy Bloom", subject: "Re: Fall collection", body: "Approved, sending ACH.", at: "06/27 · 9:04 AM" },
    ],
  },
  // ─── 6. Grim Lawd — In Production, tax exempt ───
  {
    refId: "122", quoteRefId: "QO-122",
    contact: "Grim Lawd", company: "Grimeylyfe Records",
    createdBy: "Ernesto Navarro", ownerAvatar: "EN", ownerColor: "#22c55e",
    title: "Merch drop — 2500 postcards + 5000 business cards + tour poster labels",
    lineItems: [
      { id: "l1", productId: 8, productName: "Postcards", productCategory: "Marketing Materials", materialId: 199, materialName: "Matte 14pt Card Stock", quantity: 2500, widthIn: 4, heightIn: 6, sides: "S2", colorMode: "CMYK", finishingIds: [179], finishingLabels: ["Gloss Lam"], specialEffectIds: [], specialEffectLabels: [], unitPrice: 0.32, extended: 800.00 },
      { id: "l2", productId: 2, productName: "Business Cards", productCategory: "Marketing Materials", materialId: 199, materialName: "Matte 14pt Card Stock", quantity: 5000, widthIn: 3.5, heightIn: 2, sides: "S2", colorMode: "CMYK", finishingIds: [178], finishingLabels: ["Soft Touch Lam"], specialEffectIds: [209], specialEffectLabels: ["Silver Dot Foil"], unitPrice: 0.28, extended: 1400.00 },
      { id: "l3", productId: 1, productName: "Roll Labels", productCategory: "Labels & Stickers", materialId: 184, materialName: "White BOPP", quantity: 3000, widthIn: 3, heightIn: 4, sides: "S1", colorMode: "CMYK", finishingIds: [177], finishingLabels: ["Matte Lam"], specialEffectIds: [], specialEffectLabels: [], unitPrice: 0.36, extended: 1080.00, comment: "Tour poster stickers — 8 designs" },
    ],
    total: 3280.00, received: 3280.00, balanceDue: 0,
    priority: "Normal", dueDate: "07/06/2026",
    status: "In Production", payment: "Tax Exempt",
    createdAgo: "5d ago", createdDate: "06/26/2026",
    attachmentsCount: 5, attachments: ["Grim_Postcards.ai", "Grim_BizCard_V3.ai", "Tour_Sticker_8Designs.ai", "Grimeylyfe_Reseller.pdf", "Proof_Bundle.pdf"],
    files: [
      { name: "Grim_Postcards.ai", sizeKB: 3210, kind: "ai" },
      { name: "Grim_BizCard_V3.ai", sizeKB: 1420, kind: "ai" },
      { name: "Tour_Sticker_8Designs.ai", sizeKB: 4820, kind: "ai" },
      { name: "Grimeylyfe_Reseller.pdf", sizeKB: 240, kind: "pdf" },
      { name: "Proof_Bundle.pdf", sizeKB: 1840, kind: "pdf" },
    ],
    productionNotes: "Ran on Indigo 6K — press operator Arsen. Silver dot foil on bizcards clean on 2nd pass.",
    shippingMethod: "Pickup",
    customer: { phone: "(310) 555-0142", email: "boris@grimeylyfe.co", city: "Los Angeles", state: "CA", lifetimeOrders: 12, lifetimeValue: 83240, returning: true },
    payments: [
      { method: "Wire", amount: 3280.00, date: "06/26/2026", ref: "WIRE-CHASE-71822", status: "Completed" },
    ],
    communications: [
      { channel: "email_in", author: "Grim Lawd", subject: "Tour merch — cards + stickers + postcards", body: "Ernesto — need the full tour merch package. Same silver dot on the bizcards as before. Tour sticker files attached — 8 designs, 3000 total split across.", at: "06/26 · 11:04 AM" },
      { channel: "email_out", author: "Ernesto Navarro", subject: "Tour merch — locked in", body: "Grim — done. Reseller cert on file so tax exempt. Pickup at the shop 07/06.", at: "06/26 · 12:15 PM" },
    ],
  },  // ─── 7. Safe Care Packaging — In Production, awaiting resale cert ───
  {
    refId: "120", quoteRefId: "QO-120",
    contact: "Corey Nishimura", company: "SafeCare Packaging",
    createdBy: "Ernesto Navarro", ownerAvatar: "EN", ownerColor: "#22c55e",
    title: "Body Lotion Boxes — 3000 pcs matte, white cardstock only",
    lineItems: [
      { id: "l1", productId: 165, productName: "Body Lotion Box", productCategory: "Packaging & Boxes", materialId: 198, materialName: "18pt White SBS", quantity: 3000, widthIn: 2.5, heightIn: 6, sides: "S1", colorMode: "CMYK", finishingIds: [177], finishingLabels: ["Matte Lam"], specialEffectIds: [], specialEffectLabels: [], unitPrice: 1.85, extended: 5550.00, comment: "White cardstock only — no kraft" },
    ],
    total: 5550.00, received: 5550.00, balanceDue: 0,
    priority: "Normal", dueDate: "07/07/2026",
    status: "In Production", payment: "Pending Tax Review",
    createdAgo: "3d ago", createdDate: "06/28/2026",
    attachmentsCount: 3, attachments: ["SafeCare_BodyLotion_Front_V3.pdf", "SafeCare_BodyLotion_Back_V3.pdf", "Reseller_Cert_SafeCare.pdf"],
    files: [
      { name: "SafeCare_BodyLotion_Front_V3.pdf", sizeKB: 246, kind: "pdf" },
      { name: "SafeCare_BodyLotion_Back_V3.pdf", sizeKB: 262, kind: "pdf" },
      { name: "Reseller_Cert_SafeCare.pdf", sizeKB: 189, kind: "pdf" },
    ],
    productionNotes: "White SBS run on Indigo 15K. Tax review pending — Corey submitted resale cert, waiting on Nikolay to verify.",
    shippingMethod: "Ship",
    customer: { phone: "(714) 555-0311", email: "corey@safecarepkg.com", city: "Anaheim", state: "CA", lifetimeOrders: 4, lifetimeValue: 22400, returning: true },
    payments: [
      { method: "ACH", amount: 5550.00, date: "06/28/2026", ref: "ACH-BOA-63914", status: "Completed" },
    ],
    communications: [
      { channel: "email_in", author: "Corey Nishimura", subject: "Body lotion boxes — reorder", body: "Same file as last run, quantity bumped to 3000. Reseller cert attached — should be on file already but sending fresh.", at: "06/28 · 10:20 AM", attachments: ["SafeCare_files.zip", "Reseller_Cert.pdf"] },
      { channel: "email_out", author: "Ernesto Navarro", subject: "Re: Reorder", body: "Corey — got it. Cert going to tax review, we'll flip you to Tax Exempt once cleared. In the meantime running production, since payment cleared.", at: "06/28 · 11:45 AM" },
    ],
  },
  // ─── 8. Global 448 — In Production, die-cut stickers ───
  {
    refId: "118", quoteRefId: "QO-118",
    contact: "Ricky Ortiz", company: "Global 448",
    createdBy: "Manny Carlo", ownerAvatar: "MC", ownerColor: "#3b82f6",
    title: "Die Cut Stickers — 4 designs, 2500 each, holographic",
    lineItems: [
      { id: "l1", productId: 24, productName: "Die Cut / Kiss Cut Stickers", productCategory: "Labels & Stickers", materialId: 224, materialName: "Rainbow Holographic BOPP", quantity: 10000, widthIn: 3, heightIn: 3, sides: "S1", colorMode: "CMYK", finishingIds: [179], finishingLabels: ["Gloss Lam"], specialEffectIds: [], specialEffectLabels: [], unitPrice: 0.38, extended: 3800.00, comment: "4 designs · 2500 each" },
    ],
    total: 3800.00, received: 3800.00, balanceDue: 0,
    priority: "Normal", dueDate: "07/10/2026",
    status: "In Production", payment: "Paid",
    createdAgo: "6d ago", createdDate: "06/25/2026",
    attachmentsCount: 4, attachments: ["Global448_Stickers_4Designs.ai", "Dieline_Approved.pdf", "Holo_swatch.pdf", "Proof_Round1.pdf"],
    files: [
      { name: "Global448_Stickers_4Designs.ai", sizeKB: 2840, kind: "ai" },
      { name: "Dieline_Approved.pdf", sizeKB: 320, kind: "pdf" },
      { name: "Holo_swatch.pdf", sizeKB: 210, kind: "pdf" },
      { name: "Proof_Round1.pdf", sizeKB: 940, kind: "pdf" },
    ],
    shippingMethod: "Ship",
    customer: { phone: "(619) 555-0872", email: "ricky@global448.com", city: "San Diego", state: "CA", lifetimeOrders: 5, lifetimeValue: 18200, returning: true },
    payments: [
      { method: "Card", amount: 3800.00, date: "06/25/2026", ref: "MC •••• 8830", status: "Completed" },
    ],
    communications: [
      { channel: "email_in", author: "Ricky Ortiz", subject: "Holo stickers — reorder", body: "Manny — 4 designs, 2500 each. Same holo material as last time. Files below.", at: "06/25 · 8:12 AM" },
      { channel: "email_out", author: "Manny Carlo", subject: "Re: Holo stickers", body: "Ricky — got it. Charged card, running week of 07/07. Ship by 07/10.", at: "06/25 · 9:30 AM" },
    ],
  },
  // ─── 9. Gold Custom Packaging — Ready to Ship, large-volume ───
  {
    refId: "115", quoteRefId: "QO-115",
    contact: "Alex Golden", company: "Gold Custom Packaging",
    createdBy: "Ernesto Navarro", ownerAvatar: "EN", ownerColor: "#22c55e",
    title: "Mylar stand-up pouches — 25,000 pcs across 4 SKUs, CR zippers",
    lineItems: [
      { id: "l1", productId: 33, productName: "Child-Resistant Stand Up Pouches", productCategory: "Bags & Pouches", materialId: 175, materialName: "Silver Virgin (MET PET)", quantity: 25000, widthIn: 5, heightIn: 8, sides: "S2", colorMode: "CMYK", finishingIds: [177], finishingLabels: ["Matte Lam"], specialEffectIds: [], specialEffectLabels: [], unitPrice: 0.92, extended: 23000.00, comment: "4 SKUs · CR Zipper Style 8511U" },
    ],
    total: 23000.00, received: 23000.00, balanceDue: 0,
    priority: "Normal", dueDate: "07/02/2026",
    status: "Ready to Ship", payment: "Paid",
    createdAgo: "12d ago", createdDate: "06/19/2026",
    attachmentsCount: 6, attachments: ["Gold_Pouch_4SKU_Master.ai", "Zipper_spec_8511U.pdf", "Dieline_Approved.pdf", "Print_Ready_v2.pdf", "Front_Proof.pdf", "Back_Proof.pdf"],
    files: [
      { name: "Gold_Pouch_4SKU_Master.ai", sizeKB: 8420, kind: "ai" },
      { name: "Zipper_spec_8511U.pdf", sizeKB: 320, kind: "pdf" },
      { name: "Dieline_Approved.pdf", sizeKB: 410, kind: "pdf" },
      { name: "Print_Ready_v2.pdf", sizeKB: 3120, kind: "pdf" },
      { name: "Front_Proof.pdf", sizeKB: 1280, kind: "pdf" },
      { name: "Back_Proof.pdf", sizeKB: 1240, kind: "pdf" },
    ],
    productionNotes: "Ran on Karlville over 3 shifts. QC passed 06/30. Palletized, awaiting freight pickup.",
    shippingMethod: "Ship", trackingRef: "SAIA-88214771",
    customer: { phone: "(818) 555-1240", email: "alex@goldpkg.com", city: "Sun Valley", state: "CA", lifetimeOrders: 9, lifetimeValue: 148300, returning: true },
    payments: [
      { method: "Wire", amount: 23000.00, date: "06/20/2026", ref: "WIRE-CHASE-91188", status: "Completed" },
    ],
    communications: [
      { channel: "email_in", author: "Alex Golden", subject: "25K pouch reorder", body: "Same 4 SKUs, quantity bumped to 25K total. Wire going out Monday.", at: "06/19 · 2:14 PM" },
      { channel: "email_out", author: "Ernesto Navarro", subject: "Re: 25K reorder", body: "Alex — got it. Karlville has capacity next week. Wire received 06/20, in production.", at: "06/20 · 10:45 AM" },
      { channel: "email_out", author: "Ernesto Navarro", subject: "Palletized — freight pickup Wednesday", body: "Alex — all 25K palletized on 2 skids. SAIA freight scheduled Wed 07/02. Tracking SAIA-88214771.", at: "06/30 · 4:30 PM" },
    ],
  },
  // ─── 10. Rise Botanicals — Ready to Ship ───
  {
    refId: "113", quoteRefId: "QO-113",
    contact: "Marcus King", company: "Rise Botanicals",
    createdBy: "Maria Hakobyan", ownerAvatar: "MH", ownerColor: "#f97316",
    title: "Bottle labels — 8000 pcs, spot UV highlights on floral",
    lineItems: [
      { id: "l1", productId: 1, productName: "Roll Labels", productCategory: "Labels & Stickers", materialId: 200, materialName: "Clear BOPP", quantity: 8000, widthIn: 3, heightIn: 4, sides: "S1", colorMode: "CMYK", finishingIds: [], finishingLabels: [], specialEffectIds: [226], specialEffectLabels: ["Raised UV 20µ"], unitPrice: 0.29, extended: 2320.00 },
    ],
    total: 2320.00, received: 2320.00, balanceDue: 0,
    priority: "Normal", dueDate: "07/01/2026",
    status: "Ready to Ship", payment: "Paid",
    createdAgo: "9d ago", createdDate: "06/22/2026",
    attachmentsCount: 3, attachments: ["Rise_Bottle_Label_V4.ai", "SpotUV_map.pdf", "Print_Ready_v2.pdf"],
    files: [
      { name: "Rise_Bottle_Label_V4.ai", sizeKB: 1120, kind: "ai" },
      { name: "SpotUV_map.pdf", sizeKB: 320, kind: "pdf" },
      { name: "Print_Ready_v2.pdf", sizeKB: 890, kind: "pdf" },
    ],
    productionNotes: "Ran clean. Roll direction: Left Out. Ready for UPS pickup.",
    shippingMethod: "Ship",
    customer: { phone: "(707) 555-0399", email: "marcus@risebotanicals.co", city: "Santa Rosa", state: "CA", lifetimeOrders: 3, lifetimeValue: 6120, returning: true },
    payments: [
      { method: "Card", amount: 2320.00, date: "06/22/2026", ref: "VISA •••• 2214", status: "Completed" },
    ],
    communications: [
      { channel: "email_in", author: "Marcus King", subject: "Bottle labels for Q3", body: "Rerun of the Q2 label, same file. Bumping to 8000. Please confirm.", at: "06/22 · 11:14 AM" },
      { channel: "email_out", author: "Maria Hakobyan", subject: "Re: Q3 bottle labels", body: "Marcus — done. Turnaround 8-10 business days, tracking will hit 07/01.", at: "06/22 · 12:30 PM" },
    ],
  },  // ─── 11. Vick May Day — Shipped, folding cartons ───
  {
    refId: "107", quoteRefId: "QO-107",
    contact: "Vick May Day", company: "May Day Studios",
    createdBy: "Manny Carlo", ownerAvatar: "MC", ownerColor: "#3b82f6",
    title: "Mini Tuck End Boxes — 2000 pcs, gold foil logo",
    lineItems: [
      { id: "l1", productId: 167, productName: "Mini Tuck End Box", productCategory: "Packaging & Boxes", materialId: 198, materialName: "18pt White SBS", quantity: 2000, widthIn: 3, heightIn: 4, sides: "S1", colorMode: "CMYK", finishingIds: [177], finishingLabels: ["Matte Lam"], specialEffectIds: [206], specialEffectLabels: ["Gold Foil"], unitPrice: 1.65, extended: 3300.00 },
    ],
    total: 3300.00, received: 3300.00, balanceDue: 0,
    priority: "Normal", dueDate: "06/28/2026",
    status: "Shipped", payment: "Paid",
    createdAgo: "14d ago", createdDate: "06/17/2026",
    attachmentsCount: 3, attachments: ["MayDay_MiniTuck_V2.ai", "Dieline_Approved.pdf", "Gold_foil_map.pdf"],
    files: [
      { name: "MayDay_MiniTuck_V2.ai", sizeKB: 1720, kind: "ai" },
      { name: "Dieline_Approved.pdf", sizeKB: 280, kind: "pdf" },
      { name: "Gold_foil_map.pdf", sizeKB: 210, kind: "pdf" },
    ],
    shippingMethod: "Ship", trackingRef: "1Z999AA10778112034",
    customer: { phone: "(213) 555-0448", email: "vick@maydaystudios.co", city: "Los Angeles", state: "CA", lifetimeOrders: 1, lifetimeValue: 3300, returning: false },
    payments: [
      { method: "Card", amount: 3300.00, date: "06/17/2026", ref: "AMEX •••• 1008", status: "Completed" },
    ],
    communications: [
      { channel: "email_in", author: "Vick May Day", subject: "First order — mini tuck boxes", body: "Hey — first time working with you. Attached artwork for 2000 tuck end boxes with gold foil logo. Please quote.", at: "06/16 · 3:22 PM" },
      { channel: "email_out", author: "Manny Carlo", subject: "Re: First order", body: "Vick — welcome! Quote attached. If it looks good I'll send a payment link.", at: "06/16 · 5:14 PM", attachments: ["QO-107.pdf"] },
      { channel: "email_in", author: "Vick May Day", subject: "Re: First order", body: "Looks good — paid. When will it ship?", at: "06/17 · 8:30 AM" },
      { channel: "email_out", author: "Manny Carlo", subject: "Shipped — UPS", body: "Vick — shipped today. Tracking 1Z999AA10778112034.", at: "06/29 · 4:15 PM" },
    ],
  },
  // ─── 12. Cane Company — Shipped ───
  {
    refId: "104", quoteRefId: "QO-104",
    contact: "Ruben Cane", company: "Cane Company",
    createdBy: "Ernesto Navarro", ownerAvatar: "EN", ownerColor: "#22c55e",
    title: "White BOPP labels — 4000 pcs, matte lam",
    lineItems: [
      { id: "l1", productId: 1, productName: "Roll Labels", productCategory: "Labels & Stickers", materialId: 184, materialName: "White BOPP", quantity: 4000, widthIn: 2.5, heightIn: 3.5, sides: "S1", colorMode: "CMYK", finishingIds: [177], finishingLabels: ["Matte Lam"], specialEffectIds: [], specialEffectLabels: [], unitPrice: 0.28, extended: 1120.00 },
    ],
    total: 1120.00, received: 1120.00, balanceDue: 0,
    priority: "Normal", dueDate: "06/27/2026",
    status: "Shipped", payment: "Paid",
    createdAgo: "13d ago", createdDate: "06/18/2026",
    attachmentsCount: 2, attachments: ["Cane_Label_V1.ai", "Print_Ready_v2.pdf"],
    files: [
      { name: "Cane_Label_V1.ai", sizeKB: 780, kind: "ai" },
      { name: "Print_Ready_v2.pdf", sizeKB: 620, kind: "pdf" },
    ],
    shippingMethod: "Ship", trackingRef: "1Z999AA10229384765",
    customer: { phone: "(760) 555-0122", email: "ruben@canecompany.co", city: "Palm Springs", state: "CA", lifetimeOrders: 2, lifetimeValue: 2340, returning: true },
    payments: [
      { method: "ACH", amount: 1120.00, date: "06/18/2026", ref: "ACH-CHASE-40182", status: "Completed" },
    ],
    communications: [
      { channel: "email_in", author: "Ruben Cane", subject: "Reorder labels", body: "Same as last time, 4000 pcs.", at: "06/18 · 9:14 AM" },
      { channel: "email_out", author: "Ernesto Navarro", subject: "Re: Reorder", body: "Ruben — running this week, ships 06/27.", at: "06/18 · 10:22 AM" },
    ],
  },
  // ─── 13. Cali Papers — Shipped, vinyl banners ───
  {
    refId: "101", quoteRefId: "QO-101",
    contact: "Ana Rivera", company: "Cali Papers",
    createdBy: "Maria Hakobyan", ownerAvatar: "MH", ownerColor: "#f97316",
    title: "Two 4x8 vinyl banners for expo booth",
    lineItems: [
      { id: "l1", productId: 35, productName: "Vinyl Banners", productCategory: "Wide Format", materialId: 190, materialName: "13oz Matte Vinyl", quantity: 2, widthIn: 96, heightIn: 48, sides: "S1", colorMode: "CMYK", finishingIds: [], finishingLabels: ["Hemmed + Grommets"], specialEffectIds: [], specialEffectLabels: [], unitPrice: 240.00, extended: 480.00, comment: "SQFT sizing · 32 sqft each" },
    ],
    total: 480.00, received: 480.00, balanceDue: 0,
    priority: "Normal", dueDate: "06/25/2026",
    status: "Shipped", payment: "Paid",
    createdAgo: "15d ago", createdDate: "06/16/2026",
    attachmentsCount: 2, attachments: ["CaliPapers_Banner_4x8.pdf", "Booth_layout.pdf"],
    files: [
      { name: "CaliPapers_Banner_4x8.pdf", sizeKB: 4820, kind: "pdf" },
      { name: "Booth_layout.pdf", sizeKB: 320, kind: "pdf" },
    ],
    shippingMethod: "Ship", trackingRef: "1Z999AA10665128374",
    customer: { phone: "(408) 555-0788", email: "ana@calipapers.com", city: "San Jose", state: "CA", lifetimeOrders: 1, lifetimeValue: 480, returning: false },
    payments: [
      { method: "Card", amount: 480.00, date: "06/16/2026", ref: "VISA •••• 5581", status: "Completed" },
    ],
    communications: [
      { channel: "email_in", author: "Ana Rivera", subject: "Banners for expo", body: "Need two 4x8 banners for our July 20 expo. Hemmed with grommets.", at: "06/16 · 1:04 PM" },
      { channel: "email_out", author: "Maria Hakobyan", subject: "Re: Banners", body: "Ana — quote $480. Turnaround 5 business days.", at: "06/16 · 2:15 PM" },
      { channel: "email_in", author: "Ana Rivera", subject: "Re: Banners", body: "Approved, paid.", at: "06/16 · 3:00 PM" },
    ],
  },
  // ─── 14. Green Leaf Wellness — Delivered ───
  {
    refId: "098", quoteRefId: "QO-098",
    contact: "Priya Nair", company: "Green Leaf Wellness",
    createdBy: "Maria Hakobyan", ownerAvatar: "MH", ownerColor: "#f97316",
    title: "Tincture bottle labels + CR pouches — 4 SKU",
    lineItems: [
      { id: "l1", productId: 1, productName: "Roll Labels", productCategory: "Labels & Stickers", materialId: 200, materialName: "Clear BOPP", quantity: 5000, widthIn: 2, heightIn: 3, sides: "S1", colorMode: "CMYK", finishingIds: [177], finishingLabels: ["Matte Lam"], specialEffectIds: [], specialEffectLabels: [], unitPrice: 0.26, extended: 1300.00 },
      { id: "l2", productId: 34, productName: "Child-Resistant Flat Pouches", productCategory: "Bags & Pouches", materialId: 175, materialName: "Silver Virgin (MET PET)", quantity: 2500, widthIn: 4, heightIn: 6, sides: "S2", colorMode: "CMYK", finishingIds: [177], finishingLabels: ["Matte Lam"], specialEffectIds: [], specialEffectLabels: [], unitPrice: 0.98, extended: 2450.00 },
    ],
    total: 3750.00, received: 3750.00, balanceDue: 0,
    priority: "Normal", dueDate: "06/22/2026",
    status: "Delivered", payment: "Paid",
    createdAgo: "18d ago", createdDate: "06/13/2026",
    attachmentsCount: 4, attachments: ["GreenLeaf_TinctureLabel.ai", "GreenLeaf_CRPouch.ai", "CR_zipper_spec.pdf", "Print_Ready_v2.pdf"],
    files: [
      { name: "GreenLeaf_TinctureLabel.ai", sizeKB: 1420, kind: "ai" },
      { name: "GreenLeaf_CRPouch.ai", sizeKB: 2210, kind: "ai" },
      { name: "CR_zipper_spec.pdf", sizeKB: 220, kind: "pdf" },
      { name: "Print_Ready_v2.pdf", sizeKB: 1080, kind: "pdf" },
    ],
    shippingMethod: "Ship", trackingRef: "1Z999AA10119284563",
    customer: { phone: "(415) 555-0722", email: "priya@greenleafwellness.co", city: "Oakland", state: "CA", lifetimeOrders: 4, lifetimeValue: 14200, returning: true },
    payments: [
      { method: "ACH", amount: 3750.00, date: "06/13/2026", ref: "ACH-CHASE-71299", status: "Completed" },
    ],
    communications: [
      { channel: "email_in", author: "Priya Nair", subject: "Tincture + pouch reorder", body: "Same 4 SKUs. 5K labels + 2.5K pouches.", at: "06/13 · 11:04 AM" },
      { channel: "email_out", author: "Maria Hakobyan", subject: "Re: Reorder", body: "Priya — got it. Ships 06/22.", at: "06/13 · 12:22 PM" },
      { channel: "email_out", author: "Maria Hakobyan", subject: "Delivered — signature confirmed", body: "Priya — UPS delivered 06/23 at 11:14 AM, signed by 'P Nair'.", at: "06/23 · 11:44 AM" },
    ],
  },
  // ─── 15. Vibe Botanicals — Delivered, trading cards ───
  {
    refId: "095", quoteRefId: "QO-095",
    contact: "Diego Alvarez", company: "Vibe Botanicals",
    createdBy: "Manny Carlo", ownerAvatar: "MC", ownerColor: "#3b82f6",
    title: "Standard Trading Cards — 5000 pcs, gloss lam",
    lineItems: [
      { id: "l1", productId: 49, productName: "Standard Trading Cards", productCategory: "Marketing Materials", materialId: 199, materialName: "Matte 14pt Card Stock", quantity: 5000, widthIn: 2.5, heightIn: 3.5, sides: "S2", colorMode: "CMYK", finishingIds: [179], finishingLabels: ["Gloss Lam"], specialEffectIds: [], specialEffectLabels: [], unitPrice: 0.18, extended: 900.00 },
    ],
    total: 900.00, received: 900.00, balanceDue: 0,
    priority: "Normal", dueDate: "06/20/2026",
    status: "Delivered", payment: "Paid",
    createdAgo: "22d ago", createdDate: "06/09/2026",
    attachmentsCount: 2, attachments: ["Vibe_TradingCards_Front.pdf", "Vibe_TradingCards_Back.pdf"],
    files: [
      { name: "Vibe_TradingCards_Front.pdf", sizeKB: 1240, kind: "pdf" },
      { name: "Vibe_TradingCards_Back.pdf", sizeKB: 1180, kind: "pdf" },
    ],
    shippingMethod: "Pickup",
    customer: { phone: "(213) 555-0918", email: "diego@vibebotanicals.co", city: "Los Angeles", state: "CA", lifetimeOrders: 2, lifetimeValue: 1800, returning: true },
    payments: [
      { method: "Card", amount: 900.00, date: "06/09/2026", ref: "VISA •••• 7712", status: "Completed" },
    ],
    communications: [
      { channel: "email_in", author: "Diego Alvarez", subject: "Trading cards for launch", body: "5000 standard trading cards for a launch giveaway.", at: "06/09 · 9:14 AM" },
      { channel: "email_out", author: "Manny Carlo", subject: "Re: Trading cards", body: "Diego — quote $900. Pickup 06/20.", at: "06/09 · 10:44 AM" },
      { channel: "sms_out", author: "Manny Carlo", body: "Diego — cards are ready for pickup at the shop.", at: "06/19 · 3:14 PM" },
      { channel: "sms_in", author: "Diego Alvarez", body: "On my way", at: "06/19 · 4:02 PM" },
    ],
  },  // ─── 16. Little Buddha — Delivered ───
  {
    refId: "090", quoteRefId: "QO-090",
    contact: "Ren Takahashi", company: "Little Buddha",
    createdBy: "Ernesto Navarro", ownerAvatar: "EN", ownerColor: "#22c55e",
    title: "Bottle labels + business cards package",
    lineItems: [
      { id: "l1", productId: 1, productName: "Roll Labels", productCategory: "Labels & Stickers", materialId: 184, materialName: "White BOPP", quantity: 3000, widthIn: 2, heightIn: 3, sides: "S1", colorMode: "CMYK", finishingIds: [178], finishingLabels: ["Soft Touch Lam"], specialEffectIds: [], specialEffectLabels: [], unitPrice: 0.32, extended: 960.00 },
      { id: "l2", productId: 2, productName: "Business Cards", productCategory: "Marketing Materials", materialId: 199, materialName: "Matte 14pt Card Stock", quantity: 500, widthIn: 3.5, heightIn: 2, sides: "S2", colorMode: "CMYK", finishingIds: [178], finishingLabels: ["Soft Touch Lam"], specialEffectIds: [], specialEffectLabels: [], unitPrice: 0.24, extended: 120.00 },
    ],
    total: 1080.00, received: 1080.00, balanceDue: 0,
    priority: "Normal", dueDate: "06/18/2026",
    status: "Delivered", payment: "Paid",
    createdAgo: "24d ago", createdDate: "06/07/2026",
    attachmentsCount: 3, attachments: ["LittleBuddha_Label_V2.ai", "LittleBuddha_BizCard.ai", "Proof_Approved.pdf"],
    files: [
      { name: "LittleBuddha_Label_V2.ai", sizeKB: 940, kind: "ai" },
      { name: "LittleBuddha_BizCard.ai", sizeKB: 620, kind: "ai" },
      { name: "Proof_Approved.pdf", sizeKB: 480, kind: "pdf" },
    ],
    shippingMethod: "Ship", trackingRef: "1Z999AA10884127653",
    customer: { phone: "(310) 555-0311", email: "ren@littlebuddha.co", city: "Culver City", state: "CA", lifetimeOrders: 2, lifetimeValue: 2140, returning: true },
    payments: [
      { method: "Card", amount: 1080.00, date: "06/07/2026", ref: "VISA •••• 3319", status: "Completed" },
    ],
    communications: [
      { channel: "email_in", author: "Ren Takahashi", subject: "Labels + cards bundle", body: "Reorder labels, and add 500 business cards this time.", at: "06/07 · 10:14 AM" },
      { channel: "email_out", author: "Ernesto Navarro", subject: "Re: Bundle", body: "Ren — quote $1,080. Ships 06/18.", at: "06/07 · 11:22 AM" },
    ],
  },
  // ─── 17. Urban Farms — Delivered ───
  {
    refId: "086", quoteRefId: "QO-086",
    contact: "Kaleb Foster", company: "Urban Farms",
    createdBy: "Maria Hakobyan", ownerAvatar: "MH", ownerColor: "#f97316",
    title: "Custom boxes for microgreens — 1500 pcs",
    lineItems: [
      { id: "l1", productId: 189, productName: "Flip-Top Hinged Lid Box", productCategory: "Packaging & Boxes", materialId: 198, materialName: "18pt White SBS", quantity: 1500, widthIn: 6, heightIn: 4, sides: "S1", colorMode: "CMYK", finishingIds: [179], finishingLabels: ["Gloss Lam"], specialEffectIds: [], specialEffectLabels: [], unitPrice: 2.10, extended: 3150.00 },
    ],
    total: 3150.00, received: 3150.00, balanceDue: 0,
    priority: "Normal", dueDate: "06/16/2026",
    status: "Delivered", payment: "Paid",
    createdAgo: "27d ago", createdDate: "06/04/2026",
    attachmentsCount: 3, attachments: ["UrbanFarms_HingedLid.ai", "Dieline_Approved.pdf", "Proof_Round2.pdf"],
    files: [
      { name: "UrbanFarms_HingedLid.ai", sizeKB: 2410, kind: "ai" },
      { name: "Dieline_Approved.pdf", sizeKB: 320, kind: "pdf" },
      { name: "Proof_Round2.pdf", sizeKB: 890, kind: "pdf" },
    ],
    shippingMethod: "Pickup",
    customer: { phone: "(510) 555-0644", email: "kaleb@urbanfarms.co", city: "Berkeley", state: "CA", lifetimeOrders: 1, lifetimeValue: 3150, returning: false },
    payments: [
      { method: "ACH", amount: 3150.00, date: "06/04/2026", ref: "ACH-BOA-88291", status: "Completed" },
    ],
    communications: [
      { channel: "email_in", author: "Kaleb Foster", subject: "First order — microgreens box", body: "New here. Need 1500 boxes for my microgreens delivery service. Attached mockup.", at: "06/04 · 9:14 AM" },
      { channel: "email_out", author: "Maria Hakobyan", subject: "Re: Microgreens box", body: "Kaleb — welcome. Quote $3,150 attached. White cardstock only, standard for our line. Pickup 06/16.", at: "06/04 · 11:22 AM" },
    ],
  },
  // ─── 18. Richard Shaltz — Pending Payment ───
  {
    refId: "133", quoteRefId: "QO-133",
    contact: "Richard Shaltz", company: "Shaltz Botanicals",
    createdBy: "Manny Carlo", ownerAvatar: "MC", ownerColor: "#3b82f6",
    title: "Labels for oil line — 3000 pcs, waiting on payment",
    lineItems: [
      { id: "l1", productId: 1, productName: "Roll Labels", productCategory: "Labels & Stickers", materialId: 184, materialName: "White BOPP", quantity: 3000, widthIn: 2, heightIn: 4, sides: "S1", colorMode: "CMYK", finishingIds: [177], finishingLabels: ["Matte Lam"], specialEffectIds: [], specialEffectLabels: [], unitPrice: 0.36, extended: 1080.00 },
    ],
    total: 1080.00, received: 0, balanceDue: 1080.00,
    priority: "Normal", dueDate: "07/09/2026",
    status: "Pending Payment", payment: "Unpaid",
    createdAgo: "1d ago", createdDate: "06/30/2026",
    attachmentsCount: 2, attachments: ["Shaltz_OilLabel_V1.ai", "QO-133.pdf"],
    files: [
      { name: "Shaltz_OilLabel_V1.ai", sizeKB: 720, kind: "ai" },
      { name: "QO-133.pdf", sizeKB: 320, kind: "pdf" },
    ],
    shippingMethod: "Ship",
    customer: { phone: "(408) 555-0201", email: "richard@shaltzbotanicals.co", city: "San Jose", state: "CA", lifetimeOrders: 1, lifetimeValue: 620, returning: false },
    payments: [],
    communications: [
      { channel: "email_in", author: "Richard Shaltz", subject: "Oil label order", body: "3000 white BOPP labels, matte lam. Please quote.", at: "06/30 · 10:14 AM" },
      { channel: "email_out", author: "Manny Carlo", subject: "Re: Oil label", body: "Richard — quote attached, $1,080. Payment link included. Payment before we start.", at: "06/30 · 11:22 AM", attachments: ["QO-133.pdf"] },
      { channel: "sms_out", author: "Manny Carlo", body: "Richard — heads up on the quote for 3K oil labels, sent to your inbox.", at: "07/01 · 8:44 AM" },
    ],
  },
  // ─── 19. Dream Snacks Co — Pending Payment, mylar bags ───
  {
    refId: "132", quoteRefId: "QO-132",
    contact: "Willa Chen", company: "Dream Snacks Co",
    createdBy: "Ernesto Navarro", ownerAvatar: "EN", ownerColor: "#22c55e",
    title: "Mylar stand-up pouches — 5000 pcs, holographic accents",
    lineItems: [
      { id: "l1", productId: 30, productName: "Stand Up Pouches", productCategory: "Bags & Pouches", materialId: 175, materialName: "Silver Virgin (MET PET)", quantity: 5000, widthIn: 5, heightIn: 8, sides: "S2", colorMode: "CMYK", finishingIds: [178], finishingLabels: ["Soft Touch Lam"], specialEffectIds: [211], specialEffectLabels: ["Rainbow Holographic Foil"], unitPrice: 1.48, extended: 7400.00, comment: "3 SKUs · 1667 each" },
    ],
    total: 7400.00, received: 0, balanceDue: 7400.00,
    paymentTerms: "Net-15", paymentDueDate: "06/29/2026", paymentOverdue: false,
    priority: "Normal", dueDate: "07/14/2026",
    status: "Pending Payment", payment: "Unpaid",
    createdAgo: "2d ago", createdDate: "06/29/2026",
    attachmentsCount: 4, attachments: ["DreamSnacks_3SKU_Master.ai", "Holo_foil_map.pdf", "Dieline_Approved.pdf", "QO-132.pdf"],
    files: [
      { name: "DreamSnacks_3SKU_Master.ai", sizeKB: 4220, kind: "ai" },
      { name: "Holo_foil_map.pdf", sizeKB: 420, kind: "pdf" },
      { name: "Dieline_Approved.pdf", sizeKB: 310, kind: "pdf" },
      { name: "QO-132.pdf", sizeKB: 380, kind: "pdf" },
    ],
    shippingMethod: "Ship",
    customer: { phone: "(212) 555-0917", email: "willa@dreamsnacks.co", city: "Brooklyn", state: "NY", lifetimeOrders: 1, lifetimeValue: 0, returning: false },
    payments: [],
    communications: [
      { channel: "email_in", author: "Willa Chen", subject: "Mylar pouches — 3 SKUs", body: "5000 total split across 3 SKUs. Holo foil accent on all. Please send quote.", at: "06/29 · 11:14 AM" },
      { channel: "email_out", author: "Ernesto Navarro", subject: "Re: Mylar pouches", body: "Willa — quote $7,400. Karlville run, 10 business days from payment. Payment link attached.", at: "06/29 · 1:22 PM", attachments: ["QO-132.pdf"] },
    ],
  },
  // ─── 20. Sun Roll — Cancelled ───
  {
    refId: "100", quoteRefId: "QO-100",
    contact: "Kai Nakamura", company: "Sun Roll",
    createdBy: "Manny Carlo", ownerAvatar: "MC", ownerColor: "#3b82f6",
    title: "Sticker sheets — cancelled by customer",
    lineItems: [
      { id: "l1", productId: 24, productName: "Die Cut / Kiss Cut Stickers", productCategory: "Labels & Stickers", materialId: 189, materialName: "Semi-Gloss Paper", quantity: 2000, widthIn: 3, heightIn: 3, sides: "S1", colorMode: "CMYK", finishingIds: [], finishingLabels: [], specialEffectIds: [], specialEffectLabels: [], unitPrice: 0.32, extended: 640.00 },
    ],
    total: 640.00, received: 0, balanceDue: 0,
    priority: "Normal", dueDate: "06/28/2026",
    status: "Cancelled", payment: "Unpaid",
    createdAgo: "14d ago", createdDate: "06/17/2026",
    attachmentsCount: 1, attachments: ["SunRoll_Stickers_V1.ai"],
    files: [
      { name: "SunRoll_Stickers_V1.ai", sizeKB: 1140, kind: "ai" },
    ],
    productionNotes: "Customer changed direction — cancelled before production started.",
    customer: { phone: "(808) 555-0244", email: "kai@sunroll.co", city: "Honolulu", state: "HI", lifetimeOrders: 0, lifetimeValue: 0, returning: false },
    payments: [],
    communications: [
      { channel: "email_in", author: "Kai Nakamura", subject: "Sticker order", body: "2000 die-cut stickers, files attached.", at: "06/17 · 9:14 AM" },
      { channel: "email_out", author: "Manny Carlo", subject: "Re: Stickers", body: "Kai — quote $640. Payment link attached.", at: "06/17 · 11:22 AM" },
      { channel: "email_in", author: "Kai Nakamura", subject: "Cancel please", body: "Going a different direction — please cancel.", at: "06/19 · 2:30 PM" },
      { channel: "email_out", author: "Manny Carlo", subject: "Re: Cancel", body: "Kai — no problem, cancelled. No charge since we hadn't started.", at: "06/19 · 3:14 PM" },
    ],
  },
  // ─── 21. Petal & Pine — Refunded, gold foil off-spec ───
  {
    refId: "088", quoteRefId: "QO-088",
    contact: "Priya Shah", company: "Petal & Pine",
    createdBy: "Maria Hakobyan", ownerAvatar: "MH", ownerColor: "#f97316",
    title: "Wedding invitation suite — refund issued, gold foil off-spec",
    lineItems: [
      { id: "l1", productId: 8, productName: "Postcards", productCategory: "Marketing Materials", materialId: 199, materialName: "Matte 14pt Card Stock", quantity: 250, widthIn: 5, heightIn: 7, sides: "S2", colorMode: "CMYK", finishingIds: [177], finishingLabels: ["Matte Lam"], specialEffectIds: [206], specialEffectLabels: ["Gold Foil"], unitPrice: 2.60, extended: 650.00 },
    ],
    total: 650.00, received: 650.00, balanceDue: 0,
    priority: "Normal", dueDate: "06/12/2026",
    status: "Refunded", payment: "Paid",
    createdAgo: "26d ago", createdDate: "06/05/2026",
    attachmentsCount: 4, attachments: ["Invite_artwork.ai", "Gold_foil_map.pdf", "Refund_request.pdf", "Photo_of_mismatch.jpg"],
    files: [
      { name: "Invite_artwork.ai", sizeKB: 3210, kind: "ai" },
      { name: "Gold_foil_map.pdf", sizeKB: 240, kind: "pdf" },
      { name: "Refund_request.pdf", sizeKB: 180, kind: "pdf" },
      { name: "Photo_of_mismatch.jpg", sizeKB: 2840, kind: "jpg" },
    ],
    productionNotes: "Gold foil ran warmer than approved proof. Customer accepted full refund and kept usable stock.",
    refundedAmount: 650.00, refundReason: "Gold foil off-spec vs. approved proof",
    shippingMethod: "Ship",
    customer: { phone: "(415) 555-0812", email: "priya@petalandpine.co", city: "Berkeley", state: "CA", lifetimeOrders: 1, lifetimeValue: 0, returning: false },
    payments: [
      { method: "Card", amount: 650.00, date: "06/05/2026", ref: "VISA •••• 8842", status: "Completed" },
      { method: "Card", amount: -650.00, date: "06/24/2026", ref: "REFUND VISA •••• 8842", status: "Completed" },
    ],
    communications: [
      { channel: "email_in", author: "Priya Shah", subject: "Wedding invites — 250 with gold foil", body: "Attached final artwork. Wedding is July 4 so need by June 12.", at: "06/05 · 10:14 AM" },
      { channel: "email_out", author: "Maria Hakobyan", subject: "Re: Wedding invites", body: "Priya — $650, ships 06/12. Congrats!", at: "06/05 · 11:22 AM" },
      { channel: "email_in", author: "Priya Shah", subject: "Gold foil doesn't match proof", body: "Received them and the foil is way warmer / more copper than the swatch you sent. Photo attached. Wedding is next week — what can you do?", at: "06/13 · 4:14 PM", attachments: ["Photo_of_mismatch.jpg"] },
      { channel: "call_out", author: "Maria Hakobyan", body: "Called Priya. Offered full refund + let her keep the invites since re-run wouldn't hit her wedding date. She agreed.", at: "06/13 · 5:30 PM" },
      { channel: "email_out", author: "Maria Hakobyan", subject: "Full refund processed", body: "Priya — refunded $650 back to your card. Invites are yours to use. Truly sorry about the mismatch — we'll dial in the foil recipe before Q3.", at: "06/24 · 10:15 AM" },
    ],
  },
];
// ─── Format ────────────────────────────────────────────
export const fmtMoney = (n: number) => `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// Compute how many days past due, based on today = 07/01/2026 (the fixed mock "today").
// Returns 0 or negative if not overdue.
export function daysPastDue(dueDate: string): number {
  if (!dueDate) return 0;
  const [m, d, y] = dueDate.split("/").map(Number);
  if (!m || !d || !y) return 0;
  const due = new Date(y, m - 1, d);
  const today = new Date(2026, 6, 1); // 07/01/2026
  const diff = Math.floor((today.getTime() - due.getTime()) / (1000 * 60 * 60 * 24));
  return diff > 0 ? diff : 0;
}

export const STATUS_COLORS: Record<OrderStatus, { bg: string; fg: string }> = {
  "Pending Payment": { bg: "#fef3c7", fg: "#92400e" },
  "In Production": { bg: "#dbeafe", fg: "#1e40af" },
  "Ready to Ship": { bg: "#fef9c3", fg: "#a16207" },
  "Shipped": { bg: "#e0e7ff", fg: "#4338ca" },
  "Delivered": { bg: "#dcfce7", fg: "#166534" },
  "Cancelled": { bg: "#fee2e2", fg: "#dc2626" },
  "Refunded": { bg: "#ede9fe", fg: "#6d28d9" },
};

export const PAY_COLORS: Record<PaymentStatus, { bg: string; fg: string }> = {
  "Paid": { bg: "#dcfce7", fg: "#16a34a" },
  "Partial": { bg: "#fef3c7", fg: "#d97706" },
  "Tax Exempt": { bg: "#e0e7ff", fg: "#4f46e5" },
  "Pending Tax Review": { bg: "#fef3c7", fg: "#a16207" },
  "Unpaid": { bg: "#fee2e2", fg: "#dc2626" },
};

// ─── Quick-filter chips ────────────────────────────────
export type ChipKey = "overdue" | "paymentOverdue" | "rush" | "hasFiles" | "awaitingPayment" | "balanceDue";
export const CHIPS: { key: ChipKey; label: string; tint: string; tooltip: string }[] = [
  { key: "overdue",         label: "🔴 Delivery Overdue", tint: "#dc2626", tooltip: "Order due date has passed (production / shipping deadline missed)." },
  { key: "paymentOverdue",  label: "💸 Payment Overdue",   tint: "#b91c1c", tooltip: "Customer is past their agreed payment terms (Net-15 / Net-30 etc.) and hasn't paid yet." },
  { key: "rush",            label: "⚠ Rush",              tint: "#f59e0b", tooltip: "Rush-priority orders needing extra attention." },
  { key: "hasFiles",        label: "📎 Has files",         tint: "#3b82f6", tooltip: "Orders with at least one uploaded artwork / dieline / reference file." },
  { key: "awaitingPayment", label: "🕒 Awaiting payment",  tint: "#a16207", tooltip: "Orders that have not yet been paid in full — includes partial and unpaid." },
  { key: "balanceDue",      label: "💰 Balance due",       tint: "#dc2626", tooltip: "Orders with any unpaid amount remaining, regardless of terms." },
];

// ─── Table cell styles ───
export const th: CSSProperties = { textAlign: "left", padding: "12px 12px", fontWeight: 700 };
export const td: CSSProperties = { padding: "14px 12px", verticalAlign: "top" };
