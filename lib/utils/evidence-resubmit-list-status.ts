export type ResubmitListKind = "none" | "requested" | "submitted";

export type ResubmitListStatus =
  | { kind: "none" }
  | { kind: "requested"; label: string; at: string }
  | { kind: "submitted"; label: string; at: string };

export function resubmitListStatusIsVisible(status: ResubmitListStatus): boolean {
  return status.kind !== "none";
}

type ResubmitTimestamps = {
  requestedAt?: string | null;
  submittedAt?: string | null;
  receivedAt?: string | null;
};

function parseTime(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  return Number.isFinite(t) ? t : null;
}

export function resolveResubmitListStatus(
  timestamps: ResubmitTimestamps,
  labels: { requested: string; submitted: string },
): ResubmitListStatus {
  const requestedAt = timestamps.requestedAt ?? null;
  if (!requestedAt) return { kind: "none" };

  const reqT = parseTime(requestedAt);
  const subT = parseTime(timestamps.submittedAt);
  const recT = parseTime(timestamps.receivedAt);

  const customerReplaced =
    (recT != null && reqT != null) ||
    (subT != null && reqT != null && subT > reqT);

  if (customerReplaced) {
    const at = timestamps.receivedAt ?? timestamps.submittedAt ?? requestedAt;
    return { kind: "submitted", label: labels.submitted, at };
  }

  return { kind: "requested", label: labels.requested, at: requestedAt };
}

export function resolvePaymentEvidenceResubmitListStatus(ticket: {
  payment_evidence_resubmit_requested_at?: string | null;
  payment_evidence_submitted_at?: string | null;
  payment_evidence_resubmit_received_at?: string | null;
}): ResubmitListStatus {
  return resolveResubmitListStatus(
    {
      requestedAt: ticket.payment_evidence_resubmit_requested_at,
      submittedAt: ticket.payment_evidence_submitted_at,
      receivedAt: ticket.payment_evidence_resubmit_received_at,
    },
    { requested: "New evidence requested", submitted: "New evidence submitted" },
  );
}

export function resolveTaxExemptResubmitListStatus(ticket: {
  sales_permit_resubmit_requested_at?: string | null;
  sales_permit_submitted_at?: string | null;
  sales_permit_resubmit_received_at?: string | null;
}): ResubmitListStatus {
  return resolveResubmitListStatus(
    {
      requestedAt: ticket.sales_permit_resubmit_requested_at,
      submittedAt: ticket.sales_permit_submitted_at,
      receivedAt: ticket.sales_permit_resubmit_received_at,
    },
    { requested: "New permit requested", submitted: "New permit submitted" },
  );
}
