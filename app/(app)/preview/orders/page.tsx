"use client";

// Hayk 2026-07-01 — Orders preview.
// Same parameter shape as the New Quote flow — line items carry catalog IDs
// (productId, materialId, finishingIds, specialEffectIds) so nothing gets
// re-entered when the quote converts to an order.

import { useMemo, useState } from "react";

const ACCENT = "#FF5D2E";
const GOLD = "#fbbf24";

// Hayk 2026-07-01 — Passport number. The numeric core (e.g. "135") rides on
// every downstream artifact: quote (Q-135) → order (ORD-135) → workflow card
// (#135) → invoice (INV-135) → packing slip (PS-135). Same number, never
// re-invented. This helper strips the prefix (Q-, QO-, ORD-, INV-, PS-) and
// any year segment (2026-) so we always land on the 3-digit core.
export const passportCore = (refId: string): string =>
  refId
    .replace(/^(Q|QO|ORD|INV|PS)-?/i, "")
    .replace(/^\d{4}-/, "")
    .padStart(3, "0");

// ─── Types ────────────────────────────────────────────
type OrderStatus = "Pending Payment" | "In Production" | "Ready to Ship" | "Shipped" | "Delivered" | "Cancelled" | "Refunded";
type PaymentStatus = "Paid" | "Partial" | "Tax Exempt" | "Pending Tax Review" | "Unpaid";
type Priority = "Normal" | "High" | "Rush";

export interface OrderLineItem {
  id: string;
  productId: number;
  productName: string;
  productCategory: string;
  materialId: number;
  materialName: string;
  quantity: number;
  widthIn?: number;
  heightIn?: number;
  sides: "S1" | "S2";
  colorMode: "CMYK" | "Pantone";
  finishingIds: number[];
  finishingLabels: string[];
  specialEffectIds: number[];
  specialEffectLabels: string[];
  unitPrice: number;
  extended: number;
  frameTiersHash?: string;
  comment?: string;
  overrideEnabled?: boolean;
  overrideReason?: string;
}

export interface Attachment { name: string; sizeKB: number; kind: "pdf" | "ai" | "png" | "jpg" | "dxf"; }
export interface CommEntry { channel: "email_in" | "email_out" | "call_in" | "call_out" | "sms_in" | "sms_out" | "ig_in" | "ig_out" | "note"; author: string; subject?: string; body: string; at: string; attachments?: string[]; }
export interface PaymentEntry { method: "ACH" | "Wire" | "Card" | "Zelle" | "Cash Terminal"; amount: number; date: string; ref: string; status: "Completed" | "Pending Clearance" | "Failed"; }
export interface TimelineEntry { icon: string; tint: string; title: string; sub?: string; at: string; actor?: string; ref?: string; }
export interface CustomerProfile { phone: string; email: string; city: string; state: string; lifetimeOrders: number; lifetimeValue: number; returning: boolean; }

export interface Order {
  refId: string;                // "2026-0114" — same numeric core across quote → order → production
  quoteRefId: string;           // "QO-2026-0114" — links back to the source quote
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
}

