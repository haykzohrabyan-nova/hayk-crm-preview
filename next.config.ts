import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Using proxy.ts for session gating — do NOT add middleware.ts with auth logic.
};

export default nextConfig;
