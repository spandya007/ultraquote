-- 035: Proposal provenance — how a proposal was created. `source` is set by each
-- creation path (UI / public API / AI-MCP client); `source_detail` records the
-- caller (the OAuth client name like "Claude", or the API key name). Existing
-- proposals predate this and default to 'ui'. Mirrors products.source.
alter table public.quotes
  add column if not exists source text not null default 'ui'
    check (source in ('ui', 'api', 'mcp')),
  add column if not exists source_detail text;
