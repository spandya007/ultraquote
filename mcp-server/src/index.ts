#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { api, ApiError, API_BASE, HAS_KEY } from "./client.js";

// SmartProps MCP server (local / stdio). Exposes the SmartProps proposal
// workspace as typed tools an AI chat client can call, wrapping the public
// /api/v1 REST API (auth via SMARTPROPS_API_KEY). v1 = read tools + create_client.
// docs/integrations-phase-c-api-webhooks-zapier.md Appendix A.
//
// stdio note: stdout is the MCP protocol channel — ALL logging must go to stderr.

const server = new McpServer({ name: "smartprops", version: "0.1.0" });

type ToolResult = { content: { type: "text"; text: string }[]; isError?: boolean };

function ok(data: unknown): ToolResult {
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
}
function fail(e: unknown): ToolResult {
  const text =
    e instanceof ApiError
      ? e.status
        ? `SmartProps API error ${e.status} (${e.code}): ${e.message}`
        : `${e.code}: ${e.message}`
      : `Error: ${(e as Error).message}`;
  return { content: [{ type: "text", text }], isError: true };
}

const pagination = {
  limit: z.number().int().min(1).max(100).optional().describe("Page size, 1–100"),
  offset: z.number().int().min(0).optional().describe("Rows to skip (pagination)"),
};

// ── Read tools ────────────────────────────────────────────────────────────────
server.registerTool(
  "list_proposals",
  {
    title: "List proposals",
    description:
      "List proposals in the SmartProps workspace, newest first. Optional filters: status (draft|sent|viewed|signed|declined), client_id, updated_since (ISO 8601). Each row includes number, title, status, totals-bearing id, and pdf_url.",
    inputSchema: {
      status: z.string().optional().describe("draft, sent, viewed, signed, or declined"),
      client_id: z.string().optional().describe("Only proposals for this client id"),
      updated_since: z.string().optional().describe("ISO timestamp; only proposals updated at/after this"),
      ...pagination,
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  async (args) => {
    try { return ok(await api.get("/api/v1/proposals", args)); } catch (e) { return fail(e); }
  }
);

server.registerTool(
  "get_proposal",
  {
    title: "Get a proposal",
    description:
      "Get one proposal in full: status, client, scenarios with line items, per-scenario and headline totals, valid_until, signed_at, and pdf_url.",
    inputSchema: { id: z.string().describe("Proposal id (from list_proposals)") },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  async ({ id }) => {
    try { return ok(await api.get(`/api/v1/proposals/${encodeURIComponent(id)}`)); } catch (e) { return fail(e); }
  }
);

server.registerTool(
  "list_clients",
  {
    title: "List clients",
    description: "List active clients in the workspace, newest first. Paginated with limit/offset.",
    inputSchema: { ...pagination },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  async (args) => {
    try { return ok(await api.get("/api/v1/clients", args)); } catch (e) { return fail(e); }
  }
);

server.registerTool(
  "find_client",
  {
    title: "Find a client by name or email",
    description:
      "Search clients by a case-insensitive substring of company name, contact name, or contact email. Use this to resolve a client id (e.g. before referencing a proposal's client). Returns all matches.",
    inputSchema: { query: z.string().min(1).describe("Name or email fragment to search for") },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  async ({ query }) => {
    try {
      const needle = query.toLowerCase();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const matches: any[] = [];
      // Page through the catalog (API caps a page at 100); stop at a short page.
      for (let offset = 0; offset < 1000; offset += 100) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const page: any = await api.get("/api/v1/clients", { limit: 100, offset });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const rows: any[] = page?.data ?? [];
        for (const c of rows) {
          const hay = [c.company_name, c.contact_name, c.contact_email].filter(Boolean).join(" ").toLowerCase();
          if (hay.includes(needle)) matches.push(c);
        }
        if (rows.length < 100) break;
      }
      return ok({ query, count: matches.length, data: matches });
    } catch (e) {
      return fail(e);
    }
  }
);

server.registerTool(
  "list_products",
  {
    title: "List catalog products",
    description:
      "List the workspace's active catalog products (name, description, item_type, billing_period, unit_price, setup_price). Paginated with limit/offset.",
    inputSchema: { ...pagination },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  async (args) => {
    try { return ok(await api.get("/api/v1/products", args)); } catch (e) { return fail(e); }
  }
);

// ── Write tools ─────────────────────────────────────────────────────────────
server.registerTool(
  "create_client",
  {
    title: "Create a client",
    description:
      "Create a new client in the workspace. Requires an API key with the 'write' scope. Only company_name is required.",
    inputSchema: {
      company_name: z.string().min(1).describe("Company name (required)"),
      contact_name: z.string().optional(),
      contact_email: z.string().optional().describe("A valid email address"),
      contact_phone: z.string().optional(),
      address_street: z.string().optional(),
      address_city: z.string().optional(),
      address_state: z.string().optional(),
      address_postal: z.string().optional(),
      address_country: z.string().optional(),
      notes: z.string().optional(),
    },
    // Creates data but doesn't destroy/overwrite; not idempotent (repeat = new row).
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
  },
  async (args) => {
    try { return ok(await api.post("/api/v1/clients", args)); } catch (e) { return fail(e); }
  }
);

// ── Start ─────────────────────────────────────────────────────────────────────
async function main() {
  if (!HAS_KEY) {
    console.error("[smartprops-mcp] WARNING: SMARTPROPS_API_KEY is not set — tools will return an auth error until it is.");
  }
  console.error(`[smartprops-mcp] ready (api=${API_BASE})`);
  await server.connect(new StdioServerTransport());
}

main().catch((e) => {
  console.error("[smartprops-mcp] fatal:", e);
  process.exit(1);
});
