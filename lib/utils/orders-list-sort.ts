/** Orders list column sort — applied server-side after filters, before pagination slice. */

import { isOverdue } from "@/lib/utils/format";

export type OrdersListSortField =
  | "default"
  | "created_by"
  | "balance_due"
  | "due_date"
  | "status"
  | "payment";

const VALID_SORT_FIELDS = new Set<string>([
  "created_by",
  "balance_due",
  "due_date",
  "status",
  "payment",
]);

export function parseOrdersListSort(searchParams: URLSearchParams): OrdersListSortField {
  const sort = searchParams.get("sort")?.trim() ?? "";
  if (VALID_SORT_FIELDS.has(sort)) return sort as OrdersListSortField;
  return "default";
}

type SortableOrderRow = {
  id: string;
  ticket_status: string;
  payment_status?: string | null;
  refund_status?: string | null;
  due_date?: string | null;
  quote_final_total?: number | null;
  payment_amount_received?: number | null;
  created_by_id?: string | null;
  production_released_at?: string | null;
  created_at?: string;
};

function balanceDue(row: SortableOrderRow): number {
  const total = Number(row.quote_final_total ?? 0);
  const received = Number(row.payment_amount_received ?? 0);
  if (!Number.isFinite(total)) return 0;
  return Math.max(0, total - (Number.isFinite(received) ? received : 0));
}

const STATUS_RANK: Record<string, number> = {
  in_production: 0,
  order: 1,
  cancelled: 2,
};

const PAYMENT_RANK: Record<string, number> = {
  unpaid: 0,
  partial: 1,
  paid: 2,
};

function paymentRank(row: SortableOrderRow): number {
  const refund = row.refund_status ?? "none";
  if (refund === "full") return 4;
  if (refund === "partial") return 3;
  return PAYMENT_RANK[row.payment_status ?? "unpaid"] ?? 99;
}

function compareDefault(a: SortableOrderRow, b: SortableOrderRow): number {
  const aReleased = a.production_released_at ?? "";
  const bReleased = b.production_released_at ?? "";
  if (aReleased !== bReleased) return bReleased.localeCompare(aReleased);
  return (b.created_at ?? "").localeCompare(a.created_at ?? "");
}

function compareCreatedBy(
  a: SortableOrderRow,
  b: SortableOrderRow,
  nameById: Map<string, string>,
): number {
  const na = (a.created_by_id ? nameById.get(a.created_by_id) : null) ?? "";
  const nb = (b.created_by_id ? nameById.get(b.created_by_id) : null) ?? "";
  const byName = na.localeCompare(nb, undefined, { sensitivity: "base" });
  if (byName !== 0) return byName;
  return a.id.localeCompare(b.id);
}

function compareBalanceDue(a: SortableOrderRow, b: SortableOrderRow): number {
  const diff = balanceDue(b) - balanceDue(a);
  if (diff !== 0) return diff;
  return a.id.localeCompare(b.id);
}

function compareDueDate(a: SortableOrderRow, b: SortableOrderRow): number {
  const aDate = a.due_date ?? null;
  const bDate = b.due_date ?? null;
  const aOver = isOverdue(aDate);
  const bOver = isOverdue(bDate);
  if (aOver !== bOver) return aOver ? -1 : 1;
  if (!aDate && !bDate) return a.id.localeCompare(b.id);
  if (!aDate) return 1;
  if (!bDate) return -1;
  const byDate = aDate.localeCompare(bDate);
  if (byDate !== 0) return byDate;
  return a.id.localeCompare(b.id);
}

function compareStatus(a: SortableOrderRow, b: SortableOrderRow): number {
  const ra = STATUS_RANK[a.ticket_status] ?? 99;
  const rb = STATUS_RANK[b.ticket_status] ?? 99;
  if (ra !== rb) return ra - rb;
  return a.id.localeCompare(b.id);
}

function comparePayment(a: SortableOrderRow, b: SortableOrderRow): number {
  const diff = paymentRank(a) - paymentRank(b);
  if (diff !== 0) return diff;
  return a.id.localeCompare(b.id);
}

export function sortOrdersRows<T extends SortableOrderRow>(
  rows: T[],
  sort: OrdersListSortField,
  options?: { creatorNameById?: Map<string, string> },
): T[] {
  if (sort === "default" || rows.length <= 1) {
    return [...rows].sort(compareDefault);
  }

  const cmp = (a: T, b: T): number => {
    switch (sort) {
      case "created_by":
        return compareCreatedBy(a, b, options?.creatorNameById ?? new Map());
      case "balance_due":
        return compareBalanceDue(a, b);
      case "due_date":
        return compareDueDate(a, b);
      case "status":
        return compareStatus(a, b);
      case "payment":
        return comparePayment(a, b);
      default:
        return compareDefault(a, b);
    }
  };

  return [...rows].sort(cmp);
}

export const ORDERS_SORTABLE_COLUMNS: { label: string; field: OrdersListSortField }[] = [
  { label: "Created by", field: "created_by" },
  { label: "Balance Due", field: "balance_due" },
  { label: "Due Date", field: "due_date" },
  { label: "Status", field: "status" },
  { label: "Payment", field: "payment" },
];
