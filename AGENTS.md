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
- **`docs/DB_CURRENT_STATE.md`** — update when schema, RLS, or database assumptions change.
- **`docs/SOURCE_INVESTIGATION.md`** — update when adding or changing source crawl assumptions.
- **`README.md`** — setup and env vars for humans.

## Project slug

- Use **`glassspider`** as `PROJECT_SLUG` (or match `projects.slug` in the database if it differs).

## App commands

- `npm run dev`
- `npm run build`
- `npm run lint`
- `npm run typecheck`

## Runtime notes

- Next.js App Router routes under `app/`.
- Server Supabase helpers live in `lib/supabase/server.ts`.
- Product access checks live in `lib/auth.ts` and must remain server-side.
- Next.js is the Vercel control plane and must enqueue jobs only; do not run crawl/scrape/classify work in route handlers or server actions.
- Python worker code lives in `worker/app/` and owns crawl/scrape/classify execution on Fly.io.
- **`glassspider_claim_next_job` idle responses** may decode as null, empty collections, or an all-null job object. The worker only validates **`Job`** when **`row.get("id")`** is truthy; do not assume SQL `NULL` becomes Python `None` only.
- `SUPABASE_SERVICE_ROLE_KEY` belongs only in the worker environment, never in Vercel or browser-exposed env vars.
- Job execution state lives in `glassspider_jobs`; use atomic claim/complete/fail RPCs and preserve one active job per source/type.
