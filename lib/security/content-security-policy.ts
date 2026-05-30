/**
 * Central Content-Security-Policy builder for next.config.ts headers().
 *
 * Notes:
 * - @vercel/speed-insights loads first-party scripts in production (`/_vercel/...`).
 * - In development it loads from va.vercel-scripts.com — allowed only when NODE_ENV=development.
 * - Supabase auth, REST, Realtime, and storage use *.supabase.co / wss://*.supabase.co.
 */
export function buildContentSecurityPolicy(): string {
  const isDev = process.env.NODE_ENV === "development";

  const scriptSrc = [
    "'self'",
    "'unsafe-inline'",
    "'unsafe-eval'", // Next.js dev + some runtime chunks
    "https://vercel.live",
    ...(isDev ? ["https://va.vercel-scripts.com"] : []),
  ];

  const connectSrc = [
    "'self'",
    "https://*.supabase.co",
    "wss://*.supabase.co",
    "https://vercel.live",
    "wss://vercel.live",
    ...(isDev
      ? [
          "https://vitals.vercel-insights.com",
          "https://va.vercel-scripts.com",
          "http://localhost:*",
          "https://localhost:*",
          "ws://localhost:*",
          "wss://localhost:*",
        ]
      : []),
  ];

  const styleSrc = ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"];

  return [
    "default-src 'self'",
    `script-src ${scriptSrc.join(" ")}`,
    `style-src ${styleSrc.join(" ")}`,
    `style-src-elem ${styleSrc.join(" ")}`,
    "font-src 'self' https://fonts.gstatic.com data:",
    "img-src 'self' data: blob: https:",
    "media-src 'self' blob:",
    `connect-src ${connectSrc.join(" ")}`,
    "worker-src 'self' blob:",
    "frame-src 'self' blob: https://vercel.live",
    "object-src 'self' blob:", // public quote PDF previews (blob URLs after fetch)
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; ");
}

/** CSP for streamed quote attachments — may be embedded on /q/[token] (same origin). */
export function buildPublicQuoteFileContentSecurityPolicy(): string {
  return "default-src 'none'; frame-ancestors 'self'";
}

/** Public customer quote page — same as app CSP but guaranteed blob: for PDF previews. */
export function buildPublicQuotePageContentSecurityPolicy(): string {
  return buildContentSecurityPolicy();
}
