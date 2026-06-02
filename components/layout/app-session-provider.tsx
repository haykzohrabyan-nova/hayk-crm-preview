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
