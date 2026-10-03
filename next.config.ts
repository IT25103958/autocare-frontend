import type { NextConfig } from "next";

// Where the Spring Boot backend runs, as seen from this Next server.
const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:8080";

const nextConfig: NextConfig = {
  // Lets the dev server be opened through a temporary Cloudflare tunnel link.
  allowedDevOrigins: ["*.trycloudflare.com"],
  // The browser only ever talks to this site; /api is forwarded to the backend.
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${BACKEND_URL}/api/:path*` }];
  },
};

export default nextConfig;
