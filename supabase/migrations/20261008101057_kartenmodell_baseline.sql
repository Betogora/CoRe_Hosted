begin;

-- Kartenmodell-Baseline (ADR-032 bis ADR-034): Inhalte (`notes`) und ihre planbaren
-- Abfragen (`cards`) sind getrennt; Lernstand liegt in typisierten Kartenspalten.
-- `card_catalog` und `deck_study_summaries` bleiben als Delta- und Zählprojektion der
-- Web-Replica und werden je Anweisung statt je Zeile gepflegt.

create extension if not exists pgcrypto;
create extension if not exists pg_trgm with schema extensions;

create sequence if not exists public.account_sync_change_id_seq as bigint;

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
  user_id uuid not null references auth.users(id) on delete cascade,
  id text not null,
  parent_deck_id text,
  name text not null,
  description text not null default '',
  source text not null check (source in ('manual', 'anki-apkg')),
  anki_deck_id text,
  hierarchy_path text[] not null default '{}'::text[],
  deck_settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  sync_change_id bigint not null default 0 check (sync_change_id > 0),
  revision integer not null default 1 check (revision >= 1),
  deleted_at timestamptz,
  updated_by_device_id text,
  primary key (user_id, id)
);
comment on table public.decks is 'Accountgebundene, private CoRe-Stapel.';

create table public.note_type_sources (
  user_id uuid not null references auth.users(id) on delete cascade,
  id text not null,
  anki_notetype_id text not null,
  name text not null,
  definition jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  revision integer not null default 1 check (revision >= 1),
  deleted_at timestamptz,
  updated_by_device_id text,
  primary key (user_id, id)
);
comment on table public.note_type_sources is 'Unsichtbare Anki-Vorlage je importiertem Notiztyp, Eingabe der Neuübersetzung (ADR-033).';

create table public.notes (
  user_id uuid not null references auth.users(id) on delete cascade,
  id text not null,
  content jsonb not null,
  media jsonb not null default '{}'::jsonb,
  search_text text not null default '',
  sort_text text not null default '',
  source text not null check (source in ('manual', 'anki-apkg')),
  anki_guid text,
  note_type_source_id text,
  translator_id text,
  translator_version integer check (translator_version >= 1),
  marked boolean not null default false,
  content_revision integer not null default 1 check (content_revision >= 1),
  imported_content_revision integer check (imported_content_revision >= 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  revision integer not null default 1 check (revision >= 1),
  deleted_at timestamptz,
  updated_by_device_id text,
  primary key (user_id, id),
  constraint notes_translator_check check ((translator_id is null) = (translator_version is null)),
  constraint notes_note_type_source_owner_fk foreign key (user_id, note_type_source_id)
    references public.note_type_sources (user_id, id)
);
comment on table public.notes is 'Inhalte nach ADR-032; `media` ordnet Mediennamen des Inhalts ihrer SHA-1 zu.';

create table public.note_sources (
  user_id uuid not null references auth.users(id) on delete cascade,
  id text not null,
  note_type_source_id text not null,
  fields jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  revision integer not null default 1 check (revision >= 1),
  deleted_at timestamptz,
  updated_by_device_id text,
  primary key (user_id, id),
  constraint note_sources_note_owner_fk foreign key (user_id, id)
    references public.notes (user_id, id) on delete cascade,
  constraint note_sources_note_type_source_owner_fk foreign key (user_id, note_type_source_id)
    references public.note_type_sources (user_id, id)
);
comment on table public.note_sources is 'Rohe Anki-Feldwerte je importiertem Inhalt; `id` ist die Inhalts-ID.';

create table public.cards (
  user_id uuid not null references auth.users(id) on delete cascade,
  id text not null,
  note_id text not null,
  deck_id text not null,
  prompt_key text not null check (prompt_key ~ '^[a-z0-9][a-z0-9:-]*$'),
  anki_card_id text,
  status text not null default 'active' check (status in ('active', 'suspended')),
  anki_flag smallint not null default 0 check (anki_flag between 0 and 7),
  state text not null default 'new' check (state in ('new', 'learning', 'review', 'relearning')),
  due_at timestamptz not null,
  stability double precision not null default 0 check (stability >= 0),
  difficulty double precision not null default 5 check (difficulty >= 0),
  reps integer not null default 0 check (reps >= 0),
  lapses integer not null default 0 check (lapses >= 0),
  interval_days double precision not null default 0 check (interval_days >= 0),
  learning_step_index integer not null default 0 check (learning_step_index >= 0),
  last_reviewed_at timestamptz,
  last_rating text check (last_rating in ('again', 'hard', 'good', 'easy')),
  study_extra jsonb not null default '{}'::jsonb,
  source_scheduler jsonb,
  study_revision integer not null default 0 check (study_revision >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  revision integer not null default 1 check (revision >= 1),
  deleted_at timestamptz,
  updated_by_device_id text,
  primary key (user_id, id),
  constraint cards_note_owner_fk foreign key (user_id, note_id)
    references public.notes (user_id, id) on delete cascade,
  constraint cards_deck_owner_fk foreign key (user_id, deck_id)
    references public.decks (user_id, id) on delete cascade
);
comment on table public.cards is 'Planbare Abfragen eines Inhalts mit typisiertem Lernstand.';

create unique index cards_note_prompt_key_idx on public.cards (user_id, note_id, prompt_key) where deleted_at is null;
create index cards_user_note_idx on public.cards (user_id, note_id);
create index cards_user_deck_idx on public.cards (user_id, deck_id);
create index cards_active_deck_due_idx on public.cards (user_id, deck_id, state, due_at)
  where status = 'active' and deleted_at is null;
create index cards_user_anki_card_idx on public.cards (user_id, anki_card_id) where anki_card_id is not null;

create table public.card_variants (
  user_id uuid not null references auth.users(id) on delete cascade,
  id text not null,
  card_id text not null,
  front text not null default '',
  back text not null default '',
  variant_level integer not null default 2 check (variant_level between 1 and 3),
  is_active boolean not null default true,
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
  revision integer not null default 1 check (revision >= 1),
  deleted_at timestamptz,
  updated_by_device_id text,
  primary key (user_id, id),
  constraint card_variants_card_owner_fk foreign key (user_id, card_id)
    references public.cards (user_id, id) on delete cascade
);
create index card_variants_user_card_idx on public.card_variants (user_id, card_id);

create table public.review_events (
  user_id uuid not null references auth.users(id) on delete cascade,
  id text not null,
  card_id text not null,
  deck_id text not null,
  variant_id text,
  rating text not null check (rating in ('again', 'hard', 'good', 'easy', 'manual')),
  answered_at timestamptz not null,
  response_time_ms integer check (response_time_ms >= 0),
  scheduler_before jsonb,
  scheduler_after jsonb,
  flags jsonb not null default '{}'::jsonb,
  statistics_day date not null default current_date,
  statistics_hour smallint not null default 0 check (statistics_hour between 0 and 23),
  statistics_category text not null default 'learning' check (statistics_category in ('learning', 'relearning', 'young', 'mature')),
  statistics_interval_days numeric not null default 0 check (statistics_interval_days >= 0),
  retention_first boolean not null default false,
  created_at timestamptz not null default now(),
  created_by_device_id text,
  primary key (user_id, id),
  constraint review_events_card_owner_fk foreign key (user_id, card_id)
    references public.cards (user_id, id) on delete cascade,
  constraint review_events_deck_owner_fk foreign key (user_id, deck_id)
    references public.decks (user_id, id) on delete cascade
);
create index review_events_user_card_answered_idx on public.review_events (user_id, card_id, answered_at, id);
create index review_events_user_answered_idx on public.review_events (user_id, answered_at, id);
create index review_events_retention_idx on public.review_events (user_id, card_id, statistics_day, answered_at, id)
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
  constraint review_statistics_daily_deck_owner_fk foreign key (user_id, deck_id)
    references public.decks (user_id, id) on delete cascade
);
create index review_statistics_daily_user_day_deck_idx on public.review_statistics_daily (user_id, day_key, deck_id);

create table public.media_files (
  user_id uuid not null references auth.users(id) on delete cascade,
  sha1 text not null check (sha1 ~ '^[0-9a-f]{40}$'),
  size bigint not null check (size >= 0),
  mime_type text not null default 'application/octet-stream',
  original_name text not null,
  storage_path text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, sha1)
);
comment on table public.media_files is 'Eine private Mediendatei je Account und SHA-1.';

create table public.note_media (
  user_id uuid not null references auth.users(id) on delete cascade,
  note_id text not null,
  sha1 text not null,
  primary key (user_id, note_id, sha1),
  constraint note_media_note_owner_fk foreign key (user_id, note_id)
    references public.notes (user_id, id) on delete cascade
);
create index note_media_user_sha1_idx on public.note_media (user_id, sha1);
comment on table public.note_media is 'Aus `notes.media` gepflegte Verknüpfung von Inhalten und Mediendateien.';

create table public.sync_devices (
  user_id uuid not null references auth.users(id) on delete cascade,
  id text not null,
  label text not null default 'Browser',
  last_seen_at timestamptz not null default now(),
  user_agent text not null default '',
  created_at timestamptz not null default now(),
  primary key (user_id, id)
);

