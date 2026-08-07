import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";
import {
  buildContentSecurityPolicy,
  buildPublicQuoteFileContentSecurityPolicy,
  buildPublicQuotePageContentSecurityPolicy,
} from "./lib/security/content-security-policy";

const nextConfig: NextConfig = {
  // Pin the project root so Turbopack resolves deps (tailwind, etc.) from this
  // folder — a stray lockfile in the parent workspace was misdetecting the root.
  turbopack: { root: import.meta.dirname },
  // Using proxy.ts for session gating — do NOT add middleware.ts with auth logic.
  compress: true,
  images: {
    formats: ["image/avif", "image/webp"],
  },
  async headers() {
    return [
      {
        source: "/((?!api/public/quotes/).*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-XSS-Protection", value: "1; mode=block" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          {
            key: "Content-Security-Policy",
            value: buildContentSecurityPolicy(),
          },
        ],
      },
      // Listed last so these override the catch-all when both match (Next uses last value).
      {
        source: "/api/public/quotes/:token/files/:fileId",
        headers: [
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          {
            key: "Content-Security-Policy",
            value: buildPublicQuoteFileContentSecurityPolicy(),
          },
        ],
      },
      {
        source: "/q/:path*",
        headers: [
          {
            key: "Content-Security-Policy",
            value: buildPublicQuotePageContentSecurityPolicy(),
          },
        ],
      },
    ];
  },
};

export default withSentryConfig(nextConfig, {
  org: "ai-automation-la-llc",
  project: "bazarcrm",

  // Auth token for source map upload (set in .env.sentry-build-plugin or Vercel env vars)
  authToken: process.env.SENTRY_AUTH_TOKEN,

  // Upload wider set of client source files for better stack trace resolution
  widenClientFileUpload: true,

  // Proxy Sentry requests through /monitoring to bypass ad-blockers and CSP
  tunnelRoute: "/monitoring",

  // Suppress non-CI build output
  silent: !process.env.CI,
});
