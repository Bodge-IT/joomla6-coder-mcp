---
issue: 19
date: 2026-04-16
title: CRITICAL — Arbitrary file read via LSP definition preview
---

**Spec reference:** Issue #19 — LSP `getDefinition()` returned previews for any file URI Intelephense resolved to, with no workspace boundary check

**Net effect:** `getDefinition()` now resolves each definition's `realpath` and only reads the file if it sits within `workspaceRoot` or the Intelephense `storagePath`. Definitions pointing at PHP stubs, `node_modules`, or any other external path return location metadata with no `preview` field. The returned `uri` and `path` are passed through `sanitisePath()` so shipped output no longer leaks server filesystem structure. Preview content is capped at 2,000 characters with a `... [truncated]` marker.

**Watch items:** Previously legitimate previews for files symlinked into the workspace will still resolve correctly because we check against the `realpath`. Callers that rely on the absolute `uri`/`path` fields to reopen files on the client side will now receive sanitised paths — if a client needs the raw workspace path, it should prefix the sanitised value with its own known workspace root.
