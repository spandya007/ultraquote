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
  },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "*.supabase.co" },
    ],
  },
};

export default nextConfig;
