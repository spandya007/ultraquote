# SmartProps MCP server

A local [Model Context Protocol](https://modelcontextprotocol.io) server that lets an AI chat client
(Claude Desktop, Cursor, etc.) work with your SmartProps proposal workspace — *"list my signed proposals,"
*"find the client Acme,"* *"create a client for Northwind IT."*

It's a thin, typed wrapper over the SmartProps public REST API (`/api/v1`), authenticated with a SmartProps
**API key**. This is the **local / stdio** distribution (recommended first step); a remote OAuth connector is
a later phase. See `docs/integrations-phase-c-api-webhooks-zapier.md` Appendix A.

## Tools (v1)

| Tool | What | Scope |
|---|---|---|
| `list_proposals` | List proposals (filters: status, client_id, updated_since) | read |
| `get_proposal` | One proposal in full (scenarios, line items, totals, pdf_url) | read |
| `list_clients` | List clients | read |
| `find_client` | Find clients by name/email substring | read |
| `list_products` | List catalog products | read |
| `create_client` | Create a client | **write** |

Write tools require an API key with the **`write`** scope. Read tools work with a read-only key.

> More tools (`create_proposal`, `add_line_item`, AI `draft_section`, and a safety-gated
> `send_for_signature`) are deferred until the corresponding API endpoints and the two-step send-safety
> model land. Sending a legally-binding signature request will never be a silent one-shot from an AI.

## Setup

```bash
cd mcp-server
npm install
npm run build      # compiles src → dist
```

Get an API key: **SmartProps → Settings → Integrations → API keys → New key** (tick *Allow writes* if you
want `create_client`). The key is shown once — copy it.

### Configure Claude Desktop

Edit `claude_desktop_config.json` (Claude Desktop → Settings → Developer → Edit Config):

```json
{
  "mcpServers": {
    "smartprops": {
      "command": "node",
      "args": ["/ABSOLUTE/PATH/TO/ultraquote/mcp-server/dist/index.js"],
      "env": {
        "SMARTPROPS_API_KEY": "sp_live_...",
        "SMARTPROPS_API_URL": "https://app.smartprops.io"
      }
    }
  }
}
```

Restart Claude Desktop. The SmartProps tools appear in the tools menu; try *"List my most recent proposals."*

### Test with the MCP Inspector (no chat client needed)

```bash
SMARTPROPS_API_KEY=sp_live_... npx @modelcontextprotocol/inspector node dist/index.js
```

Opens a UI to browse the tools and call them against your real workspace.

## Configuration

| Env var | Required | Default | Notes |
|---|---|---|---|
| `SMARTPROPS_API_KEY` | yes | — | `sp_live_…` key. Without it, tools return a clear auth error. |
| `SMARTPROPS_API_URL` | no | `https://app.smartprops.io` | Point at a preview/self-host if needed. |

## Notes

- **stdio protocol:** stdout carries the MCP JSON-RPC stream; all diagnostics go to **stderr**.
- **Tenant isolation:** the key resolves to exactly one workspace server-side; there's no way to reach
  another tenant's data through this server.
- **Rate limit:** the API allows 100 requests/min per key (shared across all tools).
