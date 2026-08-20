begin;

create extension if not exists pgcrypto;

create sequence if not exists public.account_sync_change_id_seq as bigint;
alter sequence public.account_sync_change_id_seq restart with 1;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  display_name text,
  timezone text not null default 'Europe/Berlin',
  onboarding_complete boolean not null default false,
  scheduler_preferences jsonb not null default '{}'::jsonb,
  ui_preferences jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.decks (
  id text,
  user_id uuid not null references auth.users(id) on delete cascade,
  local_owner_id text,
  parent_deck_id text,
  name text not null,
  description text not null default '',
  source text not null check (source in ('anki-apkg', 'manual', 'text-import', 'csv-import', 'spreadsheet-import')),
  original_deck_id text,
  hierarchy_path text[] not null default '{}'::text[],
  card_count integer not null default 0,
  tags text[] not null default '{}'::text[],
  import_meta jsonb not null default '{}'::jsonb,
  deck_settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  sync_change_id bigint not null default 0 check (sync_change_id > 0),
  revision integer not null default 1,
  deleted_at timestamptz,
  updated_by_device_id text,
  primary key (user_id, id)
);

create unique index decks_id_user_id_idx on public.decks (id, user_id);
create index decks_user_id_idx on public.decks (user_id);
comment on table public.decks is 'Accountgebundene, implizit private CoRe-Kartenstapel.';

create table public.note_type_definitions (
  id text,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  definition jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  sync_change_id bigint not null default 0 check (sync_change_id > 0),
  revision integer not null default 1 check (revision >= 1),
  deleted_at timestamptz,
  updated_by_device_id text,
  primary key (user_id, id)
);

create unique index note_type_definitions_id_user_id_idx on public.note_type_definitions (id, user_id);
create index note_type_definitions_user_id_idx on public.note_type_definitions (user_id);

create table public.cards (
  id text,
  user_id uuid not null references auth.users(id) on delete cascade,
  deck_id text not null,
  source text not null check (source in ('anki-apkg', 'manual', 'text-import', 'csv-import', 'spreadsheet-import')),
  source_card_id text,
  kind text not null check (kind in ('basic', 'basic-with-images', 'basic-reversed', 'cloze', 'image-occlusion', 'single-choice', 'multiple-choice', 'free-text', 'multi-field', 'case-vignette')),
  note_type_definition_id text,
  content_document jsonb not null default '{}'::jsonb,
  projection jsonb not null default '{}'::jsonb,
  content_revision integer not null default 1 check (content_revision >= 1),
  draft_status text not null default 'accepted',
  status text not null default 'active',
  original_front text not null default '',
  original_back text not null default '',
  original_fields jsonb not null default '[]'::jsonb,
  original_tags text[] not null default '{}'::text[],
  original_html text not null default '',
  media_refs text[] not null default '{}'::text[],
  content_hash text,
  review_state jsonb not null default '{}'::jsonb,
  core_state jsonb not null default '{}'::jsonb,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  sync_change_id bigint not null default 0 check (sync_change_id > 0),
  revision integer not null default 1,
  deleted_at timestamptz,
  updated_by_device_id text,
  primary key (id),
  constraint cards_deck_owner_fk foreign key (deck_id, user_id) references public.decks (id, user_id) on delete cascade,
  constraint cards_note_type_definition_owner_fk foreign key (note_type_definition_id, user_id) references public.note_type_definitions (id, user_id)
);

create unique index cards_id_user_id_idx on public.cards (id, user_id);
create unique index cards_id_deck_id_user_id_idx on public.cards (id, deck_id, user_id);
create index cards_user_id_idx on public.cards (user_id);
create index cards_deck_id_idx on public.cards (deck_id);
create index cards_note_type_definition_id_idx on public.cards (note_type_definition_id);
create table public.card_variants (
  id text,
  user_id uuid not null references auth.users(id) on delete cascade,
  card_id text not null,
  front text not null default '',
  back text not null default '',
  variant_type text not null default 'basic' check (variant_type = 'basic'),
  variant_level integer not null default 2 check (variant_level between 1 and 3),
  is_active boolean not null default true,
  transform_type text not null default 'rephrase' check (transform_type = 'rephrase'),
  transform_profile jsonb not null default '{}'::jsonb,
  model_run_id text,
  explanation text not null default '',
  confidence numeric,
  semantic_delta text,
  changed_recognition_cues text[] not null default '{}'::text[],
  quality_status text not null default 'active' check (quality_status in ('draft', 'active', 'rejected', 'flagged', 'disabled')),
  content_hash text,
  performance jsonb not null default '{}'::jsonb,
  feedback jsonb not null default '[]'::jsonb,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  sync_change_id bigint not null default 0 check (sync_change_id > 0),
  revision integer not null default 1,
  deleted_at timestamptz,
  updated_by_device_id text,
  primary key (user_id, id),
  constraint card_variants_card_owner_fk foreign key (card_id, user_id) references public.cards (id, user_id) on delete cascade
);

create index card_variants_user_id_idx on public.card_variants (user_id);
create index card_variants_card_id_idx on public.card_variants (card_id);
create unique index card_variants_id_user_id_idx on public.card_variants (id, user_id);
create table public.review_events (
  id text,
  user_id uuid not null references auth.users(id) on delete cascade,
  deck_id text not null,
  reviewable_type text not null check (reviewable_type in ('card', 'variant')),
  reviewable_id text not null,
  source_card_id text,
  rating text not null check (rating in ('again', 'hard', 'good', 'easy', 'manual')),
  answered_at timestamptz not null default now(),
  response_time_ms integer,
  scheduler_before jsonb,
  scheduler_after jsonb,
  flags jsonb not null default '{}'::jsonb,
  statistics_day date not null default current_date,
  statistics_hour smallint not null default 0 check (statistics_hour between 0 and 23),
  statistics_category text not null default 'learning' check (statistics_category in ('learning', 'relearning', 'young', 'mature')),
  statistics_interval_days numeric not null default 0 check (statistics_interval_days >= 0),
  retention_first boolean not null default false,
  created_at timestamptz not null default now(),
  sync_change_id bigint not null default 0 check (sync_change_id > 0),
  created_by_device_id text,
  primary key (user_id, id),
  constraint review_events_deck_owner_fk foreign key (deck_id, user_id) references public.decks (id, user_id) on delete cascade
);

create index review_events_user_id_idx on public.review_events (user_id);
create index review_events_deck_id_idx on public.review_events (deck_id);
create index review_events_answered_at_idx on public.review_events (answered_at desc);
create unique index review_events_id_user_id_idx on public.review_events (id, user_id);
create index review_events_user_reviewable_statistics_idx
  on public.review_events (user_id, reviewable_id, statistics_day, answered_at, id)
  where statistics_interval_days >= 1;

create table public.review_statistics_daily (
  user_id uuid not null references auth.users(id) on delete cascade,
  deck_id text not null,
  day_key date not null,
  review_count integer not null default 0 check (review_count >= 0),
  learning_count integer not null default 0 check (learning_count >= 0),
  relearning_count integer not null default 0 check (relearning_count >= 0),
  young_count integer not null default 0 check (young_count >= 0),
  mature_count integer not null default 0 check (mature_count >= 0),
  successful_count integer not null default 0 check (successful_count >= 0),
  timed_count integer not null default 0 check (timed_count >= 0),
  duration_ms bigint not null default 0 check (duration_ms >= 0),
  duration_learning_ms bigint not null default 0 check (duration_learning_ms >= 0),
  duration_relearning_ms bigint not null default 0 check (duration_relearning_ms >= 0),
  duration_young_ms bigint not null default 0 check (duration_young_ms >= 0),
  duration_mature_ms bigint not null default 0 check (duration_mature_ms >= 0),
  retention_young_count integer not null default 0 check (retention_young_count >= 0),
  retention_young_remembered integer not null default 0 check (retention_young_remembered >= 0),
  retention_mature_count integer not null default 0 check (retention_mature_count >= 0),
  retention_mature_remembered integer not null default 0 check (retention_mature_remembered >= 0),
  hourly_reviews jsonb not null default '{}'::jsonb,
  hourly_successful jsonb not null default '{}'::jsonb,
  rating_counts jsonb not null default '{}'::jsonb,
  primary key (user_id, deck_id, day_key),
  constraint review_statistics_daily_deck_owner_fk foreign key (deck_id, user_id)
    references public.decks (id, user_id) on delete cascade
);

create index review_statistics_daily_user_day_deck_idx
  on public.review_statistics_daily (user_id, day_key, deck_id);

create table public.media_assets (
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
  constraint media_assets_card_deck_owner_fk foreign key (card_id, deck_id, user_id) references public.cards (id, deck_id, user_id) on delete cascade
);

create index media_assets_user_id_idx on public.media_assets (user_id);
create index media_assets_sha1_idx on public.media_assets (sha1);
create index media_assets_storage_path_idx on public.media_assets (storage_bucket, storage_path);
create unique index media_assets_active_reference_idx on public.media_assets (user_id, storage_bucket, deck_id, coalesce(card_id, ''), sha1) where deleted_at is null;

create table public.sync_devices (
  id text,
  user_id uuid not null references auth.users(id) on delete cascade,
  label text not null default 'Browser',
  last_seen_at timestamptz not null default now(),
  user_agent text not null default '',
  created_at timestamptz not null default now(),
  primary key (user_id, id)
);

create table public.sync_conflicts (
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
create unique index sync_conflicts_one_active_entity_idx
  on public.sync_conflicts (user_id, entity_table, entity_id)
  where status in ('open', 'ignored');

alter table public.profiles enable row level security;
alter table public.decks enable row level security;
alter table public.note_type_definitions enable row level security;
alter table public.cards enable row level security;
alter table public.card_variants enable row level security;
alter table public.review_events enable row level security;
alter table public.review_statistics_daily enable row level security;
alter table public.media_assets enable row level security;
alter table public.sync_devices enable row level security;
alter table public.sync_conflicts enable row level security;

create policy "profiles_select_own" on public.profiles for select to authenticated using ((select auth.uid()) = id);
create policy "profiles_insert_own" on public.profiles for insert to authenticated with check ((select auth.uid()) = id);
create policy "profiles_update_own" on public.profiles for update to authenticated using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

create policy "decks_owner_all" on public.decks for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create policy "note_type_definitions_owner_all" on public.note_type_definitions for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create policy "cards_owner_all" on public.cards for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create policy "card_variants_owner_all" on public.card_variants for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create policy "review_events_owner_all" on public.review_events for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create policy "review_statistics_daily_owner_select" on public.review_statistics_daily
  for select to authenticated using ((select auth.uid()) = user_id);

create policy "media_assets_owner_all" on public.media_assets for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create policy "sync_devices_owner_all" on public.sync_devices for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create policy "sync_conflicts_owner_all" on public.sync_conflicts for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('core-media', 'core-media', false, 524288000, null)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "core_media_select_own" on storage.objects for select to authenticated
using (bucket_id = 'core-media' and (select auth.uid())::text = (storage.foldername(name))[1]);

create policy "core_media_insert_own" on storage.objects for insert to authenticated
with check (bucket_id = 'core-media' and (select auth.uid())::text = (storage.foldername(name))[1]);

create policy "core_media_delete_own" on storage.objects for delete to authenticated
using (bucket_id = 'core-media' and (select auth.uid())::text = (storage.foldername(name))[1]);

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create or replace function private.stamp_account_sync_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and new.user_id is distinct from old.user_id then
    raise exception 'Account-Zuordnung darf nicht geändert werden.' using errcode = '23514';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(new.user_id::text, 1129270853));
  new.sync_change_id := pg_catalog.nextval('public.account_sync_change_id_seq'::regclass);
  return new;
