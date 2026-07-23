// OpenAPI 3.0 description of the public API (Phase C2). Served at
// /api/v1/openapi.json. Additive-only — keep in sync as endpoints are added.

export const OPENAPI_SPEC = {
  openapi: "3.0.3",
  info: {
    title: "SmartProps API",
    version: "2026-07-01",
    description:
      "Read your proposals, clients, and catalog, create clients, and manage webhook subscriptions. " +
      "Authenticate with a Bearer API key (Settings → Integrations → API keys). Requires the 'integrations' plan feature.",
  },
  servers: [{ url: "https://app.smartprops.io/api/v1" }],
  security: [{ bearerAuth: [] }],
  components: {
    securitySchemes: {
      bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "sp_live_…" },
    },
    schemas: {
      Error: {
        type: "object",
        properties: { error: { type: "object", properties: { code: { type: "string" }, message: { type: "string" } } } },
      },
      Totals: {
        type: "object",
        properties: { monthly: { type: "number" }, one_time: { type: "number" }, currency: { type: "string" } },
      },
      ProposalSummary: {
        type: "object",
        properties: {
          id: { type: "string" }, number: { type: "string", nullable: true }, title: { type: "string", nullable: true },
          status: { type: "string" }, client_id: { type: "string", nullable: true },
          valid_until: { type: "string", nullable: true }, sent_at: { type: "string", nullable: true },
          signed_at: { type: "string", nullable: true }, pdf_url: { type: "string", nullable: true },
          created_at: { type: "string", nullable: true }, updated_at: { type: "string", nullable: true },
        },
      },
      Client: { type: "object", properties: { id: { type: "string" }, company_name: { type: "string" } } },
      Product: { type: "object", properties: { id: { type: "string" }, name: { type: "string" }, unit_price: { type: "number", nullable: true } } },
    },
  },
  paths: {
    "/proposals": {
      get: {
        summary: "List proposals",
        parameters: [
          { name: "status", in: "query", schema: { type: "string" } },
          { name: "client_id", in: "query", schema: { type: "string" } },
          { name: "updated_since", in: "query", schema: { type: "string", format: "date-time" } },
          { name: "limit", in: "query", schema: { type: "integer", default: 25, maximum: 100 } },
          { name: "offset", in: "query", schema: { type: "integer", default: 0 } },
        ],
        responses: {
          "200": {
            description: "A page of proposals",
            content: { "application/json": { schema: {
              type: "object",
              properties: { data: { type: "array", items: { $ref: "#/components/schemas/ProposalSummary" } }, limit: { type: "integer" }, offset: { type: "integer" } },
            } } },
          },
        },
      },
    },
    "/proposals/{id}": {
      get: {
        summary: "Get a proposal (with scenarios, line items, totals, client)",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: { "200": { description: "Proposal detail" }, "404": { description: "Not found", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } } },
      },
    },
    "/clients": {
      get: {
        summary: "List clients",
        parameters: [
          { name: "limit", in: "query", schema: { type: "integer", default: 25, maximum: 100 } },
          { name: "offset", in: "query", schema: { type: "integer", default: 0 } },
        ],
        responses: { "200": { description: "A page of clients" } },
      },
      post: {
        summary: "Create a client (scope: write)",
        requestBody: {
          required: true,
          content: { "application/json": { schema: {
            type: "object", required: ["company_name"],
            properties: {
              company_name: { type: "string" }, contact_name: { type: "string" }, contact_email: { type: "string" },
              contact_phone: { type: "string" }, address_street: { type: "string" }, address_city: { type: "string" },
              address_state: { type: "string" }, address_postal: { type: "string" }, address_country: { type: "string" }, notes: { type: "string" },
            },
          } } },
        },
        responses: { "201": { description: "Created client" }, "400": { description: "Validation error" } },
      },
    },
    "/products": {
      get: { summary: "List catalog products", responses: { "200": { description: "A page of products" } } },
    },
    "/webhooks": {
      post: {
        summary: "Subscribe a URL to events (scope: write)",
        requestBody: { required: true, content: { "application/json": { schema: {
          type: "object", required: ["url"],
          properties: { url: { type: "string" }, events: { type: "array", items: { type: "string", enum: ["proposal.sent", "proposal.viewed", "proposal.signed", "proposal.declined"] } } },
        } } } },
        responses: { "201": { description: "Subscription id" } },
      },
    },
    "/webhooks/{id}": {
      delete: {
        summary: "Unsubscribe (scope: write)",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: { "200": { description: "Deleted" }, "404": { description: "Not found" } },
      },
    },
  },
} as const;
