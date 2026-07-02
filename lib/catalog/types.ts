// Bazaar catalog types — mirror the shape emitted by the Bazaar sender
// (see david-integration-handoff/01-bazaar-sender-spec.md and 02-crm-receiver-spec.md).
//
// This file is the CANONICAL type contract inside the CRM. When the webhook
// receiver lands (see receiver/), it upserts rows shaped like this.

export type FieldKey =
  | "MATERIAL"
  | "FINISHING"
  | "LAMINATION"
  | "DIE"
  | "CONTAINER"
  | "DOUBLE_SIDED"
  | "QUANTITY"
  | "SIZE"
  | "SIDES"
  | "PERFORATION"
  | "SPECIAL_EFFECTS"
  | "TEAR_NOTCH"
  | "ZIPPER"
  | "WINDOW"
  | "CORNERS";

export interface Material {
  id: number;
  displayName: string;      // "White Label (White BOPP)"
  materialName: string;     // "White BOPP"
  finishing?: string;       // "2.6 MIL Elite / GPX/ Permanent Adhesive"
  priceMultiplier: number;  // used server-side for price math (CRM does NOT compute price)
  frameWidth?: string | number;
  frameLength?: string | number;
  machine?: string;         // "HP Indigo 6K"
}

export interface FrameTiers {
  tiers: Array<{ maxFrames: number; framePrice: number }>;
  machine?: string;
  frameWidth?: number;
  frameLength?: number;
  minTicket?: number;
}

export interface Product {
  id: number;
  name: string;
  store: "BAZAAR" | "PIXELPRESS";
  category: "PRINTING" | "PACKAGING" | string;   // free-text on purpose (forward-compat)
  subcategory: string | null;                     // 'labels-stickers', 'packaging-boxes', etc.
  description: string | null;
  pricingMode: string | null;                     // 'FRAME_DYNAMIC' | 'STATIC' | 'FLAT' | ...
  frameTiers: FrameTiers | null;
  quantityTiers: unknown | null;
  extraCharges: unknown | null;
  flatRate: unknown | null;
  fields: Partial<Record<FieldKey, number[] | string[] | null>>;
  materials: Material[];
  pacdora: boolean;
  pacdoraTemplateId: number | null;
  isActive?: boolean;
  onlineSales?: boolean;
}

// The 10 top-level categories Hayk locked (see 00-overview.md).
// Each maps to one or more Item.subcategory values from the Bazaar DB.
export interface Category {
  id: CategoryId;
  label: string;
  icon: string;
  subcategories: string[];   // subcategory values that roll up into this category
  order: number;
}

export type CategoryId =
  | "labels-stickers"
  | "packaging-boxes"
  | "bags-pouches"
  | "banners-signs"
  | "marketing-materials"
  | "trading-cards"
  | "wallpapers"
  | "apparel"
  | "combos"
  | "more";
