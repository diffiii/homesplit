import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  // Proxy the API through the web origin, so the browser sends Better Auth cookies as first-party.
  async rewrites() {
    // The mock service worker answers `/api/*` in the browser, so nothing reaches a backend.
    if (
      process.env.NODE_ENV === "development" &&
      process.env.NEXT_PUBLIC_API_MOCKS === "true"
    ) {
      return [];
    }
    const apiUrl = process.env.API_URL;
    if (!apiUrl) {
      throw new Error("API_URL is not set. Copy .env.example to .env.");
    }
    return [
      {
        source: "/api/:path*",
        destination: `${new URL(apiUrl).origin}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
