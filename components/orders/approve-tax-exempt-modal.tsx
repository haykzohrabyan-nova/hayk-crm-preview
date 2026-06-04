"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, FileText, Loader2, Mail, XCircle } from "lucide-react";
import { formatCurrency } from "@/lib/utils/ticket-math";
import { displayContactName } from "@/lib/utils/format";
import { computeTotalsIfTaxExemptDenied } from "@/lib/utils/tax-exempt-approval";

export interface TaxExemptApproveTicket {
  id: string;
  reference_code: string | null;
  quote_subtotal: number | null;
  quote_shipping: number | null;
  discount_type?: string | null;
  discount_value?: string | null;
  tax_exempt: boolean;
  quote_tax_rate_percent?: number | null;
  quote_pre_tax_total: number | null;
  quote_tax_amount: number | null;
  quote_final_total: number | null;
  sales_permit_number: string | null;
  sales_permit_file_name: string | null;
  customer?: {
    first_name?: string | null;
    last_name?: string | null;
    company?: string | null;
  } | null;
}

interface Props {
  open: boolean;
  ticket: TaxExemptApproveTicket;
  permitViewHref: string;
  confirming?: boolean;
  error?: string | null;
  onClose: () => void;
  onApproved: () => void;
  onRequestEvidence?: () => void;
}

function TotalRow({
  label,
  value,
  emphasize,
  muted,
}: {
  label: string;
  value: string;
  emphasize?: boolean;
  muted?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <span style={{ color: muted ? "var(--color-text-muted)" : "var(--color-text-primary)" }}>{label}</span>
      <span
        className={emphasize ? "text-base font-semibold tabular-nums" : "font-medium tabular-nums"}
        style={{ color: emphasize ? "var(--color-text-primary)" : "var(--color-text-muted)" }}
      >
        {value}
      </span>
    </div>
  );
}

