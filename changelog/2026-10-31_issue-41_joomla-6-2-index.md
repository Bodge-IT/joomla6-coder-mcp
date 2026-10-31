---
issue: 41
date: 2026-10-31
title: Index Joomla 6.2 (6.2-dev); fix SQL, media source and Windows path handling
---

**Spec reference:** Issue #41 — shipped index dated from `6.1-dev`, before 6.1.0 was released

**Net effect:** The default `JOOMLA_BRANCH` is now `6.2-dev`. The shipped indexes are rebuilt from 6.2.1-dev (`b589be2`): 949 classes (was 941), 76 tables, 10 web components. `joomla_sync` now reads `CREATE TABLE` files from `installation/sql/mysql`, follows the move of `build/media_source` to `media_source`, and writes the rebuilt schema gzipped to `schema.json.gz`. `build-index` normalises Windows backslash paths, so shipped indexes hold no local paths.

**Watch items:** The index may suggest APIs added in 6.2 (`MailOAuth2TokenProvider`, `EnumField`, `RememberMe` and others) to sites still on 6.1.x, such as the Ortus dev site on 6.1.3. The sparse-checkout list is written only on the first clone, so an existing `CACHE_DIR` keeps the old `build/media_source` pattern and will not check out `media_source`. Delete `CACHE_DIR` and re-run `joomla_sync` to pick it up.
