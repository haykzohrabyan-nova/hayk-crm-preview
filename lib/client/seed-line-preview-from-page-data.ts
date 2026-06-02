import {
  seedTicketLinePreviewCache,
  clearTicketLinePreviewCache,
} from "@/components/quotes/ticket-line-items-quick-preview";
import type { TicketLinePreviewPayload } from "@/lib/utils/fetch-ticket-line-preview";

type RowWithPreview = {
  id: string;
  line_preview?: TicketLinePreviewPayload;
};

/** After page-data loads, hydrate expand preview cache (no extra line-preview fetch). */
export function seedLinePreviewFromListRows(rows: RowWithPreview[] | undefined) {
  if (!rows?.length) return;
  const map: Record<string, TicketLinePreviewPayload> = {};
  for (const row of rows) {
    if (row.line_preview) map[row.id] = row.line_preview;
  }
  if (Object.keys(map).length > 0) {
    seedTicketLinePreviewCache(map);
  }
}

export function clearLinePreviewListCache() {
  clearTicketLinePreviewCache();
}
