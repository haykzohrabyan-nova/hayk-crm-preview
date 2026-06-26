import { formatCurrencyOrNull, formatDate, formatDateTime } from "@/lib/utils/format";
import { dueDateEndOfDayMs, isDueDateOverdue } from "@/lib/utils/due-date";
import { isOrderReferenceCode, isQuoteReferenceCode } from "@/lib/utils/reference-codes";

export type TimelineActivity = {
  id: string;
  type: string;
  created_at: string;
  by_user: { full_name: string | null } | null;
  payload: Record<string, unknown> | null;
};

export type LifecycleTimelineNode = {
  id: string;
  at: string;
  label: string;
  detail?: string;
  actor?: string;
  tone: "start" | "milestone" | "payment" | "end" | "overdue" | "completed" | "lead";
  dateOnly?: boolean;
};

const TIMELINE_TYPES = new Set([
  "order_ticket_created",
  "ticket_sent",
  "ticket_client_confirmed",
  "ticket_converted",
  "ticket_payment_evidence_submitted",
  "ticket_payment_recorded",
]);

const CUSTOMER_TYPES = new Set([
  "ticket_client_confirmed",
  "ticket_payment_evidence_submitted",
]);

function isEvidenceConfirmPayment(a: TimelineActivity): boolean {
  return (
    a.type === "ticket_payment_recorded" &&
    a.payload?.via === "accountant_evidence_confirm"
  );
}

/** Same timestamp — proof submitted before accountant approval. */
function timelineActivitySort(a: TimelineActivity, b: TimelineActivity): number {
  const diff = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
  if (diff !== 0) return diff;
  const rank = (x: TimelineActivity) => {
    if (x.type === "ticket_payment_recorded" && x.payload?.via !== "accountant_evidence_confirm") return 0;
    if (x.type === "ticket_payment_evidence_submitted") return 1;
    if (isEvidenceConfirmPayment(x)) return 2;
    return 0;
  };
  return rank(a) - rank(b);
}