create table public.sync_conflicts (
  user_id uuid not null references auth.users(id) on delete cascade,
  id text not null,
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

create table public.card_catalog (
  user_id uuid not null references auth.users(id) on delete cascade,
  id text not null,
  deck_id text not null,
  note_id text not null,
  front_preview text not null default '',
  sort_text text not null default '',
  due_at timestamptz,
  schedule_state text not null default 'new',
  maturity_band text not null default 'new',
  reviewable boolean not null default true,
  marked boolean not null default false,
  has_active_variants boolean not null default false,
  active_variant_count integer not null default 0 check (active_variant_count >= 0),
  active_variant_id text,
  body_revision integer not null default 1 check (body_revision >= 1),
  study_revision integer not null default 0 check (study_revision >= 0),
  dependency_revision integer not null default 1 check (dependency_revision >= 1),
  sync_change_id bigint not null check (sync_change_id > 0),
  deleted_at timestamptz,
  created_at timestamptz not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, id),
  constraint card_catalog_card_owner_fk foreign key (user_id, id)
    references public.cards (user_id, id) on delete cascade,
  constraint card_catalog_deck_owner_fk foreign key (user_id, deck_id)
    references public.decks (user_id, id) on delete cascade
);
comment on table public.card_catalog is 'Delta- und Seitenprojektion je Karte für die Web-Replica.';

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
  constraint deck_study_summaries_deck_owner_fk foreign key (user_id, deck_id)
    references public.decks (user_id, id) on delete cascade
);

create index decks_user_sync_change_id_idx on public.decks (user_id, sync_change_id, id);
create index card_catalog_user_sync_change_id_idx on public.card_catalog (user_id, sync_change_id, id);
create index card_catalog_active_deck_sort_idx on public.card_catalog (user_id, deck_id, sort_text, id)
  where deleted_at is null;
create index card_catalog_active_deck_due_idx on public.card_catalog (user_id, deck_id, (coalesce(due_at, 'infinity'::timestamptz)), id)
  where deleted_at is null;
create index card_catalog_active_deck_variants_idx on public.card_catalog (user_id, deck_id, has_active_variants, id)
  where deleted_at is null;
create index deck_study_summaries_user_sync_change_id_idx on public.deck_study_summaries (user_id, sync_change_id, deck_id);
create index notes_user_anki_guid_idx on public.notes (user_id, anki_guid) where anki_guid is not null;
create index notes_search_text_trgm_idx on public.notes using gin (search_text extensions.gin_trgm_ops);
create index notes_retranslation_idx on public.notes (user_id, translator_id, translator_version, id)
  where source = 'anki-apkg' and deleted_at is null;

alter table public.profiles enable row level security;
alter table public.decks enable row level security;
alter table public.note_type_sources enable row level security;
alter table public.notes enable row level security;
alter table public.note_sources enable row level security;
alter table public.cards enable row level security;
alter table public.card_variants enable row level security;
alter table public.review_events enable row level security;
alter table public.review_statistics_daily enable row level security;
alter table public.media_files enable row level security;
alter table public.note_media enable row level security;
alter table public.sync_devices enable row level security;
alter table public.sync_conflicts enable row level security;
alter table public.card_catalog enable row level security;
alter table public.deck_study_summaries enable row level security;

create policy "profiles_select_own" on public.profiles for select to authenticated using ((select auth.uid()) = id);
create policy "profiles_insert_own" on public.profiles for insert to authenticated with check ((select auth.uid()) = id);
create policy "profiles_update_own" on public.profiles for update to authenticated using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

create policy "decks_owner_all" on public.decks for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "note_type_sources_owner_all" on public.note_type_sources for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "notes_owner_all" on public.notes for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "note_sources_owner_all" on public.note_sources for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "cards_owner_all" on public.cards for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "card_variants_owner_all" on public.card_variants for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "review_events_owner_all" on public.review_events for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "media_files_owner_all" on public.media_files for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "sync_devices_owner_all" on public.sync_devices for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "sync_conflicts_owner_all" on public.sync_conflicts for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "review_statistics_daily_owner_select" on public.review_statistics_daily for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "note_media_owner_select" on public.note_media for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "card_catalog_owner_select" on public.card_catalog for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "deck_study_summaries_owner_select" on public.deck_study_summaries for select to authenticated
  using ((select auth.uid()) = user_id);

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

-- Delta-Stempel: Ein accountweites Transaktionslock hält Cursorreihenfolge und Sichtbarkeit gleich.
create or replace function private.lock_account_sync(p_user_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  select pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user_id::text, 1129270853));
$$;

revoke all on function private.lock_account_sync(uuid) from public, anon, authenticated, service_role;

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
  perform private.lock_account_sync(new.user_id);
  new.sync_change_id := pg_catalog.nextval('public.account_sync_change_id_seq'::regclass);
  return new;
end
$$;

revoke all on function private.stamp_account_sync_change() from public, anon, authenticated, service_role;

create or replace function private.guard_account_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.user_id is distinct from old.user_id then
    raise exception 'Account-Zuordnung darf nicht geändert werden.' using errcode = '23514';
  end if;
  return new;
end
$$;

revoke all on function private.guard_account_owner() from public, anon, authenticated, service_role;

create trigger decks_stamp_account_sync_change before insert or update on public.decks
  for each row execute function private.stamp_account_sync_change();
create trigger note_type_sources_guard_account_owner before update on public.note_type_sources
  for each row execute function private.guard_account_owner();
create trigger notes_guard_account_owner before update on public.notes
  for each row execute function private.guard_account_owner();
create trigger note_sources_guard_account_owner before update on public.note_sources
  for each row execute function private.guard_account_owner();
create trigger cards_guard_account_owner before update on public.cards
  for each row execute function private.guard_account_owner();
create trigger card_variants_guard_account_owner before update on public.card_variants
  for each row execute function private.guard_account_owner();
create trigger review_events_guard_account_owner before update on public.review_events
  for each row execute function private.guard_account_owner();

