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
import { createProposal, addScenario, addLineItem, MutationError } from "@/lib/proposals/mutations";
import { publicOrigin } from "@/lib/oauth/metadata";

// Builds a per-request MCP server for the remote transport (app/api/mcp/route.ts).
// Tools call the SAME tenant-scoped ScopedDb + serializers the C2 /api/v1 routes
// use, so tenant isolation and response shapes are identical. A fresh server is
// created per request (stateless) and closed over the authenticated tenant ctx.
// docs/integrations-phase-c-api-webhooks-zapier.md Appendix A.

export interface McpContext {
  db: ScopedDb;
  scopes: string[];
  userId: string | null;
}

type ToolResult = { content: { type: "text"; text: string }[]; isError?: boolean };
const ok = (data: unknown): ToolResult => ({ content: [{ type: "text", text: JSON.stringify(data, null, 2) }] });
const err = (message: string): ToolResult => ({ content: [{ type: "text", text: message }], isError: true });
// Log real (thrown) errors so they surface in the Netlify function log — tool
// results are 200s, so a failing tool is otherwise invisible server-side.
const caught = (tool: string, e: unknown): ToolResult => {
  console.error(`[mcp] tool ${tool} threw:`, e);
  return err(e instanceof Error ? e.message : String(e));
};

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
  const { db, scopes, userId } = ctx;
  // serverInfo branding — MCP clients that support the `icons`/`title` fields
  // (a recent spec addition) show the SmartProps name + logo in their connector UI.
  const app = publicOrigin();
  const server = new McpServer({
    name: "smartprops",
    version: "0.1.0",
    title: "SmartProps",
    websiteUrl: app,
    icons: [
      { src: `${app}/icon-512.png`, mimeType: "image/png", sizes: ["512x512"] },
      { src: `${app}/favicon.svg`, mimeType: "image/svg+xml" },
    ],
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);
  const requireWrite = (): ToolResult | null =>
    scopes.includes("write") ? null : err("This credential is read-only. A 'write'-scoped key/token is required.");
  const mutationError = (tool: string, e: unknown): ToolResult =>
    e instanceof MutationError ? err(`${e.code}: ${e.message}`) : caught(tool, e);

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
        return caught("list_proposals", e);
      }
    }
  );

  server.registerTool(
    "get_proposal",
    {
      title: "Get a proposal",
      description:
        "Get one proposal in full (status, client, scenarios with line items, totals, valid_until, signed_at, pdf_url). Accepts either the proposal id (UUID) or its proposal number, e.g. CMIT-2026-036.",
      inputSchema: { id: z.string().describe("Proposal id (UUID) OR proposal number, e.g. CMIT-2026-036") },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async ({ id }) => {
      try {
        // Accept either a UUID id or the human proposal number — AI clients
        // usually have the number (what the user says), not the internal id.
        const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id.trim());
        const lookup = db.select("quotes", PROPOSAL_DETAIL_COLS);
        const { data: quote } = await (isUuid ? lookup.eq("id", id.trim()) : lookup.eq("quote_number", id.trim())).maybeSingle();
        if (!quote) return err(`Proposal not found: ${id}`);
        // The scenario→line-item chain and the client lookup are independent —
        // run them in parallel to cut a round-trip on the hot path.
        const [scenPart, client] = await Promise.all([
          (async () => {
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
            return { list, itemsByScenario };
          })(),
          quote.client_id
            ? db.select("clients", "*").eq("id", quote.client_id).maybeSingle().then((r: { data: unknown }) => r.data ?? null)
            : Promise.resolve(null),
        ]);
        return ok(serializeProposalDetail(quote, scenPart.list, scenPart.itemsByScenario, client));
      } catch (e) {
        return caught("get_proposal", e);
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
        return caught("list_clients", e);
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
        return caught("find_client", e);
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
        return caught("list_products", e);
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
        return caught("create_client", e);
      }
    }
  );

  server.registerTool(
    "create_proposal",
    {
      title: "Create a proposal",
      description:
        "Create a new DRAFT proposal for a client (with a default 'Scenario A'). Requires the 'write' scope. Returns the new proposal id + number. Use add_line_item to add pricing. Does NOT send anything.",
      inputSchema: {
        client_id: z.string().describe("The client id (from find_client / list_clients)"),
        title: z.string().optional().describe("Proposal title"),
        valid_until: z.string().optional().describe("Expiry date (YYYY-MM-DD)"),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
    async (args) => {
      const gate = requireWrite();
      if (gate) return gate;
      try {
        return ok(await createProposal(db, { clientId: args.client_id, title: args.title, validUntil: args.valid_until, createdBy: userId }));
      } catch (e) {
        return mutationError("create_proposal", e);
      }
    }
  );

  server.registerTool(
    "add_scenario",
    {
      title: "Add a pricing scenario",
      description: "Add another pricing scenario (option) to a proposal. Requires 'write'. Returns the new scenario id.",
      inputSchema: {
        proposal_id: z.string().describe("The proposal id"),
        name: z.string().optional().describe("Scenario name (defaults to the next letter)"),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
    async (args) => {
      const gate = requireWrite();
      if (gate) return gate;
      try {
        return ok(await addScenario(db, { quoteId: args.proposal_id, name: args.name }));
      } catch (e) {
        return mutationError("add_scenario", e);
      }
    }
  );

  server.registerTool(
    "add_line_item",
    {
      title: "Add a line item to a scenario",
      description:
        "Add a line item to a proposal scenario — either a catalog product (pass product_id, which snapshots its price) or a free-text item (pass description + unit_price). Requires 'write'. Get scenario_id from get_proposal.",
      inputSchema: {
        scenario_id: z.string().describe("The scenario id (from get_proposal)"),
        product_id: z.string().optional().describe("Catalog product id (from list_products) — snapshots its price"),
        description: z.string().optional().describe("Free-text item name (when not using product_id)"),
        quantity: z.number().positive().optional().describe("Quantity (default 1)"),
        unit_price: z.number().optional().describe("Unit price (overrides the catalog price, or sets the free-text price)"),
        billing_period: z.enum(["Monthly", "One Time"]).optional().describe("Default 'One Time' for free-text"),
        setup_price: z.number().optional().describe("One-time setup fee per unit"),
        is_taxable: z.boolean().optional(),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
    async (args) => {
      const gate = requireWrite();
      if (gate) return gate;
      try {
        return ok(await addLineItem(db, {
          scenarioId: args.scenario_id,
          productId: args.product_id,
          description: args.description,
          quantity: args.quantity,
          unitPrice: args.unit_price,
          billingPeriod: args.billing_period,
          setupPrice: args.setup_price,
          isTaxable: args.is_taxable,
        }));
      } catch (e) {
        return mutationError("add_line_item", e);
      }
    }
  );

  return server;
}
