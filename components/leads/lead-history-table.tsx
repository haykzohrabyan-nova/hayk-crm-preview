"use client";

import { UrgencyPill } from "@/components/ui/urgency-pill";
import { StatusPill } from "@/components/ui/status-pill";
import { formatTimeTodayOrDateNumeric } from "@/lib/utils/format";
import { formatLeadProductInterests } from "@/lib/utils/format-lead-product-interests";
import {
  leadSourceLabel,
  leadTicketRefsForLead,
  type LeadHistoryTicket,
} from "@/lib/utils/lead-history-display";

export type LeadHistoryRow = {
  id: string;
  status: string;
  sales_status: string | null;
  source: string | null;
  urgency: string | null;
  interests?: Record<string, boolean> | null;
  quantities?: Record<string, string | number> | null;
  created_at: string;
  created_by_id?: string | null;
  is_system_created?: boolean;
  created_by?: { id: string; full_name: string | null } | null;
  /** Won-tab API embeds tickets on each lead */
  tickets?: LeadHistoryTicket[];
};

const COLUMNS = ["Status", "Created By", "Source", "Product Interests", "Urgency", "Quote / Order", "Created"] as const;

function TicketRefBadges({ quoteRef, orderRef }: { quoteRef: string | null; orderRef: string | null }) {
  if (!quoteRef && !orderRef) {
    return <span style={{ color: "var(--color-text-muted)" }}>—</span>;
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {quoteRef && (
        <span
          className="inline-flex items-center rounded px-2 py-0.5 text-[11px] font-medium"
          style={{ background: "var(--color-info-bg)", color: "var(--color-info-text)" }}
        >
          {quoteRef}
        </span>
      )}
      {orderRef && (
        <span
          className="inline-flex items-center rounded px-2 py-0.5 text-[11px] font-medium"
          style={{ background: "var(--color-success-bg)", color: "var(--color-success)" }}
        >
          {orderRef}
        </span>
      )}
    </div>
  );
}

function ticketsForLead(lead: LeadHistoryRow, globalTickets: LeadHistoryTicket[]): LeadHistoryTicket[] {
  if (lead.tickets?.length) {
    return lead.tickets.map((t) => ({ ...t, linked_lead_id: lead.id }));
  }
  return globalTickets.filter((t) => t.linked_lead_id === lead.id);
}