-- Kartenkatalog: mengenbasiert je Account und betroffener Kartenmenge.
create or replace function private.refresh_card_catalog(p_user_id uuid, p_card_ids text[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_user_id is null or coalesce(pg_catalog.array_length(p_card_ids, 1), 0) = 0 then return; end if;
  perform private.lock_account_sync(p_user_id);
  delete from public.card_catalog as catalog_row
  where catalog_row.user_id = p_user_id
    and catalog_row.id = any(p_card_ids)
    and not exists (select 1 from public.cards as card_row where card_row.user_id = p_user_id and card_row.id = catalog_row.id);

  insert into public.card_catalog (
    user_id, id, deck_id, note_id, front_preview, sort_text, due_at, schedule_state, maturity_band,
    reviewable, marked, has_active_variants, active_variant_count, active_variant_id,
    body_revision, study_revision, dependency_revision, sync_change_id, deleted_at, created_at, updated_at
  )
  select
    card_row.user_id,
    card_row.id,
    card_row.deck_id,
    card_row.note_id,
    left(note_row.sort_text, 240),
    left(lower(note_row.sort_text), 128),
    card_row.due_at,
    card_row.state,
    coalesce(nullif(card_row.study_extra->>'maturityBand', ''), 'new'),
    card_row.deleted_at is null and card_row.status = 'active',
    note_row.marked,
    coalesce(variant_row.active_count, 0) > 0,
    coalesce(variant_row.active_count, 0),
    variant_row.active_id,
    card_row.revision,
    card_row.study_revision,
    note_row.revision + coalesce(variant_row.revision_total, 0),
    pg_catalog.nextval('public.account_sync_change_id_seq'::regclass),
    card_row.deleted_at,
    card_row.created_at,
    greatest(card_row.updated_at, note_row.updated_at, coalesce(variant_row.updated_at, card_row.updated_at))
  from public.cards as card_row
  join public.notes as note_row on note_row.user_id = card_row.user_id and note_row.id = card_row.note_id
  left join lateral (
    select
      count(*) filter (where candidate.deleted_at is null and candidate.is_active and candidate.quality_status = 'active')::integer as active_count,
      (pg_catalog.array_agg(candidate.id order by candidate.updated_at desc, candidate.id)
        filter (where candidate.deleted_at is null and candidate.is_active and candidate.quality_status = 'active'))[1] as active_id,
      sum(candidate.revision)::integer as revision_total,
      max(candidate.updated_at) as updated_at
    from public.card_variants as candidate
    where candidate.user_id = card_row.user_id and candidate.card_id = card_row.id
  ) as variant_row on true
  where card_row.user_id = p_user_id and card_row.id = any(p_card_ids)
  on conflict (user_id, id) do update set
    deck_id = excluded.deck_id,
    note_id = excluded.note_id,
    front_preview = excluded.front_preview,
    sort_text = excluded.sort_text,
    due_at = excluded.due_at,
    schedule_state = excluded.schedule_state,
    maturity_band = excluded.maturity_band,
    reviewable = excluded.reviewable,
    marked = excluded.marked,
    has_active_variants = excluded.has_active_variants,
    active_variant_count = excluded.active_variant_count,
    active_variant_id = excluded.active_variant_id,
    body_revision = excluded.body_revision,
    study_revision = excluded.study_revision,
    dependency_revision = excluded.dependency_revision,
    sync_change_id = excluded.sync_change_id,
    deleted_at = excluded.deleted_at,
    created_at = excluded.created_at,
    updated_at = excluded.updated_at
  where (public.card_catalog.deck_id, public.card_catalog.note_id, public.card_catalog.front_preview,
    public.card_catalog.sort_text, public.card_catalog.due_at, public.card_catalog.schedule_state,
    public.card_catalog.maturity_band, public.card_catalog.reviewable, public.card_catalog.marked, public.card_catalog.has_active_variants,
    public.card_catalog.active_variant_count, public.card_catalog.active_variant_id,
    public.card_catalog.body_revision, public.card_catalog.study_revision, public.card_catalog.dependency_revision,
    public.card_catalog.deleted_at, public.card_catalog.created_at, public.card_catalog.updated_at)
  is distinct from
    (excluded.deck_id, excluded.note_id, excluded.front_preview, excluded.sort_text, excluded.due_at,
    excluded.schedule_state, excluded.maturity_band, excluded.reviewable, excluded.marked, excluded.has_active_variants,
    excluded.active_variant_count, excluded.active_variant_id, excluded.body_revision, excluded.study_revision,
    excluded.dependency_revision, excluded.deleted_at, excluded.created_at, excluded.updated_at);
end
$$;

revoke all on function private.refresh_card_catalog(uuid, text[]) from public, anon, authenticated, service_role;

create or replace function private.refresh_card_catalog_for_cards()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  affected record;
begin
  for affected in select user_id, pg_catalog.array_agg(distinct id) as card_ids from new_rows group by user_id loop
    perform private.refresh_card_catalog(affected.user_id, affected.card_ids);
  end loop;
  return null;
end
$$;

create or replace function private.refresh_card_catalog_for_variants()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  affected record;
begin
  if tg_op = 'DELETE' then
    for affected in select user_id, pg_catalog.array_agg(distinct card_id) as card_ids from old_rows group by user_id loop
      perform private.refresh_card_catalog(affected.user_id, affected.card_ids);
    end loop;
  else
    for affected in select user_id, pg_catalog.array_agg(distinct card_id) as card_ids from new_rows group by user_id loop
      perform private.refresh_card_catalog(affected.user_id, affected.card_ids);
    end loop;
  end if;
  return null;
end
$$;

create or replace function private.refresh_card_catalog_for_notes()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  affected record;
begin
  for affected in
    select changed_note.user_id, pg_catalog.array_agg(distinct card_row.id) as card_ids
    from new_rows as changed_note
    join old_rows as previous_note on previous_note.user_id = changed_note.user_id and previous_note.id = changed_note.id
    join public.cards as card_row on card_row.user_id = changed_note.user_id and card_row.note_id = changed_note.id
    where (changed_note.sort_text, changed_note.revision, changed_note.updated_at, changed_note.deleted_at)
      is distinct from (previous_note.sort_text, previous_note.revision, previous_note.updated_at, previous_note.deleted_at)
    group by changed_note.user_id
  loop
    perform private.refresh_card_catalog(affected.user_id, affected.card_ids);
  end loop;
  return null;
end
$$;

revoke all on function private.refresh_card_catalog_for_cards() from public, anon, authenticated, service_role;
revoke all on function private.refresh_card_catalog_for_variants() from public, anon, authenticated, service_role;
revoke all on function private.refresh_card_catalog_for_notes() from public, anon, authenticated, service_role;

create trigger cards_catalog_after_insert after insert on public.cards
  referencing new table as new_rows for each statement execute function private.refresh_card_catalog_for_cards();
create trigger cards_catalog_after_update after update on public.cards
  referencing new table as new_rows for each statement execute function private.refresh_card_catalog_for_cards();
create trigger card_variants_catalog_after_insert after insert on public.card_variants
  referencing new table as new_rows for each statement execute function private.refresh_card_catalog_for_variants();
create trigger card_variants_catalog_after_update after update on public.card_variants
  referencing new table as new_rows for each statement execute function private.refresh_card_catalog_for_variants();
create trigger card_variants_catalog_after_delete after delete on public.card_variants
  referencing old table as old_rows for each statement execute function private.refresh_card_catalog_for_variants();
create trigger notes_catalog_after_update after update on public.notes
  referencing old table as old_rows new table as new_rows for each statement execute function private.refresh_card_catalog_for_notes();

-- Stapelzusammenfassungen: Zählerdeltas je Anweisung und Stapel.
create or replace function private.apply_deck_study_summary_deltas(p_deltas jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  delta record;
begin
  for delta in
    select (entry->>'user_id')::uuid as user_id, entry->>'deck_id' as deck_id,
      (entry->>'total')::integer as total, (entry->>'new')::integer as new_count,
      (entry->>'learning')::integer as learning, (entry->>'mature')::integer as mature,
      (entry->>'suspended')::integer as suspended, (entry->>'variants')::integer as variants
    from pg_catalog.jsonb_array_elements(p_deltas) as entry
    order by 1, 2
  loop
    if delta.total = 0 and delta.new_count = 0 and delta.learning = 0 and delta.mature = 0
      and delta.suspended = 0 and delta.variants = 0 then
      continue;
    end if;
    perform private.lock_account_sync(delta.user_id);
    insert into public.deck_study_summaries (
      user_id, deck_id, total_count, new_count, learning_count, mature_count,
      suspended_count, active_variant_count, sync_change_id, deleted_at, updated_at
    )
    select deck_row.user_id, deck_row.id,
      greatest(delta.total, 0), greatest(delta.new_count, 0), greatest(delta.learning, 0),
      greatest(delta.mature, 0), greatest(delta.suspended, 0), greatest(delta.variants, 0),
      pg_catalog.nextval('public.account_sync_change_id_seq'::regclass), deck_row.deleted_at, now()
    from public.decks as deck_row
    where deck_row.user_id = delta.user_id and deck_row.id = delta.deck_id
    on conflict (user_id, deck_id) do update set
      total_count = greatest(public.deck_study_summaries.total_count + delta.total, 0),
      new_count = greatest(public.deck_study_summaries.new_count + delta.new_count, 0),
      learning_count = greatest(public.deck_study_summaries.learning_count + delta.learning, 0),
      mature_count = greatest(public.deck_study_summaries.mature_count + delta.mature, 0),
      suspended_count = greatest(public.deck_study_summaries.suspended_count + delta.suspended, 0),
      active_variant_count = greatest(public.deck_study_summaries.active_variant_count + delta.variants, 0),
      sync_change_id = excluded.sync_change_id,
      deleted_at = excluded.deleted_at,
      updated_at = excluded.updated_at;
  end loop;
end
$$;

revoke all on function private.apply_deck_study_summary_deltas(jsonb) from public, anon, authenticated, service_role;

create or replace function private.catalog_summary_contribution(p_row public.card_catalog, p_sign integer)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select case when p_row.deleted_at is not null then null else pg_catalog.jsonb_build_object(
    'user_id', p_row.user_id,
    'deck_id', p_row.deck_id,
    'total', p_sign,
    'new', p_sign * (case when p_row.reviewable and p_row.schedule_state = 'new' then 1 else 0 end),
    'learning', p_sign * (case when p_row.reviewable and p_row.schedule_state in ('learning', 'relearning') then 1 else 0 end),
    'mature', p_sign * (case when p_row.reviewable and p_row.maturity_band in ('mature', 'variant_ready', 'mastered') then 1 else 0 end),
    'suspended', p_sign * (case when not p_row.reviewable then 1 else 0 end),
    'variants', p_sign * p_row.active_variant_count
  ) end;
$$;

revoke all on function private.catalog_summary_contribution(public.card_catalog, integer) from public, anon, authenticated, service_role;

-- Übergangstabellen gibt es je Ereignisart; deshalb erhält jede Art eine eigene Triggerfunktion.
create or replace function private.refresh_deck_summaries_for_catalog_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  contributions jsonb;
begin
  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'user_id', user_id, 'deck_id', deck_id, 'total', total, 'new', new_count, 'learning', learning,
    'mature', mature, 'suspended', suspended, 'variants', variants
  )), '[]'::jsonb) into contributions
  from (
    select entry->>'user_id' as user_id, entry->>'deck_id' as deck_id,
      sum((entry->>'total')::integer) as total, sum((entry->>'new')::integer) as new_count,
      sum((entry->>'learning')::integer) as learning, sum((entry->>'mature')::integer) as mature,
      sum((entry->>'suspended')::integer) as suspended, sum((entry->>'variants')::integer) as variants
    from (select private.catalog_summary_contribution(new_row, 1) as entry from new_rows as new_row) as rows
    where entry is not null
    group by 1, 2
  ) as grouped;
  perform private.apply_deck_study_summary_deltas(contributions);
  return null;
end
$$;

create or replace function private.refresh_deck_summaries_for_catalog_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  contributions jsonb;
begin
  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'user_id', user_id, 'deck_id', deck_id, 'total', total, 'new', new_count, 'learning', learning,
    'mature', mature, 'suspended', suspended, 'variants', variants
  )), '[]'::jsonb) into contributions
  from (
    select entry->>'user_id' as user_id, entry->>'deck_id' as deck_id,
      sum((entry->>'total')::integer) as total, sum((entry->>'new')::integer) as new_count,
      sum((entry->>'learning')::integer) as learning, sum((entry->>'mature')::integer) as mature,
      sum((entry->>'suspended')::integer) as suspended, sum((entry->>'variants')::integer) as variants
    from (
      select private.catalog_summary_contribution(old_row, -1) as entry from old_rows as old_row
      union all
      select private.catalog_summary_contribution(new_row, 1) from new_rows as new_row
    ) as rows
    where entry is not null
    group by 1, 2
  ) as grouped;
  perform private.apply_deck_study_summary_deltas(contributions);
  return null;