end
$$;

revoke all on function private.stamp_account_sync_change() from public, anon, authenticated;

create or replace function private.prepare_review_statistics()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  profile_time_zone text := 'UTC';
  profile_day_start integer := 0;
  previous_first public.review_events%rowtype;
begin
  if new.rating = 'manual' then
    new.retention_first := false;
    return new;
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(new.user_id::text, 1129270853));
  select
    coalesce(profile_row.timezone, 'UTC'),
    least(greatest(case
      when profile_row.scheduler_preferences->>'dayStartHour' ~ '^\d{1,2}$'
        then (profile_row.scheduler_preferences->>'dayStartHour')::integer
      else 0
    end, 0), 23)
  into profile_time_zone, profile_day_start
  from (select 1) as singleton
  left join public.profiles as profile_row on profile_row.id = new.user_id;

  new.statistics_day := ((new.answered_at at time zone profile_time_zone)
    - pg_catalog.make_interval(hours => profile_day_start))::date;
  new.statistics_hour := extract(hour from new.answered_at at time zone profile_time_zone)::integer;
  new.statistics_interval_days := case
    when pg_catalog.jsonb_typeof(new.scheduler_before->'card'->'intervalDays') = 'number'
      then greatest((new.scheduler_before->'card'->>'intervalDays')::numeric, 0)
    when pg_catalog.jsonb_typeof(new.scheduler_before->'intervalDays') = 'number'
      then greatest((new.scheduler_before->>'intervalDays')::numeric, 0)
    else 0
  end;
  new.statistics_category := case
    when coalesce(new.scheduler_before->'card'->>'state', new.scheduler_before->>'state', 'new') in ('new', 'learning') then 'learning'
    when coalesce(new.scheduler_before->'card'->>'state', new.scheduler_before->>'state', 'new') = 'relearning' then 'relearning'
    when new.statistics_interval_days >= 21 then 'mature'
    else 'young'
  end;
  new.retention_first := false;

  if new.statistics_interval_days >= 1 then
    select * into previous_first
    from public.review_events as review_row
    where review_row.user_id = new.user_id
      and review_row.reviewable_id = new.reviewable_id
      and review_row.statistics_day = new.statistics_day
      and review_row.retention_first
    order by review_row.answered_at, review_row.id
    limit 1
    for update;

    if previous_first.id is null then
      new.retention_first := true;
    elsif (new.answered_at, new.id) < (previous_first.answered_at, previous_first.id) then
      update public.review_events
      set retention_first = false
      where user_id = previous_first.user_id and id = previous_first.id;
      new.retention_first := true;
    end if;
  end if;
  return new;
end
$$;

revoke all on function private.prepare_review_statistics() from public, anon, authenticated, service_role;

create or replace function private.sync_review_statistics_daily()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  event_row public.review_events%rowtype := case when tg_op = 'DELETE' then old else new end;
  review_delta integer := case when tg_op = 'INSERT' then 1 when tg_op = 'DELETE' then -1 else 0 end;
  retention_delta integer := case
    when tg_op = 'INSERT' and new.retention_first then 1
    when tg_op = 'DELETE' and old.retention_first then -1
    when tg_op = 'UPDATE' and old.retention_first is distinct from new.retention_first then case when new.retention_first then 1 else -1 end
    else 0
  end;
  duration_value integer := case when event_row.response_time_ms is null then 0 else greatest(0, least(event_row.response_time_ms, 60000)) end;
  successful_delta integer := review_delta * case when event_row.rating <> 'again' then 1 else 0 end;
  timed_delta integer := review_delta * case when event_row.response_time_ms is not null then 1 else 0 end;
  hour_key text := event_row.statistics_hour::text;
  rating_key text := event_row.statistics_category || ':' || event_row.rating;
begin
  if event_row.rating = 'manual' then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;
  insert into public.review_statistics_daily (user_id, deck_id, day_key)
  values (event_row.user_id, event_row.deck_id, event_row.statistics_day)
  on conflict (user_id, deck_id, day_key) do nothing;

  update public.review_statistics_daily
  set review_count = greatest(review_count + review_delta, 0),
    learning_count = greatest(learning_count + review_delta * case when event_row.statistics_category = 'learning' then 1 else 0 end, 0),
    relearning_count = greatest(relearning_count + review_delta * case when event_row.statistics_category = 'relearning' then 1 else 0 end, 0),
    young_count = greatest(young_count + review_delta * case when event_row.statistics_category = 'young' then 1 else 0 end, 0),
    mature_count = greatest(mature_count + review_delta * case when event_row.statistics_category = 'mature' then 1 else 0 end, 0),
    successful_count = greatest(successful_count + successful_delta, 0),
    timed_count = greatest(timed_count + timed_delta, 0),
    duration_ms = greatest(duration_ms + review_delta * duration_value, 0),
    duration_learning_ms = greatest(duration_learning_ms + review_delta * duration_value * case when event_row.statistics_category = 'learning' then 1 else 0 end, 0),
    duration_relearning_ms = greatest(duration_relearning_ms + review_delta * duration_value * case when event_row.statistics_category = 'relearning' then 1 else 0 end, 0),
    duration_young_ms = greatest(duration_young_ms + review_delta * duration_value * case when event_row.statistics_category = 'young' then 1 else 0 end, 0),
    duration_mature_ms = greatest(duration_mature_ms + review_delta * duration_value * case when event_row.statistics_category = 'mature' then 1 else 0 end, 0),
    retention_young_count = greatest(retention_young_count + retention_delta * case when event_row.statistics_category = 'young' then 1 else 0 end, 0),
    retention_young_remembered = greatest(retention_young_remembered + retention_delta * case when event_row.statistics_category = 'young' and event_row.rating <> 'again' then 1 else 0 end, 0),
    retention_mature_count = greatest(retention_mature_count + retention_delta * case when event_row.statistics_category = 'mature' then 1 else 0 end, 0),
    retention_mature_remembered = greatest(retention_mature_remembered + retention_delta * case when event_row.statistics_category = 'mature' and event_row.rating <> 'again' then 1 else 0 end, 0),
    hourly_reviews = pg_catalog.jsonb_set(hourly_reviews, array[hour_key], pg_catalog.to_jsonb(greatest(coalesce((hourly_reviews->>hour_key)::integer, 0) + review_delta, 0)), true),
    hourly_successful = pg_catalog.jsonb_set(hourly_successful, array[hour_key], pg_catalog.to_jsonb(greatest(coalesce((hourly_successful->>hour_key)::integer, 0) + successful_delta, 0)), true),
    rating_counts = pg_catalog.jsonb_set(rating_counts, array[rating_key], pg_catalog.to_jsonb(greatest(coalesce((rating_counts->>rating_key)::integer, 0) + review_delta, 0)), true)
  where user_id = event_row.user_id and deck_id = event_row.deck_id and day_key = event_row.statistics_day;

  delete from public.review_statistics_daily
  where user_id = event_row.user_id and deck_id = event_row.deck_id
    and day_key = event_row.statistics_day and review_count = 0
    and retention_young_count = 0 and retention_mature_count = 0;

  if tg_op = 'DELETE' and old.retention_first then
    update public.review_events
    set retention_first = true
    where (user_id, id) = (
      select review_row.user_id, review_row.id
      from public.review_events as review_row
      where review_row.user_id = old.user_id
        and review_row.reviewable_id = old.reviewable_id
        and review_row.statistics_day = old.statistics_day
        and review_row.statistics_interval_days >= 1
      order by review_row.answered_at, review_row.id
      limit 1
    );
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end
$$;

revoke all on function private.sync_review_statistics_daily() from public, anon, authenticated, service_role;

create trigger decks_stamp_account_sync_change before insert or update on public.decks
  for each row execute function private.stamp_account_sync_change();
create trigger note_type_definitions_stamp_account_sync_change before insert or update on public.note_type_definitions
  for each row execute function private.stamp_account_sync_change();
create trigger cards_stamp_account_sync_change before insert or update on public.cards
  for each row execute function private.stamp_account_sync_change();
create trigger card_variants_stamp_account_sync_change before insert or update on public.card_variants
  for each row execute function private.stamp_account_sync_change();
create trigger review_events_stamp_account_sync_change before insert or update on public.review_events
  for each row execute function private.stamp_account_sync_change();
create trigger review_events_prepare_statistics before insert on public.review_events
  for each row execute function private.prepare_review_statistics();
create trigger review_events_sync_statistics after insert or delete or update of retention_first on public.review_events
  for each row execute function private.sync_review_statistics_daily();

create index decks_user_updated_id_idx
  on public.decks (user_id, updated_at, id);
create index note_type_definitions_user_updated_id_idx
  on public.note_type_definitions (user_id, updated_at, id);
create index cards_user_updated_id_idx
  on public.cards (user_id, updated_at, id);
create index card_variants_user_updated_id_idx
  on public.card_variants (user_id, updated_at, id);
create index review_events_user_answered_id_idx
  on public.review_events (user_id, answered_at, id);
create index decks_user_sync_change_id_idx
  on public.decks (user_id, sync_change_id, id);
create index note_type_definitions_user_sync_change_id_idx
  on public.note_type_definitions (user_id, sync_change_id, id);
create index cards_user_sync_change_id_idx
  on public.cards (user_id, sync_change_id, id);
create index card_variants_user_sync_change_id_idx
  on public.card_variants (user_id, sync_change_id, id);
create index review_events_user_sync_change_id_idx
  on public.review_events (user_id, sync_change_id, id);

