"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  ALLOWED_LIST_PAGE_SIZES,
  formatPaginationRange,
  type ListPageSize,
} from "@/lib/utils/pagination";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface ListPaginationProps {
  total: number;
  offset: number;
  pageSize: ListPageSize;
  onOffsetChange: (offset: number) => void;
  onPageSizeChange: (size: ListPageSize) => void;
  loading?: boolean;
}

export function ListPagination({
  total,
  offset,
  pageSize,
  onOffsetChange,
  onPageSizeChange,
  loading = false,
}: ListPaginationProps) {
  const rangeLabel = formatPaginationRange(offset, pageSize, total);
  const atStart = offset <= 0;
  const atEnd = offset + pageSize >= total;

  if (total <= 0 && !loading) return null;

  return (
    <div
      className="flex flex-wrap items-center justify-between gap-3 pt-3"
      style={{ color: "var(--color-text-muted)" }}
    >
      <p className="text-xs">
        {rangeLabel ? (
          <>
            Showing <span style={{ color: "var(--color-text-primary)" }}>{rangeLabel}</span>
          </>
        ) : (
          "No results"
        )}
      </p>

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <span className="text-xs whitespace-nowrap">Rows per page</span>
          <Select
            value={String(pageSize)}
            onValueChange={(value) => onPageSizeChange(Number(value) as ListPageSize)}
            disabled={loading}
          >
            <SelectTrigger
              size="sm"
              className="h-8 min-w-[72px] text-xs"
              style={{
                borderColor: "var(--color-border)",
                background: "var(--color-surface)",
                color: "var(--color-text-primary)",
              }}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ALLOWED_LIST_PAGE_SIZES.map((size) => (
                <SelectItem key={size} value={String(size)}>
                  {size}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            disabled={loading || atStart || total === 0}
            onClick={() => onOffsetChange(Math.max(0, offset - pageSize))}
            className="inline-flex items-center gap-1 rounded-[6px] border px-2.5 py-1.5 text-xs font-medium transition-opacity disabled:cursor-not-allowed disabled:opacity-40 hover:opacity-80"
            style={{
              borderColor: "var(--color-border)",
              background: "var(--color-surface)",
              color: "var(--color-text-primary)",
            }}
          >
            <ChevronLeft size={14} />
            Previous
          </button>
          <button
            type="button"
            disabled={loading || atEnd || total === 0}
            onClick={() => onOffsetChange(offset + pageSize)}
            className="inline-flex items-center gap-1 rounded-[6px] border px-2.5 py-1.5 text-xs font-medium transition-opacity disabled:cursor-not-allowed disabled:opacity-40 hover:opacity-80"
            style={{
              borderColor: "var(--color-border)",
              background: "var(--color-surface)",
              color: "var(--color-text-primary)",
            }}
          >
            Next
            <ChevronRight size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}