end
$$;

create or replace function private.refresh_deck_summaries_for_catalog_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  contributions jsonb;
begin
  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'user_id', user_id, 'deck_id', deck_id, 'total', total, 'new', new_count, 'learning', learning,
    'mature', mature, 'suspended', suspended, 'variants', variants
  )), '[]'::jsonb) into contributions
  from (
    select entry->>'user_id' as user_id, entry->>'deck_id' as deck_id,
      sum((entry->>'total')::integer) as total, sum((entry->>'new')::integer) as new_count,
      sum((entry->>'learning')::integer) as learning, sum((entry->>'mature')::integer) as mature,
      sum((entry->>'suspended')::integer) as suspended, sum((entry->>'variants')::integer) as variants
    from (select private.catalog_summary_contribution(old_row, -1) as entry from old_rows as old_row) as rows
    where entry is not null
    group by 1, 2
  ) as grouped;
  perform private.apply_deck_study_summary_deltas(contributions);
  return null;
end
$$;

revoke all on function private.refresh_deck_summaries_for_catalog_insert() from public, anon, authenticated, service_role;
revoke all on function private.refresh_deck_summaries_for_catalog_update() from public, anon, authenticated, service_role;
revoke all on function private.refresh_deck_summaries_for_catalog_delete() from public, anon, authenticated, service_role;

create trigger card_catalog_summary_after_insert after insert on public.card_catalog
  referencing new table as new_rows for each statement execute function private.refresh_deck_summaries_for_catalog_insert();
create trigger card_catalog_summary_after_update after update on public.card_catalog
  referencing old table as old_rows new table as new_rows for each statement execute function private.refresh_deck_summaries_for_catalog_update();
create trigger card_catalog_summary_after_delete after delete on public.card_catalog
  referencing old table as old_rows for each statement execute function private.refresh_deck_summaries_for_catalog_delete();

create or replace function private.refresh_deck_summary_for_deck()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.lock_account_sync(new.user_id);
  insert into public.deck_study_summaries (user_id, deck_id, sync_change_id, deleted_at, updated_at)
  values (new.user_id, new.id, pg_catalog.nextval('public.account_sync_change_id_seq'::regclass), new.deleted_at, now())
  on conflict (user_id, deck_id) do update set
    sync_change_id = excluded.sync_change_id,
    deleted_at = excluded.deleted_at,
    updated_at = excluded.updated_at
  where public.deck_study_summaries.deleted_at is distinct from excluded.deleted_at;
  return null;
end
$$;

revoke all on function private.refresh_deck_summary_for_deck() from public, anon, authenticated, service_role;

create trigger decks_summary_after_insert after insert on public.decks
  for each row execute function private.refresh_deck_summary_for_deck();
create trigger decks_summary_after_delete_mark after update of deleted_at on public.decks
  for each row execute function private.refresh_deck_summary_for_deck();

-- Inhalt-Medien-Verknüpfung folgt `notes.media`; gelöschte Inhalte behalten ihre Verknüpfung bis zur Freigabe.
create or replace function private.sync_note_media()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.note_media as link_row
  using new_rows as note_row
  where link_row.user_id = note_row.user_id and link_row.note_id = note_row.id
    and not exists (
      select 1 from pg_catalog.jsonb_each_text(note_row.media) as entry(name, sha1)
      where entry.sha1 = link_row.sha1
    );
  insert into public.note_media (user_id, note_id, sha1)
  select distinct note_row.user_id, note_row.id, entry.sha1
  from new_rows as note_row
  cross join lateral pg_catalog.jsonb_each_text(note_row.media) as entry(name, sha1)
  where entry.sha1 ~ '^[0-9a-f]{40}$'
  on conflict do nothing;
  return null;
end
$$;

revoke all on function private.sync_note_media() from public, anon, authenticated, service_role;

create trigger notes_media_after_insert after insert on public.notes
  referencing new table as new_rows for each statement execute function private.sync_note_media();
create trigger notes_media_after_update after update on public.notes
  referencing new table as new_rows for each statement execute function private.sync_note_media();

-- Reviewstatistik: Vorbereitung je Zeile, Tagesrollup je Anweisung.
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
  perform private.lock_account_sync(new.user_id);
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
    else 0
  end;
  new.statistics_category := case
    when coalesce(new.scheduler_before->'card'->>'state', 'new') in ('new', 'learning') then 'learning'
    when new.scheduler_before->'card'->>'state' = 'relearning' then 'relearning'
    when new.statistics_interval_days >= 21 then 'mature'
    else 'young'
  end;
  new.retention_first := false;

  if new.statistics_interval_days >= 1 then
    select * into previous_first
    from public.review_events as review_row
    where review_row.user_id = new.user_id
      and review_row.card_id = new.card_id
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

create or replace function private.jsonb_add_counts(p_left jsonb, p_right jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select coalesce(pg_catalog.jsonb_object_agg(entry_key, entry_value) filter (where entry_value > 0), '{}'::jsonb)
  from (
    select entry.key as entry_key, sum(entry.value::integer)::integer as entry_value
    from (
      select * from pg_catalog.jsonb_each_text(coalesce(p_left, '{}'::jsonb))
      union all
      select * from pg_catalog.jsonb_each_text(coalesce(p_right, '{}'::jsonb))
    ) as entry
    group by entry.key
  ) as summed;
$$;

revoke all on function private.jsonb_add_counts(jsonb, jsonb) from public, anon, authenticated, service_role;

-- Wendet Ereignisdeltas an; p_sign = 1 für neue, -1 für entfernte Ereignisse, retention_only nur für Erstwertungen.
create or replace function private.apply_review_statistics(p_events jsonb, p_sign integer, p_retention_only boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  rollup record;
begin
  for rollup in
    with events as (
      select (entry->>'user_id')::uuid as user_id, entry->>'deck_id' as deck_id,
        (entry->>'statistics_day')::date as day_key, (entry->>'statistics_hour')::integer as hour,
        entry->>'statistics_category' as category, entry->>'rating' as rating,
        (entry->>'response_time_ms')::integer as response_time_ms,
        (entry->>'retention_first')::boolean as retention_first
      from pg_catalog.jsonb_array_elements(p_events) as entry
      where entry->>'rating' <> 'manual'
    ), hourly as (
      select user_id, deck_id, day_key,
        pg_catalog.jsonb_object_agg(hour::text, review_total) as hourly_reviews,
        pg_catalog.jsonb_object_agg(hour::text, success_total) as hourly_successful
      from (
        select user_id, deck_id, day_key, hour, count(*)::integer as review_total,
          count(*) filter (where rating <> 'again')::integer as success_total
        from events group by 1, 2, 3, 4
      ) as per_hour
      group by 1, 2, 3
    ), ratings as (
      select user_id, deck_id, day_key, pg_catalog.jsonb_object_agg(rating_key, rating_total) as rating_counts
      from (
        select user_id, deck_id, day_key, category || ':' || rating as rating_key, count(*)::integer as rating_total
        from events group by 1, 2, 3, 4
      ) as per_rating
      group by 1, 2, 3
    )
    select events.user_id, events.deck_id, events.day_key,
      count(*)::integer as review_count,
      count(*) filter (where category = 'learning')::integer as learning_count,
      count(*) filter (where category = 'relearning')::integer as relearning_count,
      count(*) filter (where category = 'young')::integer as young_count,
      count(*) filter (where category = 'mature')::integer as mature_count,
      count(*) filter (where rating <> 'again')::integer as successful_count,
      count(*) filter (where response_time_ms is not null)::integer as timed_count,
      coalesce(sum(least(greatest(response_time_ms, 0), 60000)), 0)::bigint as duration_ms,
      coalesce(sum(least(greatest(response_time_ms, 0), 60000)) filter (where category = 'learning'), 0)::bigint as duration_learning_ms,
      coalesce(sum(least(greatest(response_time_ms, 0), 60000)) filter (where category = 'relearning'), 0)::bigint as duration_relearning_ms,
      coalesce(sum(least(greatest(response_time_ms, 0), 60000)) filter (where category = 'young'), 0)::bigint as duration_young_ms,
      coalesce(sum(least(greatest(response_time_ms, 0), 60000)) filter (where category = 'mature'), 0)::bigint as duration_mature_ms,
      count(*) filter (where retention_first and category = 'young')::integer as retention_young_count,
      count(*) filter (where retention_first and category = 'young' and rating <> 'again')::integer as retention_young_remembered,
      count(*) filter (where retention_first and category = 'mature')::integer as retention_mature_count,
      count(*) filter (where retention_first and category = 'mature' and rating <> 'again')::integer as retention_mature_remembered,
      min(hourly.hourly_reviews::text)::jsonb as hourly_reviews,
      min(hourly.hourly_successful::text)::jsonb as hourly_successful,
      min(ratings.rating_counts::text)::jsonb as rating_counts
    from events
    join hourly using (user_id, deck_id, day_key)
    join ratings using (user_id, deck_id, day_key)
    group by events.user_id, events.deck_id, events.day_key
    order by 1, 2, 3
  loop
    insert into public.review_statistics_daily (user_id, deck_id, day_key)
    values (rollup.user_id, rollup.deck_id, rollup.day_key)
    on conflict (user_id, deck_id, day_key) do nothing;

    if p_retention_only then
      update public.review_statistics_daily set
        retention_young_count = greatest(retention_young_count + p_sign * rollup.retention_young_count, 0),
        retention_young_remembered = greatest(retention_young_remembered + p_sign * rollup.retention_young_remembered, 0),
        retention_mature_count = greatest(retention_mature_count + p_sign * rollup.retention_mature_count, 0),
        retention_mature_remembered = greatest(retention_mature_remembered + p_sign * rollup.retention_mature_remembered, 0)
      where user_id = rollup.user_id and deck_id = rollup.deck_id and day_key = rollup.day_key;
    else
      update public.review_statistics_daily set
        review_count = greatest(review_count + p_sign * rollup.review_count, 0),
        learning_count = greatest(learning_count + p_sign * rollup.learning_count, 0),
        relearning_count = greatest(relearning_count + p_sign * rollup.relearning_count, 0),
        young_count = greatest(young_count + p_sign * rollup.young_count, 0),
        mature_count = greatest(mature_count + p_sign * rollup.mature_count, 0),
        successful_count = greatest(successful_count + p_sign * rollup.successful_count, 0),
        timed_count = greatest(timed_count + p_sign * rollup.timed_count, 0),
        duration_ms = greatest(duration_ms + p_sign * rollup.duration_ms, 0),
        duration_learning_ms = greatest(duration_learning_ms + p_sign * rollup.duration_learning_ms, 0),
        duration_relearning_ms = greatest(duration_relearning_ms + p_sign * rollup.duration_relearning_ms, 0),
        duration_young_ms = greatest(duration_young_ms + p_sign * rollup.duration_young_ms, 0),
        duration_mature_ms = greatest(duration_mature_ms + p_sign * rollup.duration_mature_ms, 0),
        retention_young_count = greatest(retention_young_count + p_sign * rollup.retention_young_count, 0),
        retention_young_remembered = greatest(retention_young_remembered + p_sign * rollup.retention_young_remembered, 0),
        retention_mature_count = greatest(retention_mature_count + p_sign * rollup.retention_mature_count, 0),
        retention_mature_remembered = greatest(retention_mature_remembered + p_sign * rollup.retention_mature_remembered, 0),
        hourly_reviews = case when p_sign > 0 then private.jsonb_add_counts(hourly_reviews, rollup.hourly_reviews)
          else private.jsonb_add_counts(hourly_reviews, (select pg_catalog.jsonb_object_agg(key, -value::integer) from pg_catalog.jsonb_each_text(rollup.hourly_reviews))) end,
        hourly_successful = case when p_sign > 0 then private.jsonb_add_counts(hourly_successful, rollup.hourly_successful)
          else private.jsonb_add_counts(hourly_successful, (select pg_catalog.jsonb_object_agg(key, -value::integer) from pg_catalog.jsonb_each_text(rollup.hourly_successful))) end,
        rating_counts = case when p_sign > 0 then private.jsonb_add_counts(rating_counts, rollup.rating_counts)
          else private.jsonb_add_counts(rating_counts, (select pg_catalog.jsonb_object_agg(key, -value::integer) from pg_catalog.jsonb_each_text(rollup.rating_counts))) end
      where user_id = rollup.user_id and deck_id = rollup.deck_id and day_key = rollup.day_key;
    end if;

    delete from public.review_statistics_daily
    where user_id = rollup.user_id and deck_id = rollup.deck_id and day_key = rollup.day_key
      and review_count = 0 and retention_young_count = 0 and retention_mature_count = 0;
  end loop;
end
$$;

revoke all on function private.apply_review_statistics(jsonb, integer, boolean) from public, anon, authenticated, service_role;

create or replace function private.review_statistics_after_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.apply_review_statistics(
    coalesce((select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(new_row)) from new_rows as new_row), '[]'::jsonb), 1, false);
  return null;
end
$$;

create or replace function private.review_statistics_after_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.apply_review_statistics(coalesce((
    select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(old_row))
    from old_rows as old_row join new_rows as new_row using (user_id, id)
    where old_row.retention_first and not new_row.retention_first
  ), '[]'::jsonb), -1, true);
  perform private.apply_review_statistics(coalesce((
    select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(new_row))
    from old_rows as old_row join new_rows as new_row using (user_id, id)
    where new_row.retention_first and not old_row.retention_first
  ), '[]'::jsonb), 1, true);
  return null;