const METHOD_LABELS: Record<string, string> = {
  wire: "Wire",
  ach: "ACH",
  zelle: "Zelle",
  check: "Check",
  card: "Card",
  cash: "Cash/Terminal",
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const REF_CODE_RE = /^(QUO|ORD)-\d{4}-\d+$/i;

const fmtMoney = formatCurrencyOrNull;

function amountsMatch(a: unknown, b: unknown): boolean {
  const x = Number(a);
  const y = Number(b);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
  return Math.abs(x - y) < 0.02;
}

const DEPOSIT_CONFIRMED_VIAS = new Set([
  "accountant_evidence_confirm",
  "staff_record",
  "staff_cash_auto",
  "staff_cash_auto_backfill",
  "public_payment",
]);

function findPaymentApprovalForEvidence(
  ev: TimelineActivity,
  recorded: TimelineActivity[],
): TimelineActivity | undefined {
  const evMs = atMs(ev.created_at);
  const evAmount = ev.payload?.amount;

  const explicit = recorded.find(
    (r) =>
      r.payload?.via === "accountant_evidence_confirm" &&
      atMs(r.created_at) >= evMs - 2000 &&
      amountsMatch(r.payload?.amount, evAmount),
  );
  if (explicit) return explicit;

  return recorded.find(
    (r) =>
      DEPOSIT_CONFIRMED_VIAS.has(String(r.payload?.via ?? "")) &&
      r.payload?.via !== "accountant_evidence_confirm" &&
      atMs(r.created_at) <= evMs + 2000 &&
      amountsMatch(r.payload?.amount, evAmount),
  );
}

function buildApprovalNode(
  ev: TimelineActivity,
  approval: TimelineActivity,
  createdByName?: string | null,
): LifecycleTimelineNode {
  const explicit = approval.payload?.via === "accountant_evidence_confirm";
  const approvalAt = explicit
    ? approval.created_at
    : new Date(Math.max(atMs(ev.created_at), atMs(approval.created_at) + 1)).toISOString();

  return {
    id: explicit ? approval.id : `${ev.id}-approved-by-${approval.id}`,
    at: approvalAt,
    label: "Payment proof approved",
    detail: timelineDetail(approval, undefined),
    actor: actorName(approval, createdByName),
    tone: "payment",
  };
}

/** Pair proof submitted with accountant confirm or an earlier deposit already recorded. */
function reconcilePaymentEvidenceTimeline(
  nodes: LifecycleTimelineNode[],
  activities: TimelineActivity[],
  createdByName?: string | null,
): LifecycleTimelineNode[] {
  const recorded = activities.filter((a) => a.type === "ticket_payment_recorded");
  const evidenceList = activities.filter((a) => a.type === "ticket_payment_evidence_submitted");
  if (evidenceList.length === 0) return nodes;

  const approvalNodeIds = new Set(
    nodes.filter((n) => n.label === "Payment proof approved").map((n) => n.id),
  );
  const extraNodes: LifecycleTimelineNode[] = [];
  const updatedNodes = nodes.map((node) => {
    const ev = evidenceList.find((e) => e.id === node.id);
    if (!ev) return node;

    const approval = findPaymentApprovalForEvidence(ev, recorded);
    if (!approval) return node;

    const explicit = approval.payload?.via === "accountant_evidence_confirm";
    if (explicit && approvalNodeIds.has(approval.id)) {
      return {
        ...node,
        detail: timelineDetail(ev, undefined)?.replace(" · Awaiting review", "") ?? node.detail,
      };
    }

    if (!explicit && !approvalNodeIds.has(`${ev.id}-approved-by-${approval.id}`)) {
      extraNodes.push(buildApprovalNode(ev, approval, createdByName));
      approvalNodeIds.add(`${ev.id}-approved-by-${approval.id}`);
    }

    return {
      ...node,
      detail:
        explicit
          ? node.detail
          : (timelineDetail(ev, undefined)?.replace(" · Awaiting review", "") ??
            node.detail),
    };
  });

  if (extraNodes.length === 0) return updatedNodes;

  return [...updatedNodes, ...extraNodes].sort((a, b) => {
    const diff = atMs(a.at) - atMs(b.at);
    if (diff !== 0) return diff;
    if (a.label === "Payment proof submitted" && b.label === "Payment proof approved") return -1;
    if (a.label === "Payment proof approved" && b.label === "Payment proof submitted") return 1;
    return 0;
  });
}

function sanitizeDetail(value: unknown): string | undefined {
  if (value == null) return undefined;
  const s = String(value).trim();
  if (!s || UUID_RE.test(s)) return undefined;
  return s;
}

function referenceDetail(payload?: Record<string, unknown> | null, fallback?: string | null): string | undefined {
  const fromPayload = sanitizeDetail(payload?.reference_code);
  if (fromPayload && REF_CODE_RE.test(fromPayload)) return fromPayload;
  const fb = sanitizeDetail(fallback);
  if (fb && REF_CODE_RE.test(fb)) return fb;
  return undefined;
}

function actorName(a: TimelineActivity, fallbackCreator?: string | null): string {
  if (a.by_user?.full_name) return a.by_user.full_name;
  if (a.type === "ticket_payment_recorded" && a.payload?.via === "public_payment") return "Customer";
  if (CUSTOMER_TYPES.has(a.type) && !a.by_user) return "Customer";
  if (fallbackCreator) return fallbackCreator;
  return "System";
}

function timelineLabelForActivity(a: TimelineActivity, isQuote?: boolean): string {
  if (a.type === "ticket_payment_recorded" && isEvidenceConfirmPayment(a)) {
    return "Payment proof approved";
  }
  return timelineLabel(a.type, a.payload, isQuote);
}

function timelineLabel(type: string, payload?: Record<string, unknown> | null, isQuote?: boolean): string {
  if (type === "order_ticket_created") return isQuote ? "Quote created" : "Order created";
  if (type === "ticket_sent") return payload?.resend ? "Quote resent" : "Quote sent";
  if (type === "ticket_client_confirmed") return "Customer confirmed";
  if (type === "ticket_converted") return "Converted to order";
  if (type === "ticket_payment_evidence_submitted") return "Payment proof submitted";
  if (type === "ticket_payment_recorded") return "Payment received";
  return type.replace(/_/g, " ");
}

function timelineDetail(a: TimelineActivity, referenceCode?: string | null): string | undefined {
  const p = a.payload;
  if (!p) return referenceDetail(null, referenceCode);

  if (a.type === "ticket_sent") {
    const channel = p.channel ? String(p.channel) : null;
    const dest = sanitizeDetail(p.recipient ?? p.destination);
    if (channel && dest) return `via ${channel} · ${dest}`;
    if (channel) return `via ${channel}`;
    return undefined;
  }

  if (a.type === "ticket_client_confirmed") {
    const via =
      p.via === "public_payment"
        ? "Via payment page"
        : p.via === "public_link"
          ? "Via quote link"
          : "Confirmed";
    const ref = referenceDetail(p, referenceCode);
    return ref ? `${via} · ${ref}` : via;
  }

  if (a.type === "ticket_converted") {
    return referenceDetail(p, referenceCode);
  }

  if (a.type === "ticket_payment_evidence_submitted") {
    const amount = fmtMoney(p.amount);
    const method = p.method ? (METHOD_LABELS[String(p.method)] ?? String(p.method)) : null;
    return [amount, method, "Awaiting review"].filter(Boolean).join(" · ");
  }

  if (a.type === "ticket_payment_recorded") {
    const amount = fmtMoney(p.amount);
    const method = p.method ? (METHOD_LABELS[String(p.method)] ?? String(p.method)) : null;
    const mode =
      p.mode === "deposit"
        ? "Deposit"
        : p.mode === "balance"
          ? "Balance"
          : p.mode === "full"
            ? "Full payment"
            : null;
    if (p.via === "accountant_evidence_confirm") {
      return [amount, method, mode].filter(Boolean).join(" · ");
    }
    const via =
      p.via === "public_payment"
        ? "Customer"
        : p.via === "staff_cash_auto" || p.via === "staff_cash_auto_backfill"
          ? "Cash / offline"
          : "Staff recorded";
    return [amount, method, mode, via].filter(Boolean).join(" · ");
  }

  if (a.type === "order_ticket_created") {
    return referenceDetail(p, referenceCode) ?? sanitizeDetail(p.title);
  }

  return undefined;
}

function nodeTone(
  type: string,
  opts?: { isEnd?: boolean; isOverdue?: boolean; isCompleted?: boolean; isLead?: boolean },
): LifecycleTimelineNode["tone"] {
  if (opts?.isCompleted) return "completed";
  if (opts?.isLead) return "lead";
  if (opts?.isEnd) return opts.isOverdue ? "overdue" : "end";
  if (type === "order_ticket_created") return "start";
  if (type === "ticket_payment_recorded" || type === "ticket_payment_evidence_submitted") return "payment";
  return "milestone";
}

/** First activity when ticket_status became completed (from activity log). */
export function findTicketCompletionActivity(
  activities: TimelineActivity[],
): TimelineActivity | undefined {
  return activities
    .filter((a) => a.type === "order_ticket_status_changed" && a.payload?.to === "completed")
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())[0];
}

