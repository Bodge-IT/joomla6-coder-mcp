---
issue: 43
date: 2026-11-05
title: MVC pattern — giving your models a service of your own (Joomla 6.2)
---

**Spec reference:** Issue #43, from Herman Peeren's "Adding a service via the MVCFactory" (Joomla Community Magazine, October 2026)

**Net effect:** `joomla_coding_patterns("mvc")` has a fourth pattern. A component registers its service in the container, marks models with an aware interface, and extends core's MVCFactory service provider through the 6.2 hooks (`createMVCFactory()`, `injectServicesIntoFactory()`, `getNamespace()`), calling the parent so Joomla's own services are still injected. The notes warn against creating the service inside the model and against copying core's provider on 6.2 and later, keep core's `ApiMVCFactory` for the API client, and name 6.3 autowiring as a draft only. A new test covers the pattern.

**Watch items:** If joomla-cms PR #48193 (autowiring for MVC objects) merges for 6.3, the pattern needs a note on the simpler route.