end
$$;

create or replace function private.review_statistics_after_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.apply_review_statistics(
    coalesce((select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(old_row)) from old_rows as old_row), '[]'::jsonb), -1, false);
  update public.review_events as review_row
  set retention_first = true
  from (
    select distinct on (candidate.user_id, candidate.card_id, candidate.statistics_day) candidate.user_id, candidate.id
    from old_rows as removed
    join public.review_events as candidate
      on candidate.user_id = removed.user_id and candidate.card_id = removed.card_id
     and candidate.statistics_day = removed.statistics_day
    where removed.retention_first and candidate.statistics_interval_days >= 1 and candidate.rating <> 'manual'
      and not exists (
        select 1 from public.review_events as kept
        where kept.user_id = candidate.user_id and kept.card_id = candidate.card_id
          and kept.statistics_day = candidate.statistics_day and kept.retention_first
      )
    order by candidate.user_id, candidate.card_id, candidate.statistics_day, candidate.answered_at, candidate.id
  ) as promoted
  where review_row.user_id = promoted.user_id and review_row.id = promoted.id;
  return null;
end
$$;

revoke all on function private.review_statistics_after_insert() from public, anon, authenticated, service_role;
revoke all on function private.review_statistics_after_update() from public, anon, authenticated, service_role;
revoke all on function private.review_statistics_after_delete() from public, anon, authenticated, service_role;

create trigger review_events_prepare_statistics before insert on public.review_events
  for each row execute function private.prepare_review_statistics();
create trigger review_events_statistics_after_insert after insert on public.review_events
  referencing new table as new_rows for each statement execute function private.review_statistics_after_insert();
create trigger review_events_statistics_after_update after update on public.review_events
  referencing old table as old_rows new table as new_rows for each statement execute function private.review_statistics_after_update();
create trigger review_events_statistics_after_delete after delete on public.review_events
  referencing old table as old_rows for each statement execute function private.review_statistics_after_delete();

