import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { ScopedDb } from "@/lib/api/scoped";
import {
  serializeProposalSummary,
  serializeProposalDetail,
  serializeClient,
  serializeProduct,
  PROPOSAL_DETAIL_COLS,
} from "@/lib/api/serialize";

// Builds a per-request MCP server for the remote transport (app/api/mcp/route.ts).
// Tools call the SAME tenant-scoped ScopedDb + serializers the C2 /api/v1 routes
// use, so tenant isolation and response shapes are identical. A fresh server is
// created per request (stateless) and closed over the authenticated tenant ctx.
// docs/integrations-phase-c-api-webhooks-zapier.md Appendix A.

export interface McpContext {
  db: ScopedDb;
  scopes: string[];
}

type ToolResult = { content: { type: "text"; text: string }[]; isError?: boolean };
const ok = (data: unknown): ToolResult => ({ content: [{ type: "text", text: JSON.stringify(data, null, 2) }] });
const err = (message: string): ToolResult => ({ content: [{ type: "text", text: message }], isError: true });

const PROPOSAL_COLS =
  "id, quote_number, title, status, client_id, valid_until, sent_at, signed_at, pdf_url, created_at, updated_at";
const CLIENT_COLS =
  "id, company_name, contact_name, contact_email, contact_phone, secondary_contact_name, secondary_contact_email, secondary_contact_phone, address, address_street, address_suite, address_city, address_state, address_postal, address_country, is_active, created_at";
const PRODUCT_COLS =
  "id, name, description, item_type, billing_period, unit, unit_price, setup_price, is_taxable, is_active";
const CREATE_CLIENT_ALLOWED = new Set([
  "contact_name", "contact_email", "contact_phone",
  "secondary_contact_name", "secondary_contact_email", "secondary_contact_phone",
  "address_street", "address_suite", "address_city", "address_state", "address_postal", "address_country",
  "notes",
]);

const pagination = {
  limit: z.number().int().min(1).max(100).optional().describe("Page size, 1–100"),
  offset: z.number().int().min(0).optional().describe("Rows to skip (pagination)"),
};
const page = (a: { limit?: number; offset?: number }) => {
  const limit = a.limit ?? 25;
  const offset = a.offset ?? 0;
  return { limit, offset, from: offset, to: offset + limit - 1 };
};