create or replace function public.record_review_atomic(
  p_deck_id text,
  p_card_id text,
  p_card_review_state jsonb,
  p_card_core_state jsonb,
  p_card_updated_at timestamptz,
  p_variant_id text,
  p_variant_performance jsonb,
  p_variant_updated_at timestamptz,
  p_event jsonb,
  p_device_id text
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  event_id text := p_event->>'id';
  persisted_deck public.decks%rowtype;
  persisted_card public.cards%rowtype;
  persisted_variant public.card_variants%rowtype;
  persisted_event public.review_events%rowtype;
begin
  if current_user_id is null then
    raise exception 'Authentifizierung erforderlich.' using errcode = '42501';
  end if;
  if event_id is null or event_id = '' or p_device_id is null or p_device_id = '' then
    raise exception 'Review-Mutation ist unvollständig.' using errcode = '22023';
  end if;

  select * into persisted_event
  from public.review_events
  where user_id = current_user_id and id = event_id;

  if persisted_event.id is not null then
    if persisted_event.deck_id is distinct from p_deck_id
      or persisted_event.reviewable_type is distinct from p_event->>'reviewable_type'
      or persisted_event.reviewable_id is distinct from p_event->>'reviewable_id'
      or persisted_event.rating is distinct from p_event->>'rating'
      or persisted_event.answered_at is distinct from (p_event->>'answered_at')::timestamptz then
      raise exception 'Review-Event-ID kollidiert mit einer anderen Mutation.' using errcode = '23505';
    end if;
    select * into persisted_deck from public.decks where user_id = current_user_id and id = p_deck_id;
    select * into persisted_card from public.cards where user_id = current_user_id and id = p_card_id;
    if p_variant_id is not null then
      select * into persisted_variant from public.card_variants where user_id = current_user_id and id = p_variant_id;
    end if;
    return jsonb_build_object(
      'deck', to_jsonb(persisted_deck),
      'card', to_jsonb(persisted_card),
      'variant', case when p_variant_id is null then null else to_jsonb(persisted_variant) end,
      'event', to_jsonb(persisted_event),
      'idempotent', true
    );
  end if;

  select * into persisted_deck
  from public.decks
  where user_id = current_user_id and id = p_deck_id and deleted_at is null;
  if persisted_deck.id is null then
    raise exception 'Stapel wurde nicht gefunden.' using errcode = 'P0002';
  end if;

  select * into persisted_card
  from public.cards
  where user_id = current_user_id and id = p_card_id and deck_id = p_deck_id and deleted_at is null
  for update;
  if persisted_card.id is null then
    raise exception 'Karte wurde nicht gefunden.' using errcode = 'P0002';
  end if;

  if p_variant_id is not null then
    select * into persisted_variant
    from public.card_variants
    where user_id = current_user_id and id = p_variant_id and card_id = p_card_id and deleted_at is null
    for update;
    if persisted_variant.id is null then
      raise exception 'Variante wurde nicht gefunden.' using errcode = 'P0002';
    end if;
  end if;

  insert into public.review_events (
    id, user_id, deck_id, reviewable_type, reviewable_id, source_card_id, rating,
    answered_at, response_time_ms, scheduler_before, scheduler_after, flags,
    created_at, created_by_device_id
  ) values (
    event_id,
    current_user_id,
    p_deck_id,
    p_event->>'reviewable_type',
    p_event->>'reviewable_id',
    nullif(p_event->>'source_card_id', ''),
    p_event->>'rating',
    (p_event->>'answered_at')::timestamptz,
    nullif(p_event->>'response_time_ms', '')::integer,
    p_event->'scheduler_before',
    p_event->'scheduler_after',
    coalesce(p_event->'flags', '{}'::jsonb),
    coalesce((p_event->>'created_at')::timestamptz, (p_event->>'answered_at')::timestamptz, now()),
    p_device_id
  )
  on conflict (user_id, id) do nothing
  returning * into persisted_event;
  if persisted_event.id is null then
    select * into persisted_event from public.review_events where user_id = current_user_id and id = event_id;
    if persisted_event.deck_id is distinct from p_deck_id
      or persisted_event.reviewable_type is distinct from p_event->>'reviewable_type'
      or persisted_event.reviewable_id is distinct from p_event->>'reviewable_id'
      or persisted_event.rating is distinct from p_event->>'rating'
      or persisted_event.answered_at is distinct from (p_event->>'answered_at')::timestamptz then
      raise exception 'Review-Event-ID kollidiert mit einer anderen Mutation.' using errcode = '23505';
    end if;
    return jsonb_build_object(
      'deck', to_jsonb(persisted_deck),
      'card', to_jsonb(persisted_card),
      'variant', case when p_variant_id is null then null else to_jsonb(persisted_variant) end,
      'event', to_jsonb(persisted_event),
      'idempotent', true
    );
  end if;

  update public.cards
  set review_state = coalesce(p_card_review_state, '{}'::jsonb),
      core_state = coalesce(p_card_core_state, '{}'::jsonb),
      updated_at = coalesce(p_card_updated_at, now()),
      updated_by_device_id = p_device_id
  where user_id = current_user_id
    and id = p_card_id
    and deck_id = p_deck_id
    and deleted_at is null
    and not exists (
      select 1 from public.review_events as candidate
      where candidate.user_id = current_user_id
        and candidate.id <> event_id
        and (candidate.source_card_id = p_card_id
          or (candidate.reviewable_type = 'card' and candidate.reviewable_id = p_card_id))
        and (candidate.answered_at, candidate.id) > ((p_event->>'answered_at')::timestamptz, event_id)
    )
  returning * into persisted_card;
  if persisted_card.id is null then
    select * into persisted_card from public.cards where user_id = current_user_id and id = p_card_id;
  end if;

  if p_variant_id is not null then
    update public.card_variants
    set performance = coalesce(p_variant_performance, '{}'::jsonb),
        updated_at = coalesce(p_variant_updated_at, p_card_updated_at, now()),
        updated_by_device_id = p_device_id
    where user_id = current_user_id
      and id = p_variant_id
      and card_id = p_card_id
      and deleted_at is null
      and not exists (
        select 1 from public.review_events as candidate
        where candidate.user_id = current_user_id
          and candidate.id <> event_id
          and candidate.reviewable_id = p_variant_id
          and (candidate.answered_at, candidate.id) > ((p_event->>'answered_at')::timestamptz, event_id)
      )
    returning * into persisted_variant;
    if persisted_variant.id is null then
      select * into persisted_variant from public.card_variants where user_id = current_user_id and id = p_variant_id;
    end if;
  end if;

  return jsonb_build_object(
    'deck', to_jsonb(persisted_deck),
    'card', to_jsonb(persisted_card),
    'variant', case when p_variant_id is null then null else to_jsonb(persisted_variant) end,
    'event', to_jsonb(persisted_event),
    'idempotent', false
  );
end
$$;

revoke all on function public.record_review_atomic(
  text, text, jsonb, jsonb, timestamptz,
  text, jsonb, timestamptz, jsonb, text
) from public, anon;
grant execute on function public.record_review_atomic(
  text, text, jsonb, jsonb, timestamptz,
  text, jsonb, timestamptz, jsonb, text
) to authenticated, service_role;


revoke all privileges on table
  public.profiles,
  public.decks,
  public.note_type_definitions,
  public.cards,
  public.card_variants,
  public.review_events,
  public.review_statistics_daily,
  public.media_assets,
  public.sync_devices,
  public.sync_conflicts
from anon;

alter default privileges for role postgres in schema public
  revoke select, insert, update, delete on tables from anon, authenticated, service_role;

alter default privileges for role postgres in schema public
  revoke usage, select on sequences from anon, authenticated, service_role;

alter default privileges for role postgres in schema public
  revoke execute on functions from anon, authenticated, service_role, public;

grant usage on schema public to authenticated, service_role;
grant select, insert, update, delete on table
  public.profiles,
  public.decks,
  public.note_type_definitions,
  public.cards,
  public.card_variants,
  public.review_events,
  public.media_assets,
  public.sync_devices,
  public.sync_conflicts
to authenticated;

grant select on table public.review_statistics_daily to authenticated;

grant all privileges on table
  public.profiles,
  public.decks,
  public.note_type_definitions,
  public.cards,
  public.card_variants,
  public.review_events,
  public.review_statistics_daily,
  public.media_assets,
  public.sync_devices,
  public.sync_conflicts
to service_role;

create table public.card_catalog (
  id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  deck_id text not null,
  front_preview text not null default '',
  normalized_search_text text not null default '',
  sort_text text not null default '',
  due_at timestamptz,
  schedule_state text not null default 'new',
  maturity_band text not null default 'new',
  reviewable boolean not null default true,
  has_active_variants boolean not null default false,
  active_variant_count integer not null default 0 check (active_variant_count >= 0),
  active_variant_id text,
  interval_days numeric not null default 0 check (interval_days >= 0),
  difficulty numeric not null default 0 check (difficulty >= 0),
  stability numeric not null default 0 check (stability >= 0),
  last_reviewed_at timestamptz,
  body_revision integer not null default 1 check (body_revision >= 1),
  dependency_revision integer not null default 1 check (dependency_revision >= 1),
  sync_change_id bigint not null check (sync_change_id > 0),
  deleted_at timestamptz,
  created_at timestamptz not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, id),
  constraint card_catalog_card_owner_fk foreign key (id, user_id)
    references public.cards (id, user_id) on delete cascade,
  constraint card_catalog_deck_owner_fk foreign key (deck_id, user_id)
    references public.decks (id, user_id) on delete cascade
);

create table public.deck_study_summaries (
  user_id uuid not null references auth.users(id) on delete cascade,
  deck_id text not null,
  total_count integer not null default 0 check (total_count >= 0),
  new_count integer not null default 0 check (new_count >= 0),
  learning_count integer not null default 0 check (learning_count >= 0),
  mature_count integer not null default 0 check (mature_count >= 0),
  suspended_count integer not null default 0 check (suspended_count >= 0),
  active_variant_count integer not null default 0 check (active_variant_count >= 0),
  sync_change_id bigint not null check (sync_change_id > 0),
  deleted_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (user_id, deck_id),
  constraint deck_study_summaries_deck_owner_fk foreign key (deck_id, user_id)
    references public.decks (id, user_id) on delete cascade
);

alter table public.card_catalog enable row level security;
alter table public.deck_study_summaries enable row level security;

create policy "card_catalog_owner_select" on public.card_catalog
  for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "deck_study_summaries_owner_select" on public.deck_study_summaries
  for select to authenticated
  using ((select auth.uid()) = user_id);

create index card_catalog_user_sync_change_id_idx
  on public.card_catalog (user_id, sync_change_id, id);
create index card_catalog_active_deck_sort_idx
  on public.card_catalog (user_id, deck_id, sort_text, id)
  where deleted_at is null;
create index card_catalog_active_deck_review_due_idx
  on public.card_catalog (user_id, deck_id, reviewable, schedule_state, due_at, id)
  where deleted_at is null;
create index card_catalog_active_deck_due_idx
  on public.card_catalog (user_id, deck_id, (coalesce(due_at, 'infinity'::timestamptz)), id)
  where deleted_at is null;
create index card_catalog_active_deck_variants_idx
  on public.card_catalog (user_id, deck_id, has_active_variants, id)
  where deleted_at is null;
create index deck_study_summaries_user_sync_change_id_idx
  on public.deck_study_summaries (user_id, sync_change_id, deck_id);

create or replace function private.try_timestamptz(p_value text)
returns timestamptz
language plpgsql
stable
set search_path = ''
as $$
begin
  if p_value is null or p_value = '' then return null; end if;
  return p_value::timestamptz;
exception when others then
  return null;
end
$$;

revoke all on function private.try_timestamptz(text) from public, anon, authenticated, service_role;