-- Atomare Reviewaufzeichnung auf den typisierten Kartenspalten.
create or replace function public.record_review_atomic(
  p_card_id text,
  p_study jsonb,
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
  event_answered_at timestamptz := (p_event->>'answered_at')::timestamptz;
  persisted_card public.cards%rowtype;
  persisted_variant public.card_variants%rowtype;
  persisted_event public.review_events%rowtype;
begin
  if current_user_id is null then
    raise exception 'Authentifizierung erforderlich.' using errcode = '42501';
  end if;
  if event_id is null or event_id = '' or p_device_id is null or p_device_id = '' or p_card_id is null
    or p_event->>'card_id' is distinct from p_card_id then
    raise exception 'Review-Mutation ist unvollständig.' using errcode = '22023';
  end if;

  select * into persisted_card from public.cards
  where user_id = current_user_id and id = p_card_id and deleted_at is null
  for update;
  if persisted_card.id is null then
    raise exception 'Karte wurde nicht gefunden.' using errcode = 'P0002';
  end if;
  if p_variant_id is not null then
    select * into persisted_variant from public.card_variants
    where user_id = current_user_id and id = p_variant_id and card_id = p_card_id and deleted_at is null
    for update;
    if persisted_variant.id is null then
      raise exception 'Variante wurde nicht gefunden.' using errcode = 'P0002';
    end if;
  end if;

  insert into public.review_events (
    user_id, id, card_id, deck_id, variant_id, rating, answered_at, response_time_ms,
    scheduler_before, scheduler_after, flags, created_at, created_by_device_id
  ) values (
    current_user_id, event_id, p_card_id, p_event->>'deck_id', p_variant_id, p_event->>'rating',
    event_answered_at, nullif(p_event->>'response_time_ms', '')::integer,
    p_event->'scheduler_before', p_event->'scheduler_after', coalesce(p_event->'flags', '{}'::jsonb),
    coalesce((p_event->>'created_at')::timestamptz, event_answered_at), p_device_id
  )
  on conflict (user_id, id) do nothing
  returning * into persisted_event;

  if persisted_event.id is null then
    select * into persisted_event from public.review_events where user_id = current_user_id and id = event_id;
    if persisted_event.card_id is distinct from p_card_id
      or persisted_event.rating is distinct from p_event->>'rating'
      or persisted_event.answered_at is distinct from event_answered_at then
      raise exception 'Review-Event-ID kollidiert mit einer anderen Mutation.' using errcode = '23505';
    end if;
    return pg_catalog.jsonb_build_object(
      'card', pg_catalog.to_jsonb(persisted_card),
      'variant', case when p_variant_id is null then null else pg_catalog.to_jsonb(persisted_variant) end,
      'event', pg_catalog.to_jsonb(persisted_event),
      'idempotent', true
    );
  end if;

  update public.cards set
    state = p_study->>'state',
    due_at = (p_study->>'due_at')::timestamptz,
    stability = (p_study->>'stability')::double precision,
    difficulty = (p_study->>'difficulty')::double precision,
    reps = (p_study->>'reps')::integer,
    lapses = (p_study->>'lapses')::integer,
    interval_days = (p_study->>'interval_days')::double precision,
    learning_step_index = (p_study->>'learning_step_index')::integer,
    last_reviewed_at = nullif(p_study->>'last_reviewed_at', '')::timestamptz,
    last_rating = nullif(p_study->>'last_rating', ''),
    study_extra = coalesce(p_study->'study_extra', '{}'::jsonb),
    study_revision = study_revision + 1,
    updated_at = coalesce(p_card_updated_at, now()),
    updated_by_device_id = p_device_id
  where user_id = current_user_id
    and id = p_card_id
    and deleted_at is null
    and not exists (
      select 1 from public.review_events as candidate
      where candidate.user_id = current_user_id
        and candidate.card_id = p_card_id
        and candidate.id <> event_id
        and (candidate.answered_at, candidate.id) > (event_answered_at, event_id)
    )
  returning * into persisted_card;
  if persisted_card.id is null then
    select * into persisted_card from public.cards where user_id = current_user_id and id = p_card_id;
  end if;

  if p_variant_id is not null then
    update public.card_variants set
      performance = coalesce(p_variant_performance, '{}'::jsonb),
      updated_at = coalesce(p_variant_updated_at, p_card_updated_at, now()),
      updated_by_device_id = p_device_id
    where user_id = current_user_id
      and id = p_variant_id
      and card_id = p_card_id
      and deleted_at is null
      and not exists (
        select 1 from public.review_events as candidate
        where candidate.user_id = current_user_id
          and candidate.card_id = p_card_id
          and candidate.variant_id = p_variant_id
          and candidate.id <> event_id
          and (candidate.answered_at, candidate.id) > (event_answered_at, event_id)
      )
    returning * into persisted_variant;
    if persisted_variant.id is null then
      select * into persisted_variant from public.card_variants where user_id = current_user_id and id = p_variant_id;
    end if;
  end if;

  return pg_catalog.jsonb_build_object(
    'card', pg_catalog.to_jsonb(persisted_card),
    'variant', case when p_variant_id is null then null else pg_catalog.to_jsonb(persisted_variant) end,
    'event', pg_catalog.to_jsonb(persisted_event),
    'idempotent', false
  );
end
$$;

-- Erster Dashboard-Render: Profil, Stapelbaum mit Zählern und heutige Lernzahlen; Prognose und Statistik laden nach.
create or replace function public.get_account_bootstrap(
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
  with learning_context as materialized (
    select
      coalesce(profile_row.timezone, 'UTC') as time_zone,
      least(greatest(case
        when profile_row.scheduler_preferences->>'dayStartHour' ~ '^\d{1,2}$'
          then (profile_row.scheduler_preferences->>'dayStartHour')::integer
        else 0
      end, 0), 23) as day_start_hour
    from (select 1) as singleton
    left join public.profiles as profile_row on profile_row.id = (select auth.uid())
  ), learning_range as materialized (
    select time_zone, day_start_hour, day_key,
      (day_key::timestamp + pg_catalog.make_interval(hours => day_start_hour)) at time zone time_zone as starts_at,
      ((day_key + 1)::timestamp + pg_catalog.make_interval(hours => day_start_hour)) at time zone time_zone as ends_at
    from (
      select learning_context.*,
        ((now() at time zone time_zone) - pg_catalog.make_interval(hours => day_start_hour))::date as day_key
      from learning_context
    ) as dated
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
          'syncChangeId', coalesce(summary_row.sync_change_id, 0),
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
  ), today_events as materialized (
    select review_row.deck_id, review_row.card_id,
      bool_or(coalesce(review_row.scheduler_before->'card'->>'state', 'new') = 'new') as introduced
    from public.review_events as review_row, learning_range
    where coalesce(p_cursor, '') = ''
      and review_row.user_id = (select auth.uid())
      and review_row.rating <> 'manual'
      and review_row.answered_at >= learning_range.starts_at
      and review_row.answered_at < learning_range.ends_at
    group by review_row.deck_id, review_row.card_id
  ), available as materialized (
    select card_row.deck_id,
      count(*) filter (where card_row.state = 'new')::integer as new_count,
      count(*) filter (where card_row.state in ('learning', 'relearning'))::integer as learning_count,
      count(*) filter (where card_row.state = 'review')::integer as due_count
    from public.cards as card_row, learning_range
    where coalesce(p_cursor, '') = ''
      and card_row.user_id = (select auth.uid())
      and card_row.status = 'active'
      and card_row.deleted_at is null
      and card_row.due_at < learning_range.ends_at
    group by card_row.deck_id
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
        select pg_catalog.jsonb_object_agg(deck_id, total order by deck_id)
        from (select deck_id, count(*)::integer as total from today_events where introduced group by deck_id) as introduced
      ), '{}'::jsonb),
      'reviewedTodayByDeck', coalesce((
        select pg_catalog.jsonb_object_agg(deck_id, total order by deck_id)
        from (select deck_id, count(*)::integer as total from today_events where not introduced group by deck_id) as reviewed
      ), '{}'::jsonb),
      'availableNewByDeck', coalesce((
        select pg_catalog.jsonb_object_agg(deck_id, new_count order by deck_id) from available where new_count > 0
      ), '{}'::jsonb),
      'availableLearningByDeck', coalesce((
        select pg_catalog.jsonb_object_agg(deck_id, learning_count order by deck_id) from available where learning_count > 0
      ), '{}'::jsonb),
      'dueByDeck', coalesce((
        select pg_catalog.jsonb_object_agg(deck_id, due_count order by deck_id) from available where due_count > 0
      ), '{}'::jsonb),
      'forecastByDay', '{}'::jsonb,
      'generatedAt', now()
    ) else null end
  );
$$;

