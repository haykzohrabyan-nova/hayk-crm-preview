import { invalidateListPageCache } from "@/lib/client/list-page-cache";

/** After a successful ticket mutation: realtime refetch on open lists + optional cache prefix clear. */
export function notifyListDataChanged(options?: { cachePrefix?: string }) {
  if (options?.cachePrefix) invalidateListPageCache(options.cachePrefix);
  window.dispatchEvent(new Event("bazaar:refresh-counts"));
  window.dispatchEvent(new Event("bazaar:tickets-changed"));
}
