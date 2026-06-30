import type { OperationsDealRow } from "@/lib/utils/fetch-admin-operations-data";

export type OperationsGroupField = "stage" | "sdr" | "sales";

export const OPERATIONS_GROUP_COLUMN_TITLES: Record<
  OperationsGroupField,
  { active: string; inactive: string }
> = {
  stage: {
    inactive: "Group by stage",
    active: "Grouped by stage — click to clear",
  },
  sdr: {
    inactive: "Group by SDR name",
    active: "Grouped by SDR — click to clear",
  },
  sales: {
    inactive: "Group by sales rep name",
    active: "Grouped by sales rep — click to clear",
  },
};

export function getOperationsGroupKey(
  deal: OperationsDealRow,
  field: OperationsGroupField,
): string {
  switch (field) {
    case "stage":
      return deal.stage.trim() || "—";
    case "sdr":
      return deal.sdr_name?.trim() || "Unassigned";
    case "sales":
      if (deal.owner_highlight === "unclaimed") return "Unclaimed";
      return deal.sales_owner_name?.trim() || "Unassigned";
  }
}

/** Rough pipeline order for stage group headers (unknown labels sort alphabetically after). */
const STAGE_GROUP_RANK: Record<string, number> = {
  Pending: 0,
  Validated: 1,
  "Routed to Sales": 2,
  Claimed: 3,
  "In Progress": 4,
  "Follow Up Later": 5,
  "On Hold": 6,
  Quoted: 7,
  "Quote Sent": 8,
  Draft: 9,
  Sent: 10,
  Approved: 11,
  Routed: 12,
  "Pending Payment": 13,
  "Pending Tax Review": 14,
  Converted: 15,
  "In Production": 16,
  Completed: 17,
  Won: 18,
  Rejected: 19,
  Dropped: 20,
  Cancelled: 21,
};

const TAIL_GROUP_KEYS = new Set(["Unassigned", "Unclaimed", "—"]);

function compareGroupKeys(
  a: string,
  b: string,
  field: OperationsGroupField,
): number {
  if (field === "stage") {
    const ra = STAGE_GROUP_RANK[a] ?? 100;
    const rb = STAGE_GROUP_RANK[b] ?? 100;
    if (ra !== rb) return ra - rb;
    return a.localeCompare(b, undefined, { sensitivity: "base" });
  }

  const aTail = TAIL_GROUP_KEYS.has(a);
  const bTail = TAIL_GROUP_KEYS.has(b);
  if (aTail !== bTail) return aTail ? 1 : -1;
  return a.localeCompare(b, undefined, { sensitivity: "base" });
}

export type OperationsDealGroup = {
  key: string;
  label: string;
  deals: OperationsDealRow[];
};

export function groupOperationsDeals(
  deals: OperationsDealRow[],
  field: OperationsGroupField,
): OperationsDealGroup[] {
  const map = new Map<string, OperationsDealRow[]>();
  for (const deal of deals) {
    const key = getOperationsGroupKey(deal, field);
    const list = map.get(key);
    if (list) list.push(deal);
    else map.set(key, [deal]);
  }

  return [...map.entries()]
    .sort(([a], [b]) => compareGroupKeys(a, b, field))
    .map(([key, groupDeals]) => ({
      key,
      label: key,
      deals: groupDeals,
    }));
}
