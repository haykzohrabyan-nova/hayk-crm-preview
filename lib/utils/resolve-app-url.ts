function normalizeOrigin(url: string): string {
  return url.trim().replace(/\/$/, "");
}

function isLocalhostOrigin(url: string): boolean {
  try {
    const hostname = new URL(url).hostname;
    return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";
  } catch {
    return false;
  }
}

/**
 * Canonical app origin for links in emails and copy-to-clipboard.
 * Prefers NEXT_PUBLIC_APP_URL when it is a non-localhost URL; otherwise uses
 * the incoming request origin (admin's current site) so production emails do
 * not link to localhost when env is misconfigured.
 */
export function resolveAppUrl(requestOrigin?: string | null): string {
  const envUrl = process.env.NEXT_PUBLIC_APP_URL
    ? normalizeOrigin(process.env.NEXT_PUBLIC_APP_URL)
    : null;
  const reqUrl = requestOrigin ? normalizeOrigin(requestOrigin) : null;

  if (envUrl && !isLocalhostOrigin(envUrl)) return envUrl;
  if (reqUrl && !isLocalhostOrigin(reqUrl)) return reqUrl;
  if (envUrl) return envUrl;
  if (reqUrl) return reqUrl;

  const vercelHost = process.env.VERCEL_URL?.trim();
  if (vercelHost) return `https://${vercelHost.replace(/\/$/, "")}`;

  return "http://localhost:3000";
}

export function resolveLoginUrl(requestOrigin?: string | null): string {
  return `${resolveAppUrl(requestOrigin)}/login`;
}
