import type { NextConfig } from "next";

// Every admin page shows live data for the signed-in admin, so nothing is prerendered or cached.
const nextConfig: NextConfig = {
  poweredByHeader: false,
};

export default nextConfig;