create or replace function private.refresh_card_catalog(p_user_id uuid, p_card_id text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  card_row public.cards%rowtype;
  variant_row public.card_variants%rowtype;
  definition_revision integer := 1;
  projected_review_state jsonb;
  projected_front text;
  projected_back text;
  projected_meta jsonb;
  projected_active_variant_count integer := 0;
begin
  select * into card_row
  from public.cards
  where user_id = p_user_id and id = p_card_id;

  if card_row.id is null then
    delete from public.card_catalog where user_id = p_user_id and id = p_card_id;
    return;
  end if;

  select * into variant_row
  from public.card_variants
  where user_id = p_user_id
    and card_id = p_card_id
    and deleted_at is null
    and is_active = true
    and quality_status = 'active'
  order by updated_at desc, id
  limit 1;

  select count(*)::integer into projected_active_variant_count
  from public.card_variants as candidate
  where candidate.user_id = p_user_id
    and candidate.card_id = p_card_id
    and candidate.deleted_at is null
    and candidate.is_active = true
    and candidate.quality_status = 'active';

  if card_row.note_type_definition_id is not null then
    select coalesce(revision, 1) into definition_revision
    from public.note_type_definitions
    where user_id = p_user_id and id = card_row.note_type_definition_id;
    definition_revision := coalesce(definition_revision, 1);
  end if;

  projected_review_state := coalesce(card_row.review_state, '{}'::jsonb);
  projected_front := coalesce(nullif(card_row.original_front, ''), card_row.meta #>> '{__coreModel,title}', '');
  projected_back := coalesce(nullif(card_row.original_back, ''), card_row.meta #>> '{__coreModel,canonicalAnswer}', '');
  projected_meta := coalesce(card_row.meta, '{}'::jsonb);

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user_id::text, 1129270853));
  insert into public.card_catalog (
    id, user_id, deck_id, front_preview, normalized_search_text, sort_text,
    due_at, schedule_state, maturity_band, reviewable, has_active_variants, active_variant_count,
    active_variant_id, interval_days, difficulty, stability, last_reviewed_at,
    body_revision, dependency_revision, sync_change_id,
    deleted_at, created_at, updated_at
  ) values (
    card_row.id,
    card_row.user_id,
    card_row.deck_id,
    left(pg_catalog.regexp_replace(projected_front, '<[^>]*>', ' ', 'g'), 240),
    left(lower(pg_catalog.concat_ws(' ',
      pg_catalog.regexp_replace(projected_front, '<[^>]*>', ' ', 'g'),
      pg_catalog.regexp_replace(projected_back, '<[^>]*>', ' ', 'g'),
      projected_meta #>> '{__coreModel,title}',
      projected_meta #>> '{__coreModel,canonicalQuestion}',
      projected_meta #>> '{__coreModel,canonicalAnswer}',
      pg_catalog.array_to_string(card_row.original_tags, ' ')
    )), 2000),
    left(lower(pg_catalog.regexp_replace(projected_front, '<[^>]*>', ' ', 'g')), 512),
    private.try_timestamptz(projected_review_state->>'dueAt'),
    coalesce(nullif(projected_review_state->>'state', ''), 'new'),
    coalesce(nullif(projected_review_state->>'maturityBand', ''), 'new'),
    card_row.deleted_at is null
      and card_row.status not in ('deleted', 'suspended', 'buried')
      and card_row.draft_status <> 'draft'
      and lower(coalesce(projected_meta->>'suspended', 'false')) <> 'true'
      and lower(coalesce(projected_meta->>'buried', 'false')) <> 'true',
    projected_active_variant_count > 0,
    projected_active_variant_count,
    variant_row.id,
    case when pg_catalog.jsonb_typeof(projected_review_state->'intervalDays') = 'number'
      then greatest((projected_review_state->>'intervalDays')::numeric, 0) else 0 end,
    case when pg_catalog.jsonb_typeof(projected_review_state->'difficulty') = 'number'
      then greatest((projected_review_state->>'difficulty')::numeric, 0) else 0 end,
    case when pg_catalog.jsonb_typeof(projected_review_state->'stability') = 'number'
      then greatest((projected_review_state->>'stability')::numeric, 0) else 0 end,
    private.try_timestamptz(projected_review_state->>'lastReviewedAt'),
    greatest(coalesce(card_row.revision, 1), coalesce(card_row.content_revision, 1)),
    greatest(coalesce(variant_row.revision, 1), definition_revision),
    pg_catalog.nextval('public.account_sync_change_id_seq'::regclass),
    card_row.deleted_at,
    card_row.created_at,
    greatest(card_row.updated_at, coalesce(variant_row.updated_at, card_row.updated_at))
  )
  on conflict (user_id, id) do update set
    deck_id = excluded.deck_id,
    front_preview = excluded.front_preview,
    normalized_search_text = excluded.normalized_search_text,
    sort_text = excluded.sort_text,
    due_at = excluded.due_at,
    schedule_state = excluded.schedule_state,
    maturity_band = excluded.maturity_band,
    reviewable = excluded.reviewable,
    has_active_variants = excluded.has_active_variants,
    active_variant_count = excluded.active_variant_count,
    active_variant_id = excluded.active_variant_id,
    interval_days = excluded.interval_days,
    difficulty = excluded.difficulty,
    stability = excluded.stability,
    last_reviewed_at = excluded.last_reviewed_at,
    body_revision = excluded.body_revision,
    dependency_revision = excluded.dependency_revision,
    sync_change_id = excluded.sync_change_id,
    deleted_at = excluded.deleted_at,
    created_at = excluded.created_at,
    updated_at = excluded.updated_at
  where (public.card_catalog.deck_id, public.card_catalog.front_preview,
    public.card_catalog.normalized_search_text, public.card_catalog.sort_text,
    public.card_catalog.due_at, public.card_catalog.schedule_state,
    public.card_catalog.maturity_band, public.card_catalog.reviewable,
    public.card_catalog.has_active_variants, public.card_catalog.active_variant_count, public.card_catalog.active_variant_id,
    public.card_catalog.interval_days, public.card_catalog.difficulty,
    public.card_catalog.stability, public.card_catalog.last_reviewed_at,
    public.card_catalog.body_revision, public.card_catalog.dependency_revision,
    public.card_catalog.deleted_at, public.card_catalog.created_at, public.card_catalog.updated_at)
  is distinct from
    (excluded.deck_id, excluded.front_preview, excluded.normalized_search_text,
    excluded.sort_text, excluded.due_at, excluded.schedule_state,
    excluded.maturity_band, excluded.reviewable, excluded.has_active_variants, excluded.active_variant_count,
    excluded.active_variant_id, excluded.interval_days, excluded.difficulty,
    excluded.stability, excluded.last_reviewed_at, excluded.body_revision,
    excluded.dependency_revision, excluded.deleted_at, excluded.created_at, excluded.updated_at);
end
$$;

revoke all on function private.refresh_card_catalog(uuid, text) from public, anon, authenticated, service_role;

create or replace function private.refresh_card_catalog_trigger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    perform private.refresh_card_catalog(
      (pg_catalog.to_jsonb(old)->>'user_id')::uuid,
      coalesce(pg_catalog.to_jsonb(old)->>'card_id', pg_catalog.to_jsonb(old)->>'id')
    );
    return old;
  end if;
  perform private.refresh_card_catalog(
    (pg_catalog.to_jsonb(new)->>'user_id')::uuid,
    coalesce(pg_catalog.to_jsonb(new)->>'card_id', pg_catalog.to_jsonb(new)->>'id')
  );
  if tg_op = 'UPDATE' and tg_table_name = 'card_variants'
    and pg_catalog.to_jsonb(old)->>'card_id' is distinct from pg_catalog.to_jsonb(new)->>'card_id'
  then
    perform private.refresh_card_catalog(
      (pg_catalog.to_jsonb(old)->>'user_id')::uuid,
      pg_catalog.to_jsonb(old)->>'card_id'
    );
  end if;
  return new;
end
$$;

revoke all on function private.refresh_card_catalog_trigger() from public, anon, authenticated, service_role;

create or replace function private.refresh_definition_card_catalog_trigger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  affected_card record;
  owner_id uuid;
  definition_id text;
begin
  if tg_op = 'DELETE' then
    owner_id := old.user_id;
    definition_id := old.id;
  else
    owner_id := new.user_id;
    definition_id := new.id;
  end if;
  for affected_card in
    select card_row.user_id, card_row.id
    from public.cards as card_row
    where card_row.user_id = owner_id
      and card_row.note_type_definition_id = definition_id
  loop
    perform private.refresh_card_catalog(affected_card.user_id, affected_card.id);
  end loop;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end
$$;

revoke all on function private.refresh_definition_card_catalog_trigger() from public, anon, authenticated, service_role;

create or replace function private.refresh_deck_study_summary(p_user_id uuid, p_deck_id text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  deck_row public.decks%rowtype;
begin
  select * into deck_row from public.decks where user_id = p_user_id and id = p_deck_id;
  if deck_row.id is null then return; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user_id::text, 1129270853));
  insert into public.deck_study_summaries (
    user_id, deck_id, total_count, new_count, learning_count, mature_count,
    suspended_count, active_variant_count, sync_change_id, deleted_at, updated_at
  )
  select
    deck_row.user_id,
    deck_row.id,
    count(*) filter (where catalog_row.deleted_at is null),
    count(*) filter (where catalog_row.deleted_at is null and catalog_row.reviewable and catalog_row.schedule_state = 'new'),
    count(*) filter (where catalog_row.deleted_at is null and catalog_row.reviewable and catalog_row.schedule_state in ('learning', 'relearning')),
    count(*) filter (where catalog_row.deleted_at is null and catalog_row.reviewable and catalog_row.maturity_band in ('mature', 'variant_ready', 'mastered')),
    count(*) filter (where catalog_row.deleted_at is null and not catalog_row.reviewable),
    coalesce(sum(catalog_row.active_variant_count) filter (where catalog_row.deleted_at is null), 0),
    pg_catalog.nextval('public.account_sync_change_id_seq'::regclass),
    deck_row.deleted_at,
    now()
  from public.card_catalog as catalog_row
  where catalog_row.user_id = p_user_id and catalog_row.deck_id = p_deck_id
  on conflict (user_id, deck_id) do update set
    total_count = excluded.total_count,
    new_count = excluded.new_count,
    learning_count = excluded.learning_count,
    mature_count = excluded.mature_count,
    suspended_count = excluded.suspended_count,
    active_variant_count = excluded.active_variant_count,
    sync_change_id = excluded.sync_change_id,
    deleted_at = excluded.deleted_at,
    updated_at = excluded.updated_at;
end
$$;

revoke all on function private.refresh_deck_study_summary(uuid, text) from public, anon, authenticated, service_role;

