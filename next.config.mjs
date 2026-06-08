/** @type {import('next').NextConfig} */
const nextConfig = {
  // BlockNote 0.14 is not StrictMode-safe: the double-invoked mount can
  // re-create the editor and re-run content loading, causing node-view churn.
  // The actual "Position undefined out of range" crash is fixed by loading
  // saved content via editor.replaceBlocks() after mount (see proposal-editor.tsx),
  // but we keep StrictMode off as a safeguard against editor double-mount.
  reactStrictMode: false,
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