// ─── Mock dataset ────────────────────────────────────────
// Fixed "today" = 2026-07-01 for consistent age/overdue math.
// Product IDs and material IDs come straight from lib/catalog/catalog-v1.json
// so nothing has to be re-mapped when a quote converts to an order.
export const ORDERS: Order[] = [
  // ─── 1. Boris Boris / Grimeylyfe — In Production, Rush, repeat customer with 12 lifetime orders ───
  {
    refId: "2026-0135", quoteRefId: "QO-2026-0135",
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
      { channel: "email_out", author: "Ernesto Navarro", subject: "Wire received — order in production", body: "Boris — wire cleared this morning, jars + labels queued on Indigo 6K + Karlville for Wednesday run. Silver dot foil map is locked from your last batch so no reproof needed. Tracking will hit your inbox Thursday.", at: "06/30 · 11:02 AM", attachments: ["ORD-2026-0135_confirmation.pdf"] },
      { channel: "sms_out", author: "Ernesto Navarro", body: "Boris — you're all set, running Wed, ships Thursday. -Ernesto", at: "06/30 · 11:04 AM" },
      { channel: "call_in", author: "Boris Boris", body: "Called to confirm foil color matches last run — sent him a Karlville press-check photo, he approved.", at: "07/01 · 9:22 AM" },
    ],
    timeline: [
      { icon: "📝", tint: "#f97316", title: "Quote drafted", sub: "QO-2026-0135 · Boris confirmed sizes over the phone", at: "06/29 · 4:12 PM", actor: "Ernesto Navarro" },
      { icon: "✉", tint: "#3b82f6", title: "Quote sent", sub: "Email to boris@grimeylyfe.co", at: "06/29 · 4:15 PM", actor: "Ernesto Navarro" },
      { icon: "👁", tint: "#22c55e", title: "Customer viewed quote", sub: "Opened from mobile", at: "06/29 · 6:44 PM", actor: "Boris Boris" },
      { icon: "✓", tint: "#16a34a", title: "Quote approved", sub: "Boris confirmed via SMS", at: "06/30 · 9:58 AM", actor: "Boris Boris" },
      { icon: "💵", tint: "#16a34a", title: "Wire received — $4,975.00", sub: "Chase wire · confirmation 88214", at: "06/30 · 10:47 AM" },
      { icon: "📦", tint: "#8b5cf6", title: "Order created", sub: "ORD-2026-0135 · from QO-2026-0135", at: "06/30 · 11:00 AM", ref: "ORD-2026-0135" },
      { icon: "🎨", tint: "#a78bfa", title: "Assigned to designer", sub: "Marianna — reusing last batch's approved files", at: "06/30 · 11:20 AM", actor: "Marianna" },
      { icon: "✓", tint: "#16a34a", title: "Files re-approved by customer", sub: "Boris signed off — identical to last batch", at: "06/30 · 2:34 PM", actor: "Boris Boris" },
      { icon: "🏭", tint: "#06b6d4", title: "On press — Indigo 6K", sub: "Labels running · press operator Arsen", at: "07/01 · 8:15 AM", actor: "Arsen" },
      { icon: "🏭", tint: "#06b6d4", title: "Foil layer on Karlville", sub: "Silver dot foil registration re-set for HP 72", at: "07/01 · 10:00 AM", actor: "Arsen" },
    ],
  },
  // ─── 2. Prime Cannabis — In Production, Net-30 past due ───
  {
    refId: "2026-0130", quoteRefId: "QO-2026-0130",
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
      { channel: "email_out", author: "Maria Hakobyan", subject: "Net-30 invoice past due — ORD-2026-0130", body: "Hi Terrence — flagging that this invoice is now 21 days past our Net-30 terms. Order is complete and boxed but I can't release until payment clears. Can we get an ETA today?", at: "07/01 · 8:30 AM" },
      { channel: "email_in", author: "Terrence Blake", subject: "Re: Net-30 invoice past due", body: "Maria — sorry for the lag. ACH went out yesterday, should hit your account within 24-48h. I'll forward the confirmation.", at: "07/01 · 10:12 AM" },
      { channel: "note", author: "Maria Hakobyan", body: "Terrence usually pays same-day. This is his first late. Flagged with Hayk — holding shipment until ACH clears.", at: "07/01 · 10:20 AM" },
    ],
  },
  // ─── 3. Amazi Amazi / Trap Snacks — In Production, Net-30 past due, repeat customer ───
  {
    refId: "2026-0128", quoteRefId: "QO-2026-0128",
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
    refId: "2026-0126", quoteRefId: "QO-2026-0126",
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
    refId: "2026-0124", quoteRefId: "QO-2026-0124",
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
      { channel: "email_out", author: "Marianna", subject: "Re: Fall collection", body: "Ivy — got it. Quote attached. Pantone 2035C is on Indigo 15K's approved swatch library so we're good. Turnaround 10 business days.", at: "06/26 · 5:20 PM", attachments: ["QO-2026-0124.pdf"] },
      { channel: "email_in", author: "Ivy Bloom", subject: "Re: Fall collection", body: "Approved, sending ACH.", at: "06/27 · 9:04 AM" },
    ],
  },
  // ─── 6. Grim Lawd — In Production, tax exempt ───
  {
    refId: "2026-0122", quoteRefId: "QO-2026-0122",
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
    refId: "2026-0120", quoteRefId: "QO-2026-0120",
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
    refId: "2026-0118", quoteRefId: "QO-2026-0118",
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
    refId: "2026-0115", quoteRefId: "QO-2026-0115",
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
    refId: "2026-0113", quoteRefId: "QO-2026-0113",
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
    refId: "2026-0107", quoteRefId: "QO-2026-0107",
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
      { channel: "email_out", author: "Manny Carlo", subject: "Re: First order", body: "Vick — welcome! Quote attached. If it looks good I'll send a payment link.", at: "06/16 · 5:14 PM", attachments: ["QO-2026-0107.pdf"] },
      { channel: "email_in", author: "Vick May Day", subject: "Re: First order", body: "Looks good — paid. When will it ship?", at: "06/17 · 8:30 AM" },
      { channel: "email_out", author: "Manny Carlo", subject: "Shipped — UPS", body: "Vick — shipped today. Tracking 1Z999AA10778112034.", at: "06/29 · 4:15 PM" },
    ],
  },
  // ─── 12. Cane Company — Shipped ───
  {
    refId: "2026-0104", quoteRefId: "QO-2026-0104",
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
    refId: "2026-0101", quoteRefId: "QO-2026-0101",
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
    refId: "2026-0098", quoteRefId: "QO-2026-0098",
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
    refId: "2026-0095", quoteRefId: "QO-2026-0095",
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
    refId: "2026-0090", quoteRefId: "QO-2026-0090",
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
    refId: "2026-0086", quoteRefId: "QO-2026-0086",
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
    refId: "2026-0133", quoteRefId: "QO-2026-0133",
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
    attachmentsCount: 2, attachments: ["Shaltz_OilLabel_V1.ai", "QO-2026-0133.pdf"],
    files: [
      { name: "Shaltz_OilLabel_V1.ai", sizeKB: 720, kind: "ai" },
      { name: "QO-2026-0133.pdf", sizeKB: 320, kind: "pdf" },
    ],
    shippingMethod: "Ship",
    customer: { phone: "(408) 555-0201", email: "richard@shaltzbotanicals.co", city: "San Jose", state: "CA", lifetimeOrders: 1, lifetimeValue: 620, returning: false },
    payments: [],
    communications: [
      { channel: "email_in", author: "Richard Shaltz", subject: "Oil label order", body: "3000 white BOPP labels, matte lam. Please quote.", at: "06/30 · 10:14 AM" },
      { channel: "email_out", author: "Manny Carlo", subject: "Re: Oil label", body: "Richard — quote attached, $1,080. Payment link included. Payment before we start.", at: "06/30 · 11:22 AM", attachments: ["QO-2026-0133.pdf"] },
      { channel: "sms_out", author: "Manny Carlo", body: "Richard — heads up on the quote for 3K oil labels, sent to your inbox.", at: "07/01 · 8:44 AM" },
    ],
  },
  // ─── 19. Dream Snacks Co — Pending Payment, mylar bags ───
  {
    refId: "2026-0132", quoteRefId: "QO-2026-0132",
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
    attachmentsCount: 4, attachments: ["DreamSnacks_3SKU_Master.ai", "Holo_foil_map.pdf", "Dieline_Approved.pdf", "QO-2026-0132.pdf"],
    files: [
      { name: "DreamSnacks_3SKU_Master.ai", sizeKB: 4220, kind: "ai" },
      { name: "Holo_foil_map.pdf", sizeKB: 420, kind: "pdf" },
      { name: "Dieline_Approved.pdf", sizeKB: 310, kind: "pdf" },
      { name: "QO-2026-0132.pdf", sizeKB: 380, kind: "pdf" },
    ],
    shippingMethod: "Ship",
    customer: { phone: "(212) 555-0917", email: "willa@dreamsnacks.co", city: "Brooklyn", state: "NY", lifetimeOrders: 1, lifetimeValue: 0, returning: false },
    payments: [],
    communications: [
      { channel: "email_in", author: "Willa Chen", subject: "Mylar pouches — 3 SKUs", body: "5000 total split across 3 SKUs. Holo foil accent on all. Please send quote.", at: "06/29 · 11:14 AM" },
      { channel: "email_out", author: "Ernesto Navarro", subject: "Re: Mylar pouches", body: "Willa — quote $7,400. Karlville run, 10 business days from payment. Payment link attached.", at: "06/29 · 1:22 PM", attachments: ["QO-2026-0132.pdf"] },
    ],
  },
  // ─── 20. Sun Roll — Cancelled ───
  {
    refId: "2026-0100", quoteRefId: "QO-2026-0100",
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
    refId: "2026-0088", quoteRefId: "QO-2026-0088",
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

const STATUS_COLORS: Record<OrderStatus, { bg: string; fg: string }> = {
  "Pending Payment": { bg: "#fef3c7", fg: "#92400e" },
  "In Production": { bg: "#dbeafe", fg: "#1e40af" },
  "Ready to Ship": { bg: "#fef9c3", fg: "#a16207" },
  "Shipped": { bg: "#e0e7ff", fg: "#4338ca" },
  "Delivered": { bg: "#dcfce7", fg: "#166534" },
  "Cancelled": { bg: "#fee2e2", fg: "#dc2626" },
  "Refunded": { bg: "#ede9fe", fg: "#6d28d9" },
};

const PAY_COLORS: Record<PaymentStatus, { bg: string; fg: string }> = {
  "Paid": { bg: "#dcfce7", fg: "#16a34a" },
  "Partial": { bg: "#fef3c7", fg: "#d97706" },
  "Tax Exempt": { bg: "#e0e7ff", fg: "#4f46e5" },
  "Pending Tax Review": { bg: "#fef3c7", fg: "#a16207" },
  "Unpaid": { bg: "#fee2e2", fg: "#dc2626" },
};

// ─── Quick-filter chips ────────────────────────────────
type ChipKey = "overdue" | "paymentOverdue" | "rush" | "hasFiles" | "awaitingPayment" | "balanceDue";
const CHIPS: { key: ChipKey; label: string; tint: string; tooltip: string }[] = [
  { key: "overdue",         label: "🔴 Delivery Overdue", tint: "#dc2626", tooltip: "Order due date has passed (production / shipping deadline missed)." },
  { key: "paymentOverdue",  label: "💸 Payment Overdue",   tint: "#b91c1c", tooltip: "Customer is past their agreed payment terms (Net-15 / Net-30 etc.) and hasn't paid yet." },
  { key: "rush",            label: "⚠ Rush",              tint: "#f59e0b", tooltip: "Rush-priority orders needing extra attention." },
  { key: "hasFiles",        label: "📎 Has files",         tint: "#3b82f6", tooltip: "Orders with at least one uploaded artwork / dieline / reference file." },
  { key: "awaitingPayment", label: "🕒 Awaiting payment",  tint: "#a16207", tooltip: "Orders that have not yet been paid in full — includes partial and unpaid." },
  { key: "balanceDue",      label: "💰 Balance due",       tint: "#dc2626", tooltip: "Orders with any unpaid amount remaining, regardless of terms." },
];

// ─── Page ────────────────────────────────────────────
export default function OrdersPreview() {
  const [tab, setTab] = useState<"all" | "pending" | "production" | "ready" | "shipped" | "completed" | "cancelled" | "refunds">("all");
  const [dateRange, setDateRange] = useState<"today" | "yesterday" | "7d" | "30d" | "custom">("30d");
  const [teamFilter, setTeamFilter] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>("2026-0135");
  const [detailId, setDetailId] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    const p = new URLSearchParams(window.location.search).get("open");
    return p || null;
  });
  const [view, setView] = useState<"table" | "kanban">("table");
  const [chips, setChips] = useState<Set<ChipKey>>(() => {
    // Auto-apply chip from ?filter= URL param, so dashboard callouts can deep-link.
    if (typeof window === "undefined") return new Set();
    const p = new URLSearchParams(window.location.search).get("filter");
    if (p === "payment-overdue") return new Set(["paymentOverdue" as ChipKey]);
    if (p === "past-due" || p === "overdue") return new Set(["overdue" as ChipKey]);
    if (p === "rush") return new Set(["rush" as ChipKey]);
    return new Set();
  });

  const toggleChip = (k: ChipKey) => {
    setChips(prev => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k); else next.add(k);
      return next;
    });
  };

  const filtered = useMemo(() => {
    let out = ORDERS;
    if (tab === "pending") out = out.filter(o => o.status === "Pending Payment");
    if (tab === "production") out = out.filter(o => o.status === "In Production");
    if (tab === "ready") out = out.filter(o => o.status === "Ready to Ship");
    if (tab === "shipped") out = out.filter(o => o.status === "Shipped");
    if (tab === "completed") out = out.filter(o => o.status === "Delivered");
    if (tab === "cancelled") out = out.filter(o => o.status === "Cancelled");
    if (tab === "refunds") out = out.filter(o => o.status === "Refunded");
    if (teamFilter) out = out.filter(o => o.createdBy === teamFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      out = out.filter(o => o.contact.toLowerCase().includes(q) || o.company.toLowerCase().includes(q) || o.refId.includes(q) || o.title.toLowerCase().includes(q));
    }
    if (chips.has("overdue"))         out = out.filter(o => o.dueOverdue === true);
    if (chips.has("paymentOverdue"))  out = out.filter(o => o.paymentOverdue === true);
    if (chips.has("rush"))            out = out.filter(o => o.priority === "Rush");
    if (chips.has("hasFiles"))        out = out.filter(o => o.attachmentsCount > 0);
    if (chips.has("awaitingPayment")) out = out.filter(o => o.status === "Pending Payment" || o.payment !== "Paid");
    if (chips.has("balanceDue"))      out = out.filter(o => o.balanceDue > 0);
    // Overdue-first sort: any order past due (and still open) floats to the top,
    // regardless of tab/filter — so nothing critical gets buried.
    const isOverdue = (o: Order) => o.dueOverdue === true && o.status !== "Delivered" && o.status !== "Cancelled" && o.status !== "Refunded";
    return [...out].sort((a, b) => {
      const ao = isOverdue(a) ? 1 : 0;
      const bo = isOverdue(b) ? 1 : 0;
      if (ao !== bo) return bo - ao;
      return 0;
    });
  }, [tab, search, teamFilter, chips]);

  const counts = {
    all: ORDERS.length,
    pending: ORDERS.filter(o => o.status === "Pending Payment").length,
    production: ORDERS.filter(o => o.status === "In Production").length,
    ready: ORDERS.filter(o => o.status === "Ready to Ship").length,
    shipped: ORDERS.filter(o => o.status === "Shipped").length,
    completed: ORDERS.filter(o => o.status === "Delivered").length,
    cancelled: ORDERS.filter(o => o.status === "Cancelled").length,
    refunds: ORDERS.filter(o => o.status === "Refunded").length,
  };

  const detailOrder = detailId ? ORDERS.find(o => o.refId === detailId) : null;

  return (
    <div style={{ fontFamily: "system-ui, -apple-system, sans-serif", background: "var(--preview-bg)", color: "var(--preview-text)", margin: "-20px", padding: "20px", minHeight: "100vh" }}>
      {/* Preview banner */}
      <div style={{ display: "flex", gap: "8px", marginBottom: "18px", alignItems: "center", padding: "10px 14px", background: "var(--preview-surface-2)", borderRadius: "10px", color: "var(--preview-text)" }}>
        <span style={{ fontSize: "11px", fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: ACCENT }}>Preview</span>
        <span style={{ fontSize: "12px", color: "var(--preview-text)" }}>Orders · same catalog parameters as quotes · continuous ref# through quote → order → production</span>
        <span style={{ marginLeft: "auto", fontSize: "12px", color: "var(--preview-text-muted)" }}>Real /orders untouched</span>
      </div>

      {detailOrder ? (
        <OrderDetail order={detailOrder} onBack={() => setDetailId(null)} />
      ) : (
        <>
          {/* Header */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px" }}>
            <h1 style={{ fontSize: "24px", fontWeight: 800, margin: 0 }}>Orders</h1>
            <div style={{ display: "flex", gap: "6px", background: "var(--preview-surface)", border: "1px solid var(--preview-border)", borderRadius: "10px", padding: "3px" }}>
              {(["today", "yesterday", "7d", "30d", "custom"] as const).map(r => (
                <button key={r} onClick={() => setDateRange(r)} style={{
                  padding: "7px 14px", background: dateRange === r ? "#0a0a0a" : "transparent",
                  color: dateRange === r ? "#fff" : "#666", border: "none", borderRadius: "7px",
                  fontSize: "12.5px", fontWeight: dateRange === r ? 700 : 500, cursor: "pointer",
                }}>{r === "today" ? "Today" : r === "yesterday" ? "Yesterday" : r === "7d" ? "Last 7 Days" : r === "30d" ? "Last 30 Days" : "📅 Custom"}</button>
              ))}
            </div>
          </div>

          {/* Tabs + team filter + search */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px", gap: "12px" }}>
            <div style={{ display: "flex", gap: "22px", borderBottom: "1px solid #eee", flex: 1 }}>
              {[
                { key: "all", label: "All", count: counts.all },
                { key: "pending", label: "Pending Payment", count: counts.pending },
                { key: "production", label: "In Production", count: counts.production },
                { key: "ready", label: "Ready to Ship", count: counts.ready },
                { key: "shipped", label: "Shipped", count: counts.shipped },
                { key: "completed", label: "Completed", count: counts.completed },
                { key: "cancelled", label: "Cancelled", count: counts.cancelled },
                { key: "refunds", label: "Refunds", count: counts.refunds },
              ].map(t => {
                const active = tab === t.key;
                return (
                  <button key={t.key} onClick={() => setTab(t.key as any)} style={{
                    background: "transparent", border: "none",
                    padding: "10px 0", marginBottom: "-1px",
                    borderBottom: active ? `2px solid ${GOLD}` : "2px solid transparent",
                    color: active ? "#171717" : "#666",
                    fontSize: "13px", fontWeight: active ? 700 : 500, cursor: "pointer",
                    display: "flex", alignItems: "center", gap: "8px",
                  }}>
                    {t.label} <span style={{ padding: "1px 8px", background: active ? "#fef3c7" : "#f5f5f5", color: active ? "#78350f" : "#666", borderRadius: "999px", fontSize: "11px", fontWeight: 700 }}>{t.count}</span>
                  </button>
                );
              })}
            </div>
            <div style={{ display: "flex", gap: "8px" }}>
              {/* View toggle: Table / Kanban */}
              <div style={{ display: "flex", gap: "3px", background: "var(--preview-surface)", border: "1px solid var(--preview-border)", borderRadius: "8px", padding: "3px" }}>
                <button onClick={() => setView("table")} style={{
                  padding: "5px 10px", background: view === "table" ? "#0a0a0a" : "transparent",
                  color: view === "table" ? "#fff" : "#666", border: "none", borderRadius: "6px",
                  fontSize: "12px", fontWeight: view === "table" ? 700 : 500, cursor: "pointer",
                }}>☰ Table</button>
                <button onClick={() => setView("kanban")} style={{
                  padding: "5px 10px", background: view === "kanban" ? "#0a0a0a" : "transparent",
                  color: view === "kanban" ? "#fff" : "#666", border: "none", borderRadius: "6px",
                  fontSize: "12px", fontWeight: view === "kanban" ? 700 : 500, cursor: "pointer",
                }}>▦ Kanban</button>
              </div>
              <select value={teamFilter || "all"} onChange={e => setTeamFilter(e.target.value === "all" ? null : e.target.value)} style={{ padding: "7px 12px", background: "var(--preview-surface)", border: "1px solid var(--preview-border)", borderRadius: "8px", fontSize: "12.5px", cursor: "pointer" }}>
                <option value="all">All team members</option>
                <option>Manny Carlo</option><option>Maria Hakobyan</option><option>Gary Matevosyan</option><option>Ernesto Navarro</option>
              </select>
              <div style={{ position: "relative" }}>
                <input value={search} onChange={e => setSearch(e.target.value)} placeholder="🔍 Search orders..." style={{ padding: "7px 12px", background: "var(--preview-surface)", border: "1px solid var(--preview-border)", borderRadius: "8px", fontSize: "12.5px", width: "220px", outline: "none" }} />
              </div>
            </div>
          </div>

          {/* Quick-filter chips */}
          <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginBottom: "12px", alignItems: "center" }}>
            <span style={{ fontSize: "10.5px", color: "#888", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", marginRight: "4px" }}>Quick filters:</span>
            {CHIPS.map(c => {
              const active = chips.has(c.key);
              return (
                <button key={c.key} onClick={() => toggleChip(c.key)} title={c.tooltip} style={{
                  padding: "4px 10px",
                  background: active ? c.tint + "22" : "var(--preview-surface-2)",
                  color: active ? c.tint : "#666",
                  border: `1px solid ${active ? c.tint + "66" : "var(--preview-border)"}`,
                  borderRadius: "999px",
                  fontSize: "11.5px",
                  fontWeight: active ? 700 : 500,
                  cursor: "pointer",
                }}>{c.label}</button>
              );
            })}
            {chips.size > 0 && (
              <button onClick={() => setChips(new Set())} style={{
                padding: "4px 8px", background: "transparent", border: "none",
                color: "#888", fontSize: "11px", cursor: "pointer", textDecoration: "underline",
              }}>Clear</button>
            )}
          </div>

          {view === "kanban" ? (
            <KanbanBoard orders={filtered} onCardClick={id => setDetailId(id)} />
          ) : (
          /* Orders table */
          <div style={{ background: "var(--preview-surface)", borderRadius: "12px", border: "1px solid var(--preview-border)", overflow: "hidden" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
              <thead>
                <tr style={{ color: "#888", fontSize: "10.5px", textTransform: "uppercase", letterSpacing: "0.06em", background: "var(--preview-surface-2)" }}>
                  <th style={{ ...th, width: "110px" }}>Order #</th>
                  <th style={{ ...th, width: "92px", cursor: "help" }} title="Order Placed — the date the quote was converted to an order (customer paid or agreed to terms).">Date</th>
                  <th style={th}>Contact</th>
                  <th style={{ ...th, maxWidth: "280px" }}>Title</th>
                  <th style={th}>Created By</th>
                  <th style={{ ...th, textAlign: "right" }}>Total</th>
                  <th style={{ ...th, textAlign: "right" }}>Received</th>
                  <th style={{ ...th, textAlign: "right" }}>Balance Due</th>
                  <th style={th}>Priority</th>
                  <th style={th}>Due Date</th>
                  <th style={th}>Status</th>
                  <th style={th}>Payment</th>
                  <th style={th}>Created</th>
                  <th style={{ width: "60px" }}></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(o => (
                  <OrderRow
                    key={o.refId}
                    order={o}
                    expanded={expandedId === o.refId}
                    onToggle={() => setExpandedId(expandedId === o.refId ? null : o.refId)}
                    onView={() => setDetailId(o.refId)}
                  />
                ))}
              </tbody>
            </table>
          </div>
          )}
        </>
      )}
    </div>
  );
}

// ─── Row (with inline expand) ────────────────────────────────────────
function OrderRow({ order, expanded, onToggle, onView }: { order: Order; expanded: boolean; onToggle: () => void; onView: () => void }) {
  const overdue = order.dueOverdue;
  return (
    <>
      <tr onClick={onToggle} style={{
        borderTop: "1px solid #f4f4f4",
        background: overdue ? "#fef2f2" : expanded ? "#fff7ed" : "transparent",
        cursor: "pointer",
        borderLeft: overdue ? "3px solid #dc2626" : "3px solid transparent",
      }}>
        <td style={td}>
          <div style={{ display: "flex", alignItems: "center", gap: "5px", fontFamily: "monospace", fontWeight: 700, color: expanded ? ACCENT : "#171717" }}>
            <span style={{ fontSize: "10px" }}>{expanded ? "▾" : "▸"}</span>
            {order.refId}
          </div>
        </td>
        <td style={td} title={`Order Placed — the date the quote was converted to an order (customer paid or agreed to terms). This order was placed on ${order.createdDate} (${order.createdAgo}).`}>
          <div style={{ fontSize: "12px", color: "var(--preview-text)", fontWeight: 600, whiteSpace: "nowrap", cursor: "help" }}>{order.createdDate}</div>
          <div style={{ fontSize: "10.5px", color: "var(--preview-text-muted)" }}>{order.createdAgo}</div>
        </td>
        <td style={td}>
          <div style={{ fontSize: "13px", fontWeight: 700 }}>{order.contact}</div>
          {order.company && <div style={{ fontSize: "11px", color: "#888" }}>{order.company}</div>}
        </td>
        <td style={{ ...td, maxWidth: "280px" }}>
          <div style={{ fontSize: "12.5px", lineHeight: 1.4, color: "#333", overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical" as any }}>{order.title || <span style={{ color: "#bbb" }}>—</span>}</div>
          <div style={{ fontSize: "10.5px", color: order.attachmentsCount > 0 ? "#3b82f6" : "#bbb", marginTop: "3px", fontWeight: 600 }}>
            {order.attachmentsCount > 0 ? `📎 ${order.attachmentsCount}` : "—"}
          </div>
        </td>
        <td style={td}>
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <span style={{ width: "22px", height: "22px", borderRadius: "50%", background: order.ownerColor + "22", color: order.ownerColor, fontSize: "9px", fontWeight: 800, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>{order.ownerAvatar}</span>
            <span style={{ fontSize: "12px" }}>{order.createdBy.split(" ")[0]}</span>
          </div>
        </td>
        <td style={{ ...td, textAlign: "right", fontWeight: 700 }}>{fmtMoney(order.total)}</td>
        <td style={{ ...td, textAlign: "right", color: "#16a34a", fontWeight: 600 }}>{order.received > 0 ? fmtMoney(order.received) : "—"}</td>
        <td style={{ ...td, textAlign: "right", color: order.balanceDue > 0 ? "#dc2626" : "#171717", fontWeight: order.balanceDue > 0 ? 700 : 500 }}>
          <div>{fmtMoney(order.balanceDue)}</div>
          {order.paymentOverdue && order.paymentDueDate && (() => {
            const d = daysPastDue(order.paymentDueDate);
            if (d <= 0) return null;
            return (
              <div style={{ fontSize: "10px", color: "#b91c1c", fontWeight: 700, marginTop: "2px" }} title={`${order.paymentTerms || "Payment"} due ${order.paymentDueDate} — ${d} day${d === 1 ? "" : "s"} past due`}>
                💸 {d} {d === 1 ? "day" : "days"} late
              </div>
            );
          })()}
        </td>
        <td style={td}>
          <span style={{ color: order.priority === "High" ? "#dc2626" : order.priority === "Rush" ? "#f59e0b" : "#22c55e", fontWeight: 700, fontSize: "11.5px" }}>
            {order.priority}
          </span>
        </td>
        <td style={td}>
          {order.dueDate ? (
            <>
              <div style={{ fontSize: "11.5px", color: overdue ? "#dc2626" : "var(--preview-text)", fontWeight: overdue ? 700 : 500 }}>{order.dueDate}</div>
              {overdue && (() => {
                const d = daysPastDue(order.dueDate);
                return <div style={{ fontSize: "10px", color: "#dc2626", fontWeight: 700 }} title={`Due date passed ${d} day${d === 1 ? "" : "s"} ago`}>⚠ {d} {d === 1 ? "day" : "days"} late</div>;
              })()}
            </>
          ) : <span style={{ color: "#bbb" }}>—</span>}
        </td>
        <td style={td}>
          <span style={{ padding: "2px 8px", background: STATUS_COLORS[order.status].bg, color: STATUS_COLORS[order.status].fg, fontSize: "11px", fontWeight: 700, borderRadius: "5px" }}>{order.status}</span>
        </td>
        <td style={td}>
          <span style={{ padding: "2px 8px", background: PAY_COLORS[order.payment].bg, color: PAY_COLORS[order.payment].fg, fontSize: "11px", fontWeight: 700, borderRadius: "5px" }}>{order.payment}</span>
        </td>
        <td style={td}><span style={{ color: "#888", fontSize: "11.5px" }}>{order.createdAgo}</span></td>
        <td style={td}>
          <button onClick={e => { e.stopPropagation(); onView(); }} style={{ padding: "5px 10px", background: "var(--preview-surface)", border: "1px solid var(--preview-border)", borderRadius: "6px", fontSize: "11px", fontWeight: 600, cursor: "pointer" }}>↗ View</button>
        </td>
      </tr>

      {/* Expanded row — line items in quote-parameter format */}
      {expanded && (
        <tr style={{ background: "var(--preview-surface)" }}>
          <td colSpan={14} style={{ padding: "6px 20px 14px 20px" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {order.lineItems.map(l => (
                <div key={l.id} style={{ background: "#fff7ed", border: `1px solid ${ACCENT}44`, borderRadius: "10px", padding: "12px 16px", display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "20px" }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: "14px", fontWeight: 800, marginBottom: "4px" }}>
                      {l.productName} <span style={{ fontSize: "11.5px", color: "#888", fontWeight: 500 }}>· {l.materialName}</span>
                    </div>
                    <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginTop: "6px" }}>
                      <Pill>{l.productCategory}</Pill>
                      <Pill>Color: {l.colorMode}</Pill>
                      <Pill>Sides: {l.sides === "S1" ? "Single-sided" : "Double-sided"}</Pill>
                      {l.widthIn && l.heightIn && <Pill>Size: {l.widthIn}" × {l.heightIn}"</Pill>}
                      <Pill>Qty: {l.quantity.toLocaleString()}</Pill>
                      <Pill>Unit: {fmtMoney(l.unitPrice)}</Pill>
                      {l.finishingLabels.map(f => <Pill key={f} tone="amber">{f}</Pill>)}
                      {l.specialEffectLabels.map(e => <Pill key={e} tone="purple">{e}</Pill>)}
                    </div>
                    {l.comment && <div style={{ fontSize: "11.5px", color: "#666", marginTop: "6px", fontStyle: "italic" }}>{l.comment}</div>}
                  </div>
                  <div style={{ fontSize: "20px", fontWeight: 800, color: "#16a34a", whiteSpace: "nowrap" }}>{fmtMoney(l.extended)}</div>
                </div>
              ))}
              {order.attachments.length > 0 && (
                <div style={{ padding: "2px 4px" }}>
                  <div style={{ fontSize: "10.5px", color: "#888", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "4px" }}>Attachments ({order.attachmentsCount})</div>
                  <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                    {order.attachments.slice(0, 3).map(name => (
                      <span key={name} style={{ display: "inline-flex", alignItems: "center", gap: "5px", padding: "3px 10px", background: "#eff6ff", color: "#1e40af", border: "1px solid #bfdbfe", fontSize: "11px", fontWeight: 600, borderRadius: "6px" }}>
                        📎 {name}
                      </span>
                    ))}
                    {order.attachments.length > 3 && (
                      <span style={{ fontSize: "11px", color: "#888", padding: "3px 4px" }}>+{order.attachments.length - 3} more</span>
                    )}
                  </div>
                </div>
              )}
              <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 4px", fontSize: "12px", color: "#666" }}>
                <span>Quote source: <b style={{ color: ACCENT, fontFamily: "monospace" }}>{order.quoteRefId}</b> · {order.attachmentsCount} attachment{order.attachmentsCount !== 1 ? "s" : ""} · {order.shippingMethod || "Not set"}</span>
                <button onClick={onView} style={{ padding: "5px 12px", background: "#0a0a0a", color: "#fff", border: "none", borderRadius: "6px", fontSize: "11.5px", fontWeight: 700, cursor: "pointer" }}>Full details →</button>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function Pill({ children, tone }: { children: React.ReactNode; tone?: "amber" | "purple" }) {
  const bg = tone === "amber" ? "#fef3c7" : tone === "purple" ? "#ede9fe" : "#fff";
  const fg = tone === "amber" ? "#78350f" : tone === "purple" ? "#5b21b6" : "#333";
  const bd = tone === "amber" ? "#fde68a" : tone === "purple" ? "#c4b5fd" : "#e5e5e5";
  return (
    <span style={{ padding: "3px 10px", background: bg, color: fg, border: `1px solid ${bd}`, fontSize: "11px", fontWeight: 600, borderRadius: "6px", whiteSpace: "nowrap" }}>{children}</span>
  );
}

// ─── Kanban board ────────────────────────────────────────
function KanbanBoard({ orders, onCardClick }: { orders: Order[]; onCardClick: (id: string) => void }) {
  const columns: OrderStatus[] = ["Pending Payment", "In Production", "Ready to Ship", "Shipped", "Delivered", "Cancelled", "Refunded"];
  return (
    <div style={{ display: "flex", gap: "10px", overflowX: "auto", paddingBottom: "8px" }}>
      {columns.map(col => {
        const items = orders.filter(o => o.status === col);
        const c = STATUS_COLORS[col];
        return (
          <div key={col} style={{ flex: "0 0 260px", background: "var(--preview-surface-2)", border: "1px solid var(--preview-border)", borderRadius: "12px", padding: "10px", display: "flex", flexDirection: "column", gap: "8px", maxHeight: "calc(100vh - 260px)" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "2px 4px 6px 4px", borderBottom: `2px solid ${c.fg}22` }}>
              <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: c.fg }} />
                <span style={{ fontSize: "11.5px", fontWeight: 800, color: "#171717" }}>{col}</span>
              </div>
              <span style={{ padding: "1px 7px", background: c.bg, color: c.fg, borderRadius: "999px", fontSize: "10.5px", fontWeight: 700 }}>{items.length}</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "8px", overflowY: "auto", flex: 1 }}>
              {items.length === 0 ? (
                <div style={{ padding: "16px 8px", textAlign: "center", color: "#bbb", fontSize: "11px", fontStyle: "italic" }}>Empty</div>
              ) : items.map(o => (
                <KanbanCard key={o.refId} order={o} onClick={() => onCardClick(o.refId)} />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function KanbanCard({ order, onClick }: { order: Order; onClick: () => void }) {
  const overdue = order.dueOverdue;
  return (
    <div onClick={onClick} style={{
      background: "var(--preview-surface)",
      border: `1px solid ${overdue ? "#dc2626" : "var(--preview-border)"}`,
      borderLeft: `3px solid ${overdue ? "#dc2626" : order.priority === "Rush" ? "#f59e0b" : order.priority === "High" ? "#dc2626" : "#22c55e"}`,
      borderRadius: "8px",
      padding: "10px 12px",
      cursor: "pointer",
      display: "flex",
      flexDirection: "column",
      gap: "4px",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontFamily: "monospace", fontSize: "11px", fontWeight: 700, color: "var(--preview-text)" }}>{order.refId}</span>
        <span
          title={`Priority: ${order.priority}${order.priority === "Rush" ? " — top priority" : order.priority === "High" ? " — above normal" : " — normal turnaround"}`}
          style={{ fontSize: "10px", fontWeight: 700, color: order.priority === "Rush" ? "#f59e0b" : order.priority === "High" ? "#dc2626" : "#22c55e", cursor: "help", padding: "1px 6px", background: order.priority === "Rush" ? "rgba(245,158,11,0.12)" : order.priority === "High" ? "rgba(220,38,38,0.12)" : "rgba(34,197,94,0.12)", borderRadius: "999px" }}
        >⚑ {order.priority}</span>
      </div>
      <div style={{ fontSize: "12.5px", fontWeight: 700, color: "var(--preview-text)", lineHeight: 1.3 }}>{order.contact}</div>
      {order.company && <div style={{ fontSize: "10.5px", color: "var(--preview-text-muted)" }}>{order.company}</div>}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "4px" }}>
        <span style={{ fontSize: "13px", fontWeight: 800, color: "#16a34a" }}>{fmtMoney(order.total)}</span>
        {order.dueDate ? (
          <span style={{ fontSize: "10.5px", color: overdue ? "#dc2626" : "var(--preview-text-muted)", fontWeight: overdue ? 700 : 500 }}>
            {overdue ? "⚠ " : "📅 "}{order.dueDate}
          </span>
        ) : <span style={{ fontSize: "10.5px", color: "var(--preview-text-faint)" }}>—</span>}
      </div>
      {overdue && (() => {
        const d = daysPastDue(order.dueDate);
        return (
          <div style={{ display: "inline-flex", alignItems: "center", gap: "3px", marginTop: "2px", padding: "2px 7px", background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: "999px", fontSize: "10px", color: "#dc2626", fontWeight: 700, alignSelf: "flex-start" }}
            title={`Due date passed ${d} day${d === 1 ? "" : "s"} ago`}
          >⚠ {d} {d === 1 ? "day" : "days"} late</div>
        );
      })()}
      {order.paymentOverdue && order.paymentDueDate && (() => {
        const d = daysPastDue(order.paymentDueDate);
        if (d <= 0) return null;
        return (
          <div style={{ display: "inline-flex", alignItems: "center", gap: "3px", marginTop: "2px", padding: "2px 7px", background: "rgba(185,28,28,0.12)", border: "1px solid rgba(185,28,28,0.3)", borderRadius: "999px", fontSize: "10px", color: "#b91c1c", fontWeight: 700, alignSelf: "flex-start" }}
            title={`${order.paymentTerms || "Payment"} due ${order.paymentDueDate} — ${d} day${d === 1 ? "" : "s"} past due · balance ${fmtMoney(order.balanceDue)}`}
          >💸 Payment {d} {d === 1 ? "day" : "days"} late</div>
        );
      })()}
      {order.attachmentsCount > 0 && (
        <div style={{ fontSize: "10px", color: "#3b82f6", fontWeight: 600, marginTop: "2px" }}>📎 {order.attachmentsCount}</div>
      )}
    </div>
  );
}

// ─── Order Detail (full page takeover) ────────────────────────────────────────
function OrderDetail({ order, onBack }: { order: Order; onBack: () => void }) {
  const [status, setStatus] = useState(order.status);
  const [priority, setPriority] = useState(order.priority);
  const [showEngIds, setShowEngIds] = useState(false);
  const [tab, setTab] = useState<"overview" | "activity" | "comms" | "quotes" | "files" | "payments">("overview");

  // Prefer per-order timeline if present, otherwise fall back to generated one.
  const timeline: TimelineEvent[] = order.timeline
    ? order.timeline.map(t => ({ icon: t.icon, tint: t.tint, title: t.title, sub: t.sub, at: t.at, ref: t.ref })).reverse()
    : buildTimeline(order);

  return (
    <div>
      {/* Top bar */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px" }}>
        <button onClick={onBack} style={{ background: "transparent", border: "none", color: "#666", fontSize: "13px", cursor: "pointer", fontWeight: 500 }}>← Back to Orders</button>
        <div style={{ display: "flex", gap: "8px" }}>
          <button style={{ padding: "8px 14px", background: "var(--preview-surface)", border: "1px solid var(--preview-border)", borderRadius: "8px", fontSize: "12.5px", fontWeight: 600, cursor: "pointer" }}>📄 View Source Quote ({order.quoteRefId})</button>
          <button style={{ padding: "8px 14px", background: "var(--preview-surface)", border: "1px solid var(--preview-border)", borderRadius: "8px", fontSize: "12.5px", fontWeight: 600, cursor: "pointer" }}>✎ Edit Order</button>
          <button style={{ padding: "8px 16px", background: "#0a0a0a", color: "#fff", border: "none", borderRadius: "8px", fontSize: "12.5px", fontWeight: 700, cursor: "pointer" }}>→ Send to Workflow</button>
          <button style={{ padding: "8px 12px", background: "var(--preview-surface)", border: "1px solid var(--preview-border)", borderRadius: "8px", cursor: "pointer" }}>⋯</button>
        </div>
      </div>

      {/* Header card — compact */}
      <div style={{ background: "var(--preview-surface)", border: "1px solid var(--preview-border)", borderRadius: "14px", padding: "18px 22px", marginBottom: "12px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "20px" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <h1 style={{ fontSize: "26px", fontWeight: 800, margin: 0, fontFamily: "monospace" }}>ORD-{order.refId}</h1>
              <button style={{ background: "transparent", border: "none", color: "#aaa", cursor: "pointer", fontSize: "13px", padding: "2px 4px" }} title="Copy full ID">⧉</button>
              <button style={{ background: "transparent", border: "none", color: "#aaa", cursor: "pointer", fontSize: "13px", padding: "2px 4px" }} title="Print order">🖨</button>
            </div>
            <div style={{ fontSize: "14px", color: "#333", marginTop: "4px" }}>
              <b>{order.contact}</b> · {order.company || "—"}
              {order.customer?.returning && (
                <span style={{ marginLeft: "8px", padding: "2px 8px", background: "#dcfce7", color: "#166534", fontSize: "10.5px", fontWeight: 700, borderRadius: "5px" }}>Returning Customer · {order.customer.lifetimeOrders} orders</span>
              )}
              {order.customer && !order.customer.returning && (
                <span style={{ marginLeft: "8px", padding: "2px 8px", background: "#e0e7ff", color: "#4338ca", fontSize: "10.5px", fontWeight: 700, borderRadius: "5px" }}>New Customer</span>
              )}
            </div>
            <div style={{ display: "flex", gap: "6px", marginTop: "10px" }}>
              <span style={{ padding: "3px 10px", background: STATUS_COLORS[status].bg, color: STATUS_COLORS[status].fg, fontSize: "11px", fontWeight: 700, borderRadius: "6px" }}>{status}</span>
              <span style={{ padding: "3px 10px", background: PAY_COLORS[order.payment].bg, color: PAY_COLORS[order.payment].fg, fontSize: "11px", fontWeight: 700, borderRadius: "6px" }}>{order.payment}</span>
              <span style={{ padding: "3px 10px", background: priority === "High" ? "#fee2e2" : priority === "Rush" ? "#fef3c7" : "#dcfce7", color: priority === "High" ? "#dc2626" : priority === "Rush" ? "#f59e0b" : "#22c55e", fontSize: "11px", fontWeight: 700, borderRadius: "6px" }}>🚩 {priority} Priority</span>
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: "10px", color: "#888", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em" }}>Order Total</div>
            <div style={{ fontSize: "30px", fontWeight: 800, letterSpacing: "-0.5px" }}>{fmtMoney(order.total)}</div>
            <div style={{ fontSize: "11.5px", marginTop: "2px", color: "#16a34a", fontWeight: 700 }}>
              Received {fmtMoney(order.received)}
              {order.balanceDue > 0 && <span style={{ color: "#dc2626", marginLeft: "8px" }}>· Balance due {fmtMoney(order.balanceDue)}</span>}
            </div>
            {order.paymentOverdue && order.paymentDueDate && (() => {
              const d = daysPastDue(order.paymentDueDate);
              if (d <= 0) return null;
              return (
                <div style={{ display: "inline-flex", alignItems: "center", gap: "4px", marginTop: "6px", padding: "3px 10px", background: "#fee2e2", border: "1px solid #fca5a5", borderRadius: "999px", fontSize: "11px", color: "#b91c1c", fontWeight: 800 }}
                  title={`${order.paymentTerms || "Payment"} due ${order.paymentDueDate}`}
                >💸 Payment {d} {d === 1 ? "day" : "days"} past due · terms {order.paymentTerms || "—"}</div>
              );
            })()}
            <div style={{ fontSize: "10.5px", color: "#888", marginTop: "1px" }}>on {order.createdDate}</div>
          </div>
        </div>
      </div>

      {/* Meta strip — Created By, Created, Due, Priority, Status, Fulfillment */}
      <div style={{ background: "var(--preview-surface)", border: "1px solid var(--preview-border)", borderRadius: "12px", padding: "12px 20px", marginBottom: "14px", display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: "16px", alignItems: "center" }}>
        <MetaCell icon="👤" label="Created By">
          <span style={{ display: "inline-flex", alignItems: "center", gap: "5px", fontWeight: 700 }}>
            <span style={{ width: "20px", height: "20px", borderRadius: "50%", background: order.ownerColor + "22", color: order.ownerColor, fontSize: "9px", fontWeight: 800, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>{order.ownerAvatar}</span>
            {order.createdBy}
          </span>
        </MetaCell>
        <MetaCell icon="📅" label="Created">
          <div style={{ fontWeight: 700 }}>{order.createdDate}</div>
          <div style={{ fontSize: "10.5px", color: "#888" }}>{order.createdAgo}</div>
        </MetaCell>
        <MetaCell icon="📅" label="Due Date">
          <div style={{ fontWeight: 700, color: order.dueOverdue ? "#dc2626" : "var(--preview-text)" }}>{order.dueDate || "—"}</div>
          {order.dueOverdue && (() => {
            const d = daysPastDue(order.dueDate);
            return (
              <div
                style={{ display: "inline-flex", alignItems: "center", gap: "4px", marginTop: "3px", padding: "2px 8px", background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: "999px", fontSize: "10.5px", color: "#dc2626", fontWeight: 700 }}
                title={`Due date passed ${d} day${d === 1 ? "" : "s"} ago`}
              >⚠ {d} {d === 1 ? "day" : "days"} late</div>
            );
          })()}
        </MetaCell>
        <MetaCell icon="🚩" label="Priority">
          <select value={priority} onChange={e => setPriority(e.target.value as Priority)} style={{ padding: "3px 10px 3px 6px", background: "var(--preview-surface)", border: "1px solid var(--preview-border)", borderRadius: "5px", fontSize: "12.5px", fontWeight: 700, width: "100%" }}>
            <option>Normal</option><option>High</option><option>Rush</option>
          </select>
        </MetaCell>
        <MetaCell icon="⚙" label="Status">
          <select value={status} onChange={e => setStatus(e.target.value as OrderStatus)} style={{ padding: "3px 10px 3px 6px", background: "var(--preview-surface)", border: "1px solid var(--preview-border)", borderRadius: "5px", fontSize: "12.5px", fontWeight: 700, width: "100%" }}>
            <option>Pending Payment</option><option>In Production</option><option>Ready to Ship</option><option>Shipped</option><option>Delivered</option><option>Cancelled</option><option>Refunded</option>
          </select>
        </MetaCell>
        <MetaCell icon="🚚" label="Fulfillment">
          <div style={{ fontWeight: 700 }}>{order.shippingMethod || "—"}</div>
          {order.trackingRef && <div style={{ fontSize: "10.5px", color: "#888" }}>{order.trackingRef}</div>}
        </MetaCell>
      </div>

      {/* 3-column body: Customer sidebar (LEFT) | Content tabs (MIDDLE) | Timeline + Workflow (RIGHT) */}
      <div style={{ display: "grid", gridTemplateColumns: "280px minmax(0, 1fr) 320px", gap: "14px", marginBottom: "14px" }}>
        {/* LEFT — Customer sidebar with Actions */}
        <CustomerSidebar order={order} />

        {/* MIDDLE — Tabbed content */}
        <div style={{ background: "var(--preview-surface)", border: "1px solid var(--preview-border)", borderRadius: "14px", padding: "0", overflow: "hidden" }}>
          {/* Tab bar */}
          <div style={{ display: "flex", gap: "20px", padding: "0 22px", borderBottom: "1px solid #eee" }}>
            {[
              { key: "overview", label: "Overview" },
              { key: "activity", label: `Activity Timeline (${timeline.length})` },
              { key: "comms", label: `Communications (${order.communications?.length ?? 0})` },
              { key: "quotes", label: `Quote History (3)` },
              { key: "files", label: `Files (${order.attachmentsCount})` },
              { key: "payments", label: `Payments (${order.payments?.length ?? 0})` },
            ].map(t => {
              const active = tab === t.key;
              return (
                <button key={t.key} onClick={() => setTab(t.key as any)} style={{ background: "transparent", border: "none", padding: "14px 4px", marginBottom: "-1px", borderBottom: active ? `2px solid ${ACCENT}` : "2px solid transparent", color: active ? "#171717" : "#666", fontSize: "13px", fontWeight: active ? 700 : 500, cursor: "pointer" }}>
                  {t.label}
                </button>
              );
            })}
          </div>

          <div style={{ padding: "18px 22px" }}>
            {tab === "overview" && <OverviewTab order={order} showEngIds={showEngIds} setShowEngIds={setShowEngIds} />}
            {tab === "activity" && <ActivityTab events={timeline} />}
            {tab === "comms" && <CommsTab order={order} />}
            {tab === "quotes" && <QuoteHistoryTab order={order} />}
            {tab === "files" && <FilesTab order={order} />}
            {tab === "payments" && <PaymentsTab order={order} />}
          </div>
        </div>

        {/* RIGHT — Activity Timeline + Workflow Progress */}
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          <ActivityTimelineCard events={timeline.slice(0, 5)} />
          <WorkflowProgressCard order={order} />
        </div>
      </div>

      {/* Financial Summary bar */}
      <FinancialSummary order={order} />
    </div>
  );
}

function MetaCell({ icon, label, children }: any) {
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: "4px", fontSize: "10px", color: "#888", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "3px" }}>
        <span>{icon}</span>
        <span>{label}</span>
      </div>
      <div style={{ fontSize: "12.5px" }}>{children}</div>
    </div>
  );
}

// ─── Left: Customer sidebar ────────────────────────────────
function CustomerSidebar({ order }: { order: Order }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "12px", position: "sticky", top: "16px", height: "fit-content" }}>
      {/* Customer card */}
      <div style={{ background: "var(--preview-surface)", border: "1px solid var(--preview-border)", borderRadius: "14px", padding: "16px 18px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "12px" }}>
          <span style={{ fontSize: "10.5px", color: "#888", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em" }}>Customer</span>
          <button style={{ padding: "3px 10px", background: "var(--preview-surface)", border: "1px solid var(--preview-border)", borderRadius: "6px", fontSize: "10.5px", fontWeight: 600, cursor: "pointer" }}>Edit</button>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "12px" }}>
          <div style={{ width: "40px", height: "40px", borderRadius: "50%", background: order.ownerColor + "22", color: order.ownerColor, fontSize: "12px", fontWeight: 800, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>{order.contact.slice(0, 2).toUpperCase()}</div>
          <div>
            <div style={{ fontSize: "14px", fontWeight: 800 }}>{order.contact}</div>
            {order.company && <div style={{ fontSize: "11.5px", color: "#888" }}>{order.company}</div>}
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "6px", fontSize: "11.5px", color: "#666", marginBottom: "12px" }}>
          <div>📞 {order.customer?.phone || "—"}</div>
          <div>✉ {order.customer?.email || "—"}</div>
          <div>📍 {order.customer ? `${order.customer.city}, ${order.customer.state}` : "—"}</div>
        </div>
        <span style={{ display: "inline-block", padding: "2px 8px", background: order.customer?.returning ? "#dcfce7" : "#e0e7ff", color: order.customer?.returning ? "#166534" : "#4338ca", fontSize: "10.5px", fontWeight: 700, borderRadius: "5px", marginBottom: "12px" }}>{order.customer?.returning ? "Returning Customer" : "New Customer"}</span>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "6px", padding: "10px", background: "var(--preview-surface-2)", borderRadius: "8px" }}>
          <div><div style={{ fontSize: "9.5px", color: "#888", textTransform: "uppercase", fontWeight: 700 }}>Lifetime</div><div style={{ fontSize: "12px", fontWeight: 800 }}>${(order.customer?.lifetimeValue ?? 0).toLocaleString()}</div></div>
          <div><div style={{ fontSize: "9.5px", color: "#888", textTransform: "uppercase", fontWeight: 700 }}>Orders</div><div style={{ fontSize: "12px", fontWeight: 800 }}>{order.customer?.lifetimeOrders ?? 0}</div></div>
          <div><div style={{ fontSize: "9.5px", color: "#888", textTransform: "uppercase", fontWeight: 700 }}>Terms</div><div style={{ fontSize: "12px", fontWeight: 800 }}>{order.paymentTerms || "Prepay"}</div></div>
        </div>
      </div>

      {/* Actions block */}
      <div style={{ background: "var(--preview-surface)", border: "1px solid var(--preview-border)", borderRadius: "14px", padding: "16px 18px" }}>
        <div style={{ fontSize: "10.5px", color: "#888", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "10px" }}>Actions</div>
        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
          <ActionButton bg="#0a0a0a" fg="#fff">✓ Mark as Completed</ActionButton>
          <ActionButton bg="#fef3c7" fg="#78350f" border="#fde68a">↩ Refund Payment</ActionButton>
          <ActionButton bg="#fee2e2" fg="#dc2626" border="#fecaca">✕ Cancel Order</ActionButton>
          <ActionButton bg="#fff" fg="#333" border="#e5e5e5">🔗 Resend Link to Customer</ActionButton>
        </div>
      </div>

      {/* Help card */}
      <div style={{ background: "var(--preview-surface-2)", border: "1px solid var(--preview-border)", borderRadius: "12px", padding: "14px 16px", display: "flex", alignItems: "center", gap: "10px" }}>
        <div style={{ width: "34px", height: "34px", borderRadius: "50%", background: order.ownerColor + "22", color: order.ownerColor, fontSize: "10px", fontWeight: 800, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>{order.ownerAvatar}</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: "12px", fontWeight: 700 }}>Need help with this order?</div>
          <div style={{ fontSize: "10.5px", color: "#888" }}>Contact your account manager</div>
        </div>
        <button style={{ padding: "5px 10px", background: "var(--preview-surface)", border: "1px solid var(--preview-border)", borderRadius: "6px", fontSize: "10.5px", fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" }}>💬 Message</button>
      </div>
    </div>
  );
}

function ActionButton({ bg, fg, border, children }: any) {
  return (
    <button style={{
      padding: "9px 12px",
      background: bg,
      color: fg,
      border: border ? `1px solid ${border}` : "none",
      borderRadius: "8px",
      fontSize: "12.5px",
      fontWeight: 700,
      cursor: "pointer",
      textAlign: "left",
    }}>{children}</button>
  );
}

// ─── Middle: Tab content ─────────────────────────────────
function OverviewTab({ order, showEngIds, setShowEngIds }: { order: Order; showEngIds: boolean; setShowEngIds: (v: boolean) => void }) {
  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
        <div style={{ fontSize: "12px", fontWeight: 800, letterSpacing: "0.04em" }}>LINE ITEMS ({order.lineItems.length})</div>
        <label style={{ fontSize: "10.5px", color: "#888", cursor: "pointer", display: "flex", alignItems: "center", gap: "4px" }}>
          <input type="checkbox" checked={showEngIds} onChange={e => setShowEngIds(e.target.checked)} /> Show catalog IDs (dev)
        </label>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginBottom: "18px" }}>
        {order.lineItems.map((l, i) => (
          <div key={l.id} style={{ background: "var(--preview-surface-2)", border: "1px solid var(--preview-border)", borderRadius: "10px", padding: "12px 16px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "8px" }}>
              <div>
                <div style={{ fontSize: "10.5px", color: "#888", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em" }}>LINE {i + 1} · {l.productCategory}</div>
                <div style={{ fontSize: "15px", fontWeight: 800, marginTop: "2px" }}>{l.productName}</div>
                <div style={{ fontSize: "12px", color: "#666" }}>{l.materialName}</div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: "18px", fontWeight: 800, color: "#16a34a" }}>{fmtMoney(l.extended)}</div>
                <div style={{ fontSize: "10.5px", color: "#888" }}>{l.quantity.toLocaleString()} × {fmtMoney(l.unitPrice)}</div>
              </div>
            </div>
            <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
              {l.widthIn && l.heightIn && <Pill>Size: {l.widthIn}" × {l.heightIn}"</Pill>}
              <Pill>Sides: {l.sides === "S1" ? "Single" : "Double"}</Pill>
              <Pill>Color: {l.colorMode}</Pill>
              {l.finishingLabels.map(f => <Pill key={f} tone="amber">{f}</Pill>)}
              {l.specialEffectLabels.map(e => <Pill key={e} tone="purple">{e}</Pill>)}
            </div>
            {l.comment && <div style={{ marginTop: "8px", padding: "6px 10px", background: "#fffbeb", border: "1px solid #fde68a", borderRadius: "6px", fontSize: "11.5px", color: "#78350f" }}>💬 {l.comment}</div>}
            {showEngIds && (
              <div style={{ marginTop: "8px", paddingTop: "6px", borderTop: "1px dashed #ddd", fontSize: "10px", color: "#888", fontFamily: "monospace" }}>
                productId: {l.productId} · materialId: {l.materialId} · finishingIds: [{l.finishingIds.join(", ")}] · specialEffectIds: [{l.specialEffectIds.join(", ")}]
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Production notes */}
      <div style={{ marginBottom: "16px" }}>
        <div style={{ fontSize: "12px", fontWeight: 800, letterSpacing: "0.04em", marginBottom: "8px" }}>📝 PRODUCTION NOTES</div>
        <textarea defaultValue={order.productionNotes || ""} placeholder="Notes visible to production team..." style={{ width: "100%", minHeight: "70px", padding: "10px 12px", border: "1px solid var(--preview-border)", borderRadius: "8px", fontSize: "12.5px", fontFamily: "inherit", resize: "vertical", boxSizing: "border-box" }} />
      </div>

      {/* Attachments */}
      <div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
          <div style={{ fontSize: "12px", fontWeight: 800, letterSpacing: "0.04em" }}>📎 ATTACHMENTS ({order.attachmentsCount})</div>
          <button style={{ padding: "4px 10px", background: ACCENT, color: "#fff", border: "none", borderRadius: "6px", fontSize: "11px", fontWeight: 700, cursor: "pointer" }}>+ Upload File</button>
        </div>
        {order.attachmentsCount === 0 ? (
          <div style={{ padding: "14px", textAlign: "center", color: "#aaa", fontSize: "12px", border: "1px dashed #ddd", borderRadius: "6px" }}>No attachments</div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "8px" }}>
            {(order.files ?? order.attachments.map(name => ({ name, sizeKB: 480, kind: (name.endsWith(".ai") ? "ai" : name.endsWith(".jpg") ? "jpg" : name.endsWith(".png") ? "png" : name.endsWith(".dxf") ? "dxf" : "pdf") as Attachment["kind"] }))).map((f, i) => {
              const tintBg = f.kind === "pdf" ? "#fee2e2" : f.kind === "ai" ? "#fef3c7" : f.kind === "dxf" ? "#e0e7ff" : "#dbeafe";
              const tintFg = f.kind === "pdf" ? "#dc2626" : f.kind === "ai" ? "#a16207" : f.kind === "dxf" ? "#4338ca" : "#1e40af";
              const sizeLabel = f.sizeKB >= 1024 ? `${(f.sizeKB / 1024).toFixed(1)} MB` : `${f.sizeKB} KB`;
              return (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: "10px", padding: "10px 12px", background: "var(--preview-surface-2)", border: "1px solid var(--preview-border)", borderRadius: "8px" }}>
                  <div style={{ width: "36px", height: "36px", background: tintBg, color: tintFg, borderRadius: "6px", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "11px", fontWeight: 800 }}>{f.kind.toUpperCase()}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: "12.5px", fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.name}</div>
                    <div style={{ fontSize: "10.5px", color: "#888" }}>{f.kind.toUpperCase()} · {sizeLabel}</div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}

function ActivityTab({ events }: { events: TimelineEvent[] }) {
  return (
    <div style={{ position: "relative", paddingLeft: "10px" }}>
      <div style={{ position: "absolute", left: "24px", top: "10px", bottom: "10px", width: "2px", background: "#f0f0f0" }} />
      {events.map((e, i) => (
        <div key={i} style={{ display: "flex", gap: "14px", padding: "10px 0", position: "relative", zIndex: 1 }}>
          <div style={{ width: "30px", height: "30px", borderRadius: "50%", background: e.tint + "22", color: e.tint, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "13px", flexShrink: 0, border: "2px solid #fff" }}>{e.icon}</div>
          <div style={{ flex: 1 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: "6px" }}>
              <span style={{ fontSize: "13px", fontWeight: 700 }}>{e.title}</span>
              <span style={{ fontSize: "10.5px", color: "#888" }}>{e.at}</span>
            </div>
            {e.sub && <div style={{ fontSize: "12px", color: "#666", marginTop: "2px" }}>{e.sub}</div>}
          </div>
        </div>
      ))}
    </div>
  );
}

function QuoteHistoryTab({ order }: { order: Order }) {
  const versions = [
    { ref: order.quoteRefId, version: "v3 (accepted)", date: "Jun 30, 2026 · 3:35 PM", author: order.createdBy, total: order.total, accepted: true },
    { ref: `${order.quoteRefId}-v2`, version: "v2 (revised)", date: "Jun 30, 2026 · 2:12 PM", author: order.createdBy, total: order.total * 1.1 },
    { ref: `${order.quoteRefId}-v1`, version: "v1 (initial)", date: "Jun 29, 2026 · 11:04 AM", author: order.createdBy, total: order.total * 1.2 },
  ];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
      {versions.map(v => (
        <div key={v.ref} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", background: v.accepted ? "#fff7ed" : "var(--preview-surface-2)", border: `1px solid ${v.accepted ? ACCENT + "33" : "#eee"}`, borderRadius: "8px" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span style={{ fontFamily: "monospace", fontWeight: 700, color: ACCENT, cursor: "pointer" }}>{v.ref}</span>
              <span style={{ fontSize: "11.5px", color: "#666", fontWeight: 700 }}>{v.version}</span>
            </div>
            <div style={{ fontSize: "11px", color: "#888", marginTop: "3px" }}>{v.date} · by {v.author}</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: "14px", fontWeight: 800 }}>{fmtMoney(v.total)}</div>
            <button style={{ marginTop: "3px", padding: "3px 8px", background: "var(--preview-surface)", border: "1px solid var(--preview-border)", borderRadius: "5px", fontSize: "10.5px", fontWeight: 600, cursor: "pointer" }}>View</button>
          </div>
        </div>
      ))}
    </div>
  );
}

function FilesTab({ order }: { order: Order }) {
  // Prefer rich file objects with size/kind; fall back to plain string names.
  const richFiles: Attachment[] = order.files
    ?? order.attachments.map(name => ({
      name,
      sizeKB: 480,
      kind: (name.endsWith(".ai") ? "ai" : name.endsWith(".jpg") ? "jpg" : name.endsWith(".png") ? "png" : name.endsWith(".dxf") ? "dxf" : "pdf") as Attachment["kind"],
    }));
  const fileNames = richFiles.map(f => f.name);
  const files = fileNames.length ? fileNames : ["mockup.pdf", "die-line.pdf"];
  const fileMeta: Record<string, Attachment> = Object.fromEntries(richFiles.map(f => [f.name, f]));
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
        <div style={{ fontSize: "12px", fontWeight: 800, letterSpacing: "0.04em" }}>{files.length} FILE{files.length !== 1 ? "S" : ""}</div>
        <button style={{ padding: "5px 12px", background: ACCENT, color: "#fff", border: "none", borderRadius: "6px", fontSize: "11.5px", fontWeight: 700, cursor: "pointer" }}>+ Upload File</button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "10px" }}>
        {files.map((f, i) => (
          <div key={i} style={{ background: "var(--preview-surface-2)", border: "1px solid var(--preview-border)", borderRadius: "8px", overflow: "hidden", cursor: "pointer" }}>
            <div style={{ aspectRatio: "16/10", background: f.endsWith(".pdf") ? "linear-gradient(135deg, #dc2626, #f97316)" : f.endsWith(".ai") ? "linear-gradient(135deg, #f97316, #eab308)" : "linear-gradient(135deg, #3b82f6, #8b5cf6)", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: "16px", fontWeight: 800 }}>
              {f.endsWith(".pdf") ? "PDF" : f.endsWith(".ai") ? "AI" : "IMG"}
            </div>
            <div style={{ padding: "8px 10px" }}>
              <div style={{ fontSize: "11.5px", fontWeight: 700 }}>{f}</div>
              <div style={{ fontSize: "10px", color: "#888" }}>
                {fileMeta[f] ? `${fileMeta[f].kind.toUpperCase()} · ${fileMeta[f].sizeKB >= 1024 ? (fileMeta[f].sizeKB / 1024).toFixed(1) + " MB" : fileMeta[f].sizeKB + " KB"}` : `Attached via ${order.quoteRefId}`}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Communications tab — email / call / SMS / IG / note log ───
function CommsTab({ order }: { order: Order }) {
  const comms = order.communications ?? [];
  if (comms.length === 0) {
    return <div style={{ padding: "20px", textAlign: "center", color: "#888", fontSize: "12.5px" }}>No communications logged for this order yet.</div>;
  }
  const iconFor = (c: CommEntry["channel"]) => {
    switch (c) {
      case "email_in": return { icon: "✉", tint: "#3b82f6", label: "Email in" };
      case "email_out": return { icon: "✉", tint: "#22c55e", label: "Email out" };
      case "call_in": return { icon: "📞", tint: "#3b82f6", label: "Call in" };
      case "call_out": return { icon: "📞", tint: "#22c55e", label: "Call out" };
      case "sms_in": return { icon: "💬", tint: "#3b82f6", label: "SMS in" };
      case "sms_out": return { icon: "💬", tint: "#22c55e", label: "SMS out" };
      case "ig_in": return { icon: "📷", tint: "#e11d48", label: "IG DM in" };
      case "ig_out": return { icon: "📷", tint: "#e11d48", label: "IG DM out" };
      case "note": return { icon: "📝", tint: "#78350f", label: "Internal note" };
    }
  };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
      {comms.map((c, i) => {
        const meta = iconFor(c.channel);
        return (
          <div key={i} style={{ padding: "12px 14px", background: c.channel === "note" ? "#fffbeb" : "var(--preview-surface-2)", border: `1px solid ${c.channel === "note" ? "#fde68a" : "var(--preview-border)"}`, borderRadius: "10px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: "8px", marginBottom: "4px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                <span style={{ width: "22px", height: "22px", borderRadius: "50%", background: meta.tint + "22", color: meta.tint, fontSize: "11px", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>{meta.icon}</span>
                <span style={{ fontSize: "10.5px", color: "#888", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em" }}>{meta.label}</span>
                <span style={{ fontSize: "12px", fontWeight: 700 }}>· {c.author}</span>
              </div>
              <span style={{ fontSize: "10.5px", color: "#888" }}>{c.at}</span>
            </div>
            {c.subject && <div style={{ fontSize: "12.5px", fontWeight: 700, marginBottom: "3px" }}>{c.subject}</div>}
            <div style={{ fontSize: "12px", color: "#333", lineHeight: 1.5 }}>{c.body}</div>
            {c.attachments && c.attachments.length > 0 && (
              <div style={{ display: "flex", gap: "5px", flexWrap: "wrap", marginTop: "6px" }}>
                {c.attachments.map(a => (
                  <span key={a} style={{ padding: "2px 8px", background: "#eff6ff", color: "#1e40af", border: "1px solid #bfdbfe", fontSize: "10.5px", fontWeight: 600, borderRadius: "5px" }}>📎 {a}</span>
                ))}
              </div>
            )}
          </div>
        );
      })}
      <button style={{ marginTop: "6px", padding: "8px 12px", background: ACCENT, color: "#fff", border: "none", borderRadius: "8px", fontSize: "12px", fontWeight: 700, cursor: "pointer" }}>+ Log new communication</button>
    </div>
  );
}

function PaymentsTab({ order }: { order: Order }) {
  const payments = order.payments ?? [];
  if (payments.length === 0) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
        <div style={{ padding: "12px 16px", background: "#fee2e2", border: "1px solid #fecaca", borderRadius: "8px" }}>
          <div style={{ fontSize: "13px", fontWeight: 800, color: "#dc2626" }}>Awaiting payment — {fmtMoney(order.balanceDue)}</div>
          <div style={{ fontSize: "11px", color: "#dc2626" }}>No payments recorded yet.</div>
        </div>
        <button style={{ padding: "10px", background: ACCENT, color: "#fff", border: "none", borderRadius: "8px", fontSize: "12.5px", fontWeight: 700, cursor: "pointer" }}>+ Record Payment</button>
      </div>
    );
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
      {payments.map((p, i) => (
        <div key={i} style={{ padding: "12px 16px", background: p.amount < 0 ? "#fef3c7" : "var(--preview-surface-2)", border: `1px solid ${p.amount < 0 ? "#fde68a" : "var(--preview-border)"}`, borderRadius: "8px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
            <div>
              <div style={{ fontSize: "13px", fontWeight: 800 }}>
                {p.amount < 0 ? "Refund" : `Payment #${i + 1}`} — {fmtMoney(Math.abs(p.amount))}
              </div>
              <div style={{ fontSize: "11px", color: "#888" }}>{p.date} · {p.method} · {p.ref}</div>
            </div>
            <div style={{ padding: "3px 8px", background: p.status === "Completed" ? "#dcfce7" : p.status === "Pending Clearance" ? "#fef3c7" : "#fee2e2", color: p.status === "Completed" ? "#166534" : p.status === "Pending Clearance" ? "#78350f" : "#dc2626", fontSize: "11px", fontWeight: 700, borderRadius: "5px" }}>{p.status}</div>
          </div>
        </div>
      ))}
      {order.balanceDue > 0 && (
        <div style={{ padding: "12px 16px", background: "#fee2e2", border: "1px solid #fecaca", borderRadius: "8px" }}>
          <div style={{ fontSize: "13px", fontWeight: 800, color: "#dc2626" }}>Balance Due — {fmtMoney(order.balanceDue)}</div>
          <div style={{ fontSize: "11px", color: "#dc2626" }}>Awaiting payment · terms {order.paymentTerms || "—"}</div>
        </div>
      )}
      <button style={{ padding: "10px", background: ACCENT, color: "#fff", border: "none", borderRadius: "8px", fontSize: "12.5px", fontWeight: 700, cursor: "pointer" }}>+ Record Payment</button>
    </div>
  );
}

// ─── Right: Activity Timeline card (compact) ─────────────────
function ActivityTimelineCard({ events }: { events: TimelineEvent[] }) {
  return (
    <div style={{ background: "var(--preview-surface)", border: "1px solid var(--preview-border)", borderRadius: "14px", padding: "16px 18px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
        <div style={{ fontSize: "10.5px", fontWeight: 800, color: "#888", textTransform: "uppercase", letterSpacing: "0.05em" }}>Activity Timeline</div>
        <span style={{ fontSize: "11px", color: ACCENT, fontWeight: 700, cursor: "pointer" }}>View all</span>
      </div>
      <div style={{ position: "relative", paddingLeft: "6px" }}>
        <div style={{ position: "absolute", left: "20px", top: "10px", bottom: "10px", width: "2px", background: "#f0f0f0" }} />
        {events.map((e, i) => (
          <div key={i} style={{ display: "flex", gap: "10px", padding: "6px 0", position: "relative", zIndex: 1 }}>
            <div style={{ width: "26px", height: "26px", borderRadius: "50%", background: e.tint + "22", color: e.tint, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "11px", flexShrink: 0, border: "2px solid #fff" }}>{e.icon}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: "10.5px", color: "#888" }}>{e.at}</div>
              <div style={{ fontSize: "12px", fontWeight: 700, marginTop: "1px" }}>{e.title}</div>
              {e.sub && <div style={{ fontSize: "10.5px", color: "#888", marginTop: "1px" }}>{e.sub}</div>}
            </div>
          </div>
        ))}
      </div>
      <button style={{ width: "100%", marginTop: "10px", padding: "6px 8px", background: "var(--preview-surface)", border: "1px solid var(--preview-border)", borderRadius: "6px", fontSize: "11px", fontWeight: 600, cursor: "pointer" }}>🕐 View Full Timeline</button>
    </div>
  );
}

// ─── Right: Workflow Progress card ─────────────────
function WorkflowProgressCard({ order }: { order: Order }) {
  const stages = ["Quote", "Approved", "Design", "Production", "QC", "Pickup"];
  const currentIdx = order.status === "Pending Payment" ? 1 : order.status === "In Production" ? 3 : order.status === "Ready to Ship" ? 4 : order.status === "Shipped" ? 5 : order.status === "Delivered" ? 5 : order.status === "Refunded" ? 5 : 3;
  return (
    <div style={{ background: "var(--preview-surface)", border: "1px solid var(--preview-border)", borderRadius: "14px", padding: "16px 18px" }}>
      <div style={{ fontSize: "10.5px", fontWeight: 800, color: "#888", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "12px" }}>Workflow Progress</div>
      <div style={{ display: "flex", alignItems: "flex-start", marginBottom: "14px" }}>
        {stages.map((s, i) => (
          <div key={s} style={{ display: "flex", alignItems: "flex-start", flex: 1 }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flex: 1 }}>
              <div style={{
                width: "22px", height: "22px", borderRadius: "50%",
                background: i < currentIdx ? "#22c55e" : i === currentIdx ? ACCENT : "#e5e5e5",
                color: "var(--preview-text)",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: "10px", fontWeight: 800,
              }}>{i < currentIdx ? "✓" : i === currentIdx ? "●" : ""}</div>
              <div style={{ fontSize: "9.5px", color: i <= currentIdx ? "#171717" : "#888", marginTop: "4px", fontWeight: i === currentIdx ? 700 : 500, textAlign: "center" }}>{s}</div>
            </div>
            {i < stages.length - 1 && <div style={{ flex: 1, height: "2px", background: i < currentIdx ? "#22c55e" : "#e5e5e5", marginTop: "10px", margin: "10px -6px 0" }} />}
          </div>
        ))}
      </div>

      <div style={{ paddingTop: "12px", borderTop: "1px solid #f0f0f0", display: "flex", alignItems: "center", gap: "10px", marginBottom: "12px" }}>
        <div style={{ width: "30px", height: "30px", borderRadius: "50%", background: "#f97316" + "22", color: "#f97316", fontSize: "10px", fontWeight: 800, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>MH</div>
        <div>
          <div style={{ fontSize: "10.5px", color: "#888" }}>Designer</div>
          <div style={{ fontSize: "12.5px", fontWeight: 700 }}>Marianna H.</div>
        </div>
      </div>
      <div style={{ fontSize: "10.5px", color: "#888", marginBottom: "10px" }}>Last Update · Jul 03, 2026 9:15 AM</div>
      <button style={{ width: "100%", padding: "8px", background: "var(--preview-surface)", border: "1px solid var(--preview-border)", borderRadius: "8px", fontSize: "12px", fontWeight: 700, cursor: "pointer" }}>↗ Open in Workflow</button>
    </div>
  );
}

// ─── Financial Summary bar ─────────────────
function FinancialSummary({ order }: { order: Order }) {
  const paid = order.balanceDue === 0;
  return (
    <div style={{ background: "var(--preview-surface)", border: "1px solid var(--preview-border)", borderRadius: "14px", padding: "14px 22px", display: "flex", alignItems: "center", gap: "24px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "8px", flex: 1 }}>
        <div style={{ fontSize: "10.5px", fontWeight: 800, color: "#888", textTransform: "uppercase", letterSpacing: "0.05em" }}>💰 Financial Summary</div>
        <span style={{ padding: "2px 8px", background: paid ? "#dcfce7" : "#fef3c7", color: paid ? "#166534" : "#78350f", fontSize: "10.5px", fontWeight: 700, borderRadius: "5px" }}>{paid ? "Paid in full" : "Partial"}</span>
      </div>
      <FinCell label="Amount Paid" value={fmtMoney(order.received)} />
      <FinCell label="Last Payment" value={order.payments && order.payments.length > 0 ? order.payments[order.payments.length - 1].date : "—"} />
      <FinCell label="Payment Method" value={order.payments && order.payments.length > 0 ? `${order.payments[order.payments.length - 1].method} · ${order.payments[order.payments.length - 1].ref}` : (order.balanceDue > 0 ? "Awaiting" : "—")} />
      <button style={{ padding: "8px 14px", background: "var(--preview-surface)", border: "1px solid var(--preview-border)", borderRadius: "8px", fontSize: "12.5px", fontWeight: 700, cursor: "pointer" }}>📄 View Receipt</button>
    </div>
  );
}

function FinCell({ label, value }: any) {
  return (
    <div>
      <div style={{ fontSize: "10px", color: "#888", textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 700 }}>{label}</div>
      <div style={{ fontSize: "12.5px", fontWeight: 700, marginTop: "2px" }}>{value}</div>
    </div>
  );
}

function QuickField({ icon, label, children }: any) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12.5px" }}>
      <span style={{ fontSize: "13px" }}>{icon}</span>
      <span style={{ fontSize: "10px", color: "#888", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</span>
      <span>{children}</span>
    </div>
  );
}

// ─── Activity Timeline ────────────────────────────────
interface TimelineEvent { icon: string; tint: string; title: string; sub?: string; at: string; ref?: string }

function buildTimeline(order: Order): TimelineEvent[] {
  const paidPart = order.received > 0 && order.received < order.total;
  const paidFull = order.received >= order.total && order.total > 0;
  const now: TimelineEvent[] = [];

  // Quote lifecycle
  now.push({ icon: "📝", tint: "#f97316", title: "Quote drafted", sub: `${order.quoteRefId} by ${order.createdBy}`, at: "5d ago", ref: order.quoteRefId });
  now.push({ icon: "✉", tint: "#3b82f6", title: "Quote sent to customer", sub: `Email + SMS to ${order.contact}`, at: "5d ago" });
  now.push({ icon: "👁", tint: "#22c55e", title: "Customer viewed quote", sub: order.quoteRefId, at: "4d ago" });
  now.push({ icon: "✓", tint: "#16a34a", title: "Customer approved quote", sub: `${order.contact} accepted terms`, at: "3d ago" });

  // Payment
  if (paidFull) {
    now.push({ icon: "💵", tint: "#16a34a", title: "Payment received", sub: `${fmtMoney(order.total)} · full payment`, at: "3d ago" });
  } else if (paidPart) {
    now.push({ icon: "💵", tint: "#f59e0b", title: "Partial payment received", sub: `${fmtMoney(order.received)} of ${fmtMoney(order.total)} · balance ${fmtMoney(order.balanceDue)}`, at: "3d ago" });
  } else if (order.payment === "Tax Exempt") {
    now.push({ icon: "🧾", tint: "#4f46e5", title: "Tax-exempt approved", sub: "Reseller certificate on file", at: "3d ago" });
  } else if (order.payment === "Pending Tax Review") {
    now.push({ icon: "⏳", tint: "#a16207", title: "Awaiting tax review", sub: "Reseller certificate submitted, pending verification", at: "1d ago" });
  }

  // Order creation
  now.push({ icon: "📦", tint: "#8b5cf6", title: "Order created", sub: `ORD-${order.refId} · from ${order.quoteRefId}`, at: order.createdAgo, ref: `ORD-${order.refId}` });

  // Production events
  if (["In Production", "Ready to Ship", "Shipped", "Delivered"].includes(order.status)) {
    now.push({ icon: "🎯", tint: "#3b82f6", title: "Sent to Workflow", sub: `Job card #${order.refId} on production board`, at: "20h ago" });
    now.push({ icon: "🎨", tint: "#a78bfa", title: "Assigned to designer", sub: "Marianna", at: "18h ago" });
    now.push({ icon: "✏", tint: "#f59e0b", title: "Proof sent to customer", sub: "Awaiting sign-off", at: "12h ago" });
    now.push({ icon: "✓", tint: "#16a34a", title: "Proof approved", sub: `${order.contact} approved artwork`, at: "8h ago" });
    now.push({ icon: "🏭", tint: "#06b6d4", title: "In production", sub: "HP Indigo 6K · press operator: Arsen", at: "4h ago" });
  }
  if (["Ready to Ship", "Shipped", "Delivered"].includes(order.status)) {
    now.push({ icon: "📦", tint: "#f59e0b", title: "Ready to ship", sub: "QC passed · boxed", at: "2h ago" });
  }
  if (["Shipped", "Delivered"].includes(order.status)) {
    now.push({ icon: "🚚", tint: "#3b82f6", title: "Shipped", sub: order.trackingRef ? `Tracking ${order.trackingRef}` : "In transit", at: "1h ago" });
  }
  if (order.status === "Delivered") {
    now.push({ icon: "✓", tint: "#16a34a", title: "Delivered", sub: "Signed by customer", at: "just now" });
  }

  return now.reverse(); // newest first
}

function OrderTimeline({ events, order }: { events: TimelineEvent[]; order: Order }) {
  return (
    <div style={{ background: "var(--preview-surface)", border: "1px solid var(--preview-border)", borderRadius: "14px", padding: "16px 20px", height: "fit-content" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px" }}>
        <div style={{ fontSize: "12px", fontWeight: 800, letterSpacing: "0.04em" }}>🕐 ORDER HISTORY</div>
        <span style={{ fontSize: "11px", color: "#888" }}>{events.length} events</span>
      </div>

      <div style={{ position: "relative", paddingLeft: "8px" }}>
        <div style={{ position: "absolute", left: "22px", top: "10px", bottom: "10px", width: "2px", background: "#f0f0f0" }} />
        {events.map((e, i) => (
          <div key={i} style={{ display: "flex", gap: "12px", padding: "6px 0", position: "relative", zIndex: 1 }}>
            <div style={{ width: "30px", height: "30px", borderRadius: "50%", background: e.tint + "22", color: e.tint, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "13px", flexShrink: 0, border: "2px solid #fff" }}>{e.icon}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: "6px" }}>
                <span style={{ fontSize: "12.5px", fontWeight: 700 }}>{e.title}</span>
                <span style={{ fontSize: "10.5px", color: "#888", whiteSpace: "nowrap" }}>{e.at}</span>
              </div>
              {e.sub && <div style={{ fontSize: "11px", color: "#666", marginTop: "1px", lineHeight: 1.4 }}>
                {e.ref ? (
                  <>{e.sub.split(e.ref)[0]}<span style={{ color: ACCENT, fontWeight: 700, cursor: "pointer" }}>{e.ref}</span>{e.sub.split(e.ref)[1] || ""}</>
                ) : e.sub}
              </div>}
            </div>
          </div>
        ))}
      </div>

      {/* Comment / note composer */}
      <div style={{ marginTop: "16px", paddingTop: "14px", borderTop: "1px solid #f0f0f0" }}>
        <div style={{ fontSize: "10.5px", fontWeight: 700, color: "#666", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "6px" }}>+ Add Note</div>
        <textarea placeholder="Log something... visible to team." style={{ width: "100%", minHeight: "50px", padding: "8px 10px", border: "1px solid var(--preview-border)", borderRadius: "8px", fontSize: "12px", fontFamily: "inherit", resize: "vertical", boxSizing: "border-box" }} />
        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "6px" }}>
          <button style={{ padding: "5px 12px", background: ACCENT, color: "#fff", border: "none", borderRadius: "6px", fontSize: "11.5px", fontWeight: 700, cursor: "pointer" }}>Add to timeline</button>
        </div>
      </div>
    </div>
  );
}

function Meta({ label, children }: any) {
  return (
    <div>
      <div style={{ fontSize: "10px", color: "#888", textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 700, marginBottom: "3px" }}>{label}</div>
      <div style={{ fontSize: "12.5px", fontWeight: 600, color: "#171717" }}>{children}</div>
    </div>
  );
}

// ─── Small helpers ────────────────────────────────────────
const th: React.CSSProperties = { textAlign: "left", padding: "12px 12px", fontWeight: 700 };
const td: React.CSSProperties = { padding: "14px 12px", verticalAlign: "top" };
