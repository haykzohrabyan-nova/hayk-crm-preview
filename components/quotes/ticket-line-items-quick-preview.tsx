"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertCircle, RefreshCw } from "lucide-react";
import { LineItemsForm } from "@/components/quotes/shared/line-items-form";
import type { SkuLookups } from "@/components/quotes/shared/types";
import type { TicketLinePreviewPayload } from "@/lib/utils/fetch-ticket-line-preview";

const previewCache = new Map<string, TicketLinePreviewPayload>();
/** One shared fetch per ticket while multiple preview instances mount (desktop row + mobile card, Strict Mode). */
const inflightPreviews = new Map<string, Promise<TicketLinePreviewPayload>>();

async function fetchLinePreview(ticketId: string): Promise<TicketLinePreviewPayload> {
  const cached = previewCache.get(ticketId);
  if (cached) return cached;

  const existing = inflightPreviews.get(ticketId);
  if (existing) return existing;

  const promise = fetch(`/api/tickets/${ticketId}/line-preview`).then(async (res) => {
    if (!res.ok) throw new Error("line-preview failed");
    const json = (await res.json()) as TicketLinePreviewPayload;
    previewCache.set(ticketId, json);
    return json;
  });

  inflightPreviews.set(ticketId, promise);
  void promise.finally(() => {
    if (inflightPreviews.get(ticketId) === promise) {
      inflightPreviews.delete(ticketId);
    }
  });

  return promise;
}

/** Unused in read-only mode — satisfies LineItemsForm props. */
const READ_ONLY_SKU_LOOKUPS: SkuLookups = {
  lamination: [],
  color_mode: [],
  sides: [],
  roll_direction: [],
  finishing: [],
};

const noop = () => {};

type LoadState = "idle" | "loading" | "loaded" | "error";

function PreviewSkeleton() {
  return (
    <div className="space-y-3 animate-pulse">
      <div className="h-20 rounded-lg" style={{ background: "var(--color-border)" }} />
      <div className="h-20 rounded-lg" style={{ background: "var(--color-border)" }} />
      <div className="h-24 rounded-lg" style={{ background: "var(--color-border)" }} />
    </div>
  );
}

export function TicketLineItemsQuickPreview({
  ticketId,
  ticketRef: ticketRefProp,
  expanded,
  previewId,
}: {
  ticketId: string;
  /** QUO-/ORD- ref or UUID — enables file thumbnails (falls back to API `ticket_ref`). */
  ticketRef?: string | null;
  expanded: boolean;
  /** For aria-controls from parent row */
  previewId?: string;
}) {
  const [state, setState] = useState<LoadState>(() =>
    previewCache.has(ticketId) ? "loaded" : "idle",
  );
  const [data, setData] = useState<TicketLinePreviewPayload | null>(
    () => previewCache.get(ticketId) ?? null,
  );

  const load = useCallback(async () => {
    const cached = previewCache.get(ticketId);
    if (cached) {
      setData(cached);
      setState("loaded");
      return;
    }

    setState("loading");
    try {
      const json = await fetchLinePreview(ticketId);
      setData(json);
      setState("loaded");
    } catch {
      setState("error");
      setData(null);
    }
  }, [ticketId]);

  useEffect(() => {
    if (!expanded) return;

    const cached = previewCache.get(ticketId);
    if (cached) {
      setData(cached);
      setState("loaded");
      return;
    }

    let ignore = false;
    setState("loading");

    void fetchLinePreview(ticketId).then(
      (json) => {
        if (ignore) return;
        setData(json);
        setState("loaded");
      },
      () => {
        if (ignore) return;
        setState("error");
        setData(null);
      },
    );

    return () => {
      ignore = true;
    };
  }, [expanded, ticketId]);

  if (!expanded) return null;

  return (
    <div id={previewId} className="py-4 px-4 md:px-5" role="region" aria-label="Line items preview">
      {state === "loading" && <PreviewSkeleton />}

      {state === "error" && (
        <div
          className="flex flex-wrap items-center gap-3 rounded-lg px-4 py-3 text-sm"
          style={{
            background: "var(--color-danger-bg)",
            color: "var(--color-danger)",
            border: "1px solid var(--color-danger-border)",
          }}
        >
          <AlertCircle size={16} className="shrink-0" />
          <span>Could not load line items.</span>
          <button
            type="button"
            onClick={() => void load()}
            className="inline-flex items-center gap-1 text-xs font-medium underline"
          >
            <RefreshCw size={12} />
            Retry
          </button>
        </div>
      )}

      {state === "loaded" && data && (
        <LineItemsForm
          editing={false}
          skus={[]}
          products={[]}
          skuLookups={READ_ONLY_SKU_LOOKUPS}
          onUpdate={noop}
          onRemove={noop}
          onAdd={noop}
          ticketRef={data.ticket_ref ?? ticketRefProp ?? ticketId}
          displayLines={data.line_items}
        />
      )}
    </div>
  );
}

/** Seed from list page-data so expand does not call line-preview API. */
export function seedTicketLinePreviewCache(
  previews: Record<string, TicketLinePreviewPayload>,
) {
  for (const [ticketId, payload] of Object.entries(previews)) {
    previewCache.set(ticketId, payload);
  }
}

/** Clear cache when list data may be stale (optional export for parent). */
export function clearTicketLinePreviewCache(ticketId?: string) {
  if (ticketId) previewCache.delete(ticketId);
  else previewCache.clear();
}
