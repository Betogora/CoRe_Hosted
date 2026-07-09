begin;

alter table public.decks
  add column if not exists revision integer not null default 1,
  add column if not exists deleted_at timestamptz,
  add column if not exists updated_by_device_id text;

alter table public.cards
  add column if not exists revision integer not null default 1,
  add column if not exists deleted_at timestamptz,
  add column if not exists updated_by_device_id text;

alter table public.card_variants
  add column if not exists revision integer not null default 1,
  add column if not exists deleted_at timestamptz,
  add column if not exists updated_by_device_id text;

alter table public.review_events
  add column if not exists created_by_device_id text;

alter table public.source_documents
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists revision integer not null default 1,
  add column if not exists deleted_at timestamptz,
  add column if not exists updated_by_device_id text;

alter table public.ai_jobs
  add column if not exists revision integer not null default 1,
  add column if not exists deleted_at timestamptz,
  add column if not exists updated_by_device_id text;

create table if not exists public.media_assets (
  id text,
  user_id uuid not null references auth.users(id) on delete cascade,
  deck_id text,
  card_id text,
  sha1 text not null,
  size bigint not null default 0,
  mime_type text not null default 'application/octet-stream',
  original_name text not null,
  storage_bucket text not null default 'core-media',
  storage_path text not null,
  source text not null default 'apkg-media',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  primary key (user_id, id),
  constraint media_assets_deck_owner_fk foreign key (deck_id, user_id) references public.decks (id, user_id) on delete cascade,
  constraint media_assets_card_owner_fk foreign key (card_id, user_id) references public.cards (id, user_id) on delete cascade
);

create index if not exists media_assets_user_id_idx on public.media_assets (user_id);
create index if not exists media_assets_sha1_idx on public.media_assets (sha1);
create unique index if not exists media_assets_storage_path_idx on public.media_assets (storage_bucket, storage_path);

create table if not exists public.sync_devices (
  id text,
  user_id uuid not null references auth.users(id) on delete cascade,
  label text not null default 'Browser',
  last_seen_at timestamptz not null default now(),
  user_agent text not null default '',
  created_at timestamptz not null default now(),
  primary key (user_id, id)
);

create table if not exists public.sync_conflicts (
  id text,
  user_id uuid not null references auth.users(id) on delete cascade,
  entity_table text not null,
  entity_id text not null,
  base_revision integer,
  local_revision integer,
  remote_revision integer,
  local_value jsonb not null default '{}'::jsonb,
  remote_value jsonb not null default '{}'::jsonb,
  status text not null default 'open' check (status in ('open', 'resolved', 'ignored')),
  resolution jsonb not null default '{}'::jsonb,
  updated_by_device_id text,
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  primary key (user_id, id)
);

create table if not exists public.admin_audit_events (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references auth.users(id) on delete set null,
  target_user_id uuid references auth.users(id) on delete set null,
  action text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.media_assets enable row level security;
alter table public.sync_devices enable row level security;
alter table public.sync_conflicts enable row level security;
alter table public.admin_audit_events enable row level security;

drop policy if exists "media_assets_owner_all" on public.media_assets;
create policy "media_assets_owner_all" on public.media_assets for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists "sync_devices_owner_all" on public.sync_devices;
create policy "sync_devices_owner_all" on public.sync_devices for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists "sync_conflicts_owner_all" on public.sync_conflicts;
create policy "sync_conflicts_owner_all" on public.sync_conflicts for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists "admin_audit_service_only" on public.admin_audit_events;
create policy "admin_audit_service_only" on public.admin_audit_events for all to service_role using (true) with check (true);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('core-media', 'core-media', false, 524288000, null)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "core_media_select_own" on storage.objects;
create policy "core_media_select_own" on storage.objects for select to authenticated
using (bucket_id = 'core-media' and (select auth.uid())::text = (storage.foldername(name))[1]);

drop policy if exists "core_media_insert_own" on storage.objects;
create policy "core_media_insert_own" on storage.objects for insert to authenticated
with check (bucket_id = 'core-media' and (select auth.uid())::text = (storage.foldername(name))[1]);

drop policy if exists "core_media_delete_own" on storage.objects;
create policy "core_media_delete_own" on storage.objects for delete to authenticated
using (bucket_id = 'core-media' and (select auth.uid())::text = (storage.foldername(name))[1]);

revoke all privileges on table
  public.media_assets,
  public.sync_devices,
  public.sync_conflicts,
  public.admin_audit_events
from anon;

grant usage on schema public to authenticated, service_role;
grant select, insert, update, delete on table
  public.media_assets,
  public.sync_devices,
  public.sync_conflicts
to authenticated;

grant all privileges on table
  public.media_assets,
  public.sync_devices,
  public.sync_conflicts,
  public.admin_audit_events
to service_role;

commit;
