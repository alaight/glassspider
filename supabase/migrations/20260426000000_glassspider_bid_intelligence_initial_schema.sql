-- Glassspider bid intelligence MVP schema.
-- Supabase CLI was unavailable in this environment, so this migration uses a
-- conventional timestamped filename and should be validated before applying.

create extension if not exists "pgcrypto";

create type public.glassspider_source_status as enum ('active', 'paused', 'draft');
create type public.glassspider_rule_type as enum ('include', 'exclude', 'detail', 'listing');
create type public.glassspider_run_type as enum ('crawl', 'scrape', 'classify');
create type public.glassspider_run_status as enum ('queued', 'running', 'succeeded', 'failed', 'cancelled');
create type public.glassspider_url_type as enum ('listing', 'detail', 'award', 'document', 'unknown');
create type public.glassspider_url_status as enum ('new', 'queued', 'scraped', 'ignored', 'failed');
create type public.glassspider_review_status as enum ('pending', 'approved', 'rejected', 'needs_review');

create table public.glassspider_sources (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references public.projects(id) on delete restrict,
  name text not null,
  slug text not null unique,
  base_url text not null,
  entry_urls text[] not null default '{}',
  status public.glassspider_source_status not null default 'draft',
  crawl_frequency text,
  scrape_frequency text,
  compliance_notes text,
  last_crawled_at timestamptz,
  last_scraped_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.glassspider_source_rules (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references public.glassspider_sources(id) on delete cascade,
  rule_type public.glassspider_rule_type not null,
  pattern text not null,
  description text,
  priority integer not null default 100,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.glassspider_runs (
  id uuid primary key default gen_random_uuid(),
  source_id uuid references public.glassspider_sources(id) on delete set null,
  run_type public.glassspider_run_type not null,
  status public.glassspider_run_status not null default 'queued',
  triggered_by uuid references auth.users(id) on delete set null,
  started_at timestamptz,
  finished_at timestamptz,
  pages_visited integer not null default 0,
  urls_discovered integer not null default 0,
  records_extracted integer not null default 0,
  records_updated integer not null default 0,
  ai_calls integer not null default 0,
  error_message text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.glassspider_discovered_urls (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references public.glassspider_sources(id) on delete cascade,
  run_id uuid references public.glassspider_runs(id) on delete set null,
  url text not null,
  url_type public.glassspider_url_type not null default 'unknown',
  status public.glassspider_url_status not null default 'new',
  parent_url text,
  crawl_depth integer not null default 0,
  http_status integer,
  content_hash text,
  matched_rule text,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  last_crawled_at timestamptz,
  error_message text,
  unique (source_id, url)
);

create table public.glassspider_raw_records (
  id uuid primary key default gen_random_uuid(),
  source_id uuid references public.glassspider_sources(id) on delete set null,
  discovered_url_id uuid references public.glassspider_discovered_urls(id) on delete set null,
  run_id uuid references public.glassspider_runs(id) on delete set null,
  source_url text not null,
  external_reference text,
  raw_title text,
  raw_text text not null,
  raw_metadata jsonb not null default '{}'::jsonb,
  content_hash text,
  extraction_status public.glassspider_review_status not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.glassspider_bid_records (
  id uuid primary key default gen_random_uuid(),
  source_id uuid references public.glassspider_sources(id) on delete set null,
  raw_record_id uuid references public.glassspider_raw_records(id) on delete set null,
  source_url text not null,
  external_reference text,
  notice_type text,
  title text not null,
  buyer_name text,
  supplier_name text,
  description text,
  sector_primary text,
  sector_secondary text,
  relevance_score numeric(5, 2),
  contract_value_low numeric,
  contract_value_high numeric,
  contract_value_awarded numeric,
  currency text default 'GBP',
  published_date date,
  award_date date,
  start_date date,
  end_date date,
  duration_months integer,
  extension_available boolean,
  extension_details text,
  estimated_renewal_date date,
  location text,
  region text,
  cpv_codes text[] not null default '{}',
  framework text,
  lot_number text,
  lot_title text,
  review_status public.glassspider_review_status not null default 'pending',
  ai_summary text,
  search_vector tsvector generated always as (
    to_tsvector(
      'english',
      coalesce(title, '') || ' ' ||
      coalesce(description, '') || ' ' ||
      coalesce(buyer_name, '') || ' ' ||
      coalesce(supplier_name, '') || ' ' ||
      coalesce(sector_primary, '') || ' ' ||
      coalesce(sector_secondary, '')
    )
  ) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.glassspider_classifications (
  id uuid primary key default gen_random_uuid(),
  bid_record_id uuid references public.glassspider_bid_records(id) on delete cascade,
  raw_record_id uuid references public.glassspider_raw_records(id) on delete cascade,
  classifier text not null,
  prompt_version text,
  labels text[] not null default '{}',
  confidence numeric(5, 2),
  output jsonb not null default '{}'::jsonb,
  review_status public.glassspider_review_status not null default 'pending',
  created_at timestamptz not null default now()
);

create table public.glassspider_saved_searches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  filters jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.glassspider_exports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  filters jsonb not null default '{}'::jsonb,
  status text not null default 'queued',
  file_path text,
  error_message text,
  created_at timestamptz not null default now(),
  finished_at timestamptz
);

create index glassspider_source_rules_source_idx on public.glassspider_source_rules(source_id);
create unique index glassspider_source_rules_unique_pattern_idx
  on public.glassspider_source_rules(source_id, rule_type, pattern);
create index glassspider_runs_source_created_idx on public.glassspider_runs(source_id, created_at desc);
create index glassspider_discovered_urls_source_status_idx on public.glassspider_discovered_urls(source_id, status);
create index glassspider_bid_records_renewal_idx on public.glassspider_bid_records(estimated_renewal_date);
create index glassspider_bid_records_review_idx on public.glassspider_bid_records(review_status);
create index glassspider_bid_records_search_idx on public.glassspider_bid_records using gin(search_vector);
create unique index glassspider_bid_records_source_url_idx
  on public.glassspider_bid_records(source_url);

alter table public.glassspider_sources enable row level security;
alter table public.glassspider_source_rules enable row level security;
alter table public.glassspider_runs enable row level security;
alter table public.glassspider_discovered_urls enable row level security;
alter table public.glassspider_raw_records enable row level security;
alter table public.glassspider_bid_records enable row level security;
alter table public.glassspider_classifications enable row level security;
alter table public.glassspider_saved_searches enable row level security;
alter table public.glassspider_exports enable row level security;

create policy "Glassspider viewers can read sources"
  on public.glassspider_sources for select
  to authenticated
  using (
    exists (
      select 1
      from public.projects p
      join public.project_access pa on pa.project_id = p.id
      where p.slug = 'glassspider'
        and pa.user_id = auth.uid()
        and pa.role in ('owner', 'admin', 'member', 'viewer', 'analyst', 'reviewer')
    )
  );

create policy "Glassspider admins can manage sources"
  on public.glassspider_sources for all
  to authenticated
  using (
    exists (
      select 1
      from public.projects p
      join public.project_access pa on pa.project_id = p.id
      where p.slug = 'glassspider'
        and pa.user_id = auth.uid()
        and pa.role in ('owner', 'admin')
    )
  )
  with check (
    exists (
      select 1
      from public.projects p
      join public.project_access pa on pa.project_id = p.id
      where p.slug = 'glassspider'
        and pa.user_id = auth.uid()
        and pa.role in ('owner', 'admin')
    )
  );

create policy "Glassspider viewers can read rules"
  on public.glassspider_source_rules for select
  to authenticated
  using (
    exists (
      select 1
      from public.projects p
      join public.project_access pa on pa.project_id = p.id
      where p.slug = 'glassspider'
        and pa.user_id = auth.uid()
        and pa.role in ('owner', 'admin', 'member', 'viewer', 'analyst', 'reviewer')
    )
  );

create policy "Glassspider admins can manage rules"
  on public.glassspider_source_rules for all
  to authenticated
  using (
    exists (
      select 1
      from public.projects p
      join public.project_access pa on pa.project_id = p.id
      where p.slug = 'glassspider'
        and pa.user_id = auth.uid()
        and pa.role in ('owner', 'admin')
    )
  )
  with check (
    exists (
      select 1
      from public.projects p
      join public.project_access pa on pa.project_id = p.id
      where p.slug = 'glassspider'
        and pa.user_id = auth.uid()
        and pa.role in ('owner', 'admin')
    )
  );

create policy "Glassspider viewers can read pipeline state"
  on public.glassspider_runs for select
  to authenticated
  using (
    exists (
      select 1
      from public.projects p
      join public.project_access pa on pa.project_id = p.id
      where p.slug = 'glassspider'
        and pa.user_id = auth.uid()
        and pa.role in ('owner', 'admin', 'member', 'viewer', 'analyst', 'reviewer')
    )
  );

create policy "Glassspider viewers can read discovered urls"
  on public.glassspider_discovered_urls for select
  to authenticated
  using (
    exists (
      select 1
      from public.projects p
      join public.project_access pa on pa.project_id = p.id
      where p.slug = 'glassspider'
        and pa.user_id = auth.uid()
        and pa.role in ('owner', 'admin', 'member', 'viewer', 'analyst', 'reviewer')
    )
  );

create policy "Glassspider viewers can read raw records"
  on public.glassspider_raw_records for select
  to authenticated
  using (
    exists (
      select 1
      from public.projects p
      join public.project_access pa on pa.project_id = p.id
      where p.slug = 'glassspider'
        and pa.user_id = auth.uid()
        and pa.role in ('owner', 'admin', 'member', 'viewer', 'analyst', 'reviewer')
    )
  );

create policy "Glassspider viewers can read bid records"
  on public.glassspider_bid_records for select
  to authenticated
  using (
    exists (
      select 1
      from public.projects p
      join public.project_access pa on pa.project_id = p.id
      where p.slug = 'glassspider'
        and pa.user_id = auth.uid()
        and pa.role in ('owner', 'admin', 'member', 'viewer', 'analyst', 'reviewer')
    )
  );

create policy "Glassspider viewers can read classifications"
  on public.glassspider_classifications for select
  to authenticated
  using (
    exists (
      select 1
      from public.projects p
      join public.project_access pa on pa.project_id = p.id
      where p.slug = 'glassspider'
        and pa.user_id = auth.uid()
        and pa.role in ('owner', 'admin', 'member', 'viewer', 'analyst', 'reviewer')
    )
  );

create policy "Glassspider users manage own saved searches"
  on public.glassspider_saved_searches for all
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "Glassspider users read own exports"
  on public.glassspider_exports for select
  to authenticated
  using (user_id = auth.uid());
