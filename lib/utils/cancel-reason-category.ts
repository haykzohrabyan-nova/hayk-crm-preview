import type { LookupCategory } from "@/lib/types";

export type CancelReasonCategory = "quote_cancel_reason" | "order_cancel_reason";

const ORDER_STAGE_STATUSES = new Set(["order", "in_production"]);

/** Pick admin lookup category based on ticket lifecycle stage at cancel time. */
export function cancelReasonCategoryForStatus(ticketStatus: string): CancelReasonCategory {
  return ORDER_STAGE_STATUSES.has(ticketStatus) ? "order_cancel_reason" : "quote_cancel_reason";
}

export function isCancelReasonCategory(category: string): category is CancelReasonCategory {
  return category === "quote_cancel_reason" || category === "order_cancel_reason";
}

export const CANCEL_REASON_CATEGORIES: LookupCategory[] = [
  "quote_cancel_reason",
  "order_cancel_reason",
];

/** True when the stored slug is the configurable "Other" option (requires free-text detail). */
export function isOtherCancelReason(value: string | null | undefined): boolean {
  return !!value && (value.endsWith("_other") || value === "other");
}
