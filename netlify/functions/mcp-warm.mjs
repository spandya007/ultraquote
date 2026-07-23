// Netlify Scheduled Function — keeps the /api/mcp function warm so remote MCP
// clients (Claude Desktop, etc.) don't hit a cold start (~5s) on the first tool
// call after idle. A cold start exceeds the client's request timeout → the client
// closes the connection (Netlify logs a 499) and the tool call fails.
//
// A GET to /api/mcp loads the Next server function (the whole app shares one
// serverless function on Netlify; the MCP SDK import is the bulk of the cold
// start) and returns 401 quickly. Runs every MINUTE — the function was observed
// cooling in ~2 min, so a slower cadence leaves cold gaps. Prod only (scheduled
// functions don't run on deploy previews).
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

export const config = { schedule: "* * * * *" };
