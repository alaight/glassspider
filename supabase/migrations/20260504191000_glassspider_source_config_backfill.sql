alter table public.glassspider_sources
  add column if not exists fetch_mode text not null default 'static_html',
  add column if not exists fetch_config jsonb not null default '{}'::jsonb,
  add column if not exists extraction_mapping jsonb not null default '{}'::jsonb,
  add column if not exists discovery_metadata jsonb not null default '{}'::jsonb;

update public.glassspider_sources
set fetch_mode = case fetch_mode
  when 'static' then 'static_html'
  when 'rendered' then 'rendered_html'
  when 'api' then 'declared_api'
  else fetch_mode
end
where fetch_mode in ('static', 'rendered', 'api');

alter table public.glassspider_sources
  drop constraint if exists glassspider_sources_fetch_mode_check;

alter table public.glassspider_sources
  add constraint glassspider_sources_fetch_mode_check
  check (fetch_mode in ('static_html', 'rendered_html', 'discovered_api', 'declared_api'));

notify pgrst, 'reload schema';
