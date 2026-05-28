/** Shared list pagination — default 25 rows, optional 50 / 100. */

export const DEFAULT_LIST_PAGE_SIZE = 25;
export const ALLOWED_LIST_PAGE_SIZES = [25, 50, 100] as const;
export const MAX_LIST_PAGE_SIZE = 100;

export const LIST_PAGE_SIZE_STORAGE_KEY = "bazaar-list-page-size";

export type ListPageSize = (typeof ALLOWED_LIST_PAGE_SIZES)[number];

export type PaginationParams = {
  limit: number;
  offset: number;
};

export type PaginationMeta = PaginationParams & {
  total: number;
  hasMore: boolean;
};

export function normalizeListPageSize(raw: number | string | null | undefined): ListPageSize {
  const parsed = typeof raw === "number" ? raw : parseInt(String(raw ?? ""), 10);
  if (ALLOWED_LIST_PAGE_SIZES.includes(parsed as ListPageSize)) {
    return parsed as ListPageSize;
  }
  return DEFAULT_LIST_PAGE_SIZE;
}

export function parseListPaginationParams(searchParams: URLSearchParams): PaginationParams {
  const limit = normalizeListPageSize(searchParams.get("limit"));
  const offset = Math.max(0, parseInt(searchParams.get("offset") ?? "0", 10) || 0);
  return { limit, offset };
}

export function toPaginatedMeta({
  limit,
  offset,
  total,
  rowCount,
}: PaginationParams & { total: number; rowCount: number }): PaginationMeta {
  return {
    limit,
    offset,
    total,
    hasMore: offset + rowCount < total,
  };
}

/** e.g. "1–25 of 200" — returns null when total is 0. */
export function formatPaginationRange(offset: number, limit: number, total: number): string | null {
  if (total <= 0) return null;
  const start = offset + 1;
  const end = Math.min(offset + limit, total);
  return `${start}–${end} of ${total}`;
}

export function readStoredListPageSize(): ListPageSize {
  if (typeof window === "undefined") return DEFAULT_LIST_PAGE_SIZE;
  try {
    return normalizeListPageSize(localStorage.getItem(LIST_PAGE_SIZE_STORAGE_KEY));
  } catch {
    return DEFAULT_LIST_PAGE_SIZE;
  }
}

export function writeStoredListPageSize(size: ListPageSize): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(LIST_PAGE_SIZE_STORAGE_KEY, String(size));
  } catch {
    // ignore quota / private mode
  }
}
