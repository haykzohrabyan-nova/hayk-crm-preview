"use client";

import { useState } from "react";
import { FileText, CheckCircle2, Loader2 } from "lucide-react";
import { isTaxExemptApprovalPending } from "@/lib/utils/invoice-payment-summary";
import { isLegacyTaxExemptMissingPermitFile } from "@/lib/utils/tax-exempt-approval";
import { formatDateTime } from "@/lib/utils/format";
import {
  DetailCollapsibleSection,
  DetailSection,
} from "@/components/quotes/quote-detail/detail-layout-primitives";
import { ApproveTaxExemptModal, type TaxExemptApproveTicket } from "@/components/orders/approve-tax-exempt-modal";

export interface TaxExemptReviewTicket extends TaxExemptApproveTicket {
  sales_permit_storage_path?: string | null;
  sales_permit_reviewed_at?: string | null;
  sales_permit_reviewed_by?: { id: string; full_name: string | null } | null;
}

interface Props {
  ticket: TaxExemptReviewTicket;
  readOnly?: boolean;
  defaultOpen?: boolean;
  /** When set, navigate here after successful approve (e.g. `/payments`). */
  afterApprovePath?: string | null;
  onApproved?: () => void;
  /** When true, omit outer DetailSection wrapper (nested inside PaymentDetailOverview). */
  embedded?: boolean;
}

export function TaxExemptReviewSection({
  ticket,
  readOnly = false,
  defaultOpen = false,
  afterApprovePath = null,
  onApproved,
  embedded = false,
}: Props) {
  const [modalOpen, setModalOpen] = useState(false);
  const pending = isTaxExemptApprovalPending(ticket);
  const legacyMissingFile = isLegacyTaxExemptMissingPermitFile(ticket);
  const permitHref = `/api/tickets/${ticket.reference_code ?? ticket.id}/sales-permit`;
  const orderPath = `/orders/${ticket.reference_code ?? ticket.id}`;

  if (!ticket.tax_exempt) return null;
  const showReviewedArchive =
    !!ticket.sales_permit_reviewed_at && !!ticket.sales_permit_file_name;
  if (!pending && !legacyMissingFile && !showReviewedArchive) return null;

  const sectionTitle = pending || legacyMissingFile ? "Tax-exempt review" : "Tax-exempt documentation";
  const canApprove = !readOnly && pending && !legacyMissingFile;

  const body = (
    <>
      <DetailCollapsibleSection title={sectionTitle} defaultOpen={defaultOpen || pending}>
        <div className="space-y-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 min-w-0 flex-1">
              <div>
                <p
                  className="text-[11px] font-medium uppercase tracking-wider mb-2"
                  style={{ color: "var(--color-text-muted)", letterSpacing: "0.06em" }}
                >
                  Permit #
                </p>
                <span className="text-sm font-medium" style={{ color: "var(--color-text-primary)" }}>
                  {ticket.sales_permit_number ?? "—"}
                </span>
              </div>
              {ticket.sales_permit_file_name && (
                <div>
                  <p
                    className="text-[11px] font-medium uppercase tracking-wider mb-2"
                    style={{ color: "var(--color-text-muted)", letterSpacing: "0.06em" }}
                  >
                    File
                  </p>
                  <span className="text-sm truncate block" style={{ color: "var(--color-text-muted)" }}>
                    {ticket.sales_permit_file_name}
                  </span>
                </div>
              )}
            </div>

            <div className="flex items-center gap-2 flex-wrap shrink-0 lg:pt-5">
              {ticket.sales_permit_file_name && (
                <a
                  href={permitHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-[6px] px-3 py-2 text-[13px] font-medium border"
                  style={{
                    borderColor: "var(--color-border)",
                    color: "var(--color-text-primary)",
                    background: "var(--color-bg)",
                    textDecoration: "none",
                  }}
                >
                  <FileText size={14} />
                  View file
                </a>
              )}
              {canApprove && (
                <button
                  type="button"
                  onClick={() => setModalOpen(true)}
                  className="inline-flex items-center gap-1.5 rounded-[6px] px-4 py-2 text-[13px] font-medium"
                  style={{
                    background: "var(--color-btn-primary-bg)",
                    color: "var(--color-btn-primary-text)",
                  }}
                >
                  <CheckCircle2 size={14} />
                  Confirm tax-exempt
                </button>
              )}
            </div>
          </div>

          {!pending && ticket.sales_permit_reviewed_at && (
            <p className="text-sm" style={{ color: "var(--color-success)" }}>
              Approved {formatDateTime(ticket.sales_permit_reviewed_at)}
              {ticket.sales_permit_reviewed_by?.full_name
                ? ` by ${ticket.sales_permit_reviewed_by.full_name}`
                : ""}
            </p>
          )}

          {legacyMissingFile && (
            <div
              className="rounded-[6px] px-3 py-2.5 text-sm"
              style={{
                background: "var(--color-warning-bg)",
                border: "1px solid var(--color-warning-border)",
                color: "var(--color-warning-text-deep)",
              }}
            >
              This order was marked tax-exempt before permit files were required. Upload the sales permit
              document on the order (Quote tab → Permit File), then return here or use{" "}
              <strong>Payments → Tax-exempt pending</strong> to confirm.
              {!readOnly && (
                <>
                  {" "}
                  <a href={orderPath} style={{ color: "var(--color-tab-active)", fontWeight: 500 }}>
                    Open order to upload
                  </a>
                </>
              )}
            </div>
          )}

          <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>
            {legacyMissingFile
              ? "Approval is available after the permit file is uploaded."
              : pending
                ? readOnly
                  ? "An accountant must confirm the tax-exempt permit before payment confirmation or order completion."
                  : "Confirming locks totals and notifies the customer when email/SMS is configured. Edit totals in the confirmation step if needed."
                : "Tax-exempt documentation was reviewed. The permit file remains available for audit."}
          </p>
        </div>
      </DetailCollapsibleSection>

      <ApproveTaxExemptModal
        open={modalOpen}
        ticket={ticket}
        permitViewHref={permitHref}
        onClose={() => setModalOpen(false)}
        onApproved={() => {
          onApproved?.();
          if (afterApprovePath) {
            window.location.assign(afterApprovePath);
          }
        }}
      />
    </>
  );

  if (embedded) return body;

  return <DetailSection>{body}</DetailSection>;
}
