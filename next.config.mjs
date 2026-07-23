/** @type {import('next').NextConfig} */
const nextConfig = {
  // Re-enabled with the BlockNote 0.51 upgrade — the 0.14 "Position undefined
  // out of range" getPos crash on StrictMode double-mount no longer applies. The
  // post-mount replaceBlocks load (proposal-editor.tsx) is kept (guarded by a
  // contentLoaded ref, so the double-invoked effect won't double-load).
  reactStrictMode: true,
  // Don't serve stale dynamic routes from the client Router Cache on
  // back/forward navigation — always refetch (fixes e.g. /quotes not showing a
  // newly added quote when navigating back to it).
  experimental: {
    staleTimes: { dynamic: 0 },
    // The MCP SDK is ESM/Node-only; keep it external so it's required at runtime
    // (in the /api/mcp nodejs route) rather than bundled. See lib/mcp/server.ts.
    serverComponentsExternalPackages: ["@modelcontextprotocol/sdk"],
  },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "*.supabase.co" },
    ],
  },
  // The Quotes → Proposals rename moved the page route /quotes → /proposals.
  // Redirect old links (bookmarks, past emails) to the new path. The /api/quotes
  // API path is unchanged (internal, not user-facing).
  async redirects() {
    return [
      { source: "/quotes", destination: "/proposals", permanent: true },
      { source: "/quotes/:id", destination: "/proposals/:id", permanent: true },
    ];
  },
};

export default nextConfig;
