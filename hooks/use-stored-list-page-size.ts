"use client";

import { useEffect, useState } from "react";
import {
  DEFAULT_LIST_PAGE_SIZE,
  type ListPageSize,
  readStoredListPageSize,
  writeStoredListPageSize,
} from "@/lib/utils/pagination";

/**
 * Hydration-safe page-size state backed by localStorage.
 *
 * Always initialises to DEFAULT_LIST_PAGE_SIZE so the server-rendered HTML
 * matches the client's first paint, then syncs the stored value after mount.
 * This avoids the React hydration mismatch caused by reading localStorage
 * inside a useState lazy initialiser.
 */
export function useStoredListPageSize(): [ListPageSize, (size: ListPageSize) => void] {
  const [pageSize, setPageSize] = useState<ListPageSize>(DEFAULT_LIST_PAGE_SIZE);

  useEffect(() => {
    setPageSize(readStoredListPageSize());
  }, []);

  function handleChange(size: ListPageSize) {
    writeStoredListPageSize(size);
    setPageSize(size);
  }

  return [pageSize, handleChange];
}
