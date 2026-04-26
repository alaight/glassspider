# Current state — glassspider

**Last updated:** 2026-04-26

## Repository

- Early-stage product repo: [glassspider](https://github.com/alaight/glassspider).
- Part of the **Laightworks** hub-and-spoke ecosystem; shares **Supabase/Postgres** with the Laightworks site.

## Database convention

- Any table this product adds for its own data: **`glassspider_<name>`** (e.g. `glassspider_items`).
- Ecosystem-wide tables (e.g. projects registry, access) are shared; confirm names in Supabase before use.

## Application

- Stack: Next.js App Router, TypeScript, Tailwind CSS, Supabase SSR.
- Root page `/` explains the Glassspider workflow and links to protected admin/viewer areas.
- Protected admin routes:
  - `/admin`: source/run overview.
  - `/admin/sources`: source registry and BidStats seed action.
  - `/admin/sources/[id]`: source URL rules.
  - `/admin/runs`: manual crawl/scrape/classify run controls and history.
  - `/admin/url-map`: discovered URL map.
- Protected viewer routes:
  - `/dashboard`: bid intelligence overview.
  - `/dashboard/search`: searchable bid records and CSV export link.
  - `/dashboard/renewals`: renewal buckets.
  - `/dashboard/records/[id]`: canonical record detail.
- API routes:
  - `POST /api/admin/runs`: admin-triggered pipeline run.
  - `GET /api/dashboard/export`: viewer CSV export.
  - `POST /api/cron/run-scheduled`: cron-protected scheduled pipeline runner.
- Server-side auth checks validate the Supabase user and shared Laightworks project access for `PROJECT_SLUG = glassspider`.
- Admin roles default to `owner,admin`; viewer roles include owner/admin/member/viewer/analyst/reviewer.

## Scraping pipeline

- Source/rule configuration lives in Supabase-backed `glassspider_*` tables.
- The first implemented worker path is TypeScript-based under `lib/scraping/`.
- Pipeline stages:
  - crawl configured entry URLs and store `glassspider_discovered_urls`;
  - scrape candidate detail/award URLs into `glassspider_raw_records`;
  - normalise deterministic fields into `glassspider_bid_records`;
  - keep AI/classification storage ready via `glassspider_classifications`.
- BidStats is seeded as a draft source with query-string crawling disabled per its public robots rules.

## Database

- Initial migration: `supabase/migrations/20260426000000_glassspider_bid_intelligence_initial_schema.sql`.
- Database prose: `docs/DB_CURRENT_STATE.md`.
- The local Supabase CLI was unavailable during migration creation, so validate the migration against the live shared schema before applying it.

## Environment

- Required env vars are documented in the root **`README.md`** and `.env.example`.
