---
issue: 33
date: 2026-10-31
title: One MCP Server per connection; GET /mcp reuses the session transport
---

**Spec reference:** Issue #33, fixed in PR #37. A single shared `Server` was connected to every transport, so the newest connection captured the responses of earlier sessions.

**Net effect:** Each SSE connection and each streamable-HTTP session now gets its own `Server`. Concurrent agents no longer see silent request timeouts. `GET /mcp` attaches to the initialised session's existing transport instead of creating a second one.

**Watch items:** `GET /mcp` now returns `400` if the `mcp-session-id` header is missing or unknown ("No initialised session; POST an initialize request first"), or if the session is an SSE session. Clients must POST `initialize` before opening the GET stream.
