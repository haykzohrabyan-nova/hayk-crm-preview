// The 10 top-level categories Hayk locked for the CRM quote builder.
// Order matters — this is the order they render in the picker.
// Each category rolls up one or more Item.subcategory values from Bazaar.

import type { Category, CategoryId } from "./types";

export const CATEGORIES: Category[] = [
  {
    id: "labels-stickers",
    label: "Labels & Stickers",
    icon: "🏷️",
    subcategories: ["labels-stickers"],
    order: 1,
  },
  {
    id: "packaging-boxes",
    label: "Packaging & Boxes",
    icon: "📦",
    subcategories: ["packaging-boxes", "packaging-supplies"],
    order: 2,
  },
  {
    id: "bags-pouches",
    label: "Bags & Pouches",
    icon: "👝",
    subcategories: ["bags-flexible-packaging"],
    order: 3,
  },
  {
    id: "banners-signs",
    label: "Banners & Signs",
    icon: "🪧",
    subcategories: ["banners-signs", "custom-vinyl-lettering", "fridge-magnets"],
    order: 4,
  },
  {
    id: "marketing-materials",
    label: "Marketing Materials",
    icon: "📇",
    subcategories: ["marketing-materials"],
    order: 5,
  },
  {
    id: "trading-cards",
    label: "Trading Cards",
    icon: "🃏",
    subcategories: ["trading-cards"],
    order: 6,
  },
  {
    id: "wallpapers",
    label: "Wallpapers",
    icon: "🖼️",
    subcategories: ["wallpapers"],
    order: 7,
  },
  {
    id: "apparel",
    label: "Apparel",
    icon: "👕",
    subcategories: ["apparel"],           // no live products yet — placeholder
    order: 8,
  },
  {
    id: "combos",
    label: "Combos",
    icon: "🎁",
    subcategories: ["label-bag-combo", "label-jar-combo", "label-tube-combo"],
    order: 9,
  },
  {
    id: "more",
    label: "More",
    icon: "⋯",
    subcategories: [],                    // catch-all: subcategories not mapped to any of the 9 above
    order: 10,
  },
];

// Reverse lookup: subcategory → categoryId
export const SUBCATEGORY_TO_CATEGORY: Record<string, CategoryId> = (() => {
  const map: Record<string, CategoryId> = {};
  for (const cat of CATEGORIES) {
    for (const sub of cat.subcategories) map[sub] = cat.id;
  }
  return map;
})();

export function getCategoryId(subcategory: string | null | undefined): CategoryId {
  if (!subcategory) return "more";
  return SUBCATEGORY_TO_CATEGORY[subcategory] ?? "more";
}
