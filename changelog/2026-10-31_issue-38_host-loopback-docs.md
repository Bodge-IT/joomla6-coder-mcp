---
issue: 38
date: 2026-10-31
title: Docs — HOST defaults to 127.0.0.1; running on another machine
---

**Spec reference:** Issue #38 — README and service example still assumed the pre-#20 `0.0.0.0` default

**Net effect:** The README gives `127.0.0.1` as the `HOST` default and has a "Running on another machine" section (`HOST=0.0.0.0` behind a firewall or VPN, plus `claude mcp add` pointed at the server's name). It states that `/sse`, `/message` and `/mcp` have no authentication. `joomla6-mcp.service.example` sets `HOST=127.0.0.1` with a comment on when to change it.

**Watch items:** Existing systemd installs that serve remote clients must set `HOST=0.0.0.0` in their unit file, or those clients get connection refused. Open the port only to your own machines.
