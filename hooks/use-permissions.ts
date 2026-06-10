"use client";

import { useEffect, useState } from "react";

/**
 * Returns the current user's action grants array and convenience helpers.
 *
 * Reads from /api/me (the same call the sidebar layout already makes).
 * After the first mount the result is cached in module state so subsequent
 * renders don't issue extra requests within the same page session.
 *
 * Usage:
 *   const { can } = usePermissions();
 *   if (can("leads.claim")) { ... }
 */

type PermissionsState = {
  grants: string[];
  loaded: boolean;
};

// Module-level cache — shared across all component instances in the same page.
let moduleCache: PermissionsState | null = null;
let pendingPromise: Promise<string[]> | null = null;

async function fetchGrants(): Promise<string[]> {
  if (pendingPromise) return pendingPromise;
  pendingPromise = fetch("/api/me")
    .then((r) => (r.ok ? r.json() : Promise.reject(r)))
    .then((d: { actionGrants?: string[] }) => d.actionGrants ?? [])
    .catch(() => [])
    .finally(() => { pendingPromise = null; });
  return pendingPromise;
}

export function usePermissions() {
  const [state, setState] = useState<PermissionsState>(
    moduleCache ?? { grants: [], loaded: false },
  );

  useEffect(() => {
    if (moduleCache?.loaded) return;
    fetchGrants().then((grants) => {
      moduleCache = { grants, loaded: true };
      setState({ grants, loaded: true });
    });
  }, []);

  return {
    grants: state.grants,
    loaded: state.loaded,

    /** Returns true if the current user has this action permission key. */
    can(key: string): boolean {
      return state.grants.includes(key);
    },

    /** Returns true if the current user has ALL of the given keys. */
    canAll(keys: string[]): boolean {
      return keys.every((k) => state.grants.includes(k));
    },

    /** Returns true if the current user has ANY of the given keys. */
    canAny(keys: string[]): boolean {
      return keys.some((k) => state.grants.includes(k));
    },
  };
}

/** Invalidates the module-level cache (call after login/role changes). */
export function invalidatePermissionsCache() {
  moduleCache = null;
}