create or replace function private.apply_deck_study_summary_delta(
  p_user_id uuid,
  p_deck_id text,
  p_total integer,
  p_new integer,
  p_learning integer,
  p_mature integer,
  p_suspended integer,
  p_active_variants integer,
  p_updated_at timestamptz
)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.deck_study_summaries (
    user_id, deck_id, total_count, new_count, learning_count, mature_count,
    suspended_count, active_variant_count, sync_change_id, deleted_at, updated_at
  )
  select
    deck_row.user_id, deck_row.id,
    greatest(p_total, 0), greatest(p_new, 0), greatest(p_learning, 0),
    greatest(p_mature, 0), greatest(p_suspended, 0), greatest(p_active_variants, 0),
    pg_catalog.nextval('public.account_sync_change_id_seq'::regclass),
    deck_row.deleted_at, coalesce(p_updated_at, now())
  from public.decks as deck_row
  where deck_row.user_id = p_user_id and deck_row.id = p_deck_id
  on conflict (user_id, deck_id) do update set
    total_count = greatest(public.deck_study_summaries.total_count + p_total, 0),
    new_count = greatest(public.deck_study_summaries.new_count + p_new, 0),
    learning_count = greatest(public.deck_study_summaries.learning_count + p_learning, 0),
    mature_count = greatest(public.deck_study_summaries.mature_count + p_mature, 0),
    suspended_count = greatest(public.deck_study_summaries.suspended_count + p_suspended, 0),
    active_variant_count = greatest(public.deck_study_summaries.active_variant_count + p_active_variants, 0),
    sync_change_id = excluded.sync_change_id,
    deleted_at = excluded.deleted_at,
    updated_at = greatest(public.deck_study_summaries.updated_at, excluded.updated_at);
$$;

revoke all on function private.apply_deck_study_summary_delta(uuid, text, integer, integer, integer, integer, integer, integer, timestamptz) from public, anon, authenticated, service_role;

create or replace function private.refresh_deck_study_summary_trigger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  old_total integer := 0;
  old_new integer := 0;
  old_learning integer := 0;
  old_mature integer := 0;
  old_suspended integer := 0;
  old_active_variants integer := 0;
  new_total integer := 0;
  new_new integer := 0;
  new_learning integer := 0;
  new_mature integer := 0;
  new_suspended integer := 0;
  new_active_variants integer := 0;
begin
  if tg_table_name = 'decks' then
    if tg_op = 'DELETE' then
      perform private.refresh_deck_study_summary(old.user_id, old.id);
      return old;
    end if;
    perform private.refresh_deck_study_summary(new.user_id, new.id);
    return new;
  end if;
  if tg_op <> 'INSERT' and old.deleted_at is null then
    old_total := 1;
    old_new := case when old.reviewable and old.schedule_state = 'new' then 1 else 0 end;
    old_learning := case when old.reviewable and old.schedule_state in ('learning', 'relearning') then 1 else 0 end;
    old_mature := case when old.reviewable and old.maturity_band in ('mature', 'variant_ready', 'mastered') then 1 else 0 end;
    old_suspended := case when not old.reviewable then 1 else 0 end;
    old_active_variants := old.active_variant_count;
  end if;
  if tg_op <> 'DELETE' and new.deleted_at is null then
    new_total := 1;
    new_new := case when new.reviewable and new.schedule_state = 'new' then 1 else 0 end;
    new_learning := case when new.reviewable and new.schedule_state in ('learning', 'relearning') then 1 else 0 end;
    new_mature := case when new.reviewable and new.maturity_band in ('mature', 'variant_ready', 'mastered') then 1 else 0 end;
    new_suspended := case when not new.reviewable then 1 else 0 end;
    new_active_variants := new.active_variant_count;
  end if;
  if tg_op = 'UPDATE' and old.deck_id is distinct from new.deck_id then
    perform private.apply_deck_study_summary_delta(old.user_id, old.deck_id,
      -old_total, -old_new, -old_learning, -old_mature, -old_suspended, -old_active_variants, old.updated_at);
    perform private.apply_deck_study_summary_delta(new.user_id, new.deck_id,
      new_total, new_new, new_learning, new_mature, new_suspended, new_active_variants, new.updated_at);
  elsif tg_op = 'INSERT' then
    perform private.apply_deck_study_summary_delta(
      new.user_id, new.deck_id,
      new_total, new_new, new_learning, new_mature, new_suspended, new_active_variants,
      new.updated_at
    );
  elsif tg_op = 'DELETE' then
    perform private.apply_deck_study_summary_delta(
      old.user_id, old.deck_id,
      -old_total, -old_new, -old_learning, -old_mature, -old_suspended, -old_active_variants,
      old.updated_at
    );
  else
    perform private.apply_deck_study_summary_delta(
      new.user_id, new.deck_id,
      new_total - old_total, new_new - old_new, new_learning - old_learning,
      new_mature - old_mature, new_suspended - old_suspended, new_active_variants - old_active_variants,
      new.updated_at
    );
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end
$$;

revoke all on function private.refresh_deck_study_summary_trigger() from public, anon, authenticated, service_role;

create trigger cards_refresh_card_catalog
  after insert or update or delete on public.cards
  for each row execute function private.refresh_card_catalog_trigger();

create trigger card_variants_refresh_card_catalog
  after insert or update or delete on public.card_variants
  for each row execute function private.refresh_card_catalog_trigger();

create trigger note_type_definitions_refresh_card_catalog
  after update of revision, deleted_at or delete on public.note_type_definitions
  for each row execute function private.refresh_definition_card_catalog_trigger();

create trigger card_catalog_refresh_deck_summary
  after insert or update or delete on public.card_catalog
  for each row execute function private.refresh_deck_study_summary_trigger();

create trigger decks_refresh_deck_summary
  after insert or update of deleted_at on public.decks
  for each row execute function private.refresh_deck_study_summary_trigger();

create or replace function public.get_account_bootstrap_v2(
  p_cursor text default '',
  p_limit integer default 200,
  p_max_bytes integer default 204800
)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with overview_context as materialized (
    select
      coalesce(profile_row.timezone, 'UTC') as time_zone,
      least(greatest(case
        when profile_row.scheduler_preferences->>'dayStartHour' ~ '^\d{1,2}$'
          then (profile_row.scheduler_preferences->>'dayStartHour')::integer
        else 0
      end, 0), 23) as day_start_hour
    from (select 1) as singleton
    left join public.profiles as profile_row on profile_row.id = (select auth.uid())
  ), learning_context as materialized (
    select
      overview_context.*,
      ((now() at time zone time_zone) - pg_catalog.make_interval(hours => day_start_hour))::date as day_key
    from overview_context
  ), learning_range as materialized (
    select
      learning_context.*,
      (day_key::timestamp + pg_catalog.make_interval(hours => day_start_hour)) at time zone time_zone as starts_at,
      ((day_key + 1)::timestamp + pg_catalog.make_interval(hours => day_start_hour)) at time zone time_zone as ends_at
    from learning_context
  ), deck_candidates as materialized (
    select
      deck_row.id,
      pg_catalog.jsonb_build_object(
        'deck', pg_catalog.to_jsonb(deck_row),
        'summary', pg_catalog.jsonb_build_object(
          'deckId', deck_row.id,
          'totalCount', coalesce(summary_row.total_count, 0),
          'newCount', coalesce(summary_row.new_count, 0),
          'learningCount', coalesce(summary_row.learning_count, 0),
          'matureCount', coalesce(summary_row.mature_count, 0),
          'suspendedCount', coalesce(summary_row.suspended_count, 0),
          'activeVariantCount', coalesce(summary_row.active_variant_count, 0),
          'updatedAt', summary_row.updated_at
        )
      ) as entry
    from public.decks as deck_row
    left join public.deck_study_summaries as summary_row
      on summary_row.user_id = deck_row.user_id and summary_row.deck_id = deck_row.id
    where deck_row.user_id = (select auth.uid())
      and deck_row.id > coalesce(p_cursor, '')
    order by deck_row.id
    limit least(greatest(p_limit, 1), 500) + 1
  ), ranked as materialized (
    select deck_candidates.*,
      pg_catalog.row_number() over (order by id) as position,
      pg_catalog.sum(pg_catalog.octet_length(entry::text)) over (order by id) as cumulative_bytes
    from deck_candidates
  ), page as materialized (
    select * from ranked
    where position <= least(greatest(p_limit, 1), 500)
      and (cumulative_bytes <= least(greatest(p_max_bytes, 65536), 204800) or position = 1)
    order by id
  )
  select pg_catalog.jsonb_build_object(
    'profile', (
      select pg_catalog.to_jsonb(profile_row) from public.profiles as profile_row
      where profile_row.id = (select auth.uid()) limit 1
    ),
    'decks', coalesce((select pg_catalog.jsonb_agg(entry order by id) from page), '[]'::jsonb),
    'nextCursor', coalesce((select max(id) from page), coalesce(p_cursor, '')),
    'hasMore', (select count(*) from ranked) > (select count(*) from page),
    'confirmedEmpty', not exists (
      select 1 from public.decks as active_deck
      where active_deck.user_id = (select auth.uid()) and active_deck.deleted_at is null
    ),
    'conflictCount', (
      select count(*) from public.sync_conflicts as conflict_row
      where conflict_row.user_id = (select auth.uid()) and conflict_row.status in ('open', 'ignored')
    ),
    'serverCatalogCursor', greatest(
      coalesce((select max(sync_change_id) from public.decks where user_id = (select auth.uid())), 0),
      coalesce((select max(sync_change_id) from public.card_catalog where user_id = (select auth.uid())), 0),
      coalesce((select max(sync_change_id) from public.deck_study_summaries where user_id = (select auth.uid())), 0)
    ),
    'studyOverview', case when coalesce(p_cursor, '') = '' then pg_catalog.jsonb_build_object(
      'contextKey', (select time_zone || ':' || day_start_hour::text from learning_range),
      'dayKey', (select day_key::text from learning_range),
      'introducedTodayByDeck', coalesce((
        select pg_catalog.jsonb_object_agg(deck_id, introduced_count order by deck_id)
        from (
          select review_row.deck_id, count(distinct review_row.reviewable_id)::integer as introduced_count
          from public.review_events as review_row, learning_range
          where review_row.user_id = (select auth.uid())
            and review_row.rating <> 'manual'
            and review_row.answered_at >= learning_range.starts_at
            and review_row.answered_at < learning_range.ends_at
            and coalesce(review_row.scheduler_before->'card'->>'state', review_row.scheduler_before->>'state', 'new') = 'new'
          group by review_row.deck_id
        ) as introduced
      ), '{}'::jsonb),
      'reviewedTodayByDeck', coalesce((
        select pg_catalog.jsonb_object_agg(deck_id, reviewed_count order by deck_id)
        from (
          select review_row.deck_id, count(distinct review_row.reviewable_id)::integer as reviewed_count
          from public.review_events as review_row, learning_range
          where review_row.user_id = (select auth.uid())
            and review_row.rating <> 'manual'
            and review_row.answered_at >= learning_range.starts_at
            and review_row.answered_at < learning_range.ends_at
            and coalesce(review_row.scheduler_before->'card'->>'state', review_row.scheduler_before->>'state', 'new') <> 'new'
          group by review_row.deck_id
        ) as reviewed
      ), '{}'::jsonb),
      'availableNewByDeck', coalesce((
        select pg_catalog.jsonb_object_agg(deck_id, available_count order by deck_id)
        from (
          select catalog_row.deck_id, count(*)::integer as available_count
          from public.card_catalog as catalog_row, learning_range
          where catalog_row.user_id = (select auth.uid())
            and catalog_row.deleted_at is null and catalog_row.reviewable
            and catalog_row.schedule_state = 'new'
            and (catalog_row.due_at is null or catalog_row.due_at < learning_range.ends_at)
          group by catalog_row.deck_id
        ) as available_new
      ), '{}'::jsonb),
      'availableLearningByDeck', coalesce((
        select pg_catalog.jsonb_object_agg(deck_id, available_count order by deck_id)
        from (
          select catalog_row.deck_id, count(*)::integer as available_count
          from public.card_catalog as catalog_row, learning_range
          where catalog_row.user_id = (select auth.uid())
            and catalog_row.deleted_at is null and catalog_row.reviewable
            and catalog_row.schedule_state in ('learning', 'relearning')
            and (catalog_row.due_at is null or catalog_row.due_at < learning_range.ends_at)
          group by catalog_row.deck_id
        ) as available_learning
      ), '{}'::jsonb),
      'dueByDeck', coalesce((
        select pg_catalog.jsonb_object_agg(deck_id, due_count order by deck_id)
        from (
          select catalog_row.deck_id, count(*)::integer as due_count
          from public.card_catalog as catalog_row, learning_range
          where catalog_row.user_id = (select auth.uid())
            and catalog_row.deleted_at is null and catalog_row.reviewable
            and catalog_row.schedule_state <> 'new' and catalog_row.due_at < learning_range.ends_at
          group by catalog_row.deck_id
        ) as due
      ), '{}'::jsonb),
      'forecastByDay', coalesce((
        select pg_catalog.jsonb_object_agg(day_key, due_count order by day_key)
        from (
          select ((catalog_row.due_at at time zone learning_range.time_zone)
                    - pg_catalog.make_interval(hours => learning_range.day_start_hour))::date::text as day_key,
                 count(*)::integer as due_count
          from public.card_catalog as catalog_row, learning_range
          where catalog_row.user_id = (select auth.uid())
            and catalog_row.deleted_at is null and catalog_row.reviewable
            and catalog_row.schedule_state <> 'new'
            and catalog_row.due_at >= learning_range.ends_at
            and catalog_row.due_at < learning_range.ends_at + interval '365 days'
          group by 1
        ) as forecast
      ), '{}'::jsonb),
      'generatedAt', now()
    ) else null end
  );
