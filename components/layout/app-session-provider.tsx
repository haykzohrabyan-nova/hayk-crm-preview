"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { buildNavSections, type NavSection } from "@/lib/auth/nav-sections";
import { createClient } from "@/lib/supabase/client";
import type { Page } from "@/lib/types";

export type AppMePayload = {
  userId: string;
  roleName: string;
  fullName: string | null;
  allowedRoutes: string[];
  pages: Page[];
};

type AppSessionContextValue = {
  me: AppMePayload | null;
  loading: boolean;
  sections: NavSection[];
  refresh: () => Promise<void>;
};

const AppSessionContext = createContext<AppSessionContextValue | null>(null);

export function AppSessionProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<AppMePayload | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/me", { credentials: "include" });
      if (!res.ok) {
        setMe(null);
        return;
      }
      const data = (await res.json()) as AppMePayload;
      setMe(data);
    } catch {
      setMe(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Keep the Supabase browser client alive so its built-in auto-refresh timer
  // fires ~60 s before the access token expires. Without this, the client is
  // never instantiated in the browser and tokens go stale after 1 hour.
  // SIGNED_OUT (refresh token expired) sends the user to login immediately.
  useEffect(() => {
    const supabase = createClient();
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") {
        window.location.assign("/login");
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  const sections = useMemo(
    () => (me?.pages ? buildNavSections(me.pages) : []),
    [me?.pages],
  );

  const value = useMemo(
    () => ({
      me,
      loading,
      sections,
      refresh: load,
    }),
    [me, loading, sections, load],
  );

  return (
    <AppSessionContext.Provider value={value}>{children}</AppSessionContext.Provider>
  );
}

export function useAppSession(): AppSessionContextValue {
  const ctx = useContext(AppSessionContext);
  if (!ctx) {
    throw new Error("useAppSession must be used within AppSessionProvider");
  }
  return ctx;
}

/** Safe outside provider (returns null). */
export function useAppSessionOptional(): AppSessionContextValue | null {
  return useContext(AppSessionContext);
}
