import * as Sentry from "@sentry/nextjs";

/**
 * Reports an unexpected API error to Sentry.
 *
 * Call this whenever !res.ok and you are showing an error message to the user.
 * Keeps Sentry informed about every 4xx/5xx the frontend encounters so silent
 * auth failures, permission problems, and server errors are all visible in the
 * Sentry dashboard alongside the user identity and session replay.
 *
 * Usage:
 *   if (!res.ok) {
 *     const msg = json.error ?? "Failed to save.";
 *     setError(msg);
 *     reportApiError(msg, res, "NewQuoteForm");
 *     return;
 *   }
 */
export function reportApiError(
  message: string,
  res: Pick<Response, "status" | "url">,
  component: string,
  extra?: Record<string, unknown>,
): void {
  Sentry.captureMessage(`[${component}] HTTP ${res.status}: ${message}`, {
    level: res.status >= 500 ? "error" : "warning",
    tags: {
      component,
      http_status: String(res.status),
    },
    extra: {
      api_url: res.url,
      ...extra,
    },
  });
}
