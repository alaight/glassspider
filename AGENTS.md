# AGENTS.md — glassspider

## Repository

- **Product:** glassspider (Laightworks ecosystem).
- **Remote:** https://github.com/alaight/glassspider

## Database (critical)

- **Shared Supabase/Postgres** with the Laightworks site. Schema changes can affect other products.
- **All new tables created for this product MUST use the prefix `glassspider_`** (e.g. `glassspider_events`). Do not create glassspider-specific tables without this prefix.
- Shared ecosystem tables (projects registry, access control, auth) are owned by hub conventions—verify names and RLS in the live project before coding.

## Cursor / MCP

- Project MCP config: `.cursor/mcp.json` (Supabase MCP points at the shared project).
- Rules: `.cursor/rules/` — especially `multi-product-architecture.mdc`, `database-read-first.mdc`, and `architecture.mdc`.

## Docs

- **`docs/CURRENT_STATE.md`** — update when behaviour, routes, or integrations change.
- **`README.md`** — setup and env vars for humans.

## Project slug

- Use **`glassspider`** as `PROJECT_SLUG` (or match `projects.slug` in the database if it differs).
