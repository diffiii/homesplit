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
