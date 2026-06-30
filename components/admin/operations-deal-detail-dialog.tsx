"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, ExternalLink } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { StatusPill } from "@/components/ui/status-pill";
import {
  useGlobalLoading,
} from "@/components/layout/global-loading-provider";
import { formatDateNumeric, relativeTime } from "@/lib/utils/format";
import { quoteDetailPath } from "@/lib/utils/reference-codes";
import type { OperationsDealRow } from "@/lib/utils/fetch-admin-operations-data";

const ACTIVITY_LABELS: Record<string, string> = {
  lead_routed_to_sales: "Routed to Sales",
  lead_status_changed: "Lead status changed",
  lead_sales_claimed: "Claimed by sales rep",
  lead_in_progress: "Marked in progress",
  lead_held: "Put on hold",
  lead_follow_up_later: "Follow up later",
  lead_resumed: "Lead resumed",
  lead_rejected: "Lead rejected",
  order_ticket_created: "Quote created",
  order_ticket_status_changed: "Ticket status changed",
  ticket_sent: "Quote sent to customer",
  ticket_client_confirmed: "Customer confirmed quote",
  ticket_converted: "Converted to order",
  ticket_payment_recorded: "Payment recorded",
  ticket_production_released: "Released to production",
  ticket_payment_evidence_submitted: "Payment evidence submitted",
};

type ActivityRow = {
  id: string;
  type: string;
  created_at: string;
  payload?: Record<string, unknown>;
  _source?: "lead" | "ticket";
};

function activityLabel(a: ActivityRow): string {
  if (a.type === "lead_status_changed") {
    const p = a.payload ?? {};
    return `Status → ${String(p.to ?? "?")}`;
  }
  if (a.type === "ticket_converted") {
    const ref = a.payload?.reference_code;
    return ref ? `Converted to ${String(ref)}` : "Converted to order";
  }
  if (a.type === "ticket_sent") {
    return "Quote sent to customer";
  }
  return ACTIVITY_LABELS[a.type] ?? a.type.replace(/_/g, " ");
}

function LinkedTicketButton({
  label,
  displayRef,
  createdAt,
  disabled,
  onOpen,
}: {
  label: string;
  displayRef: string;
  createdAt?: string | null;
  disabled?: boolean;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onOpen}
      className="w-full flex items-center justify-between gap-3 rounded-md border px-3 py-2.5 text-left cursor-pointer transition-opacity hover:opacity-90 disabled:cursor-wait disabled:opacity-70"
      style={{
        borderColor: "var(--color-border)",
        background: "var(--color-bg)",
      }}
      aria-label={`Open ${label} ${displayRef}`}
    >
      <span className="text-sm shrink-0" style={{ color: "var(--color-text-muted)" }}>
        {label}
      </span>
      <div className="min-w-0 text-right flex items-center gap-2">
        <div className="min-w-0">
          <p
            className="text-[13px] font-medium font-mono truncate"
            style={{ color: "var(--color-tab-active)" }}
          >
            {displayRef}
          </p>
          {createdAt && (
            <p className="text-xs mt-0.5" style={{ color: "var(--color-text-muted)" }}>
              {formatDateNumeric(createdAt)}
            </p>
          )}
          <p className="text-[10px] mt-0.5" style={{ color: "var(--color-info-text)" }}>
            Click to open
          </p>
        </div>
        <ExternalLink size={16} className="shrink-0" style={{ color: "var(--color-tab-active)" }} aria-hidden />
      </div>
    </button>
  );
}