function TableSkeleton({ cols }: { cols: number }) {
  return (
    <>
      {Array.from({ length: 5 }).map((_, i) => (
        <tr key={i}>
          {Array.from({ length: cols }).map((__, j) => (
            <td key={j} className="px-3 py-3">
              <div className="h-4 rounded animate-pulse" style={{ background: "var(--color-border)" }} />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

function HistoryRowCells({
  lead,
  quoteRef,
  orderRef,
  sourceLabels,
}: {
  lead: LeadHistoryRow;
  quoteRef: string | null;
  orderRef: string | null;
  sourceLabels: Record<string, string>;
}) {
  return (
    <>
      <td className="px-3 py-2.5">
        {lead.sales_status ? (
          <StatusPill status={lead.sales_status} />
        ) : (
          <span style={{ color: "var(--color-text-muted)" }}>—</span>
        )}
      </td>
      <td className="px-3 py-2.5 text-xs whitespace-nowrap">
        {lead.is_system_created ? (
          <span
            className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium"
            style={{ background: "var(--color-neutral-bg)", color: "var(--color-neutral-text)" }}
          >
            System
          </span>
        ) : lead.created_by?.full_name ? (
          <span style={{ color: "var(--color-text-primary)" }}>{lead.created_by.full_name}</span>
        ) : (
          <span style={{ color: "var(--color-text-muted)" }}>—</span>
        )}
      </td>
      <td className="px-3 py-2.5 text-xs" style={{ color: "var(--color-text-muted)" }}>
        {leadSourceLabel(lead.source, sourceLabels)}
      </td>
      <td className="px-3 py-2.5 max-w-[220px] text-xs" style={{ color: "var(--color-text-muted)" }}>
        {(() => {
          const products = formatLeadProductInterests(lead.interests, lead.quantities);
          return (
            <span className="block truncate" title={products !== "—" ? products : undefined}>
              {products}
            </span>
          );
        })()}
      </td>
      <td className="px-3 py-2.5">
        <UrgencyPill urgency={lead.urgency} />
      </td>
      <td className="px-3 py-2.5">
        <TicketRefBadges quoteRef={quoteRef} orderRef={orderRef} />
      </td>
      <td className="px-3 py-2.5 text-xs whitespace-nowrap" style={{ color: "var(--color-text-muted)" }}>
        {formatTimeTodayOrDateNumeric(lead.created_at)}
      </td>
    </>
  );
}

function MobileCard({
  lead,
  quoteRef,
  orderRef,
  sourceLabels,
  onClick,
}: {
  lead: LeadHistoryRow;
  quoteRef: string | null;
  orderRef: string | null;
  sourceLabels: Record<string, string>;
  onClick?: () => void;
}) {
  return (
    <div
      key={lead.id}
      className={`rounded-[10px] border p-4 space-y-2${onClick ? " cursor-pointer" : ""}`}
      style={{ background: "var(--color-surface)", borderColor: "var(--color-border)" }}
      onClick={onClick}
    >
      <div className="flex items-center gap-2 flex-wrap">
        {lead.sales_status ? (
          <StatusPill status={lead.sales_status} />
        ) : (
          <span className="text-xs" style={{ color: "var(--color-text-muted)" }}>—</span>
        )}
      </div>
      <div className="text-[11px] uppercase tracking-[0.06em] space-y-1" style={{ color: "var(--color-text-muted)" }}>
        {(lead.is_system_created || lead.created_by?.full_name) && (
          <div className="flex justify-between items-center">
            <span>Created By</span>
            {lead.is_system_created ? (
              <span
                className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium normal-case tracking-normal"
                style={{ background: "var(--color-neutral-bg)", color: "var(--color-neutral-text)" }}
              >
                System
              </span>
            ) : (
              <span className="normal-case tracking-normal" style={{ color: "var(--color-text-primary)" }}>
                {lead.created_by!.full_name}
              </span>
            )}
          </div>
        )}
        <div className="flex justify-between">
          <span>Source</span>
          <span className="normal-case tracking-normal">{leadSourceLabel(lead.source, sourceLabels)}</span>
        </div>
        {formatLeadProductInterests(lead.interests, lead.quantities) !== "—" && (
          <div className="flex justify-between gap-2">
            <span className="shrink-0">Product Interests</span>
            <span className="normal-case tracking-normal text-right truncate max-w-[200px]">
              {formatLeadProductInterests(lead.interests, lead.quantities)}
            </span>
          </div>
        )}
        <div className="flex justify-between items-center gap-2">
          <span>Quote / Order</span>
          <TicketRefBadges quoteRef={quoteRef} orderRef={orderRef} />
        </div>
        <div className="flex justify-between items-center">
          <span>Urgency</span>
          <UrgencyPill urgency={lead.urgency} />
        </div>
        <div className="flex justify-between">
          <span>Created</span>
          <span className="normal-case tracking-normal">{formatTimeTodayOrDateNumeric(lead.created_at)}</span>
        </div>
      </div>
    </div>
  );
}

export function LeadHistoryTable({
  leads,
  tickets = [],
  sourceLabels,
  emptyMessage = "No leads yet.",
  loading = false,
  onLeadClick,
  title = "Lead History",
  showTitle = true,
  borderRadius = "10px",
}: {
  leads: LeadHistoryRow[];
  /** Global tickets with linked_lead_id (customer profile). Omit when each lead has nested tickets. */
  tickets?: LeadHistoryTicket[];
  sourceLabels: Record<string, string>;
  emptyMessage?: string;
  loading?: boolean;
  onLeadClick?: (lead: LeadHistoryRow) => void;
  title?: string;
  showTitle?: boolean;
  borderRadius?: "10px" | "12px";
}) {
  const roundedClass = borderRadius === "12px" ? "rounded-xl" : "rounded-[10px]";

  return (
    <section>
      {showTitle && (
        <h2 className="text-[13px] font-semibold uppercase tracking-[0.06em] mb-3" style={{ color: "var(--color-text-muted)" }}>
          {title}
        </h2>
      )}

      {/* Desktop */}
      <div className={`hidden lg:block ${roundedClass} border overflow-hidden`} style={{ borderColor: "var(--color-border)" }}>
        <table className="w-full text-sm">
          <thead style={{ background: "color-mix(in srgb, var(--color-border) 30%, transparent)", borderBottom: "1px solid var(--color-border)" }}>
            <tr>
              {COLUMNS.map((h) => (
                <th key={h} className="px-3 py-2.5 text-left text-[11px] font-medium uppercase tracking-[0.06em]" style={{ color: "var(--color-text-muted)" }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <TableSkeleton cols={COLUMNS.length} />
            ) : leads.length === 0 ? (
              <tr>
                <td colSpan={COLUMNS.length} className="px-3 py-12 text-center text-sm" style={{ color: "var(--color-text-muted)" }}>
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              leads.map((lead, idx) => {
                const leadTickets = ticketsForLead(lead, tickets);
                const { quoteRef, orderRef } = leadTicketRefsForLead(leadTickets, lead.id);
                const clickable = !!onLeadClick;

                return (
                  <tr
                    key={lead.id}
                    className={clickable ? "cursor-pointer transition-colors" : undefined}
                    style={{
                      background: idx % 2 === 1 ? "var(--color-row-alt)" : "var(--color-surface)",
                      borderTop: idx > 0 ? "1px solid var(--color-border)" : undefined,
                    }}
                    onMouseEnter={clickable ? (e) => { e.currentTarget.style.background = "var(--color-row-hover)"; } : undefined}
                    onMouseLeave={clickable ? (e) => { e.currentTarget.style.background = idx % 2 === 1 ? "var(--color-row-alt)" : "var(--color-surface)"; } : undefined}
                    onClick={onLeadClick ? () => onLeadClick(lead) : undefined}
                  >
                    <HistoryRowCells lead={lead} quoteRef={quoteRef} orderRef={orderRef} sourceLabels={sourceLabels} />
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Mobile */}
      <div className="flex flex-col gap-3 lg:hidden">
        {loading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className={`${roundedClass} border p-4 space-y-3 animate-pulse`} style={{ background: "var(--color-surface)", borderColor: "var(--color-border)" }}>
              <div className="h-4 w-32 rounded" style={{ background: "var(--color-border)" }} />
            </div>
          ))
        ) : leads.length === 0 ? (
          <div className={`${roundedClass} border p-8 text-center text-sm`} style={{ background: "var(--color-surface)", borderColor: "var(--color-border)", color: "var(--color-text-muted)" }}>
            {emptyMessage}
          </div>
        ) : (
          leads.map((lead) => {
            const leadTickets = ticketsForLead(lead, tickets);
            const { quoteRef, orderRef } = leadTicketRefsForLead(leadTickets, lead.id);
            return (
              <MobileCard
                key={lead.id}
                lead={lead}
                quoteRef={quoteRef}
                orderRef={orderRef}
                sourceLabels={sourceLabels}
                onClick={onLeadClick ? () => onLeadClick(lead) : undefined}
              />
            );
          })
        )}
      </div>
    </section>
  );
}