/** Due date end passed before a given instant (e.g. order was completed late). */
export function isDueDateMissedBefore(instantIso: string, dueDate: string): boolean {
  return dueDateEndOfDayMs(dueDate) < new Date(instantIso).getTime();
}

function atMs(iso: string): number {
  return new Date(iso).getTime();
}
export function timelineSegmentFlex(prevAt: string, at: string): number {
  const ms = Math.max(0, new Date(at).getTime() - new Date(prevAt).getTime());
  const hours = ms / (3600 * 1000);
  if (hours < 1) return 1;
  if (hours < 24) return Math.max(1, Math.round(hours));
  return Math.max(2, Math.round(hours / 6));
}

/** Quote vs order — QUO-* / ORD-* reference is authoritative (ticket_kind can lag until convert). */
export function resolveTicketQuoteStage(input: {
  isQuote?: boolean;
  referenceCode?: string | null;
  ticketKind?: string | null;
}): boolean {
  const ref = input.referenceCode?.trim();
  if (ref) {
    if (isQuoteReferenceCode(ref)) return true;
    if (isOrderReferenceCode(ref)) return false;
  }
  if (input.ticketKind === "quote") return true;
  if (input.ticketKind === "order") return false;
  return input.isQuote ?? true;
}

export function buildTicketLifecycleTimeline(input: {
  activities: TimelineActivity[];
  createdAt: string;
  dueDate: string | null;
  createdByName?: string | null;
  isQuote?: boolean;
  referenceCode?: string | null;
  /** When "completed", append an Order completed node from activity log. */
  ticketStatus?: string | null;
  /** Fallback timestamp when no completion activity exists (e.g. legacy rows). */
  completedAtFallback?: string | null;
  /** Linked lead — show origin before quote/order creation. */
  leadCreatedAt?: string | null;
  leadSource?: string | null;
  /** CRM customer (no lead) — show when quote started from customer profile. */
  customerCreatedAt?: string | null;
  /** Ticket quote_source (CRM Add Quote) for creation detail. */
  quoteSource?: string | null;
  ticketKind?: string | null;
  now?: number;
}): LifecycleTimelineNode[] {
  const relevant = input.activities
    .filter((a) => TIMELINE_TYPES.has(a.type))
    .sort(timelineActivitySort);

  const createdActivity = relevant.find((a) => a.type === "order_ticket_created");
  const createdPayload = createdActivity?.payload;
  const payloadRef =
    createdPayload?.reference_code != null ? String(createdPayload.reference_code).trim() : "";
  const payloadKind =
    createdPayload?.ticket_kind != null ? String(createdPayload.ticket_kind) : undefined;

  // Creation moment: use activity payload only (current ORD-* must not relabel a QUO-* create).
  const creationQuoteStage = createdActivity
    ? resolveTicketQuoteStage({
        referenceCode: payloadRef || undefined,
        ticketKind: payloadKind,
        isQuote: true,
      })
    : resolveTicketQuoteStage({
        isQuote: input.isQuote,
        referenceCode: input.referenceCode,
        ticketKind: input.ticketKind,
      });

  const quoteStage = resolveTicketQuoteStage({
    isQuote: input.isQuote,
    referenceCode: input.referenceCode,
    ticketKind: input.ticketKind,
  });

  const startAt = createdActivity?.created_at ?? input.createdAt;
  const creationLabel = creationQuoteStage ? "Quote created" : "Order created";

  const creationDetail =
    (createdActivity
      ? timelineDetail(createdActivity, payloadRef || input.referenceCode)
      : null) ??
    referenceDetail(createdPayload, payloadRef || input.referenceCode) ??
    (input.quoteSource?.trim() ? `Source · ${input.quoteSource.trim()}` : undefined);

  const startNode: LifecycleTimelineNode = createdActivity
    ? {
        id: createdActivity.id,
        at: createdActivity.created_at,
        label: creationLabel,
        detail: creationDetail,
        actor: actorName(createdActivity, input.createdByName),
        tone: "start",
      }
    : {
        id: "start",
        at: startAt,
        label: creationLabel,
        detail: creationDetail,
        actor: input.createdByName ?? "Staff",
        tone: "start",
      };

  const seen = new Set<string>([startNode.id]);
  const middleNodes: LifecycleTimelineNode[] = [];

  for (const a of relevant) {
    if (a.type === "order_ticket_created") continue;
    if (seen.has(a.id)) continue;
    seen.add(a.id);
    middleNodes.push({
      id: a.id,
      at: a.created_at,
      label: timelineLabelForActivity(a, quoteStage),
      detail: timelineDetail(a, input.referenceCode),
      actor: actorName(a, input.createdByName),
      tone: nodeTone(a.type),
    });
  }

  middleNodes.sort((a, b) => atMs(a.at) - atMs(b.at));

  const reconciledMiddle = reconcilePaymentEvidenceTimeline(
    middleNodes,
    input.activities,
    input.createdByName,
  );

  const completion =
    input.ticketStatus === "completed"
      ? findTicketCompletionActivity(input.activities)
      : undefined;
  const completedAt =
    completion?.created_at ??
    (input.ticketStatus === "completed" ? input.completedAtFallback : undefined);

  const chronological: LifecycleTimelineNode[] = [...reconciledMiddle];

  if (input.dueDate) {
    const missedBeforeCompletion =
      completedAt != null && isDueDateMissedBefore(completedAt, input.dueDate);
    const overdueOpen = !completedAt && isDueDateOverdue(input.dueDate);
    const overdue = missedBeforeCompletion || overdueOpen;

    chronological.push({
      id: "due-date",
      at: `${input.dueDate}T23:59:59`,
      label: overdue
        ? missedBeforeCompletion
          ? "Due date · Completed late"
          : "Due date · Overdue"
        : "Due date",
      detail: missedBeforeCompletion ? "Completed after due date" : "End of day",
      dateOnly: true,
      tone: nodeTone("", { isEnd: true, isOverdue: overdue }),
    });
  }

  if (completedAt) {
    chronological.push({
      id: completion?.id ?? "order-completed",
      at: completedAt,
      label: "Order completed",
      detail: "Ready for pickup",
      actor: completion ? actorName(completion, input.createdByName) : undefined,
      tone: nodeTone("", { isCompleted: true }),
    });
  }

  chronological.sort((a, b) => atMs(a.at) - atMs(b.at));

  const ordered: LifecycleTimelineNode[] = [];

  if (input.leadCreatedAt && atMs(input.leadCreatedAt) <= atMs(startAt)) {
    ordered.push({
      id: "lead-created",
      at: input.leadCreatedAt,
      label: "Lead created",
      detail: input.leadSource?.trim() ? `Source · ${input.leadSource.trim()}` : undefined,
      tone: nodeTone("", { isLead: true }),
    });
  } else if (
    input.customerCreatedAt &&
    atMs(input.customerCreatedAt) <= atMs(startAt)
  ) {
    ordered.push({
      id: "customer-in-crm",
      at: input.customerCreatedAt,
      label: "Customer in CRM",
      tone: nodeTone("", { isLead: true }),
    });
  }

  ordered.push(startNode, ...chronological);

  return ordered;
}

export function formatTimelineStamp(iso: string, dateOnly?: boolean): string {
  return dateOnly ? formatDate(iso) : formatDateTime(iso);
}
