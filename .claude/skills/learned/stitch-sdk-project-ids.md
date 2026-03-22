---
name: stitch-sdk-project-ids
description: "Stitch SDK requires real project IDs from stitch.withgoogle.com — arbitrary strings cause entity-not-found errors"
user-invocable: false
origin: auto-extracted
---

# Stitch SDK Project IDs

**Extracted:** 2026-03-22
**Context:** Using sp_auto, sp_generate, sp_flow tools in stitch-pro-mcp

## Problem
sp_auto and sp_generate fail with `"Tool Call Failed [generate_screen_from_text]: Requested entity was not found."` when using arbitrary project IDs like `"stitch-pro-landing"`.

## Solution
Projects must exist on Stitch's servers first. The SDK's `project(id)` method references existing projects — it does not create them from arbitrary strings.

To get a valid project ID:
1. Create a project at https://stitch.withgoogle.com
2. Or use the `create_project` upstream Stitch tool (if available via StitchToolClient)
3. Then pass the returned ID to sp_generate/sp_auto

## When to Use
Before any `sp_generate`, `sp_flow`, or `sp_auto` call. Always verify project exists first with `sp_projects`.
