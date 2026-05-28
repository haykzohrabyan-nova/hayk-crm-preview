export interface LeadProductInterestRow {
  product: string;
  quantity: string;
  has_design?: boolean;
}

export type LeadProductInterestRowErrors = {
  product: number[];
  quantity: number[];
};

function parseQuantity(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : null;
}

export function validateLeadProductInterestRows(rows: LeadProductInterestRow[]): {
  ok: boolean;
  error?: string;
  invalidProductIndexes: number[];
  invalidQuantityIndexes: number[];
  validRows: LeadProductInterestRow[];
} {
  const invalidProductIndexes: number[] = [];
  const invalidQuantityIndexes: number[] = [];

  rows.forEach((row, idx) => {
    const hasProduct = row.product.trim() !== "";
    const qty = parseQuantity(row.quantity);
    const hasValidQuantity = qty !== null && qty > 0;

    if (!hasProduct) {
      invalidProductIndexes.push(idx);
      return;
    }
    if (!hasValidQuantity) {
      invalidQuantityIndexes.push(idx);
    }
  });

  if (invalidProductIndexes.length > 0) {
    return {
      ok: false,
      error: "Select a product for each product interest row, or remove the row.",
      invalidProductIndexes,
      invalidQuantityIndexes,
      validRows: [],
    };
  }

  if (invalidQuantityIndexes.length > 0) {
    return {
      ok: false,
      error: "Enter a quantity greater than zero for each selected product.",
      invalidProductIndexes,
      invalidQuantityIndexes,
      validRows: [],
    };
  }

  const validRows = rows.filter((r) => r.product.trim() !== "");
  return {
    ok: true,
    invalidProductIndexes: [],
    invalidQuantityIndexes: [],
    validRows,
  };
}

export function buildLeadProductInterestPayload(rows: LeadProductInterestRow[]) {
  const validation = validateLeadProductInterestRows(rows);
  if (!validation.ok) {
    return {
      ok: false as const,
      error: validation.error!,
      invalidProductIndexes: validation.invalidProductIndexes,
      invalidQuantityIndexes: validation.invalidQuantityIndexes,
    };
  }

  const { validRows } = validation;
  return {
    ok: true as const,
    interests: Object.fromEntries(validRows.map((r) => [r.product, true])),
    quantities: Object.fromEntries(validRows.map((r) => [r.product, r.quantity.trim()])),
    has_design: Object.fromEntries(validRows.map((r) => [r.product, r.has_design ?? false])),
  };
}

/** Server-side guard — quantities / has_design keys must match declared interests. */
export function validateLeadInterestsPayload(
  interests: Record<string, unknown> | null | undefined,
  quantities: Record<string, unknown> | null | undefined,
  has_design?: Record<string, unknown> | null | undefined,
): string | null {
  const interestKeys = new Set(
    Object.entries(interests ?? {})
      .filter(([key, enabled]) => key.trim() !== "" && !!enabled)
      .map(([key]) => key.trim()),
  );

  for (const key of interestKeys) {
    const raw = quantities?.[key];
    const qty = parseQuantity(raw == null ? "" : String(raw));
    if (qty === null || qty <= 0) {
      return "Each selected product must have a quantity greater than zero.";
    }
  }

  for (const key of Object.keys(quantities ?? {})) {
    if (!key.trim()) return "Product interest is missing a product name.";
    if (!interestKeys.has(key.trim())) {
      return "Each quantity must have a selected product.";
    }
  }

  for (const key of Object.keys(has_design ?? {})) {
    if (!key.trim()) return "Product interest is missing a product name.";
    if (!interestKeys.has(key.trim())) {
      return "Each product interest must have a selected product.";
    }
  }

  return null;
}

export function rowErrorsFromValidation(
  invalidProductIndexes: number[],
  invalidQuantityIndexes: number[],
): { product: Set<number>; quantity: Set<number> } {
  return {
    product: new Set(invalidProductIndexes),
    quantity: new Set(invalidQuantityIndexes),
  };
}

export const EMPTY_PRODUCT_ROW_ERRORS = {
  product: new Set<number>(),
  quantity: new Set<number>(),
};

export function remapProductRowErrors(
  errors: { product: Set<number>; quantity: Set<number> },
  removedIdx: number,
): { product: Set<number>; quantity: Set<number> } {
  function remap(set: Set<number>) {
    const next = new Set<number>();
    set.forEach((i) => {
      if (i < removedIdx) next.add(i);
      else if (i > removedIdx) next.add(i - 1);
    });
    return next;
  }
  return { product: remap(errors.product), quantity: remap(errors.quantity) };
}
