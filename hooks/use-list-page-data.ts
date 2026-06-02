"use client";

import { useStaleWhileRevalidate } from "@/hooks/use-stale-while-revalidate";

type UseListPageDataOptions = {
  /** Cache namespace, e.g. `orders`, `payments`. */
  prefix: string;
  /** Full path including query string, e.g. `/api/orders/page-data?tab=all`. */
  url: string;
  events?: string[];
  enabled?: boolean;
};

/** Stale-while-revalidate fetch for `GET …/page-data` list endpoints. */
export function useListPageData<T = Record<string, unknown>>({
  prefix,
  url,
  events = ["bazaar:refresh-counts"],
  enabled = true,
}: UseListPageDataOptions) {
  const cacheKey = `${prefix}:${url}`;
  return useStaleWhileRevalidate<T>(
    cacheKey,
    async () => {
      const res = await fetch(url);
      const data = (await res.json()) as T & { error?: string };
      if (!res.ok) {
        throw new Error(
          typeof data === "object" && data && "error" in data && data.error
            ? String(data.error)
            : "Request failed",
        );
      }
      return data as T;
    },
    [url],
    { events, enabled },
  );
}