$$;

create or replace function public.pull_account_catalog_delta(
  p_cursor bigint default 0,
  p_limit integer default 500,
  p_max_bytes integer default 1048576
)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with account_changes as materialized (
    (select deck_row.sync_change_id, 'decks'::text as table_name, deck_row.id, pg_catalog.to_jsonb(deck_row) as row_data
      from public.decks as deck_row
      where deck_row.user_id = (select auth.uid()) and deck_row.sync_change_id > greatest(p_cursor, 0)
      order by deck_row.sync_change_id, deck_row.id limit least(greatest(p_limit, 1), 1000) + 1)
    union all
    (select catalog_row.sync_change_id, 'card_catalog', catalog_row.id, pg_catalog.to_jsonb(catalog_row)
      from public.card_catalog as catalog_row
      where catalog_row.user_id = (select auth.uid()) and catalog_row.sync_change_id > greatest(p_cursor, 0)
      order by catalog_row.sync_change_id, catalog_row.id limit least(greatest(p_limit, 1), 1000) + 1)
    union all
    (select summary_row.sync_change_id, 'deck_study_summaries', summary_row.deck_id, pg_catalog.to_jsonb(summary_row)
      from public.deck_study_summaries as summary_row
      where summary_row.user_id = (select auth.uid()) and summary_row.sync_change_id > greatest(p_cursor, 0)
      order by summary_row.sync_change_id, summary_row.deck_id limit least(greatest(p_limit, 1), 1000) + 1)
  ), candidates as materialized (
    select change_row.sync_change_id, change_row.table_name, change_row.id,
      pg_catalog.jsonb_build_object('table', change_row.table_name, 'row', change_row.row_data) as entry
    from account_changes as change_row
    order by change_row.sync_change_id, change_row.table_name, change_row.id
    limit least(greatest(p_limit, 1), 1000) + 1
  ), ranked as materialized (
    select candidates.*,
      pg_catalog.row_number() over (order by sync_change_id, table_name, id) as position,
      pg_catalog.sum(pg_catalog.octet_length(entry::text)) over (order by sync_change_id, table_name, id) as cumulative_bytes
    from candidates
  ), page as materialized (
    select * from ranked
    where position <= least(greatest(p_limit, 1), 1000)
      and (cumulative_bytes <= least(greatest(p_max_bytes, 65536), 2097152) or position = 1)
    order by sync_change_id, table_name, id
  )
  select pg_catalog.jsonb_build_object(
    'changes', coalesce((select pg_catalog.jsonb_agg(entry order by sync_change_id, table_name, id) from page), '[]'::jsonb),
    'nextCursor', coalesce((select max(sync_change_id) from page), greatest(p_cursor, 0)),
    'hasMore', (select count(*) from ranked) > (select count(*) from page)
  );
$$;

create or replace function public.list_account_card_catalog(
  p_deck_id text,
  p_query text default '',
  p_sort_field text default 'sortField',
  p_sort_direction text default 'asc',
  p_cursor jsonb default null,
  p_limit integer default 50,
  p_include_total boolean default true
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  query_text text := lower(trim(coalesce(p_query, '')));
  page_limit integer := least(greatest(p_limit, 1), 50);
  sort_expression text;
  cursor_expression text;
  cursor_output_expression text;
  sort_direction text;
  cursor_operator text;
  total_count bigint := null;
  response jsonb;
begin
  if current_user_id is null then
    raise exception 'Anmeldung erforderlich.' using errcode = '42501';
  end if;

  case p_sort_field
    when 'sortField' then
      sort_expression := 'catalog_row.sort_text';
      cursor_expression := 'coalesce($4->>''sortValue'', '''')';
      cursor_output_expression := 'catalog_row.sort_text';
    when 'nextStudyDate' then
      sort_expression := 'coalesce(catalog_row.due_at, ''infinity''::timestamptz)';
      cursor_expression := 'coalesce(nullif($4->>''sortValue'', '''')::timestamptz, ''infinity''::timestamptz)';
      cursor_output_expression := 'case when catalog_row.due_at is null then ''infinity'' else pg_catalog.to_char(catalog_row.due_at at time zone ''UTC'', ''YYYY-MM-DD"T"HH24:MI:SS.US'') || ''Z'' end';
    when 'variants' then
      sort_expression := 'catalog_row.has_active_variants';
      cursor_expression := 'coalesce(($4->>''sortValue'')::boolean, false)';
      cursor_output_expression := 'catalog_row.has_active_variants::text';
    else
      raise exception 'Unbekannte Katalogsortierung.' using errcode = '22023';
  end case;

  if p_sort_direction = 'desc' then
    sort_direction := 'desc';
    cursor_operator := '<';
  elsif p_sort_direction = 'asc' then
    sort_direction := 'asc';
    cursor_operator := '>';
  else
    raise exception 'Unbekannte Sortierrichtung.' using errcode = '22023';
  end if;

  if p_include_total then
    select count(*) into total_count
    from public.card_catalog as catalog_row
    where catalog_row.user_id = current_user_id
      and catalog_row.deck_id = p_deck_id
      and catalog_row.deleted_at is null
      and (query_text = '' or position(query_text in catalog_row.normalized_search_text) > 0);
  end if;

  execute pg_catalog.format($query$
    with page_candidates as materialized (
      select catalog_row.*, %3$s as sort_value
      from public.card_catalog as catalog_row
      where catalog_row.user_id = $1
        and catalog_row.deck_id = $2
        and catalog_row.deleted_at is null
        and ($3 = '' or position($3 in catalog_row.normalized_search_text) > 0)
        and ($4 is null or (%1$s, catalog_row.id) %2$s (%4$s, coalesce($4->>'id', '')))
      order by %1$s %5$s, catalog_row.id %5$s
      limit $5 + 1
    ), page as materialized (
      select page_candidates.*,
        pg_catalog.row_number() over (order by sort_value %5$s, id %5$s) as page_position
      from page_candidates
      order by sort_value %5$s, id %5$s
      limit $5
    )
    select pg_catalog.jsonb_build_object(
      'items', coalesce((
        select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(page) - 'sort_value' - 'page_position' order by page_position)
        from page
      ), '[]'::jsonb),
      'totalCount', $6,
      'hasMore', (select count(*) from page_candidates) > (select count(*) from page),
      'nextCursor', (
        select pg_catalog.jsonb_build_object('sortValue', sort_value, 'id', id)
        from page order by page_position desc limit 1
      )
    )
  $query$, sort_expression, cursor_operator, cursor_output_expression, cursor_expression, sort_direction)
  into response
  using current_user_id, p_deck_id, query_text, p_cursor, page_limit, total_count;

  return response;
end
$$;

create or replace function public.hydrate_account_cards(p_card_ids text[])
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  requested_count integer := coalesce(pg_catalog.array_length(p_card_ids, 1), 0);
begin
  if requested_count > 50 then
    raise exception 'Höchstens 50 Karten können gleichzeitig geladen werden.' using errcode = '22023';
  end if;
  return pg_catalog.jsonb_build_object(
    'cards', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(card_row) order by card_row.id)
      from public.cards as card_row
      where card_row.user_id = (select auth.uid()) and card_row.id = any(coalesce(p_card_ids, '{}'::text[]))
    ), '[]'::jsonb),
    'variants', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(variant_row) order by variant_row.card_id, variant_row.id)
      from public.card_variants as variant_row
      where variant_row.user_id = (select auth.uid()) and variant_row.card_id = any(coalesce(p_card_ids, '{}'::text[]))
    ), '[]'::jsonb),
    'noteTypeDefinitions', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(definition_row) order by definition_row.id)
      from public.note_type_definitions as definition_row
      where definition_row.user_id = (select auth.uid()) and definition_row.id in (
        select card_row.note_type_definition_id from public.cards as card_row
        where card_row.user_id = (select auth.uid()) and card_row.id = any(coalesce(p_card_ids, '{}'::text[]))
      )
    ), '[]'::jsonb)
  );
end
$$;