export function buildMcpServer(ctx: McpContext): McpServer {
  const { db, scopes } = ctx;
  const server = new McpServer({ name: "smartprops", version: "0.1.0" });

  server.registerTool(
    "list_proposals",
    {
      title: "List proposals",
      description:
        "List proposals in the SmartProps workspace, newest first. Optional filters: status (draft|sent|viewed|signed|declined), client_id, updated_since (ISO 8601). Paginated.",
      inputSchema: {
        status: z.string().optional().describe("draft, sent, viewed, signed, or declined"),
        client_id: z.string().optional(),
        updated_since: z.string().optional().describe("ISO timestamp; only proposals updated at/after this"),
        ...pagination,
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async (args) => {
      try {
        const { from, to, limit, offset } = page(args);
        let q = db.select("quotes", PROPOSAL_COLS).order("created_at", { ascending: false }).range(from, to);
        if (args.status) q = q.eq("status", args.status);
        if (args.client_id) q = q.eq("client_id", args.client_id);
        if (args.updated_since) q = q.gte("updated_at", args.updated_since);
        const { data, error } = await q;
        if (error) return err(error.message);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return ok({ data: (data ?? []).map((r: any) => serializeProposalSummary(r)), limit, offset });
      } catch (e) {
        return err((e as Error).message);
      }
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
      try {
        const { data: quote } = await db.select("quotes", PROPOSAL_DETAIL_COLS).eq("id", id).maybeSingle();
        if (!quote) return err("Proposal not found.");
        const { data: scenarios } = await db
          .child("quote_scenarios")
          .select("id, name, is_recommended, sort_order")
          .eq("quote_id", quote.id)
          .order("sort_order");
        const list = scenarios ?? [];
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const itemsByScenario = new Map<string, any[]>();
        if (list.length > 0) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const ids = list.map((s: any) => s.id);
          const { data: items } = await db
            .child("quote_line_items")
            .select("scenario_id, description, details, billing_period, quantity, unit_price, setup_price, discount_percent, discount_amount, is_taxable")
            .in("scenario_id", ids)
            .order("sort_order");
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          for (const it of items ?? []) {
            const arr = itemsByScenario.get(it.scenario_id) ?? [];
            arr.push(it);
            itemsByScenario.set(it.scenario_id, arr);
          }
        }
        let client = null;
        if (quote.client_id) {
          const { data: c } = await db.select("clients", "*").eq("id", quote.client_id).maybeSingle();
          client = c ?? null;
        }
        return ok(serializeProposalDetail(quote, list, itemsByScenario, client));
      } catch (e) {
        return err((e as Error).message);
      }
    }
  );

  server.registerTool(
    "list_clients",
    {
      title: "List clients",
      description: "List active clients in the workspace, newest first. Paginated.",
      inputSchema: { ...pagination },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async (args) => {
      try {
        const { from, to, limit, offset } = page(args);
        const { data, error } = await db
          .select("clients", CLIENT_COLS)
          .eq("is_active", true)
          .order("created_at", { ascending: false })
          .range(from, to);
        if (error) return err(error.message);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return ok({ data: (data ?? []).map((r: any) => serializeClient(r)), limit, offset });
      } catch (e) {
        return err((e as Error).message);
      }
    }
  );

  server.registerTool(
    "find_client",
    {
      title: "Find a client by name or email",
      description:
        "Search clients by a case-insensitive substring of company name, contact name, or contact email. Returns all matches.",
      inputSchema: { query: z.string().min(1).describe("Name or email fragment") },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async ({ query }) => {
      try {
        const needle = query.toLowerCase();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const matches: any[] = [];
        for (let offset = 0; offset < 1000; offset += 100) {
          const { data, error } = await db
            .select("clients", CLIENT_COLS)
            .eq("is_active", true)
            .order("created_at", { ascending: false })
            .range(offset, offset + 99);
          if (error) return err(error.message);
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const rows: any[] = data ?? [];
          for (const c of rows) {
            const hay = [c.company_name, c.contact_name, c.contact_email].filter(Boolean).join(" ").toLowerCase();
            if (hay.includes(needle)) matches.push(serializeClient(c));
          }
          if (rows.length < 100) break;
        }
        return ok({ query, count: matches.length, data: matches });
      } catch (e) {
        return err((e as Error).message);
      }
    }
  );

  server.registerTool(
    "list_products",
    {
      title: "List catalog products",
      description:
        "List the workspace's active catalog products (name, description, item_type, billing_period, unit_price, setup_price). Paginated.",
      inputSchema: { ...pagination },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async (args) => {
      try {
        const { from, to, limit, offset } = page(args);
        const { data, error } = await db
          .select("products", PRODUCT_COLS)
          .eq("is_active", true)
          .order("name", { ascending: true })
          .range(from, to);
        if (error) return err(error.message);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return ok({ data: (data ?? []).map((r: any) => serializeProduct(r)), limit, offset });
      } catch (e) {
        return err((e as Error).message);
      }
    }
  );

  server.registerTool(
    "create_client",
    {
      title: "Create a client",
      description:
        "Create a new client in the workspace. Requires a key/token with the 'write' scope. Only company_name is required.",
      inputSchema: {
        company_name: z.string().min(1).describe("Company name (required)"),
        contact_name: z.string().optional(),
        contact_email: z.string().optional(),
        contact_phone: z.string().optional(),
        address_street: z.string().optional(),
        address_city: z.string().optional(),
        address_state: z.string().optional(),
        address_postal: z.string().optional(),
        address_country: z.string().optional(),
        notes: z.string().optional(),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
    async (args) => {
      try {
        if (!scopes.includes("write")) {
          return err("This credential is read-only. A key/token with the 'write' scope is required to create a client.");
        }
        const companyName = String(args.company_name ?? "").trim();
        if (!companyName) return err("company_name is required.");
        if (args.contact_email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(args.contact_email)) {
          return err("contact_email is not a valid email address.");
        }
        const row: Record<string, unknown> = { company_name: companyName };
        for (const [k, v] of Object.entries(args)) {
          if (CREATE_CLIENT_ALLOWED.has(k) && v != null) row[k] = typeof v === "string" ? v.trim() : v;
        }
        const { data, error } = await db.insertOne("clients", row);
        if (error) return err(error.message);
        return ok(serializeClient(data));
      } catch (e) {
        return err((e as Error).message);
      }
    }
  );

  return server;
}
