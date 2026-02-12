# Joomla 6 MCP Server

An [MCP](https://modelcontextprotocol.io/) server that gives AI coding assistants deep knowledge of the Joomla 6 API. Instead of guessing at class names, event signatures, and database schemas, the AI can look them up directly from the Joomla source.

## Why?

AI tools produce better Joomla code when they have access to the actual API — real class hierarchies, real method signatures, real event parameters. Without this, you get plausible-looking code that uses deprecated patterns, wrong class names, or invented method signatures.

This server indexes the Joomla 6 CMS source and exposes it through 14 MCP tools that any compatible AI client can call.

## Quick Start

```bash
git clone https://github.com/bodge-it/joomla6-mcp.git
cd joomla6-mcp
npm install
npm run build
npm start
```

The server starts on port 3100 by default (configurable via `PORT` environment variable).

### Connect Claude Code

**Streamable HTTP (recommended):**
```bash
claude mcp add joomla6 --transport streamable-http "http://localhost:3100/mcp" --scope user
```

**SSE (legacy, still supported):**
```bash
claude mcp add joomla6 --transport sse "http://localhost:3100/sse" --scope user
```

### First Run

Once connected, run the sync tool to fetch the Joomla source and build the index:

```
joomla_sync
```

This does a sparse checkout of the Joomla CMS repository from GitHub, parses the PHP source into a searchable index, and extracts database schemas from the install SQL.

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

**Index tools** (sync, lookup_class, search, list_events, get_services) — work from the parsed PHP index. Run `joomla_sync` first.

**Reference tools** (extension_structure, coding_patterns) — built-in knowledge of Joomla conventions and patterns.

**LSP tools** (diagnostics, hover, definition, completion) — powered by Intelephense running against the Joomla source. Accept either a file path on the server or inline PHP code.

**Schema tools** (schema) — parsed from Joomla's install SQL files.

**Lint tools** (lint, fix) — require PHP and phpcs/phpcbf to be installed on the server. Stubs until then.

## Configuration

All configuration is via environment variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3100` | Server port |
| `HOST` | `0.0.0.0` | Bind address |
| `DATA_DIR` | `./data` | Index and schema cache directory |
| `CACHE_DIR` | `./cache/libraries` | Joomla source cache (sparse checkout) |
| `JOOMLA_BRANCH` | `6.1-dev` | Joomla CMS branch to sync |

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
- **Response truncation** — all tool responses are capped at 50KB to prevent transport timeouts
- **LSP auto-restart** — Intelephense restarts automatically on crash (3 retries, 5s cooldown)
- **Dual transport** — both SSE and Streamable HTTP are supported simultaneously

## Health Check

```bash
curl http://localhost:3100/health
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

49 tests across 5 test files using vitest.

## Licence

GPL-2.0-or-later — matching the Joomla CMS licence.