create or replace function public.get_deck_offline_manifest(
  p_deck_id text,
  p_cursor text default '',
  p_limit integer default 50
)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with candidates as materialized (
    select catalog_row.*
    from public.card_catalog as catalog_row
    where catalog_row.user_id = (select auth.uid()) and catalog_row.deck_id = p_deck_id
      and catalog_row.deleted_at is null and catalog_row.id > coalesce(p_cursor, '')
    order by catalog_row.id
    limit least(greatest(p_limit, 1), 50) + 1
  ), page as materialized (
    select * from candidates order by id limit least(greatest(p_limit, 1), 50)
  )
  select pg_catalog.jsonb_build_object(
    'cards', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'id', page.id,
        'bodyRevision', page.body_revision,
        'dependencyRevision', page.dependency_revision,
        'bodyBytes', coalesce((
          select pg_catalog.octet_length(pg_catalog.to_jsonb(card_row)::text)
            + coalesce(sum(pg_catalog.octet_length(pg_catalog.to_jsonb(variant_row)::text)), 0)
          from public.cards as card_row
          left join public.card_variants as variant_row
            on variant_row.user_id = card_row.user_id and variant_row.card_id = card_row.id
          where card_row.user_id = page.user_id and card_row.id = page.id
          group by card_row.user_id, card_row.id
        ), 0),
        'updatedAt', page.updated_at
      ) order by page.id) from page
    ), '[]'::jsonb),
    'media', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'id', media_row.id, 'sha1', media_row.sha1, 'size', media_row.size,
        'mimeType', media_row.mime_type, 'originalName', media_row.original_name,
        'storageBucket', media_row.storage_bucket, 'storagePath', media_row.storage_path,
        'cardId', media_row.card_id, 'updatedAt', media_row.updated_at
      ) order by media_row.id)
      from public.media_assets as media_row
      where media_row.user_id = (select auth.uid()) and media_row.deck_id = p_deck_id
        and media_row.deleted_at is null
        and (
          media_row.card_id in (select id from page)
          or (coalesce(p_cursor, '') = '' and media_row.card_id is null)
        )
    ), '[]'::jsonb),
    'nextCursor', coalesce((select max(id) from page), coalesce(p_cursor, '')),
    'hasMore', (select count(*) from candidates) > (select count(*) from page),
    'totalCount', (
      select count(*) from public.card_catalog as total_row
      where total_row.user_id = (select auth.uid()) and total_row.deck_id = p_deck_id and total_row.deleted_at is null
    )
  );
$$;

create or replace function public.get_account_statistics(
  p_deck_ids text[] default null,
  p_from timestamptz default null,
  p_to timestamptz default null,
  p_time_zone text default 'UTC',
  p_day_start_hour integer default 0
)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with scoped_catalog as materialized (
    select catalog_row.deck_id, catalog_row.due_at, catalog_row.schedule_state,
      catalog_row.maturity_band, catalog_row.reviewable, catalog_row.active_variant_count,
      catalog_row.interval_days, catalog_row.difficulty, catalog_row.stability,
      catalog_row.last_reviewed_at, catalog_row.deleted_at, catalog_row.created_at
    from public.card_catalog as catalog_row
    where catalog_row.user_id = (select auth.uid())
      and (p_deck_ids is null or catalog_row.deck_id = any(p_deck_ids))
  ), current_states as materialized (
    select deck_id, due_at, interval_days, difficulty, stability, last_reviewed_at
    from scoped_catalog
    where deleted_at is null and reviewable
  ), catalog_totals as materialized (
    select
      count(*) filter (where deleted_at is null)::integer as total,
      count(*) filter (where deleted_at is null and schedule_state = 'new')::integer as new_count,
      count(*) filter (where deleted_at is null and schedule_state in ('learning', 'relearning'))::integer as learning_count,
      count(*) filter (where deleted_at is null and maturity_band in ('mature', 'variant_ready', 'mastered'))::integer as mature_count,
      count(*) filter (where deleted_at is null and not reviewable)::integer as suspended_count,
      count(*) filter (where deleted_at is null and reviewable and schedule_state <> 'new' and due_at < now())::integer as overdue_count,
      coalesce(sum(1 + active_variant_count) filter (where deleted_at is null and reviewable), 0)::integer as active_variants,
      count(*) filter (where deleted_at is not null)::integer as deleted_items
    from scoped_catalog
  ), statistics_bounds as materialized (
    select
      case when p_from is null then null else ((p_from at time zone p_time_zone)
        - pg_catalog.make_interval(hours => least(greatest(p_day_start_hour, 0), 23)))::date end as from_day,
      case when p_to is null then null else ((p_to at time zone p_time_zone)
        - pg_catalog.make_interval(hours => least(greatest(p_day_start_hour, 0), 23)))::date end as to_day
  ), scoped_rollups as materialized (
    select rollup_row.*
    from public.review_statistics_daily as rollup_row, statistics_bounds
    where rollup_row.user_id = (select auth.uid())
      and (p_deck_ids is null or rollup_row.deck_id = any(p_deck_ids))
      and (statistics_bounds.to_day is null or rollup_row.day_key < statistics_bounds.to_day)
  ), categorized_rollups as materialized (
    select rollup_row.*
    from scoped_rollups as rollup_row, statistics_bounds
    where statistics_bounds.from_day is null or rollup_row.day_key >= statistics_bounds.from_day
  ), daily as materialized (
    select
      day_key::text,
      sum(review_count)::integer as total,
      sum(learning_count)::integer as learning,
      sum(relearning_count)::integer as relearning,
      sum(young_count)::integer as young,
      sum(mature_count)::integer as mature,
      sum(successful_count)::integer as successful,
      sum(timed_count)::integer as timed_count,
      sum(duration_ms)::bigint as duration_ms,
      sum(duration_learning_ms)::bigint as duration_learning_ms,
      sum(duration_relearning_ms)::bigint as duration_relearning_ms,
      sum(duration_young_ms)::bigint as duration_young_ms,
      sum(duration_mature_ms)::bigint as duration_mature_ms
    from categorized_rollups
    group by day_key
  ), heatmap_daily as materialized (
    select day_key::text, sum(review_count)::integer as review_count
    from scoped_rollups group by day_key
  ), hourly as materialized (
    select hour_entry.key::integer as local_hour,
      sum(hour_entry.value::integer)::integer as reviews,
      sum(coalesce((rollup_row.hourly_successful ->> hour_entry.key)::integer, 0))::integer as successful
    from categorized_rollups as rollup_row
    cross join lateral pg_catalog.jsonb_each_text(rollup_row.hourly_reviews) as hour_entry
    group by hour_entry.key
  ), rating_counts as materialized (
    select pg_catalog.split_part(rating_entry.key, ':', 1) as category,
      pg_catalog.split_part(rating_entry.key, ':', 2) as rating,
      sum(rating_entry.value::integer)::integer as rating_count
    from categorized_rollups as rollup_row
    cross join lateral pg_catalog.jsonb_each_text(rollup_row.rating_counts) as rating_entry
    group by rating_entry.key
  ), deck_reviews as materialized (
    select deck_id, sum(review_count)::integer as reviews,
      sum(successful_count)::integer as successful,
      sum(coalesce((rating_counts ->> 'learning:again')::integer, 0)
        + coalesce((rating_counts ->> 'relearning:again')::integer, 0)
        + coalesce((rating_counts ->> 'young:again')::integer, 0)
        + coalesce((rating_counts ->> 'mature:again')::integer, 0))::integer as again
    from categorized_rollups group by deck_id
  ), added_cards_daily as materialized (
    select ((card_row.created_at at time zone p_time_zone)
              - pg_catalog.make_interval(hours => least(greatest(p_day_start_hour, 0), 23)))::date::text as day_key,
           count(*)::integer as card_count
    from scoped_catalog as card_row
    where (p_from is null or card_row.created_at >= p_from)
      and (p_to is null or card_row.created_at < p_to)
    group by day_key
  ), forecast_daily as materialized (
    select
      ((catalog_row.due_at at time zone p_time_zone)
        - pg_catalog.make_interval(hours => least(greatest(p_day_start_hour, 0), 23)))::date::text as day_key,
      count(*) filter (where catalog_row.schedule_state in ('new', 'learning'))::integer as learning,
      count(*) filter (where catalog_row.schedule_state = 'relearning')::integer as relearning,
      count(*) filter (where catalog_row.schedule_state not in ('new', 'learning', 'relearning')
        and catalog_row.maturity_band not in ('mature', 'variant_ready', 'mastered'))::integer as young,
      count(*) filter (where catalog_row.schedule_state not in ('new', 'learning', 'relearning')
        and catalog_row.maturity_band in ('mature', 'variant_ready', 'mastered'))::integer as mature,
      count(*)::integer as total
    from scoped_catalog as catalog_row
    where catalog_row.deleted_at is null and catalog_row.reviewable and catalog_row.due_at >= now()
      and catalog_row.due_at < now() + interval '365 days'
    group by day_key
  ), retention_periods as materialized (
    select * from statistics_bounds, lateral (values
      ('selected'::text, from_day, to_day),
      ('previous'::text, case when from_day is not null and to_day is not null then from_day - (to_day - from_day) else null end, from_day),
      ('all'::text, null::date, to_day)
    ) as period(key, starts_on, ends_before)
  ), retention_rows as materialized (
    select period.key,
      coalesce(sum(review.retention_young_remembered), 0)::integer as young_remembered,
      coalesce(sum(review.retention_young_count), 0)::integer as young_total,
      coalesce(sum(review.retention_mature_remembered), 0)::integer as mature_remembered,
      coalesce(sum(review.retention_mature_count), 0)::integer as mature_total
    from retention_periods as period
    left join scoped_rollups as review
      on (period.starts_on is null or review.day_key >= period.starts_on)
      and (period.ends_before is null or review.day_key < period.ends_before)
      and (period.key <> 'previous' or period.ends_before is not null)
    group by period.key
  ), deck_retention as materialized (
    select deck_id,
      sum(retention_young_remembered + retention_mature_remembered)::integer as remembered,
      sum(retention_young_count + retention_mature_count)::integer as retention_total
    from categorized_rollups
    group by deck_id
  ), deck_state as materialized (
    select deck_id, sum(interval_days) as interval_total,
      count(*) filter (where interval_days > 0)::integer as interval_count,
      min(due_at) as next_due_at
    from current_states group by deck_id
  ), deck_aggregates as materialized (
    select deck_row.id as deck_id,
      coalesce(deck_reviews.reviews, 0) as reviews,
      coalesce(deck_reviews.successful, 0) as successful,
      coalesce(deck_reviews.again, 0) as again,
      coalesce(deck_retention.remembered, 0) as remembered,
      coalesce(deck_retention.retention_total, 0) as retention_total,
      coalesce(deck_state.interval_total, 0) as interval_total,
      coalesce(deck_state.interval_count, 0) as interval_count,
      deck_state.next_due_at
    from public.decks as deck_row
    left join deck_reviews on deck_reviews.deck_id = deck_row.id
    left join deck_retention on deck_retention.deck_id = deck_row.id
    left join deck_state on deck_state.deck_id = deck_row.id
    where deck_row.user_id = (select auth.uid())
      and deck_row.deleted_at is null
      and (p_deck_ids is null or deck_row.id = any(p_deck_ids))
  ), interval_bucket_counts as materialized (
    select least(59, floor(interval_days))::integer as bucket, count(*)::integer as bucket_count
    from current_states where interval_days > 0 group by bucket
  ), interval_distribution as materialized (
    select bucket, bucket_count,
      100 * sum(bucket_count) over (order by bucket)::numeric / nullif(sum(bucket_count) over (), 0) as cumulative_percent
    from interval_bucket_counts
  ), interval_statistics as materialized (
    select round(avg(interval_days), 1) as average_days,
      percentile_cont(0.5) within group (order by interval_days) as median_days,
      percentile_cont(0.95) within group (order by interval_days) as percentile_95_days,
      round(sum(1 / greatest(interval_days, 1)), 1) as daily_workload
    from current_states where interval_days > 0
  ), stability_bucket_counts as materialized (
    select least(39, floor(stability))::integer as bucket, count(*)::integer as bucket_count
    from current_states where stability > 0 group by bucket
  ), stability_distribution as materialized (
    select bucket, bucket_count,
      100 * sum(bucket_count) over (order by bucket)::numeric / nullif(sum(bucket_count) over (), 0) as cumulative_percent
    from stability_bucket_counts
  ), difficulty_bucket_counts as materialized (
    select least(10, greatest(1, ceil(difficulty)))::integer as bucket, count(*)::integer as bucket_count
    from current_states where difficulty > 0 and difficulty <= 10 group by bucket
  ), difficulty_distribution as materialized (
    select bucket, bucket_count,
      100 * sum(bucket_count) over (order by bucket)::numeric / nullif(sum(bucket_count) over (), 0) as cumulative_percent
    from difficulty_bucket_counts
  ), retrievability_states as materialized (
    select least(0.999999, greatest(0,
      power(
        1 + (19::double precision / 81)
          * greatest(0, extract(epoch from (now() - last_reviewed_at))::double precision / 86400)
          / stability::double precision,
        -0.5::double precision
      )
    )) as retrievability
    from current_states where stability > 0 and last_reviewed_at is not null
  ), retrievability_bucket_counts as materialized (
    select floor(retrievability * 20)::integer as bucket, count(*)::integer as bucket_count
    from retrievability_states group by bucket
  ), retrievability_distribution as materialized (
    select bucket, bucket_count,
      100 * sum(bucket_count) over (order by bucket)::numeric / nullif(sum(bucket_count) over (), 0) as cumulative_percent
    from retrievability_bucket_counts
  )
  select pg_catalog.jsonb_build_object(
    'cards', pg_catalog.jsonb_build_object(
      'total', (select total from catalog_totals),
      'new', (select new_count from catalog_totals),
      'learning', (select learning_count from catalog_totals),
      'mature', (select mature_count from catalog_totals),
      'suspended', (select suspended_count from catalog_totals)
    ),
    'reviewsByDay', coalesce((
      select pg_catalog.jsonb_object_agg(day_key, pg_catalog.jsonb_build_object(
        'total', total, 'learning', learning, 'relearning', relearning, 'young', young, 'mature', mature,
        'successful', successful, 'timedCount', timed_count, 'durationMs', coalesce(duration_ms, 0),
        'durationLearningMs', coalesce(duration_learning_ms, 0), 'durationRelearningMs', coalesce(duration_relearning_ms, 0),
        'durationYoungMs', coalesce(duration_young_ms, 0), 'durationMatureMs', coalesce(duration_mature_ms, 0)
      ) order by day_key) from daily
    ), '{}'::jsonb),
    'heatmapByDay', coalesce((select pg_catalog.jsonb_object_agg(day_key, review_count order by day_key) from heatmap_daily), '{}'::jsonb),
    'addedCardsByDay', coalesce((select pg_catalog.jsonb_object_agg(day_key, card_count order by day_key) from added_cards_daily), '{}'::jsonb),
    'forecastByDay', coalesce((select pg_catalog.jsonb_object_agg(day_key, pg_catalog.jsonb_build_object(
      'learning', learning, 'relearning', relearning, 'young', young, 'mature', mature, 'total', total
    ) order by day_key) from forecast_daily), '{}'::jsonb),
    'overdue', (select overdue_count from catalog_totals),
    'dueTomorrow', coalesce((select sum(total) from forecast_daily where day_key = (
      (((now() at time zone p_time_zone) - pg_catalog.make_interval(hours => least(greatest(p_day_start_hour, 0), 23)))::date + 1)::text
    )), 0),
    'dailyWorkload', coalesce((select daily_workload from interval_statistics), 0),
    'status', pg_catalog.jsonb_build_object(
      'activeVariants', (select active_variants from catalog_totals),
      'deletedItems', (select deleted_items from catalog_totals)
    ),
    'intervals', pg_catalog.jsonb_build_object(
      'points', coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'key', bucket::text, 'label', case when bucket = 59 then '59+ Tage' else bucket::text || ' Tage' end,
        'count', bucket_count, 'cumulativePercent', cumulative_percent
      ) order by bucket) from interval_distribution), '[]'::jsonb),
      'averageDays', coalesce((select average_days from interval_statistics), 0),
      'medianDays', coalesce((select median_days from interval_statistics), 0),
      'percentile95Days', coalesce((select percentile_95_days from interval_statistics), 0)
    ),
    'fsrs', pg_catalog.jsonb_build_object(
      'difficulty', coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'key', bucket::text, 'label', bucket::text, 'count', bucket_count, 'cumulativePercent', cumulative_percent
      ) order by bucket) from difficulty_distribution), '[]'::jsonb),
      'stability', coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'key', bucket::text, 'label', case when bucket = 39 then '39+ Tage' else bucket::text || ' Tage' end,
        'count', bucket_count, 'cumulativePercent', cumulative_percent
      ) order by bucket) from stability_distribution), '[]'::jsonb),
      'retrievability', coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'key', (bucket * 5)::text || '-' || ((bucket + 1) * 5)::text,
        'label', (bucket * 5)::text || '–' || ((bucket + 1) * 5)::text || ' %',
        'count', bucket_count, 'cumulativePercent', cumulative_percent
      ) order by bucket) from retrievability_distribution), '[]'::jsonb)
    ),
    'retention', coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'key', key, 'youngRemembered', young_remembered, 'youngTotal', young_total,
      'matureRemembered', mature_remembered, 'matureTotal', mature_total
    ) order by case key when 'selected' then 1 when 'previous' then 2 else 3 end) from retention_rows), '[]'::jsonb),
    'hourly', coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'hour', local_hour, 'reviews', reviews, 'successful', successful
    ) order by local_hour) from hourly), '[]'::jsonb),
    'ratings', coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'category', category, 'rating', rating, 'count', rating_count
    ) order by category, rating) from rating_counts), '[]'::jsonb),
    'deckReviews', coalesce((select pg_catalog.jsonb_object_agg(deck_id, pg_catalog.jsonb_build_object(
      'reviews', reviews, 'successful', successful, 'again', again,
      'remembered', remembered, 'retentionTotal', retention_total,
      'intervalTotal', interval_total, 'intervalCount', interval_count, 'nextDueAt', next_due_at
    ) order by deck_id) from deck_aggregates), '{}'::jsonb),
    'generatedAt', now()
  );
