import type { NextConfig } from "next";
import {
  buildContentSecurityPolicy,
  buildPublicQuoteFileContentSecurityPolicy,
  buildPublicQuotePageContentSecurityPolicy,
} from "./lib/security/content-security-policy";

const nextConfig: NextConfig = {
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

export default nextConfig;
