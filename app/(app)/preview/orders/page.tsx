"use client";

// Hayk 2026-07-01 — Orders preview.
// Same parameter shape as the New Quote flow — line items carry catalog IDs
// (productId, materialId, finishingIds, specialEffectIds) so nothing gets
// re-entered when the quote converts to an order.

import { useMemo, useState } from "react";

const ACCENT = "#FF5D2E";
const GOLD = "#fbbf24";

// ─── Types ────────────────────────────────────────────
type OrderStatus = "Pending Payment" | "In Production" | "Ready to Ship" | "Shipped" | "Delivered" | "Cancelled" | "Refunded";
type PaymentStatus = "Paid" | "Partial" | "Tax Exempt" | "Pending Tax Review" | "Unpaid";
type Priority = "Normal" | "High" | "Rush";

interface OrderLineItem {
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

interface Order {
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
  dueOverdue?: boolean;
  status: OrderStatus;
  payment: PaymentStatus;
  createdAgo: string;
  createdDate: string;             // "06/28/2026" — actual date the order was placed
  attachmentsCount: number;
  attachments: string[];           // sample file names, e.g. ["artwork_v3.ai", "dieline.pdf"]
  productionNotes?: string;
  shippingMethod?: "Pickup" | "Ship";
  trackingRef?: string;
  refundedAmount?: number;         // set when status is Refunded
  refundReason?: string;
}

// ─── Mock dataset ────────────────────────────────────────
const ORDERS: Order[] = [
  {
    refId: "2026-0114", quoteRefId: "QO-2026-0114",
    contact: "Joseph", company: "Frenzy Organics",
    createdBy: "Manny Carlo", ownerAvatar: "MC", ownerColor: "#3b82f6",
    title: "JAR DESIGN — 1 OFF SAMPLE PRINT ON CLEAR LABEL MATERIAL",
    lineItems: [
      { id: "l1", productId: 3, productName: "Roll Labels", productCategory: "Labels & Stickers", materialId: 200, materialName: "Clear Label (Clear BOPP)", quantity: 1, widthIn: 2.5, heightIn: 3.5, sides: "S1", colorMode: "CMYK", finishingIds: [], finishingLabels: [], specialEffectIds: [], specialEffectLabels: [], unitPrice: 54.88, extended: 54.88, comment: "Sample print — clear material" },
    ],
    total: 54.88, received: 54.88, balanceDue: 0,
    priority: "High", dueDate: "07/01/2026", dueOverdue: false,
    status: "In Production", payment: "Paid",
    createdAgo: "16h ago", createdDate: "06/30/2026", attachmentsCount: 2, attachments: ["artwork_v3.ai", "dieline.pdf"], productionNotes: "Rush — customer needs first article today",
    shippingMethod: "Pickup",
  },
  {
    refId: "2026-0112", quoteRefId: "QO-2026-0112",
    contact: "ulisesss Sillero", company: "The Holding Company",
    createdBy: "Ernesto Navarro", ownerAvatar: "EN", ownerColor: "#22c55e",
    title: "has 9 sku wants 640 each transparent labels with raised uv matte finish total 5760",
    lineItems: [
      { id: "l1", productId: 3, productName: "Roll Labels", productCategory: "Labels & Stickers", materialId: 200, materialName: "Clear Label (Clear BOPP)", quantity: 5760, widthIn: 2, heightIn: 3, sides: "S1", colorMode: "CMYK", finishingIds: [177], finishingLabels: ["Matte Lam"], specialEffectIds: [206], specialEffectLabels: ["Raised UV"], unitPrice: 0.99, extended: 5702.40 },
    ],
    total: 5702.40, received: 5702.40, balanceDue: 0,
    priority: "Normal", dueDate: "07/03/2026",
    status: "In Production", payment: "Tax Exempt",
    createdAgo: "16h ago", createdDate: "06/30/2026", attachmentsCount: 4, attachments: ["9sku_master.ai", "proof_front.pdf", "proof_back.pdf", "raised_uv_map.pdf"],
    shippingMethod: "Ship",
  },
  {
    refId: "2026-0109", quoteRefId: "QO-2026-0109",
    contact: "Matt", company: "Moon Mind",
    createdBy: "Maria Hakobyan", ownerAvatar: "MH", ownerColor: "#f97316",
    title: "",
    lineItems: [
      { id: "l1", productId: 12, productName: "Folding Cartons", productCategory: "Packaging & Boxes", materialId: 198, materialName: "18pt SBS C1S", quantity: 500, widthIn: 3.5, heightIn: 2.5, sides: "S1", colorMode: "CMYK", finishingIds: [179], finishingLabels: ["Gloss Lam"], specialEffectIds: [], specialEffectLabels: [], unitPrice: 2.49, extended: 1245.66 },
    ],
    total: 1245.66, received: 1245.66, balanceDue: 0,
    priority: "Normal", dueDate: "",
    status: "In Production", payment: "Paid",
    createdAgo: "20h ago", createdDate: "06/30/2026", attachmentsCount: 1, attachments: ["moon_mind_carton.pdf"],
    shippingMethod: "Pickup",
  },
  {
    refId: "2026-0111", quoteRefId: "QO-2026-0111",
    contact: "Boris Boris", company: "",
    createdBy: "Ernesto Navarro", ownerAvatar: "EN", ownerColor: "#22c55e",
    title: "has 1 sku wants 2000 pcs at 0.75 each soft touch spot uv using small die LA Kush 9ml jar",
    lineItems: [
      { id: "l1", productId: 30, productName: "Label + 9ml Jar Combo", productCategory: "Combos", materialId: 189, materialName: "Semi-Gloss Paper Label", quantity: 2000, widthIn: 2, heightIn: 2, sides: "S1", colorMode: "CMYK", finishingIds: [178], finishingLabels: ["Soft Touch Lam"], specialEffectIds: [201], specialEffectLabels: ["Spot UV"], unitPrice: 0.75, extended: 1500.00 },
    ],
    total: 1500.00, received: 800.00, balanceDue: 700.00,
    priority: "Normal", dueDate: "07/03/2026",
    status: "In Production", payment: "Tax Exempt",
    createdAgo: "18h ago", createdDate: "06/30/2026", attachmentsCount: 3, attachments: ["la_kush_label.ai", "spot_uv_mask.pdf", "small_die.dxf"],
    shippingMethod: "Ship",
  },
  {
    refId: "2026-0108", quoteRefId: "QO-2026-0108",
    contact: "Amazi Amazi", company: "Trap Snacks",
    createdBy: "Ernesto Navarro", ownerAvatar: "EN", ownerColor: "#22c55e",
    title: "for trap snacks has 6 skus wants 427 of each box and bag soft touch spot uv front and bak using terp head die",
    lineItems: [
      { id: "l1", productId: 12, productName: "Folding Cartons", productCategory: "Packaging & Boxes", materialId: 198, materialName: "18pt SBS C1S", quantity: 2562, widthIn: 4, heightIn: 3, sides: "S2", colorMode: "CMYK", finishingIds: [178], finishingLabels: ["Soft Touch Lam"], specialEffectIds: [201], specialEffectLabels: ["Spot UV"], unitPrice: 2.19, extended: 5610.78 },
      { id: "l2", productId: 30, productName: "Stand Up Pouch", productCategory: "Bags & Pouches", materialId: 175, materialName: "MET PET", quantity: 2562, widthIn: 5, heightIn: 8, sides: "S2", colorMode: "CMYK", finishingIds: [178], finishingLabels: ["Soft Touch Lam"], specialEffectIds: [201], specialEffectLabels: ["Spot UV"], unitPrice: 1.52, extended: 3906.74 },
    ],
    total: 9517.52, received: 5000.00, balanceDue: 4517.52,
    priority: "Normal", dueDate: "07/03/2026",
    status: "In Production", payment: "Partial",
    createdAgo: "20h ago", createdDate: "06/30/2026", attachmentsCount: 6, attachments: ["trap_snacks_box_v2.ai", "trap_snacks_pouch.ai", "terp_head.dxf", "spot_uv_front.pdf", "spot_uv_back.pdf", "proof_bundle.pdf"],
    shippingMethod: "Ship",
  },
  {
    refId: "2026-0094", quoteRefId: "QO-2026-0094",
    contact: "Guy Eran", company: "Green Boyz",
    createdBy: "Ernesto Navarro", ownerAvatar: "EN", ownerColor: "#22c55e",
    title: "crunch berries 3.5g jar boxes and labels and tube label, ssoft touch, spot uv, silver dot foiling",
    lineItems: [
      { id: "l1", productId: 12, productName: "Folding Cartons", productCategory: "Packaging & Boxes", materialId: 198, materialName: "18pt SBS C1S", quantity: 500, widthIn: 3, heightIn: 2, sides: "S1", colorMode: "CMYK", finishingIds: [178], finishingLabels: ["Soft Touch Lam"], specialEffectIds: [201, 209], specialEffectLabels: ["Spot UV", "Silver Foil"], unitPrice: 3.60, extended: 1800.01 },
    ],
    total: 1800.01, received: 1800.01, balanceDue: 0,
    priority: "Normal", dueDate: "06/30/2026", dueOverdue: true,
    status: "In Production", payment: "Paid",
    createdAgo: "3d ago", createdDate: "06/28/2026", attachmentsCount: 5, attachments: ["crunch_berries_box.ai", "tube_label.ai", "jar_label.ai", "silver_foil_map.pdf", "final_proof.pdf"],
    shippingMethod: "Ship",
  },
  {
    refId: "2026-0106", quoteRefId: "QO-2026-0106",
    contact: "Safe Care Packaging", company: "Safe Care LLC",
    createdBy: "Ernesto Navarro", ownerAvatar: "EN", ownerColor: "#22c55e",
    title: "for suspended wants 3000pcs for 8th labels and 1000pcs for 1/4 labels",
    lineItems: [
      { id: "l1", productId: 3, productName: "Roll Labels", productCategory: "Labels & Stickers", materialId: 189, materialName: "Semi-Gloss Paper Label", quantity: 3000, widthIn: 2, heightIn: 3, sides: "S1", colorMode: "CMYK", finishingIds: [], finishingLabels: [], specialEffectIds: [], specialEffectLabels: [], unitPrice: 0.12, extended: 360.00 },
      { id: "l2", productId: 3, productName: "Roll Labels", productCategory: "Labels & Stickers", materialId: 189, materialName: "Semi-Gloss Paper Label", quantity: 1000, widthIn: 1.75, heightIn: 2.5, sides: "S1", colorMode: "CMYK", finishingIds: [], finishingLabels: [], specialEffectIds: [], specialEffectLabels: [], unitPrice: 0.12, extended: 120.00 },
    ],
    total: 480.00, received: 0, balanceDue: 480.00,
    priority: "Normal", dueDate: "07/02/2026",
    status: "Pending Payment", payment: "Pending Tax Review",
    createdAgo: "1d ago", createdDate: "06/29/2026", attachmentsCount: 2, attachments: ["8th_label.ai", "quarter_label.ai"],
  },
  {
    refId: "2026-0103", quoteRefId: "QO-2026-0103",
    contact: "Davit Zargaryan", company: "",
    createdBy: "Zargaryan Davit", ownerAvatar: "DZ", ownerColor: "#8b5cf6",
    title: "Test-5",
    lineItems: [{ id: "l1", productId: 3, productName: "Roll Labels", productCategory: "Labels & Stickers", materialId: 189, materialName: "Semi-Gloss Paper Label", quantity: 1, widthIn: 2, heightIn: 2, sides: "S1", colorMode: "CMYK", finishingIds: [], finishingLabels: [], specialEffectIds: [], specialEffectLabels: [], unitPrice: 0.44, extended: 0.44 }],
    total: 0.44, received: 0.44, balanceDue: 0,
    priority: "Normal", dueDate: "06/30/2026", dueOverdue: true,
    status: "In Production", payment: "Paid",
    createdAgo: "1d ago", createdDate: "06/29/2026", attachmentsCount: 0, attachments: [],
  },
  {
    refId: "2026-0083", quoteRefId: "QO-2026-0083",
    contact: "Quoanda Renee", company: "Jesus Girl Apparel",
    createdBy: "Manny Carlo", ownerAvatar: "MC", ownerColor: "#3b82f6",
    title: "B/W TEES, 1 LOGOS PER SHIRT LG/SM",
    lineItems: [
      { id: "l1", productId: 50, productName: "T-Shirt (Screen Print)", productCategory: "Apparel", materialId: 100, materialName: "Cotton T-Shirt", quantity: 285, widthIn: 8, heightIn: 10, sides: "S1", colorMode: "CMYK", finishingIds: [], finishingLabels: [], specialEffectIds: [], specialEffectLabels: [], unitPrice: 5.00, extended: 1425.00, comment: "LG + SM shirts, 1-color logo" },
    ],
    total: 1426.75, received: 1426.75, balanceDue: 0,
    priority: "Normal", dueDate: "06/30/2026", dueOverdue: true,
    status: "In Production", payment: "Paid",
    createdAgo: "4d ago", createdDate: "06/26/2026", attachmentsCount: 2, attachments: ["jesus_girl_logo.ai", "shirt_placement.pdf"],
  },
  {
    refId: "2026-0079", quoteRefId: "QO-2026-0079",
    contact: "Oscar Rivera", company: "Old Salt Coffee",
    createdBy: "Maria Hakobyan", ownerAvatar: "MH", ownerColor: "#f97316",
    title: "Cold brew label roll — 15,000 pcs, matte lam",
    lineItems: [
      { id: "l1", productId: 3, productName: "Roll Labels", productCategory: "Labels & Stickers", materialId: 189, materialName: "Semi-Gloss Paper Label", quantity: 15000, widthIn: 3, heightIn: 4, sides: "S1", colorMode: "CMYK", finishingIds: [177], finishingLabels: ["Matte Lam"], specialEffectIds: [], specialEffectLabels: [], unitPrice: 0.14, extended: 2100.00 },
    ],
    total: 2100.00, received: 2100.00, balanceDue: 0,
    priority: "Normal", dueDate: "07/03/2026",
    status: "Ready to Ship", payment: "Paid",
    createdAgo: "5d ago", createdDate: "06/25/2026", attachmentsCount: 3, attachments: ["cold_brew_label.ai", "matte_finish_spec.pdf", "print_proof.jpg"],
    shippingMethod: "Ship",
  },
  {
    refId: "2026-0075", quoteRefId: "QO-2026-0075",
    contact: "Ruben Torres", company: "Coco Bloom",
    createdBy: "Ernesto Navarro", ownerAvatar: "EN", ownerColor: "#22c55e",
    title: "Custom folding cartons — matte + gold foil dot",
    lineItems: [
      { id: "l1", productId: 12, productName: "Folding Cartons", productCategory: "Packaging & Boxes", materialId: 198, materialName: "18pt SBS C1S", quantity: 1000, widthIn: 3.5, heightIn: 3.5, sides: "S1", colorMode: "CMYK", finishingIds: [177], finishingLabels: ["Matte Lam"], specialEffectIds: [208], specialEffectLabels: ["Gold Foil"], unitPrice: 3.20, extended: 3200.00 },
    ],
    total: 3200.00, received: 3200.00, balanceDue: 0,
    priority: "Normal", dueDate: "06/28/2026",
    status: "Shipped", payment: "Paid",
    createdAgo: "6d ago", createdDate: "06/24/2026", attachmentsCount: 4, attachments: ["coco_bloom_carton.ai", "gold_foil_map.pdf", "matte_lam_spec.pdf", "final_proof.pdf"],
    shippingMethod: "Ship", trackingRef: "1Z999AA10123456784",
  },
  {
    refId: "2026-0071", quoteRefId: "QO-2026-0071",
    contact: "Zoe Lin", company: "Verdant Roots",
    createdBy: "Manny Carlo", ownerAvatar: "MC", ownerColor: "#3b82f6",
    title: "Standup pouches — 3,000 units, holographic foil",
    lineItems: [
      { id: "l1", productId: 30, productName: "Stand Up Pouch", productCategory: "Bags & Pouches", materialId: 175, materialName: "MET PET", quantity: 3000, widthIn: 5, heightIn: 8, sides: "S2", colorMode: "CMYK", finishingIds: [178], finishingLabels: ["Soft Touch Lam"], specialEffectIds: [210], specialEffectLabels: ["Holographic Foil"], unitPrice: 1.80, extended: 5400.00 },
    ],
    total: 5400.00, received: 5400.00, balanceDue: 0,
    priority: "Rush", dueDate: "06/25/2026",
    status: "Delivered", payment: "Paid",
    createdAgo: "9d ago", createdDate: "06/21/2026", attachmentsCount: 5, attachments: ["verdant_pouch.ai", "holographic_foil.pdf", "gusset_spec.pdf", "front_proof.jpg", "back_proof.jpg"],
    shippingMethod: "Ship", trackingRef: "1Z999AA10123456789",
  },
  {
    refId: "2026-0068", quoteRefId: "QO-2026-0068",
    contact: "Marcus King", company: "Rise Kombucha",
    createdBy: "Ernesto Navarro", ownerAvatar: "EN", ownerColor: "#22c55e",
    title: "Bottle labels — 8,000 pcs, spot UV highlights",
    lineItems: [
      { id: "l1", productId: 3, productName: "Roll Labels", productCategory: "Labels & Stickers", materialId: 200, materialName: "Clear Label (Clear BOPP)", quantity: 8000, widthIn: 3, heightIn: 4, sides: "S1", colorMode: "CMYK", finishingIds: [], finishingLabels: [], specialEffectIds: [201], specialEffectLabels: ["Spot UV"], unitPrice: 0.22, extended: 1760.00 },
    ],
    total: 1760.00, received: 1760.00, balanceDue: 0,
    priority: "Normal", dueDate: "06/26/2026",
    status: "Shipped", payment: "Paid",
    createdAgo: "8d ago", createdDate: "06/22/2026", attachmentsCount: 3, attachments: ["rise_kombucha_label.ai", "spot_uv_mask.pdf", "clear_bopp_spec.pdf"],
    shippingMethod: "Ship", trackingRef: "1Z999AA10555432198",
  },
  {
    refId: "2026-0065", quoteRefId: "QO-2026-0065",
    contact: "Nikoloz K.", company: "Iron Pine",
    createdBy: "Maria Hakobyan", ownerAvatar: "MH", ownerColor: "#f97316",
    title: "Postcards + trifold brochures for launch event",
    lineItems: [
      { id: "l1", productId: 40, productName: "Postcards", productCategory: "Marketing Materials", materialId: 199, materialName: "14pt C2S Card Stock", quantity: 2500, widthIn: 4, heightIn: 6, sides: "S2", colorMode: "CMYK", finishingIds: [179], finishingLabels: ["Gloss Lam"], specialEffectIds: [], specialEffectLabels: [], unitPrice: 0.28, extended: 700.00 },
      { id: "l2", productId: 41, productName: "Trifold Brochure", productCategory: "Marketing Materials", materialId: 199, materialName: "14pt C2S Card Stock", quantity: 1000, widthIn: 8.5, heightIn: 11, sides: "S2", colorMode: "CMYK", finishingIds: [], finishingLabels: [], specialEffectIds: [], specialEffectLabels: [], unitPrice: 0.45, extended: 450.00 },
    ],
    total: 1150.00, received: 1150.00, balanceDue: 0,
    priority: "Normal", dueDate: "06/22/2026",
    status: "Delivered", payment: "Paid",
    createdAgo: "12d ago", createdDate: "06/18/2026", attachmentsCount: 2, attachments: ["postcard_artwork.pdf", "trifold_artwork.pdf"],
    shippingMethod: "Pickup",
  },
  {
    refId: "2026-0060", quoteRefId: "QO-2026-0060",
    contact: "Lena Park", company: "Hearth Bread",
    createdBy: "Ernesto Navarro", ownerAvatar: "EN", ownerColor: "#22c55e",
    title: "Mylar bags for cookie collection — 4 SKU",
    lineItems: [
      { id: "l1", productId: 30, productName: "Mylar Bag", productCategory: "Bags & Pouches", materialId: 175, materialName: "MET PET", quantity: 5000, widthIn: 5, heightIn: 7, sides: "S2", colorMode: "CMYK", finishingIds: [178], finishingLabels: ["Soft Touch Lam"], specialEffectIds: [], specialEffectLabels: [], unitPrice: 1.15, extended: 5750.00 },
    ],
    total: 5750.00, received: 2000.00, balanceDue: 3750.00,
    priority: "Normal", dueDate: "07/05/2026",
    status: "Pending Payment", payment: "Partial",
    createdAgo: "2d ago", createdDate: "06/28/2026", attachmentsCount: 4, attachments: ["hearth_pouch_sku1.ai", "hearth_pouch_sku2.ai", "hearth_pouch_sku3.ai", "hearth_pouch_sku4.ai"],
    shippingMethod: "Ship",
  },
  {
    refId: "2026-0055", quoteRefId: "QO-2026-0055",
    contact: "David Han", company: "Solstice Coffee",
    createdBy: "Manny Carlo", ownerAvatar: "MC", ownerColor: "#3b82f6",
    title: "Custom sticker sheets — cancelled by customer",
    lineItems: [
      { id: "l1", productId: 4, productName: "Die Cut Stickers", productCategory: "Labels & Stickers", materialId: 189, materialName: "Semi-Gloss Paper Label", quantity: 2000, widthIn: 3, heightIn: 3, sides: "S1", colorMode: "CMYK", finishingIds: [], finishingLabels: [], specialEffectIds: [], specialEffectLabels: [], unitPrice: 0.35, extended: 700.00 },
    ],
    total: 700.00, received: 0, balanceDue: 0,
    priority: "Normal", dueDate: "06/29/2026",
    status: "Cancelled", payment: "Unpaid",
    createdAgo: "10d ago", createdDate: "06/20/2026", attachmentsCount: 1, attachments: ["solstice_stickers.ai"],
    productionNotes: "Customer changed direction — cancelled before production started.",
  },
  {
    refId: "2026-0048", quoteRefId: "QO-2026-0048",
    contact: "Priya Shah", company: "Petal & Pine",
    createdBy: "Maria Hakobyan", ownerAvatar: "MH", ownerColor: "#f97316",
    title: "Wedding invite suite — refund issued, print color mismatch",
    lineItems: [
      { id: "l1", productId: 40, productName: "Invitation Cards", productCategory: "Marketing Materials", materialId: 199, materialName: "14pt C2S Card Stock", quantity: 250, widthIn: 5, heightIn: 7, sides: "S2", colorMode: "CMYK", finishingIds: [177], finishingLabels: ["Matte Lam"], specialEffectIds: [208], specialEffectLabels: ["Gold Foil"], unitPrice: 2.60, extended: 650.00 },
    ],
    total: 650.00, received: 650.00, balanceDue: 0,
    priority: "Normal", dueDate: "06/15/2026",
    status: "Refunded", payment: "Paid",
    createdAgo: "14d ago", createdDate: "06/16/2026", attachmentsCount: 3, attachments: ["invite_artwork.ai", "gold_foil_map.pdf", "refund_request.pdf"],
    productionNotes: "Color mismatch on gold foil vs. proof. Refunded in full 06/24.",
    refundedAmount: 650.00, refundReason: "Gold foil off-spec vs. approved proof",
    shippingMethod: "Ship",
  },
  {
    refId: "2026-0042", quoteRefId: "QO-2026-0042",
    contact: "Diego Alvarez", company: "Alta Sauces",
    createdBy: "Manny Carlo", ownerAvatar: "MC", ownerColor: "#3b82f6",
    title: "Sauce bottle labels — partial refund, 500 pcs under-registered",
    lineItems: [
      { id: "l1", productId: 3, productName: "Roll Labels", productCategory: "Labels & Stickers", materialId: 189, materialName: "Semi-Gloss Paper Label", quantity: 3000, widthIn: 2.5, heightIn: 3.5, sides: "S1", colorMode: "CMYK", finishingIds: [179], finishingLabels: ["Gloss Lam"], specialEffectIds: [], specialEffectLabels: [], unitPrice: 0.28, extended: 840.00 },
    ],
    total: 840.00, received: 840.00, balanceDue: 0,
    priority: "Normal", dueDate: "06/10/2026",
    status: "Refunded", payment: "Paid",
    createdAgo: "20d ago", createdDate: "06/10/2026", attachmentsCount: 2, attachments: ["alta_bottle_label.ai", "refund_memo.pdf"],
    productionNotes: "500 pcs mis-registered — customer accepted partial refund of $140, kept usable stock.",
    refundedAmount: 140.00, refundReason: "500 pcs mis-registered — partial refund",
    shippingMethod: "Ship",
  },
];

// ─── Format ────────────────────────────────────────────
const fmtMoney = (n: number) => `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

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
type ChipKey = "overdue" | "rush" | "hasFiles" | "awaitingPayment" | "balanceDue";
const CHIPS: { key: ChipKey; label: string; tint: string }[] = [
  { key: "overdue",         label: "🔴 Overdue",         tint: "#dc2626" },
  { key: "rush",            label: "⚠ Rush",             tint: "#f59e0b" },
  { key: "hasFiles",        label: "📎 Has files",        tint: "#3b82f6" },
  { key: "awaitingPayment", label: "🕒 Awaiting payment", tint: "#a16207" },
  { key: "balanceDue",      label: "💰 Balance due",      tint: "#dc2626" },
];

// ─── Page ────────────────────────────────────────────
export default function OrdersPreview() {
  const [tab, setTab] = useState<"all" | "pending" | "production" | "ready" | "shipped" | "completed" | "cancelled" | "refunds">("all");
  const [dateRange, setDateRange] = useState<"today" | "yesterday" | "7d" | "30d" | "custom">("30d");
  const [teamFilter, setTeamFilter] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>("2026-0114");
  const [detailId, setDetailId] = useState<string | null>(null);
  const [view, setView] = useState<"table" | "kanban">("table");
  const [chips, setChips] = useState<Set<ChipKey>>(new Set());

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
                <button key={c.key} onClick={() => toggleChip(c.key)} style={{
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
        <td style={{ ...td, textAlign: "right", color: order.balanceDue > 0 ? "#dc2626" : "#171717", fontWeight: order.balanceDue > 0 ? 700 : 500 }}>{fmtMoney(order.balanceDue)}</td>
        <td style={td}>
          <span style={{ color: order.priority === "High" ? "#dc2626" : order.priority === "Rush" ? "#f59e0b" : "#22c55e", fontWeight: 700, fontSize: "11.5px" }}>
            {order.priority}
          </span>
        </td>
        <td style={td}>
          {order.dueDate ? (
            <>
              <div style={{ fontSize: "11.5px", color: overdue ? "#dc2626" : "#171717", fontWeight: overdue ? 700 : 500 }}>{order.dueDate}</div>
              {overdue && <div style={{ fontSize: "10px", color: "#dc2626", fontWeight: 700 }}>Overdue</div>}
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
        <span style={{ fontFamily: "monospace", fontSize: "11px", fontWeight: 700, color: "#171717" }}>{order.refId}</span>
        <span style={{ fontSize: "10px", fontWeight: 700, color: order.priority === "Rush" ? "#f59e0b" : order.priority === "High" ? "#dc2626" : "#22c55e" }}>{order.priority}</span>
      </div>
      <div style={{ fontSize: "12.5px", fontWeight: 700, color: "#171717", lineHeight: 1.3 }}>{order.contact}</div>
      {order.company && <div style={{ fontSize: "10.5px", color: "#888" }}>{order.company}</div>}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "4px" }}>
        <span style={{ fontSize: "13px", fontWeight: 800, color: "#16a34a" }}>{fmtMoney(order.total)}</span>
        {order.dueDate ? (
          <span style={{ fontSize: "10.5px", color: overdue ? "#dc2626" : "#666", fontWeight: overdue ? 700 : 500 }}>
            {overdue ? "⚠ " : "📅 "}{order.dueDate}
          </span>
        ) : <span style={{ fontSize: "10.5px", color: "#bbb" }}>—</span>}
      </div>
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
  const [tab, setTab] = useState<"overview" | "activity" | "quotes" | "files" | "payments">("overview");

  const timeline = buildTimeline(order);

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
              <span style={{ marginLeft: "8px", padding: "2px 8px", background: "#dcfce7", color: "#166534", fontSize: "10.5px", fontWeight: 700, borderRadius: "5px" }}>Returning Customer</span>
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
            <div style={{ fontSize: "10.5px", color: "#888", marginTop: "1px" }}>on Jun 30, 2026</div>
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
          <div style={{ fontWeight: 700 }}>Jun 30, 2026</div>
          <div style={{ fontSize: "10.5px", color: "#888" }}>3:50 PM ({order.createdAgo})</div>
        </MetaCell>
        <MetaCell icon="📅" label="Due Date">
          <div style={{ fontWeight: 700, color: order.dueOverdue ? "#dc2626" : "#171717" }}>{order.dueDate || "—"}</div>
          {order.dueOverdue && <div style={{ fontSize: "10.5px", color: "#dc2626", fontWeight: 700 }}>Overdue</div>}
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
              { key: "activity", label: "Activity Timeline" },
              { key: "quotes", label: `Quote History (3)` },
              { key: "files", label: `Files (${order.attachmentsCount})` },
              { key: "payments", label: "Payments" },
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
          <div>📞 (213) 561-7090</div>
          <div>✉ jbelay0001@ymail.com</div>
          <div>🚶 Walk-in</div>
        </div>
        <span style={{ display: "inline-block", padding: "2px 8px", background: "#dcfce7", color: "#166534", fontSize: "10.5px", fontWeight: 700, borderRadius: "5px", marginBottom: "12px" }}>Returning Customer</span>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "6px", padding: "10px", background: "var(--preview-surface-2)", borderRadius: "8px" }}>
          <div><div style={{ fontSize: "9.5px", color: "#888", textTransform: "uppercase", fontWeight: 700 }}>Lifetime</div><div style={{ fontSize: "12px", fontWeight: 800 }}>$83,240</div></div>
          <div><div style={{ fontSize: "9.5px", color: "#888", textTransform: "uppercase", fontWeight: 700 }}>Total</div><div style={{ fontSize: "12px", fontWeight: 800 }}>12</div></div>
          <div><div style={{ fontSize: "9.5px", color: "#888", textTransform: "uppercase", fontWeight: 700 }}>Open</div><div style={{ fontSize: "12px", fontWeight: 800 }}>4</div></div>
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
            {["mockup.pdf", "die-line.pdf"].slice(0, order.attachmentsCount).map((name, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: "10px", padding: "10px 12px", background: "var(--preview-surface-2)", border: "1px solid var(--preview-border)", borderRadius: "8px" }}>
                <div style={{ width: "36px", height: "36px", background: "#fee2e2", color: "#dc2626", borderRadius: "6px", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "18px" }}>📄</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: "12.5px", fontWeight: 700 }}>{name}</div>
                  <div style={{ fontSize: "10.5px", color: "#888" }}>PDF · {["2.4 MB", "348 KB"][i]}</div>
                </div>
              </div>
            ))}
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
  const files = ["mockup.pdf", "die-line.pdf", "artwork.ai", "photo.jpg", "spec.pdf", "reference.png"].slice(0, Math.max(order.attachmentsCount, 2));
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
              <div style={{ fontSize: "10px", color: "#888" }}>Attached via {order.quoteRefId}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function PaymentsTab({ order }: { order: Order }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
      <div style={{ padding: "12px 16px", background: "var(--preview-surface-2)", border: "1px solid var(--preview-border)", borderRadius: "8px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <div>
            <div style={{ fontSize: "13px", fontWeight: 800 }}>Payment #1 — {fmtMoney(order.received)}</div>
            <div style={{ fontSize: "11px", color: "#888" }}>Jun 30, 2026 · 3:50 PM · VISA •••• 7131</div>
          </div>
          <div style={{ padding: "3px 8px", background: "#dcfce7", color: "#166534", fontSize: "11px", fontWeight: 700, borderRadius: "5px" }}>Completed</div>
        </div>
      </div>
      {order.balanceDue > 0 && (
        <div style={{ padding: "12px 16px", background: "#fee2e2", border: "1px solid #fecaca", borderRadius: "8px" }}>
          <div style={{ fontSize: "13px", fontWeight: 800, color: "#dc2626" }}>Balance Due — {fmtMoney(order.balanceDue)}</div>
          <div style={{ fontSize: "11px", color: "#dc2626" }}>Awaiting payment</div>
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
      <FinCell label="Payment Date" value="Jun 30, 2026 3:50 PM" />
      <FinCell label="Payment Method" value="VISA •••• 7131" />
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