-- Nachgeladene 365-Tage-Prognose eindeutiger nächster Kartenfälligkeiten.
create or replace function public.get_account_due_forecast()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with learning_range as materialized (
    select time_zone, day_start_hour,
      (((now() at time zone time_zone) - pg_catalog.make_interval(hours => day_start_hour))::date + 1)::timestamp
        + pg_catalog.make_interval(hours => day_start_hour) as local_ends_at
    from (
      select
        coalesce(profile_row.timezone, 'UTC') as time_zone,
        least(greatest(case
          when profile_row.scheduler_preferences->>'dayStartHour' ~ '^\d{1,2}$'
            then (profile_row.scheduler_preferences->>'dayStartHour')::integer
          else 0
        end, 0), 23) as day_start_hour
      from (select 1) as singleton
      left join public.profiles as profile_row on profile_row.id = (select auth.uid())
    ) as context
  ), bounds as materialized (
    select time_zone, day_start_hour, local_ends_at at time zone time_zone as ends_at from learning_range
  )
  select pg_catalog.jsonb_build_object(
    'contextKey', (select time_zone || ':' || day_start_hour::text from bounds),
    'forecastByDay', coalesce((
      select pg_catalog.jsonb_object_agg(day_key, due_count order by day_key)
      from (
        select ((card_row.due_at at time zone bounds.time_zone)
                  - pg_catalog.make_interval(hours => bounds.day_start_hour))::date::text as day_key,
               count(*)::integer as due_count
        from public.cards as card_row, bounds
        where card_row.user_id = (select auth.uid())
          and card_row.status = 'active'
          and card_row.deleted_at is null
          and card_row.state <> 'new'
          and card_row.due_at >= bounds.ends_at
          and card_row.due_at < bounds.ends_at + interval '365 days'
        group by 1
      ) as forecast
    ), '{}'::jsonb),
    'generatedAt', now()
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

-- Kartenverwaltung: Keyset-Seite je Stapel; Inhaltssuche über den Trigramm-Index der Inhalte.
create or replace function public.list_account_card_catalog(
  p_deck_id text,
  p_query text default '',
  p_sort_field text default 'sortField',
  p_sort_direction text default 'asc',
  p_cursor jsonb default null,
  p_limit integer default 50,
  p_include_total boolean default false
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
  query_pattern text;
  page_limit integer := least(greatest(p_limit, 1), 50);
  sort_expression text;
  cursor_expression text;
  cursor_output_expression text;
  sort_direction text;
  cursor_operator text;
  search_condition text := '';
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

  if query_text <> '' then
    query_pattern := '%' || pg_catalog.replace(pg_catalog.replace(pg_catalog.replace(query_text, '\', '\\'), '%', '\%'), '_', '\_') || '%';
    search_condition := 'and catalog_row.note_id in (select note_row.id from public.notes as note_row where note_row.user_id = $1 and note_row.search_text like $3)';
  end if;

  if p_include_total then
    execute pg_catalog.format($count$
      select count(*) from public.card_catalog as catalog_row
      where catalog_row.user_id = $1 and catalog_row.deck_id = $2 and catalog_row.deleted_at is null %s
    $count$, search_condition)
    into total_count
    using current_user_id, p_deck_id, query_pattern;
  end if;

  execute pg_catalog.format($query$
    with page_candidates as materialized (
      select catalog_row.*, %3$s as sort_value
      from public.card_catalog as catalog_row
      where catalog_row.user_id = $1
        and catalog_row.deck_id = $2
        and catalog_row.deleted_at is null
        %6$s
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
  $query$, sort_expression, cursor_operator, cursor_output_expression, cursor_expression, sort_direction, search_condition)
  into response
  using current_user_id, p_deck_id, query_pattern, p_cursor, page_limit, total_count;

  return response;
end
$$;

-- Kartenkörper: angefragte Karten sowie alle Karten angefragter Inhalte, mit Inhalten und Varianten.
create or replace function public.hydrate_account_cards(p_card_ids text[], p_note_ids text[] default '{}'::text[])
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
begin
  if coalesce(pg_catalog.array_length(p_card_ids, 1), 0) > 50 or coalesce(pg_catalog.array_length(p_note_ids, 1), 0) > 50 then
    raise exception 'Höchstens 50 Karten oder Inhalte können gleichzeitig geladen werden.' using errcode = '22023';
  end if;
  return (
    with selected_cards as materialized (
      select card_row.*
      from public.cards as card_row
      where card_row.user_id = (select auth.uid())
        and (card_row.id = any(coalesce(p_card_ids, '{}'::text[])) or card_row.note_id = any(coalesce(p_note_ids, '{}'::text[])))
    )
    select pg_catalog.jsonb_build_object(
      'cards', coalesce((select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(card_row) order by card_row.id) from selected_cards as card_row), '[]'::jsonb),
      'variants', coalesce((
        select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(variant_row) order by variant_row.card_id, variant_row.id)
        from public.card_variants as variant_row
        where variant_row.user_id = (select auth.uid()) and variant_row.card_id in (select id from selected_cards)
      ), '[]'::jsonb),
      'notes', coalesce((
        select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(note_row) order by note_row.id)
        from public.notes as note_row
        where note_row.user_id = (select auth.uid())
          and (note_row.id in (select note_id from selected_cards) or note_row.id = any(coalesce(p_note_ids, '{}'::text[])))
      ), '[]'::jsonb)
    )
  );
end
$$;

-- Offline-Download eines Stapels: Kartenrevisionen und referenzierte Medien je Seite.
create or replace function public.get_deck_offline_manifest(
  p_deck_id text,
  p_cursor text default '',
  p_limit integer default 50,
  p_include_total boolean default false
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
        'studyRevision', page.study_revision,
        'dependencyRevision', page.dependency_revision,
        'bodyBytes', coalesce((
          select pg_catalog.octet_length(pg_catalog.to_jsonb(card_row)::text)
            + pg_catalog.octet_length(pg_catalog.to_jsonb(note_row)::text)
            + coalesce((
              select sum(pg_catalog.octet_length(pg_catalog.to_jsonb(variant_row)::text))
              from public.card_variants as variant_row
              where variant_row.user_id = card_row.user_id and variant_row.card_id = card_row.id
            ), 0)
          from public.cards as card_row
          join public.notes as note_row on note_row.user_id = card_row.user_id and note_row.id = card_row.note_id
          where card_row.user_id = page.user_id and card_row.id = page.id
        ), 0),
        'updatedAt', page.updated_at
      ) order by page.id) from page
    ), '[]'::jsonb),
    'media', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'sha1', media_row.sha1, 'size', media_row.size, 'mimeType', media_row.mime_type,
        'originalName', media_row.original_name, 'storagePath', media_row.storage_path,
        'createdAt', media_row.created_at
      ) order by media_row.sha1)
      from public.media_files as media_row
      where media_row.user_id = (select auth.uid())
        and media_row.sha1 in (
          select link_row.sha1 from public.note_media as link_row
          where link_row.user_id = (select auth.uid()) and link_row.note_id in (select note_id from page)
        )
    ), '[]'::jsonb),
    'nextCursor', coalesce((select max(id) from page), coalesce(p_cursor, '')),
    'hasMore', (select count(*) from candidates) > (select count(*) from page),
    'totalCount', case when p_include_total then (
      select count(*) from public.card_catalog as total_row
      where total_row.user_id = (select auth.uid()) and total_row.deck_id = p_deck_id and total_row.deleted_at is null
    ) else null end
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
  with scoped_cards as materialized (
    select card_row.deck_id, card_row.due_at, card_row.state, card_row.status,
      coalesce(nullif(card_row.study_extra->>'maturityBand', ''), 'new') as maturity_band,
      card_row.interval_days, card_row.difficulty, card_row.stability, card_row.last_reviewed_at,
      card_row.deleted_at, card_row.created_at,
      (select count(*)::integer from public.card_variants as variant_row
        where variant_row.user_id = card_row.user_id and variant_row.card_id = card_row.id
          and variant_row.deleted_at is null and variant_row.is_active and variant_row.quality_status = 'active') as active_variant_count
    from public.cards as card_row
    where card_row.user_id = (select auth.uid())
      and (p_deck_ids is null or card_row.deck_id = any(p_deck_ids))
  ), current_states as materialized (
    select deck_id, due_at, interval_days, difficulty, stability, last_reviewed_at
    from scoped_cards
    where deleted_at is null and status = 'active'
  ), card_totals as materialized (
    select
      count(*) filter (where deleted_at is null)::integer as total,
      count(*) filter (where deleted_at is null and state = 'new')::integer as new_count,
      count(*) filter (where deleted_at is null and state in ('learning', 'relearning'))::integer as learning_count,
      count(*) filter (where deleted_at is null and maturity_band in ('mature', 'variant_ready', 'mastered'))::integer as mature_count,
      count(*) filter (where deleted_at is null and status <> 'active')::integer as suspended_count,
      count(*) filter (where deleted_at is null and status = 'active' and state <> 'new' and due_at < now())::integer as overdue_count,
      coalesce(sum(1 + active_variant_count) filter (where deleted_at is null and status = 'active'), 0)::integer as active_variants,
      count(*) filter (where deleted_at is not null)::integer as deleted_items
    from scoped_cards
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
    from scoped_cards as card_row
    where (p_from is null or card_row.created_at >= p_from)
      and (p_to is null or card_row.created_at < p_to)
    group by day_key
  ), forecast_daily as materialized (
    select
      ((card_row.due_at at time zone p_time_zone)
        - pg_catalog.make_interval(hours => least(greatest(p_day_start_hour, 0), 23)))::date::text as day_key,
      count(*) filter (where card_row.state in ('new', 'learning'))::integer as learning,
      count(*) filter (where card_row.state = 'relearning')::integer as relearning,
      count(*) filter (where card_row.state not in ('new', 'learning', 'relearning')
        and card_row.maturity_band not in ('mature', 'variant_ready', 'mastered'))::integer as young,
      count(*) filter (where card_row.state not in ('new', 'learning', 'relearning')
        and card_row.maturity_band in ('mature', 'variant_ready', 'mastered'))::integer as mature,
      count(*)::integer as total
    from scoped_cards as card_row
    where card_row.deleted_at is null and card_row.status = 'active' and card_row.due_at >= now()
      and card_row.due_at < now() + interval '365 days'
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
    select round(avg(interval_days)::numeric, 1) as average_days,
      percentile_cont(0.5) within group (order by interval_days) as median_days,
      percentile_cont(0.95) within group (order by interval_days) as percentile_95_days,
      round(sum(1 / greatest(interval_days, 1))::numeric, 1) as daily_workload
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
          / stability,
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
      'total', (select total from card_totals),
      'new', (select new_count from card_totals),
      'learning', (select learning_count from card_totals),
      'mature', (select mature_count from card_totals),
      'suspended', (select suspended_count from card_totals)
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
    'overdue', (select overdue_count from card_totals),
    'dueTomorrow', coalesce((select sum(total) from forecast_daily where day_key = (
      (((now() at time zone p_time_zone) - pg_catalog.make_interval(hours => least(greatest(p_day_start_hour, 0), 23)))::date + 1)::text
    )), 0),
    'dailyWorkload', coalesce((select daily_workload from interval_statistics), 0),
    'status', pg_catalog.jsonb_build_object(
      'activeVariants', (select active_variants from card_totals),
      'deletedItems', (select deleted_items from card_totals)
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

-- Stapelbaum löschen; Inhalte ohne verbleibende Karte werden wie in Anki mitgelöscht.
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
  affected_note_ids text[] := '{}'::text[];
  deleted_card_count integer := 0;
  deleted_note_count integer := 0;
begin
  if (select auth.uid()) is null then
    raise exception 'Anmeldung erforderlich.' using errcode = '42501';
  end if;

  with recursive owned_decks as (
    select deck_row.id
    from public.decks as deck_row
    where deck_row.user_id = (select auth.uid()) and deck_row.id = p_deck_id and deck_row.deleted_at is null
    union all
    select child_row.id
    from public.decks as child_row
    join owned_decks as parent_row on child_row.parent_deck_id = parent_row.id
    where child_row.user_id = (select auth.uid()) and child_row.deleted_at is null
  )
  select coalesce(pg_catalog.array_agg(id order by id), '{}'::text[]) into deleted_deck_ids from owned_decks;

  if coalesce(pg_catalog.array_length(deleted_deck_ids, 1), 0) = 0 then
    return pg_catalog.jsonb_build_object('deletedDeckIds', '[]'::jsonb, 'deletedCardCount', 0, 'deletedNoteCount', 0);
  end if;

  select coalesce(pg_catalog.array_agg(distinct card_row.note_id), '{}'::text[]) into affected_note_ids
  from public.cards as card_row
  where card_row.user_id = (select auth.uid()) and card_row.deck_id = any(deleted_deck_ids) and card_row.deleted_at is null;

  update public.card_variants as variant_row
  set deleted_at = p_deleted_at, updated_at = p_deleted_at, updated_by_device_id = p_device_id, revision = variant_row.revision + 1
  from public.cards as card_row
  where variant_row.user_id = (select auth.uid())
    and card_row.user_id = variant_row.user_id and card_row.id = variant_row.card_id
    and card_row.deck_id = any(deleted_deck_ids) and variant_row.deleted_at is null;

  update public.cards as card_row
  set deleted_at = p_deleted_at, updated_at = p_deleted_at, updated_by_device_id = p_device_id, revision = card_row.revision + 1
  where card_row.user_id = (select auth.uid()) and card_row.deck_id = any(deleted_deck_ids) and card_row.deleted_at is null;
  get diagnostics deleted_card_count = row_count;

  update public.notes as note_row
  set deleted_at = p_deleted_at, updated_at = p_deleted_at, updated_by_device_id = p_device_id, revision = note_row.revision + 1
  where note_row.user_id = (select auth.uid())
    and note_row.id = any(affected_note_ids)
    and note_row.deleted_at is null
    and not exists (
      select 1 from public.cards as remaining
      where remaining.user_id = note_row.user_id and remaining.note_id = note_row.id and remaining.deleted_at is null
    );
  get diagnostics deleted_note_count = row_count;

  update public.decks as deck_row
  set deleted_at = p_deleted_at, updated_at = p_deleted_at, updated_by_device_id = p_device_id, revision = deck_row.revision + 1
  where deck_row.user_id = (select auth.uid()) and deck_row.id = any(deleted_deck_ids) and deck_row.deleted_at is null;

  return pg_catalog.jsonb_build_object(
    'deletedDeckIds', pg_catalog.to_jsonb(deleted_deck_ids),
    'deletedCardCount', deleted_card_count,
    'deletedNoteCount', deleted_note_count
  );
end
$$;

-- Neuübersetzung (K5.4): unbearbeitete Importe mit veraltetem Übersetzer samt Quelle und Karten.
create or replace function public.list_retranslation_candidates(
  p_current_versions jsonb,
  p_cursor text default '',
  p_limit integer default 100
)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with candidates as materialized (
    select note_row.*
    from public.notes as note_row
    where note_row.user_id = (select auth.uid())
      and note_row.source = 'anki-apkg'
      and note_row.deleted_at is null
      and note_row.translator_id is not null
      and note_row.content_revision = note_row.imported_content_revision
      and p_current_versions ? note_row.translator_id
      and note_row.translator_version < (p_current_versions->>note_row.translator_id)::integer
      and note_row.id > coalesce(p_cursor, '')
    order by note_row.id
    limit least(greatest(p_limit, 1), 200) + 1
  ), page as materialized (
    select * from candidates order by id limit least(greatest(p_limit, 1), 200)
  )
  select pg_catalog.jsonb_build_object(
    'notes', coalesce((select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(page) order by page.id) from page), '[]'::jsonb),
    'noteSources', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(source_row) order by source_row.id)
      from public.note_sources as source_row
      where source_row.user_id = (select auth.uid()) and source_row.id in (select id from page)
    ), '[]'::jsonb),
    'noteTypeSources', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(type_row) order by type_row.id)
      from public.note_type_sources as type_row
      where type_row.user_id = (select auth.uid()) and type_row.id in (select note_type_source_id from page)
    ), '[]'::jsonb),
    'cards', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(card_row) order by card_row.id)
      from public.cards as card_row
      where card_row.user_id = (select auth.uid()) and card_row.note_id in (select id from page) and card_row.deleted_at is null
    ), '[]'::jsonb),
    'nextCursor', coalesce((select max(id) from page), coalesce(p_cursor, '')),
    'hasMore', (select count(*) from candidates) > (select count(*) from page)
  );
