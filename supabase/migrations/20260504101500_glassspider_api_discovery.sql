alter table public.glassspider_sources
  drop constraint if exists glassspider_sources_fetch_mode_check;

update public.glassspider_sources
set fetch_mode = case fetch_mode
  when 'static' then 'static_html'
  when 'rendered' then 'rendered_html'
  when 'api' then 'declared_api'
  else fetch_mode
end
where fetch_mode in ('static', 'rendered', 'api');

alter table public.glassspider_sources
  add constraint glassspider_sources_fetch_mode_check
  check (fetch_mode in ('static_html', 'rendered_html', 'discovered_api', 'declared_api'));

create table if not exists public.glassspider_endpoint_candidates (
  id uuid primary key default gen_random_uuid(),
  source_id uuid references public.glassspider_sources(id) on delete set null,
  source_page_url text not null,
  endpoint_url text not null,
  method text not null default 'GET',
  content_type text,
  status_code integer,
  response_preview text,
  request_post_data jsonb,
  structure_profile jsonb not null default '{}'::jsonb,
  suggested_mapping jsonb not null default '{}'::jsonb,
  record_count_guess integer,
  confidence_score integer not null default 0,
  confidence_label text not null default 'low',
  discovery_method text not null default 'playwright_network_capture',
  discovery_metadata jsonb not null default '{}'::jsonb,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source_page_url, endpoint_url, method)
);

create index if not exists glassspider_endpoint_candidates_source_idx
  on public.glassspider_endpoint_candidates(source_id, created_at desc);
create index if not exists glassspider_endpoint_candidates_confidence_idx
  on public.glassspider_endpoint_candidates(confidence_score desc, created_at desc);

create trigger glassspider_endpoint_candidates_updated_at
before update on public.glassspider_endpoint_candidates
for each row execute function public.set_updated_at();

alter table public.glassspider_endpoint_candidates enable row level security;

create policy "Glassspider viewers can read endpoint candidates"
  on public.glassspider_endpoint_candidates for select
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

create policy "Glassspider admins can manage endpoint candidates"
  on public.glassspider_endpoint_candidates for all
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
