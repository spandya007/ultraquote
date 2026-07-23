// Netlify Scheduled Function — keeps the /api/mcp function warm so remote MCP
// clients (Claude Desktop, etc.) don't hit a cold start (~5s) on the first tool
// call after idle. A cold start exceeds the client's request timeout → the client
// closes the connection (Netlify logs a 499) and the tool call fails.
//
// A GET to /api/mcp loads the route module (incl. the MCP SDK — the bulk of the
// cold-start cost) and returns 401 quickly. Runs every 2 minutes, comfortably
// inside the serverless warm-instance window. Prod only (scheduled functions
// don't run on deploy previews).
export default async () => {
  const base = process.env.URL || "https://app.smartprops.io";
  try {
    const res = await fetch(`${base}/api/mcp`, { method: "GET" });
    console.log(`[mcp-warm] pinged ${base}/api/mcp → ${res.status}`);
  } catch (e) {
    console.error("[mcp-warm] ping failed:", e);
  }
  return new Response("ok");
};

export const config = { schedule: "*/2 * * * *" };
