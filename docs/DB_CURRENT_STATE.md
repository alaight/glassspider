# Database Current State

Glassspider uses the shared Laightworks Supabase/Postgres project. Product-owned tables are prefixed with `glassspider_`; shared ecosystem tables such as `projects` and `project_access` remain hub-owned.

## Migration

- Initial schema: `supabase/migrations/20260426000000_glassspider_bid_intelligence_initial_schema.sql`
- The local Supabase CLI was not available when the migration was created. Validate the migration against the live shared schema before applying it, especially the assumed `projects(id, slug)` and `project_access(project_id, user_id, role)` columns.

## Product Tables

- `glassspider_sources`: source registry with base URL, entry URLs, status, crawl/scrape cadence, and compliance notes.
- `glassspider_source_rules`: configurable include, exclude, listing, and detail URL patterns.
- `glassspider_runs`: crawl/scrape/classification run history, counts, errors, and metadata.
- `glassspider_discovered_urls`: stored URL map with source, type, crawl status, parent URL, matched rule, and content hash.
- `glassspider_raw_records`: raw text and source metadata captured before normalisation.
- `glassspider_bid_records`: canonical bid/award records with buyer, supplier, values, dates, sector, region, renewal estimate, and Postgres full-text search vector.
- `glassspider_classifications`: rule/AI classification outputs with labels, confidence, prompt version, and review status.
- `glassspider_saved_searches`: per-user viewer search presets.
- `glassspider_exports`: export job tracking.

## Access Model

- RLS is enabled on all `glassspider_*` tables.
- Viewer roles can read product data after matching access in the shared project access tables.
- Admin roles can manage source configuration.
- Pipeline writes are expected to run server-side with the Supabase service role key only.
- Service role keys must never be exposed to browser code or `NEXT_PUBLIC_*` variables.

## Search

The MVP uses Postgres filtering and a generated `search_vector` on `glassspider_bid_records`. Elasticsearch/OpenSearch is intentionally deferred until the dataset or fuzzy-search requirements justify another service.
