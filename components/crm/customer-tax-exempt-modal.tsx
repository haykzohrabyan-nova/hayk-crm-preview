"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { X, FileText, Loader2 } from "lucide-react";
import { formatDateTime } from "@/lib/utils/format";
import { quoteDetailPath } from "@/lib/utils/reference-codes";

type HistoryRow = {
  id: string;
  reference_code: string | null;
  has_file: boolean;
  sales_permit_file_name: string | null;
  sales_permit_reviewed_at: string | null;
  approval_status: "approved" | "pending";
  reviewed_by_name: string | null;
  created_at: string;
};

type CustomerLast = {
  permit_number: string | null;
  file_name: string | null;
  reviewed_at: string | null;
  reviewed_by_name: string | null;
  has_file: boolean;
};

export function CustomerTaxExemptModal({
  customerId,
  open,
  onClose,
}: {
  customerId: string;
  open: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [customerLast, setCustomerLast] = useState<CustomerLast | null>(null);
  const [rows, setRows] = useState<HistoryRow[]>([]);

  const fetchHistory = useCallback(() => {
    if (!open || !customerId) return;
    setLoading(true);
    setError(null);
    fetch(`/api/crm/customers/${customerId}/tax-exempt-history`)
      .then((r) => r.json())
      .then((d) => {
        if (d.error) {
          setError(d.error);
          return;
        }
        setCustomerLast(d.customer_last ?? null);
        setRows(d.rows ?? []);
      })
      .catch(() => setError("Failed to load tax-exempt history."))
      .finally(() => setLoading(false));
  }, [open, customerId]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.55)" }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-[720px] min-h-[min(420px,85vh)] max-h-[85vh] overflow-hidden flex flex-col rounded-[12px] border"
        style={{ background: "var(--color-surface)", borderColor: "var(--color-border)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 px-6 py-4 border-b" style={{ borderColor: "var(--color-border)" }}>
          <div>
            <h2 className="text-[16px] font-semibold" style={{ color: "var(--color-text-primary)" }}>
              Tax-exempt history
            </h2>
            <p className="text-[13px] mt-1" style={{ color: "var(--color-text-muted)" }}>
              Per-quote approvals are separate. Customer last permit is a reuse hint for new quotes only.
            </p>
          </div>
          <button type="button" onClick={onClose} style={{ color: "var(--color-text-muted)" }}>
            <X size={18} />
          </button>
        </div>

        <div className="flex flex-1 flex-col min-h-0 gap-4 px-6 py-4 overflow-hidden">
          {loading && (
            <div
              className="flex flex-1 min-h-[280px] items-center justify-center gap-2"
              style={{ color: "var(--color-text-muted)" }}
            >
              <Loader2 size={18} className="animate-spin" />
              Loading…
            </div>
          )}

          {error && !loading && (
            <p className="text-sm" style={{ color: "var(--color-danger)" }}>{error}</p>
          )}

          {!loading && !error && customerLast?.has_file && (
            <div
              className="shrink-0 rounded-[10px] border px-4 py-3 text-sm space-y-1"
              style={{
                borderColor: "var(--color-info-border)",
                background: "var(--color-info-bg)",
                color: "var(--color-info-text-deep)",
              }}
            >
              <p className="font-medium" style={{ color: "var(--color-info-text)" }}>
                Last permit on file (customer)
              </p>
              <p>Permit #: {customerLast.permit_number ?? "—"}</p>
              {customerLast.file_name && <p>File: {customerLast.file_name}</p>}
              {customerLast.reviewed_at && (
                <p>
                  Last approved {formatDateTime(customerLast.reviewed_at)}
                  {customerLast.reviewed_by_name ? ` by ${customerLast.reviewed_by_name}` : ""}
                </p>
              )}
            </div>
          )}

          {!loading && !error && (
            <div
              className="flex-1 min-h-[280px] min-h-0 overflow-y-auto rounded-[10px] border"
              style={{ borderColor: "var(--color-border)" }}
            >
              <table className="w-full border-collapse text-sm">
                <thead className="sticky top-0 z-[1]">
                  <tr style={{ background: "var(--color-row-alt)", borderBottom: "1px solid var(--color-border)" }}>
                    {["Reference", "Permit file", "Status", "Reviewed", ""].map((h) => (
                      <th
                        key={h}
                        className="px-4 py-2.5 text-left text-[11px] font-medium uppercase tracking-wider"
                        style={{ color: "var(--color-text-muted)", letterSpacing: "0.06em" }}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.length === 0 ? (
                    <tr>
                      <td
                        colSpan={5}
                        className="px-4 py-16 text-center align-middle"
                        style={{ color: "var(--color-text-muted)" }}
                      >
                        No tax-exempt quotes or orders for this customer yet.
                      </td>
                    </tr>
                  ) : (
                    rows.map((row, i) => {
                      const href = quoteDetailPath({
                        id: row.id,
                        reference_code: row.reference_code,
                      });
                      const statusStyle =
                        row.approval_status === "approved"
                          ? { bg: "var(--color-success-bg)", text: "var(--color-success)" }
                          : { bg: "var(--color-warning-bg)", text: "var(--color-warning-text-deep)" };
                      return (
                        <tr
                          key={row.id}
                          style={{
                            borderBottom: "1px solid var(--color-border)",
                            background: i % 2 === 0 ? "var(--color-surface)" : "var(--color-row-alt)",
                          }}
                        >
                          <td className="px-4 py-3 font-mono text-xs" style={{ color: "var(--color-text-primary)" }}>
                            {row.reference_code ?? "—"}
                          </td>
                          <td className="px-4 py-3">
                            {row.has_file && row.sales_permit_file_name ? (
                              <span className="inline-flex items-center gap-1" style={{ color: "var(--color-tab-active)" }}>
                                <FileText size={13} />
                                {row.sales_permit_file_name}
                              </span>
                            ) : (
                              <span style={{ color: "var(--color-text-muted)" }}>—</span>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <span
                              className="inline-flex px-2 py-0.5 rounded-full text-[11px] font-medium"
                              style={{ background: statusStyle.bg, color: statusStyle.text }}
                            >
                              {row.approval_status === "approved" ? "Approved" : "Pending"}
                            </span>
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap" style={{ color: "var(--color-text-muted)" }}>
                            {row.sales_permit_reviewed_at
                              ? `${formatDateTime(row.sales_permit_reviewed_at)}${row.reviewed_by_name ? ` · ${row.reviewed_by_name}` : ""}`
                              : "—"}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <button
                              type="button"
                              className="text-[13px] font-medium hover:underline"
                              style={{ color: "var(--color-tab-active)" }}
                              onClick={() => {
                                onClose();
                                router.push(href);
                              }}
                            >
                              Open
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
