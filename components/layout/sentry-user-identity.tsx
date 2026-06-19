"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";
import { useAppSessionOptional } from "@/components/layout/app-session-provider";

/**
 * Sets the Sentry user context once the session is loaded.
 * Rendered inside AppSessionProvider so every error is tagged with
 * userId, role, and display name — making issues searchable by user.
 */
export function SentryUserIdentity() {
  const session = useAppSessionOptional();
  const me = session?.me ?? null;

  useEffect(() => {
    if (me) {
      Sentry.setUser({
        id: me.userId,
        username: me.fullName ?? undefined,
        data: { role: me.roleName },
      });
    } else {
      Sentry.setUser(null);
    }
  }, [me]);

  return null;
}
