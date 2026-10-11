import type { NextConfig } from "next";

export default function config(): NextConfig {
  return {
    poweredByHeader: false,
    agentRules: false,
    transpilePackages: ["@linkhub/types", "@linkhub/config"],
    webpack(config) {
      config.resolve.extensionAlias = {
        ...config.resolve.extensionAlias,
        ".js": [".ts", ".tsx", ".js"],
      };
      return config;
    },
    logging: { incomingRequests: false },
    experimental: { serverComponentsHmrCache: false },
    async headers() {
      return [
        {
          source: "/:path*",
          headers: [
            // Native POST needs a non-null Origin; disclose only the origin, never token-bearing paths.
            { key: "Referrer-Policy", value: "strict-origin" },
            { key: "X-Content-Type-Options", value: "nosniff" },
            { key: "X-Frame-Options", value: "DENY" },
          ],
        },
        {
          // Hashed build assets contain no user data. Let Next serve them with
          // immutable caching; documents, forms and other paths stay private.
          source: "/:path((?!_next/static/).*)",
          headers: [{ key: "Cache-Control", value: "private, no-store, max-age=0" }],
        },
      ];
    },
  };
}