$$;

-- Reimport (K5.7): bestehende Inhalte je Anki-GUID samt Identität ihrer Karten.
create or replace function public.load_reimport_targets(p_guids text[])
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
begin
  if coalesce(pg_catalog.array_length(p_guids, 1), 0) > 2000 then
    raise exception 'Höchstens 2.000 Anki-GUIDs können gleichzeitig zugeordnet werden.' using errcode = '22023';
  end if;
  return (
    with target_notes as materialized (
      select note_row.*
      from public.notes as note_row
      where note_row.user_id = (select auth.uid())
        and note_row.anki_guid = any(coalesce(p_guids, '{}'::text[]))
        and note_row.deleted_at is null
    )
    select pg_catalog.jsonb_build_object(
      'notes', coalesce((select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(note_row) order by note_row.id) from target_notes as note_row), '[]'::jsonb),
      'noteTypeSources', coalesce((
        select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('id', type_row.id, 'ankiNotetypeId', type_row.anki_notetype_id) order by type_row.id)
        from public.note_type_sources as type_row
        where type_row.user_id = (select auth.uid())
          and type_row.id in (select note_type_source_id from target_notes)
      ), '[]'::jsonb),
      'cards', coalesce((
        select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
          'id', card_row.id, 'noteId', card_row.note_id, 'deckId', card_row.deck_id,
          'promptKey', card_row.prompt_key, 'ankiCardId', card_row.anki_card_id
        ) order by card_row.id)
        from public.cards as card_row
        where card_row.user_id = (select auth.uid())
          and card_row.note_id in (select id from target_notes)
          and card_row.deleted_at is null
      ), '[]'::jsonb)
    )
  );
end
$$;

-- Medienfreigabe: Dateien ohne Verweis eines aktiven oder seit sieben Tagen gelöschten Inhalts.
create or replace function public.list_releasable_media(p_limit integer default 100)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'sha1', releasable.sha1, 'storagePath', releasable.storage_path
  ) order by releasable.sha1), '[]'::jsonb)
  from (
    select media_row.sha1, media_row.storage_path
    from public.media_files as media_row
    where media_row.user_id = (select auth.uid())
      and media_row.created_at < now() - interval '1 day'
      and not exists (
        select 1
        from public.note_media as link_row
        join public.notes as note_row on note_row.user_id = link_row.user_id and note_row.id = link_row.note_id
        where link_row.user_id = media_row.user_id and link_row.sha1 = media_row.sha1
          and (note_row.deleted_at is null or note_row.deleted_at > now() - interval '7 days')
      )
    order by media_row.sha1
    limit least(greatest(p_limit, 1), 500)
  ) as releasable;
$$;

revoke all privileges on table
  public.profiles, public.decks, public.note_type_sources, public.notes, public.note_sources,
  public.cards, public.card_variants, public.review_events, public.review_statistics_daily,
  public.media_files, public.note_media, public.sync_devices, public.sync_conflicts,
  public.card_catalog, public.deck_study_summaries
from anon;

alter default privileges for role postgres in schema public
  revoke select, insert, update, delete on tables from anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  revoke usage, select on sequences from anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  revoke execute on functions from anon, authenticated, service_role, public;

grant usage on schema public to authenticated, service_role;
grant select, insert, update, delete on table
  public.profiles, public.decks, public.note_type_sources, public.notes, public.note_sources,
  public.cards, public.card_variants, public.review_events, public.media_files,
  public.sync_devices, public.sync_conflicts
to authenticated;
grant select on table public.review_statistics_daily, public.note_media, public.card_catalog, public.deck_study_summaries
  to authenticated;
grant all privileges on table
  public.profiles, public.decks, public.note_type_sources, public.notes, public.note_sources,
  public.cards, public.card_variants, public.review_events, public.review_statistics_daily,
  public.media_files, public.note_media, public.sync_devices, public.sync_conflicts,
  public.card_catalog, public.deck_study_summaries
to service_role;

revoke all on function public.record_review_atomic(text, jsonb, timestamptz, text, jsonb, timestamptz, jsonb, text) from public, anon;
revoke all on function public.get_account_bootstrap(text, integer, integer) from public, anon;
revoke all on function public.get_account_due_forecast() from public, anon;
revoke all on function public.pull_account_catalog_delta(bigint, integer, integer) from public, anon;
revoke all on function public.list_account_card_catalog(text, text, text, text, jsonb, integer, boolean) from public, anon;
revoke all on function public.hydrate_account_cards(text[], text[]) from public, anon;
revoke all on function public.get_deck_offline_manifest(text, text, integer, boolean) from public, anon;
revoke all on function public.get_account_statistics(text[], timestamptz, timestamptz, text, integer) from public, anon;
revoke all on function public.delete_account_deck_tree(text, timestamptz, text) from public, anon;
revoke all on function public.list_retranslation_candidates(jsonb, text, integer) from public, anon;
revoke all on function public.list_releasable_media(integer) from public, anon;
revoke all on function public.load_reimport_targets(text[]) from public, anon;

grant execute on function public.record_review_atomic(text, jsonb, timestamptz, text, jsonb, timestamptz, jsonb, text) to authenticated, service_role;
grant execute on function public.get_account_bootstrap(text, integer, integer) to authenticated, service_role;
grant execute on function public.get_account_due_forecast() to authenticated, service_role;
grant execute on function public.pull_account_catalog_delta(bigint, integer, integer) to authenticated, service_role;
grant execute on function public.list_account_card_catalog(text, text, text, text, jsonb, integer, boolean) to authenticated, service_role;
grant execute on function public.hydrate_account_cards(text[], text[]) to authenticated, service_role;
grant execute on function public.get_deck_offline_manifest(text, text, integer, boolean) to authenticated, service_role;
grant execute on function public.get_account_statistics(text[], timestamptz, timestamptz, text, integer) to authenticated, service_role;
grant execute on function public.delete_account_deck_tree(text, timestamptz, text) to authenticated, service_role;
grant execute on function public.list_retranslation_candidates(jsonb, text, integer) to authenticated, service_role;
grant execute on function public.list_releasable_media(integer) to authenticated, service_role;
grant execute on function public.load_reimport_targets(text[]) to authenticated, service_role;

commit;
