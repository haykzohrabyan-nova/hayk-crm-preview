import { formatCurrency } from "@/lib/utils/format";
import { resolveTaxExemptResubmitListStatus } from "@/lib/utils/evidence-resubmit-list-status";

export type TaxExemptSearchRow = {
  id: string;
  reference_code?: string | null;
  title?: string | null;
  contact_name?: string | null;
  contact_email?: string | null;
  sales_permit_number?: string | null;
  sales_permit_file_name?: string | null;
  sales_permit_resubmit_requested_at?: string | null;
  sales_permit_resubmit_received_at?: string | null;
  sales_permit_submitted_at?: string | null;
  quote_final_total?: number | null;
  customer?: {
    first_name?: string | null;
    last_name?: string | null;
    company?: string | null;
  } | null;
  created_by?: { full_name?: string | null } | null;
};

function buildHaystack(row: TaxExemptSearchRow): string {
  const parts = [
    row.id,
    row.reference_code ?? "",
    row.title ?? "",
    row.contact_name ?? "",
    row.contact_email ?? "",
    row.sales_permit_number ?? "",
    row.sales_permit_file_name ?? "",
    row.customer?.first_name ?? "",
    row.customer?.last_name ?? "",
    row.customer?.company ?? "",
    row.created_by?.full_name ?? "",
    row.quote_final_total != null ? formatCurrency(row.quote_final_total) : "",
    resolveTaxExemptResubmitListStatus(row).kind === "requested" ? "new permit requested" : "",
    resolveTaxExemptResubmitListStatus(row).kind === "submitted" ? "new permit submitted" : "",
  ];
  return parts.map((p) => p.trim()).filter(Boolean).join(" ").toLowerCase();
}

export function filterTaxExemptRows<T extends TaxExemptSearchRow>(rows: T[], search: string): T[] {
  const term = search.trim().toLowerCase();
  if (!term) return rows;
  return rows.filter((row) => buildHaystack(row).includes(term));
}