$$;

create or replace function public.delete_account_deck_tree(
  p_deck_id text,
  p_deleted_at timestamptz default now(),
  p_device_id text default null
)
returns jsonb
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  deleted_deck_ids text[] := '{}'::text[];
  deleted_card_count integer := 0;
begin
  if (select auth.uid()) is null then
    raise exception 'Anmeldung erforderlich.' using errcode = '42501';
  end if;

  with recursive owned_decks as (
    select deck_row.id
    from public.decks as deck_row
    where deck_row.user_id = (select auth.uid())
      and deck_row.id = p_deck_id
      and deck_row.deleted_at is null
    union all
    select child_row.id
    from public.decks as child_row
    join owned_decks as parent_row on child_row.parent_deck_id = parent_row.id
    where child_row.user_id = (select auth.uid())
      and child_row.deleted_at is null
  )
  select coalesce(pg_catalog.array_agg(id order by id), '{}'::text[])
  into deleted_deck_ids
  from owned_decks;

  if coalesce(pg_catalog.array_length(deleted_deck_ids, 1), 0) = 0 then
    return pg_catalog.jsonb_build_object('deletedDeckIds', '[]'::jsonb, 'deletedCardCount', 0);
  end if;

  update public.media_assets as media_row
  set deleted_at = p_deleted_at,
      updated_at = p_deleted_at
  where media_row.user_id = (select auth.uid())
    and media_row.deck_id = any(deleted_deck_ids)
    and media_row.deleted_at is null;

  update public.card_variants as variant_row
  set deleted_at = p_deleted_at,
      updated_at = p_deleted_at,
      updated_by_device_id = p_device_id,
      revision = variant_row.revision + 1
  from public.cards as card_row
  where variant_row.user_id = (select auth.uid())
    and card_row.user_id = variant_row.user_id
    and card_row.id = variant_row.card_id
    and card_row.deck_id = any(deleted_deck_ids)
    and variant_row.deleted_at is null;

  update public.cards as card_row
  set deleted_at = p_deleted_at,
      updated_at = p_deleted_at,
      updated_by_device_id = p_device_id,
      revision = card_row.revision + 1
  where card_row.user_id = (select auth.uid())
    and card_row.deck_id = any(deleted_deck_ids)
    and card_row.deleted_at is null;
  get diagnostics deleted_card_count = row_count;

  update public.decks as deck_row
  set deleted_at = p_deleted_at,
      updated_at = p_deleted_at,
      updated_by_device_id = p_device_id,
      revision = deck_row.revision + 1
  where deck_row.user_id = (select auth.uid())
    and deck_row.id = any(deleted_deck_ids)
    and deck_row.deleted_at is null;

  return pg_catalog.jsonb_build_object(
    'deletedDeckIds', pg_catalog.to_jsonb(deleted_deck_ids),
    'deletedCardCount', deleted_card_count
  );
end
$$;

revoke all on function public.get_account_bootstrap_v2(text, integer, integer) from public, anon;
revoke all on function public.pull_account_catalog_delta(bigint, integer, integer) from public, anon;
revoke all on function public.list_account_card_catalog(text, text, text, text, jsonb, integer, boolean) from public, anon;
revoke all on function public.hydrate_account_cards(text[]) from public, anon;
revoke all on function public.get_deck_offline_manifest(text, text, integer) from public, anon;
revoke all on function public.get_account_statistics(text[], timestamptz, timestamptz, text, integer) from public, anon;
revoke all on function public.delete_account_deck_tree(text, timestamptz, text) from public, anon;

grant execute on function public.get_account_bootstrap_v2(text, integer, integer) to authenticated, service_role;
grant execute on function public.pull_account_catalog_delta(bigint, integer, integer) to authenticated, service_role;
grant execute on function public.list_account_card_catalog(text, text, text, text, jsonb, integer, boolean) to authenticated, service_role;
grant execute on function public.hydrate_account_cards(text[]) to authenticated, service_role;
grant execute on function public.get_deck_offline_manifest(text, text, integer) to authenticated, service_role;
grant execute on function public.get_account_statistics(text[], timestamptz, timestamptz, text, integer) to authenticated, service_role;
grant execute on function public.delete_account_deck_tree(text, timestamptz, text) to authenticated, service_role;

revoke all privileges on table public.card_catalog, public.deck_study_summaries from anon;
grant select on table public.card_catalog, public.deck_study_summaries to authenticated;
grant all privileges on table public.card_catalog, public.deck_study_summaries to service_role;

commit;