export function OperationsDealDetailDialog({
  deal,
  open,
  onOpenChange,
  onViewLead,
}: {
  deal: OperationsDealRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onViewLead: (leadId: string) => void;
}) {
  const router = useRouter();
  const { showLoading, isLoading } = useGlobalLoading();
  const [activities, setActivities] = useState<ActivityRow[]>([]);
  const [loadingActivities, setLoadingActivities] = useState(false);
  const [activityOpen, setActivityOpen] = useState(false);

  const ticketId = deal?.order_id ?? deal?.quote_id ?? null;
  const hasLinkedTicket = !!(deal?.quote_id || deal?.order_id);

  function openTicket(
    ticketIdToOpen: string,
    navRef: string,
    label: string,
  ) {
    if (isLoading) return;
    showLoading(`Opening ${label}…`);
    router.push(quoteDetailPath({ id: ticketIdToOpen, reference_code: navRef }));
  }

  const fetchActivities = useCallback(() => {
    if (!ticketId) {
      setActivities([]);
      return;
    }
    setLoadingActivities(true);
    setActivities([]);
    fetch(`/api/activities?ticket_id=${encodeURIComponent(ticketId)}&include_linked_lead=true`)
      .then((r) => r.json())
      .then((d) => {
        const rows = (d.activities ?? []) as ActivityRow[];
        setActivities(rows.slice(-5).reverse());
      })
      .catch(() => setActivities([]))
      .finally(() => setLoadingActivities(false));
  }, [ticketId]);

  useEffect(() => {
    if (!open) {
      setActivities([]);
      setLoadingActivities(false);
      setActivityOpen(false);
      return;
    }
    if (deal) fetchActivities();
  }, [open, deal, fetchActivities]);

  useEffect(() => {
    setActivityOpen(false);
  }, [deal?.lead_id, ticketId]);

  if (!deal) return null;

  const close = () => onOpenChange(false);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-[480px] max-h-[90vh] min-h-0 flex flex-col overflow-hidden gap-4"
        showCloseButton
      >
        <DialogHeader className="shrink-0">
          <DialogTitle className="text-lg font-semibold" style={{ color: "var(--color-text-primary)" }}>
            {deal.customer_name}
          </DialogTitle>
          {deal.company && (
            <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>
              {deal.company}
            </p>
          )}
        </DialogHeader>

        <div className="space-y-5 shrink-0">
          <div>
            <StatusPill status={deal.stage} size="md" />
            <p className="text-xs mt-2" style={{ color: "var(--color-text-muted)" }}>
              {deal.stage_from_ticket && deal.stage_ticket_ref ? (
                <>
                  Stage reflects ticket{" "}
                  <span className="font-mono" style={{ color: "var(--color-text-primary)" }}>
                    {deal.stage_ticket_ref}
                  </span>{" "}
                  (same labels as Quotes / Orders lists)
                </>
              ) : (
                "Stage reflects lead status — no active quote or order ticket yet"
              )}
            </p>
          </div>

          <div
            className="rounded-[10px] border p-4 space-y-2 text-sm"
            style={{ borderColor: "var(--color-border)", background: "var(--color-surface)" }}
          >
            <p className="text-[11px] font-medium uppercase tracking-[0.06em]" style={{ color: "var(--color-text-muted)" }}>
              Team
            </p>
            <div className="flex justify-between gap-4 items-start">
              <span style={{ color: "var(--color-text-muted)" }}>
                SDR
                {deal.owner_highlight === "sdr" && (
                  <span className="block text-[10px] normal-case tracking-normal mt-0.5" style={{ color: "var(--color-info-text)" }}>
                    Active owner
                  </span>
                )}
              </span>
              <span
                className="font-medium text-right"
                style={{
                  color:
                    deal.owner_highlight === "sdr"
                      ? "var(--color-text-primary)"
                      : "var(--color-text-muted)",
                }}
              >
                {deal.sdr_name ?? "—"}
              </span>
            </div>
            <div className="flex justify-between gap-4 items-start">
              <span style={{ color: "var(--color-text-muted)" }}>
                Sales rep
                {(deal.owner_highlight === "sales" || deal.owner_highlight === "unclaimed") && (
                  <span className="block text-[10px] normal-case tracking-normal mt-0.5" style={{ color: "var(--color-info-text)" }}>
                    {deal.owner_highlight === "unclaimed" ? "Awaiting claim" : "Active owner"}
                  </span>
                )}
              </span>
              <span
                className="font-medium text-right"
                style={{
                  color:
                    deal.owner_highlight === "sales" || deal.owner_highlight === "unclaimed"
                      ? "var(--color-text-primary)"
                      : "var(--color-text-muted)",
                }}
              >
                {deal.owner_highlight === "unclaimed" ? "Unclaimed" : (deal.sales_owner_name ?? "—")}
              </span>
            </div>
          </div>

          <div
            className="rounded-[10px] border p-4 space-y-3 text-sm"
            style={{ borderColor: "var(--color-border)", background: "var(--color-surface)" }}
          >
            <div>
              <p className="text-[11px] font-medium uppercase tracking-[0.06em]" style={{ color: "var(--color-text-muted)" }}>
                Linked records
              </p>
              <p className="text-xs mt-1" style={{ color: "var(--color-text-muted)" }}>
                {hasLinkedTicket
                  ? "Tap a record to open the quote or order detail page"
                  : "No quote or order linked to this lead yet"}
              </p>
            </div>
            {deal.quote_ref && deal.quote_id ? (
              <LinkedTicketButton
                label="Quote"
                displayRef={deal.quote_ref}
                createdAt={deal.quote_created_at}
                disabled={isLoading}
                onOpen={() =>
                  openTicket(
                    deal.quote_id!,
                    deal.quote_nav_ref ?? deal.quote_ref!,
                    deal.quote_ref!,
                  )
                }
              />
            ) : (
              <div className="flex justify-between gap-3 text-sm">
                <span style={{ color: "var(--color-text-muted)" }}>Quote</span>
                <span style={{ color: "var(--color-text-muted)" }}>—</span>
              </div>
            )}
            {deal.order_ref && deal.order_id ? (
              <LinkedTicketButton
                label="Order"
                displayRef={deal.order_ref}
                createdAt={deal.order_created_at}
                disabled={isLoading}
                onOpen={() => openTicket(deal.order_id!, deal.order_ref!, deal.order_ref!)}
              />
            ) : (
              <div className="flex justify-between gap-3 text-sm">
                <span style={{ color: "var(--color-text-muted)" }}>Order</span>
                <span style={{ color: "var(--color-text-muted)" }}>—</span>
              </div>
            )}
          </div>

        </div>

        <div className="min-h-0 flex-1 flex flex-col overflow-hidden">
          <button
            type="button"
            onClick={() => setActivityOpen((v) => !v)}
            className="flex w-full shrink-0 items-center gap-2 text-left rounded-[6px] -mx-1 px-1 py-0.5 cursor-pointer transition-opacity hover:opacity-80"
            aria-expanded={activityOpen}
          >
            <span
              className="shrink-0 text-[11px] font-medium uppercase tracking-[0.06em] inline-flex items-center gap-2 normal-case"
              style={{ color: "var(--color-text-muted)" }}
            >
              Recent activity
              {loadingActivities && (
                <span className="text-[10px] font-normal tracking-normal" style={{ color: "var(--color-text-muted)" }}>
                  Loading…
                </span>
              )}
              {!loadingActivities && activities.length > 0 && (
                <span className="text-[10px] font-normal tracking-normal" style={{ color: "var(--color-text-muted)" }}>
                  {activities.length} {activities.length === 1 ? "event" : "events"}
                </span>
              )}
              {!loadingActivities && !ticketId && (
                <span className="text-[10px] font-normal tracking-normal" style={{ color: "var(--color-text-muted)" }}>
                  No linked ticket
                </span>
              )}
            </span>
            <div className="flex-1 h-px" style={{ background: "var(--color-border)" }} />
            <ChevronDown
              size={16}
              className="shrink-0 transition-transform duration-200"
              style={{
                color: "var(--color-text-muted)",
                transform: activityOpen ? "rotate(0deg)" : "rotate(-90deg)",
              }}
            />
          </button>
          {activityOpen && (
            <div className="mt-3 min-h-0 flex-1 overflow-y-auto pr-1">
              {loadingActivities ? (
                <div className="space-y-2 animate-pulse">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="h-8 rounded" style={{ background: "var(--color-border)" }} />
                  ))}
                </div>
              ) : activities.length === 0 ? (
                <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>
                  {ticketId ? "No activity yet." : "No linked quote or order yet."}
                </p>
              ) : (
                <ul className="space-y-3">
                  {activities.map((a) => (
                    <li key={a.id} className="flex gap-2 text-sm">
                      <span
                        className="mt-1.5 h-2 w-2 shrink-0 rounded-full"
                        style={{ background: "var(--color-accent)" }}
                      />
                      <div>
                        <p style={{ color: "var(--color-text-primary)" }}>{activityLabel(a)}</p>
                        <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>
                          {relativeTime(a.created_at)}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>

        <div className="shrink-0 flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-2 border-t mt-auto" style={{ borderColor: "var(--color-border)" }}>
          <Button type="button" variant="outline" onClick={close}>
            Close
          </Button>
          <Button
            type="button"
            onClick={() => {
              close();
              if (!deal.ticket_only) onViewLead(deal.lead_id);
            }}
            disabled={deal.ticket_only}
            style={{
              background: "var(--color-btn-verify-bg)",
              color: "var(--color-btn-verify-text)",
            }}
          >
            View full lead
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
