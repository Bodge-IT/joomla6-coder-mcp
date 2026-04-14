---
issue: 20
date: 2026-04-14
title: CRITICAL — OAuth auto-approve with no authentication
---

**Spec reference:** Issue #20 — OAuth open access on any reachable network

**Net effect:** Server now binds to `127.0.0.1` by default (was `0.0.0.0`); client registration stores `redirect_uris`; `/authorize` rejects unknown clients and mismatched redirect URIs; `/token` validates `client_id` matches the issued code; malformed `redirect_uri` values are rejected before URL construction.

**Watch items:** If this server is deployed behind a reverse proxy or container network, set `HOST=0.0.0.0` explicitly and ensure the network boundary is firewalled. Any client that registered before this fix will need to re-register — stored client records previously discarded `redirect_uris`.
