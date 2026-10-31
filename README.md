# Joomla 6 MCP Server

An [MCP](https://modelcontextprotocol.io/) server that gives AI coding assistants deep knowledge of the Joomla 6 API. Instead of guessing at class names, event signatures, and database schemas, the AI can look them up directly from the Joomla source.

## Why?

AI tools produce better Joomla code when they have access to the actual API — real class hierarchies, real method signatures, real event parameters. Without this, you get plausible-looking code that uses deprecated patterns, wrong class names, or invented method signatures.

This server indexes the Joomla 6 CMS source and exposes it through 14 MCP tools that any compatible AI client can call.

## Quick Start

```bash
git clone https://github.com/Bodge-IT/joomla6-coder-mcp.git
cd joomla6-coder-mcp
npm install
npm run build
npm start
```

The server starts on port 3500 by default (configurable via `PORT` environment variable). Port 3500 was chosen because previously used port (3100) can clash with Windows Hyper-V reserved port ranges.

It listens on `127.0.0.1` only, so out of the box it is reachable from the same machine and nowhere else. To run it on another machine, see [Running on another machine](#running-on-another-machine).

### Connect Claude Code

**SSE (recommended):**
```bash
claude mcp add joomla6 --transport sse "http://localhost:3500/sse" --scope user
```

**Streamable HTTP (also supported):**
```bash
claude mcp add joomla6 --transport streamable-http "http://localhost:3500/mcp" --scope user
```

### First Run

The server ships with a pre-built index of Joomla 6.2 (949 classes, 76 database tables, 10 web components), so all tools work immediately — no sync required.

To refresh it from the branch set in `JOOMLA_BRANCH` (default `6.2-dev`), run the sync tool:

```
joomla_sync
```

This does a sparse checkout of the Joomla CMS repository from GitHub, parses the PHP source into a searchable index, and extracts database schemas from the MySQL install SQL (`installation/sql/mysql`). The rebuilt schema is written gzipped to `schema.json.gz` in `DATA_DIR`.

The shipped index is built from the tip of `6.2-dev` (6.2.1-dev), so it can include APIs added in 6.2. If your site runs an earlier release such as 6.1.x, check that a suggested class or method exists on your version. To index a different release line, set `JOOMLA_BRANCH` and run `joomla_sync`. The sparse-checkout list is written only on the first clone, so if `CACHE_DIR` predates 6.2, delete it before syncing to pick up the relocated `media_source` folder.

## Tools

| Tool | Description |
|------|-------------|
| `joomla_sync` | Fetch Joomla 6 source from GitHub and build the index |
| `joomla_lookup_class` | Look up a class, interface, or trait — methods, properties, constants, docblocks |
| `joomla_search` | Search the index for classes, methods, constants, and properties |
| `joomla_list_events` | List event classes for plugin development |
| `joomla_get_services` | List DI service providers and factories |
| `joomla_extension_structure` | Get standard directory structure for any extension type |
| `joomla_coding_patterns` | Get coding patterns by category (MVC, events, forms, database, routing, etc.) |
| `joomla_diagnostics` | Analyse PHP code for errors and type issues (Intelephense LSP) |
| `joomla_hover` | Get type information and docblocks at a position |
| `joomla_definition` | Go to definition with source preview |
| `joomla_completion` | Code completion suggestions |
| `joomla_schema` | Look up database table schemas |
| `joomla_lint` | PHP coding standards check (requires PHP + phpcs) |
| `joomla_fix` | Auto-fix coding standard violations (requires PHP + phpcbf) |

### Tool Categories

**Index tools** (sync, lookup_class, search, list_events, get_services) — work from the parsed PHP index. The shipped index works out of the box; run `joomla_sync` only to update.

**Reference tools** (extension_structure, coding_patterns) — built-in knowledge of Joomla conventions and patterns.

**LSP tools** (diagnostics, hover, definition, completion) — powered by Intelephense running against the Joomla source. Accept either a file path on the server or inline PHP code.

**Schema tools** (schema) — parsed from Joomla's install SQL files.

**Lint tools** (lint, fix) — require PHP and phpcs/phpcbf to be installed on the server. Stubs until then.

## Configuration

All configuration is via environment variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3500` | Server port |
| `HOST` | `127.0.0.1` | Bind address. Set `0.0.0.0` only behind a firewall or VPN |
| `DATA_DIR` | `./data` | Index and schema cache directory |
| `CACHE_DIR` | `./cache/libraries` | Joomla source cache (sparse checkout) |
| `JOOMLA_BRANCH` | `6.2-dev` | Joomla CMS branch to sync |

## Running on another machine

To serve the index from a different machine than the one running Claude Code, set `HOST=0.0.0.0` on the server and connect to it by name:

```bash
HOST=0.0.0.0 npm start
claude mcp add joomla6 --transport sse "http://your-server:3500/sse" --scope user
```

The server has no authentication of its own: anyone who can reach the port can use it. Keep the port closed to everything but your own machines, with a firewall rule or a VPN.

## Running as a Service

An example systemd unit file is provided:

```bash
cp joomla6-mcp.service.example /etc/systemd/system/joomla6-mcp.service
# Edit the file to set your user and working directory
systemctl enable --now joomla6-mcp
```

## Architecture

```
src/
├── index.ts                    # Express server, OAuth, SSE + Streamable HTTP transports
├── sync/
│   └── github-sync.ts          # Sparse checkout of Joomla CMS from GitHub
├── parser/
│   ├── index-builder.ts        # PHP AST → searchable class/method/event index
│   ├── sql-schema-parser.ts    # CREATE TABLE → schema index
│   └── php-parser.ts           # PHP parsing utilities
├── lsp/
│   ├── intelephense-bridge.ts  # Manages Intelephense LSP child process
│   ├── input-resolver.ts       # Resolves file paths and inline code to LSP URIs
│   └── diagnostics-waiter.ts   # Waits for LSP diagnostic results
└── tools/
    ├── registry.ts             # Central tool registry — all 14 tools defined here
    ├── response-utils.ts       # 50KB response truncation guard
    └── *.ts                    # Individual tool implementations
```

**Key design decisions:**

- **Sparse checkout** — only fetches the directories needed for indexing, not the full Joomla repo
- **Cached index** — the parsed index is saved as JSON so restarts don't require re-parsing
- **Response truncation** — all tool responses are capped at 20KB to prevent transport timeouts
- **LSP auto-restart** — Intelephense restarts automatically on crash (3 retries, 5s cooldown)
- **Dual transport** — both SSE and Streamable HTTP are supported simultaneously
- **One `Server` per connection** — each SSE connection and each streamable-HTTP session gets its own MCP `Server` instance, so concurrent agents never receive each other's responses
- **`GET /mcp` reuses the session** — the server-initiated stream attaches to the transport created by the session's `initialize` POST. It needs the `mcp-session-id` header; without a valid streamable-HTTP session it returns `400`

## Health Check

```bash
curl http://localhost:3500/health
```

Returns index count, schema count, and LSP status.

## Requirements

- Node.js 18+
- Git (for sparse checkout of Joomla source)
- PHP 8.2+ and phpcs/phpcbf (optional, for lint/fix tools)

## Tests

```bash
npm test
```

98 tests across 10 test files using vitest.

## Licence

GPL-2.0-or-later — matching the Joomla CMS licence.