export function ApproveTaxExemptModal({
  open,
  ticket,
  permitViewHref,
  confirming: confirmingProp,
  error: errorProp,
  onClose,
  onApproved,
  onRequestEvidence,
}: Props) {
  const [taxRate, setTaxRate] = useState(ticket.quote_tax_rate_percent ?? 0);
  const [preTax, setPreTax] = useState(ticket.quote_pre_tax_total ?? 0);
  const [taxAmount, setTaxAmount] = useState(ticket.quote_tax_amount ?? 0);
  const [finalTotal, setFinalTotal] = useState(ticket.quote_final_total ?? 0);
  const [saving, setSaving] = useState<"approve" | "deny" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showDenyConfirm, setShowDenyConfirm] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTaxRate(ticket.quote_tax_rate_percent ?? 0);
    setPreTax(ticket.quote_pre_tax_total ?? 0);
    setTaxAmount(ticket.quote_tax_amount ?? 0);
    setFinalTotal(ticket.quote_final_total ?? 0);
    setError(null);
    setShowDenyConfirm(false);
  }, [
    open,
    ticket.id,
    ticket.quote_tax_rate_percent,
    ticket.quote_pre_tax_total,
    ticket.quote_tax_amount,
    ticket.quote_final_total,
  ]);

  const deniedTotals = useMemo(
    () => computeTotalsIfTaxExemptDenied(preTax, taxRate),
    [preTax, taxRate],
  );

  const exemptTaxAmount = 0;
  const exemptFinalTotal = preTax;

  if (!open) return null;

  const confirming = confirmingProp ?? saving !== null;
  const displayError = errorProp ?? error;
  const customerLabel = ticket.customer ? displayContactName(ticket.customer) : undefined;
  const rateLabel = `${taxRate}%`;

  async function handleApprove() {
    setSaving("approve");
    setError(null);
    try {
      const res = await fetch(`/api/tickets/${ticket.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          approve_tax_exempt: true,
          quote_pre_tax_total: preTax,
          quote_tax_rate_percent: taxRate,
          quote_tax_amount: taxAmount,
          quote_final_total: finalTotal,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to confirm tax-exempt documentation.");
        setSaving(null);
        return;
      }
      window.dispatchEvent(new Event("bazaar:tickets-changed"));
      window.dispatchEvent(new Event("bazaar:refresh-counts"));
      onApproved();
      onClose();
    } catch {
      setError("Network error — please try again.");
      setSaving(null);
    }
  }

  async function handleDeny() {
    setSaving("deny");
    setError(null);
    try {
      const res = await fetch(`/api/tickets/${ticket.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deny_tax_exempt: true }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to deny tax-exempt documentation.");
        setSaving(null);
        return;
      }
      window.dispatchEvent(new Event("bazaar:tickets-changed"));
      window.dispatchEvent(new Event("bazaar:refresh-counts"));
      onApproved();
      onClose();
    } catch {
      setError("Network error — please try again.");
      setSaving(null);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.45)" }}
      onClick={confirming ? undefined : onClose}
      role="presentation"
    >
      <div
        className="w-full max-w-[720px] rounded-[12px] p-6 max-h-[90vh] overflow-y-auto"
        style={{ background: "var(--color-surface)" }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-tax-exempt-title"
      >
        <div className="flex gap-3 mb-4">
          <AlertTriangle
            size={24}
            className="shrink-0"
            style={{ color: "var(--color-warning)" }}
          />
          <div className="min-w-0">
            <h2
              id="confirm-tax-exempt-title"
              className="text-base font-semibold mb-2"
              style={{ color: "var(--color-text-primary)" }}
            >
              Review tax-exempt documentation
            </h2>
            <p className="text-sm leading-relaxed" style={{ color: "var(--color-text-muted)" }}>
              Permit{" "}
              <strong style={{ color: "var(--color-text-primary)" }}>
                #{ticket.sales_permit_number ?? "—"}
              </strong>
              . Compare totals below, then approve tax-exempt or deny and apply sales tax.
            </p>
          </div>
        </div>

        {(ticket.reference_code || customerLabel) && (
          <dl
            className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm mb-4 rounded-lg border px-3 py-3"
            style={{ borderColor: "var(--color-border)", background: "var(--color-bg)" }}
          >
            {ticket.reference_code && (
              <>
                <dt style={{ color: "var(--color-text-muted)" }}>Order</dt>
                <dd className="font-mono font-medium" style={{ color: "var(--color-text-primary)" }}>
                  {ticket.reference_code}
                </dd>
              </>
            )}
            {customerLabel && (
              <>
                <dt style={{ color: "var(--color-text-muted)" }}>Customer</dt>
                <dd className="font-medium truncate" style={{ color: "var(--color-text-primary)" }}>
                  {customerLabel}
                </dd>
              </>
            )}
          </dl>
        )}

        {ticket.sales_permit_file_name && (
          <a
            href={permitViewHref}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-[6px] px-3 py-2 text-[13px] font-medium border mb-4"
            style={{
              borderColor: "var(--color-border)",
              color: "var(--color-text-primary)",
              background: "var(--color-bg)",
              textDecoration: "none",
            }}
          >
            <FileText size={14} />
            View permit file
          </a>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
          <div
            className="rounded-lg border p-4 space-y-2.5"
            style={{
              borderColor: "var(--color-success-border)",
              background: "var(--color-success-bg)",
            }}
          >
            <p
              className="text-[11px] font-medium uppercase tracking-wide"
              style={{ color: "var(--color-success)", letterSpacing: "0.06em" }}
            >
              If approved (tax-exempt)
            </p>
            <TotalRow label="Pre-tax subtotal" value={formatCurrency(preTax)} muted />
            <TotalRow label="Sales tax" value={formatCurrency(exemptTaxAmount)} muted />
            <TotalRow label="Quote total" value={formatCurrency(exemptFinalTotal)} emphasize />
          </div>

          <div
            className="rounded-lg border p-4 space-y-2.5"
            style={{
              borderColor: "var(--color-danger-border)",
              background: "var(--color-danger-bg)",
            }}
          >
            <p
              className="text-[11px] font-medium uppercase tracking-wide"
              style={{ color: "var(--color-danger)", letterSpacing: "0.06em" }}
            >
              If denied (tax applies)
            </p>
            <TotalRow label="Pre-tax subtotal" value={formatCurrency(preTax)} muted />
            <TotalRow
              label={`Sales tax (${rateLabel})`}
              value={formatCurrency(deniedTotals.tax_amount)}
              muted
            />
            <TotalRow label="Quote total" value={formatCurrency(deniedTotals.final_total)} emphasize />
          </div>
        </div>

        <p className="text-xs mb-3" style={{ color: "var(--color-text-muted)" }}>
          Denying removes tax-exempt status and updates the quote to{" "}
          <strong style={{ color: "var(--color-text-primary)" }}>
            {formatCurrency(deniedTotals.final_total)}
          </strong>{" "}
          ({formatCurrency(deniedTotals.tax_amount)} tax at {rateLabel}). The customer is not emailed on deny;
          follow up with sales if needed.
        </p>

        <details className="mb-4 rounded-lg border" style={{ borderColor: "var(--color-border)" }}>
          <summary
            className="cursor-pointer px-3 py-2.5 text-[13px] font-medium"
            style={{ color: "var(--color-text-primary)" }}
          >
            Adjust totals before approving
          </summary>
          <div className="grid grid-cols-2 gap-3 px-3 pb-3 pt-1">
            <div>
              <label
                className="block text-[11px] font-medium uppercase tracking-wide mb-1"
                style={{ color: "var(--color-text-muted)" }}
              >
                Pre-tax total
              </label>
              <input
                type="number"
                step="0.01"
                value={preTax}
                onChange={(e) => {
                  const next = Number(e.target.value);
                  setPreTax(next);
                  setTaxAmount(0);
                  setFinalTotal(next);
                }}
                className="w-full h-9 rounded-[6px] border px-2 text-sm"
                style={{
                  borderColor: "var(--color-border)",
                  background: "var(--color-bg)",
                  color: "var(--color-text-primary)",
                }}
              />
            </div>
            <div>
              <label
                className="block text-[11px] font-medium uppercase tracking-wide mb-1"
                style={{ color: "var(--color-text-muted)" }}
              >
                Tax rate %
              </label>
              <input
                type="number"
                step="0.01"
                value={taxRate}
                onChange={(e) => setTaxRate(Number(e.target.value))}
                className="w-full h-9 rounded-[6px] border px-2 text-sm"
                style={{
                  borderColor: "var(--color-border)",
                  background: "var(--color-bg)",
                  color: "var(--color-text-primary)",
                }}
              />
            </div>
            <div>
              <label
                className="block text-[11px] font-medium uppercase tracking-wide mb-1"
                style={{ color: "var(--color-text-muted)" }}
              >
                Tax amount (exempt)
              </label>
              <input
                type="number"
                step="0.01"
                value={taxAmount}
                onChange={(e) => setTaxAmount(Number(e.target.value))}
                className="w-full h-9 rounded-[6px] border px-2 text-sm"
                style={{
                  borderColor: "var(--color-border)",
                  background: "var(--color-bg)",
                  color: "var(--color-text-primary)",
                }}
              />
            </div>
            <div>
              <label
                className="block text-[11px] font-medium uppercase tracking-wide mb-1"
                style={{ color: "var(--color-text-muted)" }}
              >
                Final total (exempt)
              </label>
              <input
                type="number"
                step="0.01"
                value={finalTotal}
                onChange={(e) => setFinalTotal(Number(e.target.value))}
                className="w-full h-9 rounded-[6px] border px-2 text-sm"
                style={{
                  borderColor: "var(--color-border)",
                  background: "var(--color-bg)",
                  color: "var(--color-text-primary)",
                }}
              />
            </div>
          </div>
        </details>

        {showDenyConfirm && (
          <p
            className="text-sm font-medium rounded-lg border px-3 py-2 mb-4"
            style={{
              borderColor: "var(--color-danger-border)",
              background: "var(--color-danger-bg)",
              color: "var(--color-danger)",
            }}
          >
            Deny will turn off tax-exempt and set the quote total to{" "}
            {formatCurrency(deniedTotals.final_total)}. Click Deny again to confirm.
          </p>
        )}

        {!showDenyConfirm && (
          <p
            className="text-sm font-medium rounded-lg border px-3 py-2 mb-4"
            style={{
              borderColor: "var(--color-warning-border)",
              background: "var(--color-warning-bg)",
              color: "var(--color-warning-text-deep)",
            }}
          >
            Only approve if the permit is valid. Use Deny if the documentation is incorrect or expired.
          </p>
        )}

        {displayError && (
          <div
            className="rounded-[6px] border px-3 py-2 text-sm mb-4"
            style={{
              borderColor: "var(--color-danger-border)",
              background: "var(--color-danger-bg)",
              color: "var(--color-danger)",
            }}
          >
            {displayError}
          </div>
        )}

        <div className="flex items-center gap-2 min-w-0">
          {onRequestEvidence ? (
            <button
              type="button"
              disabled={confirming}
              onClick={onRequestEvidence}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-[6px] border px-3 py-1.5 text-[13px] font-medium disabled:opacity-60 whitespace-nowrap"
              style={{
                borderColor: "var(--color-border)",
                color: "var(--color-text-primary)",
                background: "var(--color-surface)",
              }}
            >
              <Mail size={14} />
              Request updated permit
            </button>
          ) : null}
          <div className="min-w-2 flex-1" aria-hidden />
          <button
            type="button"
            disabled={confirming}
            onClick={onClose}
            className="shrink-0 rounded-[6px] border px-3 py-1.5 text-[13px] font-medium disabled:opacity-60 whitespace-nowrap"
            style={{
              borderColor: "var(--color-border)",
              color: "var(--color-text-muted)",
              background: "transparent",
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={confirming}
            onClick={() => {
              if (!showDenyConfirm) {
                setShowDenyConfirm(true);
                return;
              }
              void handleDeny();
            }}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-[6px] px-3 py-1.5 text-[13px] font-medium disabled:opacity-60 whitespace-nowrap"
            style={{
              background: "var(--color-danger)",
              color: "white",
            }}
          >
            {saving === "deny" ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <XCircle size={14} />
            )}
            {showDenyConfirm ? "Yes, deny" : "Deny tax-exempt"}
          </button>
          <button
            type="button"
            disabled={confirming || finalTotal <= 0}
            onClick={() => void handleApprove()}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-[6px] px-3 py-1.5 text-[13px] font-medium disabled:opacity-60 whitespace-nowrap"
            style={{
              background: "var(--color-btn-primary-bg)",
              color: "var(--color-btn-primary-text)",
            }}
          >
            {saving === "approve" ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <CheckCircle2 size={14} />
            )}
            Approve ({formatCurrency(finalTotal)})
          </button>
        </div>
      </div>
    </div>
  );
}
