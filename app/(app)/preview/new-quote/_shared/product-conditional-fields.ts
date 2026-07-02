/**
 * Product-aware conditional-field rules for the CRM native new-quote wizard.
 *
 * Ports the workflow-modal `shouldShowConditionalField` helper into the CRM,
 * but keyed on Bazaar product SUBCATEGORY (which is what the CRM catalog
 * snapshot exposes) rather than product NAME.
 *
 * Rules (from doc 06 Master Product Specification):
 *   rollDirection → labels-stickers OR label-*-combo (roll-based)
 *   depthIn       → packaging-boxes, packaging-supplies (3D products)
 *   dielineId     → packaging-boxes OR product.fields.DIE populated
 *   dielineNotes  → same as dielineId
 *   application   → label-*-combo (application service, combos only)
 *   perforation   → product.fields.PERFORATION populated
 *   gusset        → bags-flexible-packaging
 *   tearNotch     → bags-flexible-packaging
 *   zipper        → bags-flexible-packaging
 *   window        → bags-flexible-packaging
 *   sides         → packaging-boxes OR marketing-materials (multi-sided)
 *   foldType      → marketing-materials (brochures / trifolds)
 *
 * Unknown subcategory → show everything (fallback), with caller displaying a
 * "subcategory unknown — showing all fields" caption at the top of the editor.
 */

export type ConditionalFieldName =
  | "rollDirection"
  | "depthIn"
  | "dielineId"
  | "dielineNotes"
  | "application"
  | "perforation"
  | "gusset"
  | "tearNotch"
  | "zipper"
  | "window"
  | "sides"
  | "foldType"
  | "colorMode"
  | "sizeWH";

interface ProductForGating {
  subcategory?: string | null;
  fields?: Record<string, any> | null;
}

const ROLL_SUBS = new Set([
  "labels-stickers",
  "label-bag-combo",
  "label-jar-combo",
  "label-tube-combo",
]);

const COMBO_SUBS = new Set([
  "label-bag-combo",
  "label-jar-combo",
  "label-tube-combo",
]);

const BOX_SUBS = new Set(["packaging-boxes", "packaging-supplies"]);
const BAG_SUBS = new Set(["bags-flexible-packaging"]);
const MARKETING_SUBS = new Set(["marketing-materials"]);

// Known subcategories the CRM catalog snapshot exposes. Anything else falls
// back to "show all fields" and the LineItemEditor displays a caption.
const KNOWN_SUBS = new Set<string>([
  ...ROLL_SUBS,
  ...COMBO_SUBS,
  ...BOX_SUBS,
  ...BAG_SUBS,
  ...MARKETING_SUBS,
  "banners-signs",
  "custom-vinyl-lettering",
  "fridge-magnets",
  "trading-cards",
  "wallpapers",
]);

function hasAllowlist(product: ProductForGating | undefined | null, key: string): boolean {
  if (!product?.fields) return false;
  const v = (product.fields as any)[key];
  return Array.isArray(v) && v.length > 0;
}

export function shouldShow(
  fieldName: ConditionalFieldName,
  product: ProductForGating | undefined | null,
): boolean {
  const sub = product?.subcategory || "";

  // Unknown subcategory → show everything so the rep can still fill the order.
  if (!hasKnownSubcategory(product)) return true;

  switch (fieldName) {
    case "colorMode":
    case "sizeWH":
      // Universal — always show.
      return true;
    case "rollDirection":
      return ROLL_SUBS.has(sub);
    case "depthIn":
      return BOX_SUBS.has(sub);
    case "dielineId":
    case "dielineNotes":
      // Boxes always get dielines; other products get them only if the
      // product schema has a DIE allowlist populated.
      return BOX_SUBS.has(sub) || hasAllowlist(product, "DIE");
    case "application":
      return COMBO_SUBS.has(sub);
    case "perforation":
      return hasAllowlist(product, "PERFORATION");
    case "gusset":
    case "tearNotch":
    case "zipper":
    case "window":
      return BAG_SUBS.has(sub);
    case "sides":
      return BOX_SUBS.has(sub) || MARKETING_SUBS.has(sub);
    case "foldType":
      return MARKETING_SUBS.has(sub);
    default:
      return true;
  }
}

/**
 * Does the given product have a known subcategory rule set at all? Used to
 * decide whether to render the "subcategory unknown — showing all fields"
 * caption at the top of the LineItemEditor.
 */
export function hasKnownSubcategory(product: ProductForGating | undefined | null): boolean {
  const sub = product?.subcategory || "";
  if (!sub) return false;
  return KNOWN_SUBS.has(sub);
}

/**
 * Returns the raw allowlist stored on `product.fields[key]` if present as an
 * array, else empty. Callers use this to populate dropdowns for Dieline,
 * Gusset, Tear Notch, Zipper, Window, Fold Type, Perforation.
 */
export function fieldAllowlist(
  product: ProductForGating | undefined | null,
  key: string,
): any[] {
  const v = product?.fields?.[key];
  return Array.isArray(v) ? v : [];
}
