import type { Lead } from "@/lib/types";
import {
  isWaitingForCustomerConfirm,
  type RoutedLeadTicket,
} from "@/lib/utils/lead-routed-ticket-status";

/** Pipeline stage for SDR "Directed to Sales" tab — used for sub-filters and badges. */
export type RoutedPipelineStage =
  | "awaiting"
  | "in_progress"
  | "quote_sent"
  | "on_hold"
  | "dropped"
  | "won"
  | "rejected";

/** Stages exposed as sub-filter pills (Won / Rejected appear under All only). */
export type RoutedSubfilterStage = Exclude<RoutedPipelineStage, "won" | "rejected">;

export type RoutedPipelineFilter = "all" | RoutedSubfilterStage;

export const ROUTED_SUBFILTER_STAGES: RoutedSubfilterStage[] = [
  "awaiting",
  "in_progress",
  "quote_sent",
  "on_hold",
  "dropped",
];

export const ROUTED_FILTER_OPTIONS: RoutedPipelineFilter[] = [
  "all",
  ...ROUTED_SUBFILTER_STAGES,
];

export const ROUTED_STAGE_LABELS: Record<RoutedPipelineStage, string> = {
  awaiting: "Awaiting Claim",
  in_progress: "In Progress",
  quote_sent: "Quote Sent",
  on_hold: "On Hold",
  dropped: "Dropped",
  won: "Won",
  rejected: "Rejected",
};

export const ROUTED_FILTER_LABELS: Record<RoutedPipelineFilter, string> = {
  all: "All",
  ...ROUTED_STAGE_LABELS,
};

export const ROUTED_STAGE_STYLES: Record<
  RoutedPipelineStage,
  { bg: string; text: string; border: string }
> = {
  awaiting: {
    bg: "var(--color-warning-bg)",
    text: "var(--color-warning)",
    border: "var(--color-warning-border)",
  },
  in_progress: {
    bg: "var(--color-success-bg)",
    text: "var(--color-success)",
    border: "var(--color-success-border)",
  },
  quote_sent: {
    bg: "var(--color-info-bg)",
    text: "var(--color-info-text)",
    border: "var(--color-info-border)",
  },
  on_hold: {
    bg: "var(--color-warning-bg)",
    text: "var(--color-warning)",
    border: "var(--color-warning-border)",
  },
  dropped: {
    bg: "var(--color-danger-bg)",
    text: "var(--color-danger)",
    border: "var(--color-danger-border)",
  },
  won: {
    bg: "var(--color-success-bg)",
    text: "var(--color-success)",
    border: "var(--color-success-border)",
  },
  rejected: {
    bg: "var(--color-danger-bg)",
    text: "var(--color-danger)",
    border: "var(--color-danger-border)",
  },
};

const ORDER_STATUSES = new Set(["order", "in_production", "completed"]);

export type RoutedStageLead = Pick<Lead, "id" | "status" | "sales_status" | "sales_owner_id"> & {
  tickets?: RoutedLeadTicket[] | null;
};

function linkedTickets(lead: RoutedStageLead): RoutedLeadTicket[] {
  return (lead.tickets ?? []).filter(
    (t) => !t.linked_lead_id || t.linked_lead_id === lead.id,
  );
}

function hasSentQuote(lead: RoutedStageLead, tickets: RoutedLeadTicket[]): boolean {
  if (lead.sales_status === "Quote Sent") return true;
  return tickets.some(
    (t) => t.ticket_status === "sent" || isWaitingForCustomerConfirm(t),
  );
}

function hasActiveOrder(tickets: RoutedLeadTicket[]): boolean {
  return tickets.some(
    (t) =>
      t.ticket_kind === "order" ||
      ORDER_STATUSES.has(t.ticket_status ?? ""),
  );
}

export function getRoutedPipelineStage(lead: RoutedStageLead): RoutedPipelineStage {
  const salesStatus = lead.sales_status ?? null;
  const tickets = linkedTickets(lead);

  if (salesStatus === "Won") return "won";
  if (lead.status === "Rejected") return "rejected";
  if (salesStatus === "Dropped") return "dropped";
  if (salesStatus === "On Hold") return "on_hold";

  if (!lead.sales_owner_id) return "awaiting";

  if (hasSentQuote(lead, tickets)) return "quote_sent";

  if (
    salesStatus === "Ongoing" ||
    !salesStatus ||
    hasActiveOrder(tickets) ||
    lead.status === "Quoted" ||
    lead.status === "Validated"
  ) {
    return "in_progress";
  }

  return "in_progress";
}

export function matchesRoutedPipelineFilter(
  lead: RoutedStageLead,
  filter: RoutedPipelineFilter,
): boolean {
  if (filter === "all") return true;
  return getRoutedPipelineStage(lead) === filter;
}

export function countRoutedPipelineStages(
  leads: RoutedStageLead[],
): Record<RoutedPipelineFilter, number> {
  const counts = Object.fromEntries(
    ROUTED_FILTER_OPTIONS.map((key) => [key, 0]),
  ) as Record<RoutedPipelineFilter, number>;

  counts.all = leads.length;
  for (const lead of leads) {
    const stage = getRoutedPipelineStage(lead);
    if (stage !== "won" && stage !== "rejected") {
      counts[stage] += 1;
    }
  }
  return counts;
}
