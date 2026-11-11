-- Kartenverwaltung 2.0 (ADR-048), Cutover vor dem Release: der Endstand der zehn Schritt-Migrationen
-- `20261104220000_kartensuche_volltext` bis `20261110120000_treffer_lernen_tageslimits` in einer Migration.
--
-- - `note_search`: Volltext und Feldtexte je Inhalt für die lokale Suche, im Katalog-Delta-Sync, gepflegt aus `notes`.
-- - `notes.search_fields`: Feldtexte für `Feld:Text`; der Client schreibt sie, die Migration füllt Bestandsinhalte
--   angenähert aus `content`, das nächste Speichern berechnet sie exakt.
-- - `card_catalog`: Lernverlauf, Werte, Inhaltsform, Notiztyp, veraltete Varianten, Abfragenummer, manuelles
--   Zurückstellen und Haltbarkeit als Suchspalten; `refresh_card_catalog` füllt sie, der Backfill einmal für alle.
--   Die Haltbarkeit (`study_extra.durabilityDays`) schreibt nur der Client; ältere Karten haben sie erst nach ihrer
--   nächsten Antwort.
-- - Katalog-RPCs mit Begriffslisten (Klauseln aus `parseCardSearchQuery`), stapelübergreifender Liste und `p_offset`.
-- - `get_account_bootstrap`: Bewertungen mit `flags.kind = 'hit_review'` (Treffer lernen) verbrauchen keine
--   Tageslimits.

begin;

-- Volltext je Inhalt. Er läuft als eigene Zeile je Inhalt durch den Katalog-Delta-Sync und ändert sich nur mit dem
-- Text, nicht mit jeder Bewertung einer Karte.
create table public.note_search (
  user_id uuid not null references auth.users(id) on delete cascade,
  note_id text not null,
  search_text text not null default '',
  sync_change_id bigint not null default 0 check (sync_change_id > 0),
  deleted_at timestamptz,
  updated_at timestamptz not null default now(),
  search_fields jsonb not null default '[]'::jsonb,
  primary key (user_id, note_id),
  constraint note_search_note_owner_fk foreign key (user_id, note_id)
    references public.notes (user_id, id) on delete cascade
);

comment on table public.note_search is 'Volltext je Inhalt für die lokale Kartensuche der Web-Replica.';

create index note_search_user_sync_change_id_idx on public.note_search (user_id, sync_change_id, note_id);

alter table public.note_search enable row level security;

create policy "note_search_owner_select" on public.note_search for select to authenticated
  using ((select auth.uid()) = user_id);

grant select on table public.note_search to authenticated, service_role;

create trigger note_search_stamp_account_sync_change before insert or update on public.note_search
  for each row execute function private.stamp_account_sync_change();

-- Feldtexte für `Feld:Text`; Bestandsinhalte angenähert aus `content`, bevor die Pflege-Trigger existieren.

alter table public.notes add column search_fields jsonb not null default '[]'::jsonb;

update public.notes as note_row set search_fields = coalesce((
  select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('n', field_entry.name, 't', field_entry.text))
  from (
    select
      pg_catalog.regexp_replace(lower(trim(field->>'name')), '\s+', '_', 'g') as name,
      left(trim(pg_catalog.regexp_replace(pg_catalog.replace(lower(pg_catalog.regexp_replace(field->>'html', '<[^>]*>', ' ', 'g')), '&nbsp;', ' '), '\s+', ' ', 'g')), 4000) as text
    from pg_catalog.jsonb_array_elements(note_row.content->'fields') as field
  ) as field_entry
  where field_entry.name <> '' and field_entry.text <> ''
), '[]'::jsonb);

-- Gepflegt nur aus `notes`; eine Zeile ändert sich erst, wenn Text, Feldtexte oder Löschung sich ändern.

create or replace function private.refresh_note_search()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.note_search (user_id, note_id, search_text, search_fields, deleted_at, updated_at)
  select changed_note.user_id, changed_note.id, left(changed_note.search_text, 4000), changed_note.search_fields,
    changed_note.deleted_at, pg_catalog.now()
  from new_rows as changed_note
  on conflict (user_id, note_id) do update set
    search_text = excluded.search_text,
    search_fields = excluded.search_fields,
    deleted_at = excluded.deleted_at,
    updated_at = excluded.updated_at
  where (public.note_search.search_text, public.note_search.search_fields, public.note_search.deleted_at)
    is distinct from (excluded.search_text, excluded.search_fields, excluded.deleted_at);
  return null;
end
$$;

revoke all on function private.refresh_note_search() from public, anon, authenticated, service_role;

create trigger notes_search_after_insert after insert on public.notes
  referencing new table as new_rows for each statement execute function private.refresh_note_search();

create trigger notes_search_after_update after update on public.notes
  referencing new table as new_rows for each statement execute function private.refresh_note_search();

insert into public.note_search (user_id, note_id, search_text, search_fields, deleted_at, updated_at)
select note_row.user_id, note_row.id, left(note_row.search_text, 4000), note_row.search_fields, note_row.deleted_at, pg_catalog.now()
from public.notes as note_row;

-- Der Katalog-Delta-Sync bringt `note_search` auf jedes Gerät.

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
    union all
    (select type_row.sync_change_id, 'note_type_sources', type_row.id, pg_catalog.to_jsonb(type_row)
      from public.note_type_sources as type_row
      where type_row.user_id = (select auth.uid()) and type_row.sync_change_id > greatest(p_cursor, 0)
      order by type_row.sync_change_id, type_row.id limit least(greatest(p_limit, 1), 1000) + 1)
    union all
    (select search_row.sync_change_id, 'note_search', search_row.note_id, pg_catalog.to_jsonb(search_row)
      from public.note_search as search_row
      where search_row.user_id = (select auth.uid()) and search_row.sync_change_id > greatest(p_cursor, 0)
      order by search_row.sync_change_id, search_row.note_id limit least(greatest(p_limit, 1), 1000) + 1)
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

-- Suchspalten des Katalogs; `refresh_card_catalog` leitet sie aus Karten, Inhalten und `review_events` ab.
alter table public.card_catalog
  add column edited_at timestamptz,
  add column content_kind text not null default 'reveal',
  add column interval_days double precision not null default 0,
  add column difficulty double precision not null default 5,
  add column reps integer not null default 0 check (reps >= 0),
  add column lapses integer not null default 0 check (lapses >= 0),
  add column first_reviewed_at timestamptz,
  add column last_again_at timestamptz,
  add column last_hard_at timestamptz,
  add column last_good_at timestamptz,
  add column last_easy_at timestamptz,
  add column last_rescheduled_at timestamptz,
  add column note_type_id text,
  add column has_outdated_variants boolean not null default false,
  add column prompt_ordinal integer,
  add column last_buried_at timestamptz,
  add column last_unburied_at timestamptz,
  add column durability_days double precision;

-- Der Index über `note_id` hält die Volltextsuche über alle Stapel schnell: Ohne ihn schätzt der Planer
-- `search_text like` auf wenige Treffer und vergleicht jede Katalogzeile mit jedem Inhalt (50.000 Karten: über 60 s
-- statt 0,6 s).
create index if not exists card_catalog_active_note_idx on public.card_catalog (user_id, note_id) where deleted_at is null;

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
    reviewable, marked, anki_flag, leeched, tag_keys, has_active_variants, active_variant_count, active_variant_id,
    body_revision, study_revision, dependency_revision, sync_change_id, deleted_at, created_at, updated_at,
    edited_at, content_kind, interval_days, difficulty, reps, lapses,
    first_reviewed_at, last_again_at, last_hard_at, last_good_at, last_easy_at, last_rescheduled_at,
    note_type_id, has_outdated_variants, prompt_ordinal, last_buried_at, last_unburied_at, durability_days
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
    card_row.anki_flag,
    card_row.leeched_at is not null,
    private.tag_search_keys(note_row.content->'tags'),
    coalesce(variant_row.active_count, 0) > 0,
    coalesce(variant_row.active_count, 0),
    variant_row.active_id,
    card_row.revision,
    card_row.study_revision,
    note_row.revision + coalesce(variant_row.revision_total, 0),
    pg_catalog.nextval('public.account_sync_change_id_seq'::regclass),
    card_row.deleted_at,
    card_row.created_at,
    greatest(card_row.updated_at, note_row.updated_at, coalesce(variant_row.updated_at, card_row.updated_at)),
    note_row.updated_at,
    coalesce(nullif(note_row.content->'interaction'->>'kind', ''), 'reveal'),
    card_row.interval_days,
    card_row.difficulty,
    card_row.reps,
    card_row.lapses,
    history_row.first_reviewed_at,
    history_row.last_again_at,
    history_row.last_hard_at,
    history_row.last_good_at,
    history_row.last_easy_at,
    history_row.last_rescheduled_at,
    note_row.note_type_source_id,
    coalesce(variant_row.has_outdated, false),
    case
      when card_row.prompt_key in ('forward', 'choice') then 1
      when card_row.prompt_key = 'reverse' then 2
      when card_row.prompt_key ~ '^anki-[0-9]{1,6}$' then pg_catalog.substr(card_row.prompt_key, 6)::integer + 1
      when card_row.prompt_key ~ '^(cloze|io):[0-9]{1,6}$' then pg_catalog.split_part(card_row.prompt_key, ':', 2)::integer
    end,
    history_row.last_buried_at,
    history_row.last_unburied_at,
    case when card_row.study_extra->>'durabilityDays' ~ '^[0-9]+(\.[0-9]+)?$' then (card_row.study_extra->>'durabilityDays')::double precision end
  from public.cards as card_row
  join public.notes as note_row on note_row.user_id = card_row.user_id and note_row.id = card_row.note_id
  left join lateral (
    select
      count(*) filter (where candidate.deleted_at is null and candidate.is_active and candidate.quality_status = 'active')::integer as active_count,
      (pg_catalog.array_agg(candidate.id order by candidate.updated_at desc, candidate.id)
        filter (where candidate.deleted_at is null and candidate.is_active and candidate.quality_status = 'active'))[1] as active_id,
      sum(candidate.revision)::integer as revision_total,
      max(candidate.updated_at) as updated_at,
      bool_or(candidate.deleted_at is null and candidate.meta->>'outdated' = 'true') as has_outdated
    from public.card_variants as candidate
    where candidate.user_id = card_row.user_id and candidate.card_id = card_row.id
  ) as variant_row on true
  left join lateral (
    select
      min(event_row.answered_at) filter (where event_row.rating <> 'manual') as first_reviewed_at,
      max(event_row.answered_at) filter (where event_row.rating = 'again') as last_again_at,
      max(event_row.answered_at) filter (where event_row.rating = 'hard') as last_hard_at,
      max(event_row.answered_at) filter (where event_row.rating = 'good') as last_good_at,
      max(event_row.answered_at) filter (where event_row.rating = 'easy') as last_easy_at,
      max(event_row.answered_at) filter (where event_row.rating = 'manual' and event_row.flags->>'kind' = 'manual_reschedule') as last_rescheduled_at,
      max(event_row.answered_at) filter (where event_row.rating = 'manual' and event_row.flags->>'kind' = 'manual_bury') as last_buried_at,
      max(event_row.answered_at) filter (where event_row.rating = 'manual' and event_row.flags->>'kind' = 'manual_unbury') as last_unburied_at
    from public.review_events as event_row
    where event_row.user_id = card_row.user_id and event_row.card_id = card_row.id
  ) as history_row on true
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
    anki_flag = excluded.anki_flag,
    leeched = excluded.leeched,
    tag_keys = excluded.tag_keys,
    has_active_variants = excluded.has_active_variants,
    active_variant_count = excluded.active_variant_count,
    active_variant_id = excluded.active_variant_id,
    body_revision = excluded.body_revision,
    study_revision = excluded.study_revision,
    dependency_revision = excluded.dependency_revision,
    sync_change_id = excluded.sync_change_id,
    deleted_at = excluded.deleted_at,
    created_at = excluded.created_at,
    updated_at = excluded.updated_at,
    edited_at = excluded.edited_at,
    content_kind = excluded.content_kind,
    interval_days = excluded.interval_days,
    difficulty = excluded.difficulty,
    reps = excluded.reps,
    lapses = excluded.lapses,
    first_reviewed_at = excluded.first_reviewed_at,
    last_again_at = excluded.last_again_at,
    last_hard_at = excluded.last_hard_at,
    last_good_at = excluded.last_good_at,
    last_easy_at = excluded.last_easy_at,
    last_rescheduled_at = excluded.last_rescheduled_at,
    note_type_id = excluded.note_type_id,
    has_outdated_variants = excluded.has_outdated_variants,
    prompt_ordinal = excluded.prompt_ordinal,
    last_buried_at = excluded.last_buried_at,
    last_unburied_at = excluded.last_unburied_at,
    durability_days = excluded.durability_days
  where (public.card_catalog.deck_id, public.card_catalog.note_id, public.card_catalog.front_preview,
    public.card_catalog.sort_text, public.card_catalog.due_at, public.card_catalog.schedule_state,
    public.card_catalog.maturity_band, public.card_catalog.reviewable, public.card_catalog.marked,
    public.card_catalog.anki_flag, public.card_catalog.leeched, public.card_catalog.tag_keys, public.card_catalog.has_active_variants,
    public.card_catalog.active_variant_count, public.card_catalog.active_variant_id,
    public.card_catalog.body_revision, public.card_catalog.study_revision, public.card_catalog.dependency_revision,
    public.card_catalog.deleted_at, public.card_catalog.created_at, public.card_catalog.updated_at,
    public.card_catalog.edited_at, public.card_catalog.content_kind, public.card_catalog.interval_days,
    public.card_catalog.difficulty, public.card_catalog.reps, public.card_catalog.lapses,
    public.card_catalog.first_reviewed_at, public.card_catalog.last_again_at, public.card_catalog.last_hard_at,
    public.card_catalog.last_good_at, public.card_catalog.last_easy_at, public.card_catalog.last_rescheduled_at,
    public.card_catalog.note_type_id, public.card_catalog.has_outdated_variants, public.card_catalog.prompt_ordinal,
    public.card_catalog.last_buried_at, public.card_catalog.last_unburied_at, public.card_catalog.durability_days)
  is distinct from
    (excluded.deck_id, excluded.note_id, excluded.front_preview, excluded.sort_text, excluded.due_at,
    excluded.schedule_state, excluded.maturity_band, excluded.reviewable, excluded.marked,
    excluded.anki_flag, excluded.leeched, excluded.tag_keys, excluded.has_active_variants,
    excluded.active_variant_count, excluded.active_variant_id, excluded.body_revision, excluded.study_revision,
    excluded.dependency_revision, excluded.deleted_at, excluded.created_at, excluded.updated_at,
    excluded.edited_at, excluded.content_kind, excluded.interval_days, excluded.difficulty, excluded.reps,
    excluded.lapses, excluded.first_reviewed_at, excluded.last_again_at, excluded.last_hard_at,
    excluded.last_good_at, excluded.last_easy_at, excluded.last_rescheduled_at,
    excluded.note_type_id, excluded.has_outdated_variants, excluded.prompt_ordinal,
    excluded.last_buried_at, excluded.last_unburied_at, excluded.durability_days);
end
$$;

-- Die Liste läuft stapelübergreifend (ohne `p_deck_id`) und öffnet eine Seite per `p_offset` direkt.

drop function public.list_account_card_catalog(text, text, text, text, jsonb, integer, boolean, jsonb);

create or replace function public.list_account_card_catalog(
  p_deck_id text,
  p_query text default '',
  p_sort_field text default 'sortField',
  p_sort_direction text default 'asc',
  p_cursor jsonb default null,
  p_limit integer default 50,
  p_include_total boolean default false,
  p_terms jsonb default '[]'::jsonb,
  p_offset integer default 0
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
  terms jsonb := coalesce(p_terms, '[]'::jsonb);
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
  if pg_catalog.jsonb_array_length(terms) > 0 then
    search_condition := search_condition || $terms$
        and (
          select coalesce(pg_catalog.bool_and((
            select coalesce(pg_catalog.bool_or(
              case leaf->>'kind'
                when 'flag' then catalog_row.anki_flag = (leaf->>'value')::smallint
                when 'tag' then catalog_row.tag_keys @> array[leaf->>'value']
                when 'tag-none' then pg_catalog.cardinality(catalog_row.tag_keys) = 0
                when 'leech' then catalog_row.leeched
                when 'marked' then catalog_row.marked
                when 'suspended' then not catalog_row.reviewable
                when 'state' then case leaf->>'value'
                  when 'learn' then catalog_row.schedule_state in ('learning', 'relearning')
                  else catalog_row.schedule_state = leaf->>'value'
                end
                when 'maturity' then catalog_row.maturity_band = leaf->>'value'
                when 'variant' then catalog_row.has_active_variants
                when 'deck' then catalog_row.deck_id in (select pg_catalog.jsonb_array_elements_text(leaf->'ids'))
                when 'due' then catalog_row.schedule_state <> 'new' and catalog_row.due_at is not null
                  and (not coalesce((leaf->>'reviewableOnly')::boolean, false) or catalog_row.reviewable)
                  and (leaf->>'from' is null or catalog_row.due_at >= (leaf->>'from')::timestamptz)
                  and (leaf->>'to' is null or catalog_row.due_at < (leaf->>'to')::timestamptz)
                when 'since' then coalesce(case leaf->>'field'
                    when 'added' then catalog_row.created_at
                    when 'edited' then catalog_row.edited_at
                    when 'introduced' then catalog_row.first_reviewed_at
                  when 'rescheduled' then catalog_row.last_rescheduled_at
                    when 'rated' then case leaf->>'rating'
                      when 'again' then catalog_row.last_again_at
                      when 'hard' then catalog_row.last_hard_at
                      when 'good' then catalog_row.last_good_at
                      when 'easy' then catalog_row.last_easy_at
                      else greatest(catalog_row.last_again_at, catalog_row.last_hard_at, catalog_row.last_good_at, catalog_row.last_easy_at)
                    end
                  end >= (leaf->>'from')::timestamptz, false)
                when 'prop' then coalesce((
                    select case leaf->>'operator'
                      when '<' then compared.value < compared.target
                      when '<=' then compared.value <= compared.target
                      when '=' then compared.value = compared.target
                      when '!=' then compared.value <> compared.target
                      when '>=' then compared.value >= compared.target
                      when '>' then compared.value > compared.target
                    end
                    from (select case leaf->>'field'
                        when 'ivl' then case when catalog_row.schedule_state <> 'new' then catalog_row.interval_days end
                        when 'd' then case when catalog_row.schedule_state <> 'new' then catalog_row.difficulty end
                        when 's' then case when catalog_row.schedule_state <> 'new' then catalog_row.durability_days end
                        when 'reps' then catalog_row.reps::double precision
                        when 'lapses' then catalog_row.lapses::double precision
                      end as value, (leaf->>'value')::double precision as target) as compared
                  ), false)
                when 'form' then catalog_row.content_kind = leaf->>'value'
                when 'outdated' then catalog_row.has_outdated_variants
                when 'card' then coalesce(catalog_row.prompt_ordinal = (leaf->>'value')::integer, false)
                when 'buried' then coalesce(catalog_row.last_buried_at >= (leaf->>'from')::timestamptz
                  and (catalog_row.last_unburied_at is null or catalog_row.last_unburied_at < catalog_row.last_buried_at), false)
                when 'notetype' then coalesce(catalog_row.note_type_id in (select pg_catalog.jsonb_array_elements_text(leaf->'ids')), false)
                when 'field' then exists (
                  select 1
                  from public.note_search as field_search,
                    pg_catalog.jsonb_array_elements(field_search.search_fields) as field_entry
                  where field_search.user_id = catalog_row.user_id
                    and field_search.note_id = catalog_row.note_id
                    and field_entry->>'n' = leaf->>'name'
                    and pg_catalog.strpos(field_entry->>'t', leaf->>'value') > 0
                )
                when 'text' then exists (
                  select 1
                  from public.notes as text_note
                  where text_note.user_id = catalog_row.user_id
                    and text_note.id = catalog_row.note_id
                    and pg_catalog.strpos(text_note.search_text, leaf->>'value') > 0
                )
                else false
              end is distinct from coalesce((leaf->>'negated')::boolean, false)
            ), false)
            from pg_catalog.jsonb_array_elements(case when term->>'kind' = 'any' then term->'terms' else pg_catalog.jsonb_build_array(term) end) as leaf
          )), true)
          from pg_catalog.jsonb_array_elements($7) as term
        )$terms$;
  end if;

  if p_include_total then
    execute pg_catalog.format($count$
      select count(*) from public.card_catalog as catalog_row
      where catalog_row.user_id = $1 and ($2 is null or catalog_row.deck_id = $2) and catalog_row.deleted_at is null %s
    $count$, search_condition)
    into total_count
    using current_user_id, p_deck_id, query_pattern, null::jsonb, null::integer, null::bigint, terms;
  end if;

  execute pg_catalog.format($query$
    with page_candidates as materialized (
      select catalog_row.*, %3$s as sort_value
      from public.card_catalog as catalog_row
      where catalog_row.user_id = $1
        and ($2 is null or catalog_row.deck_id = $2)
        and catalog_row.deleted_at is null
        %6$s
        and ($4 is null or (%1$s, catalog_row.id) %2$s (%4$s, coalesce($4->>'id', '')))
      order by %1$s %5$s, catalog_row.id %5$s
      limit $5 + 1
      offset case when $4 is null then $8 else 0 end
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
  using current_user_id, p_deck_id, query_pattern, p_cursor, page_limit, total_count, terms, greatest(coalesce(p_offset, 0), 0);

  return response;
end
$$;

revoke all on function public.list_account_card_catalog(text, text, text, text, jsonb, integer, boolean, jsonb, integer) from public, anon;

grant execute on function public.list_account_card_catalog(text, text, text, text, jsonb, integer, boolean, jsonb, integer) to authenticated, service_role;

create or replace function public.search_account_card_catalog(
  p_deck_ids text[],
  p_query text,
  p_sort_field text default 'sortField',
  p_sort_direction text default 'asc',
  p_limit integer default 50,
  p_terms jsonb default '[]'::jsonb
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
  query_pattern text := null;
  terms jsonb := coalesce(p_terms, '[]'::jsonb);
  page_limit integer := least(greatest(p_limit, 1), 50);
  sort_expression text;
  cursor_output_expression text;
  sort_direction text;
  response jsonb;
begin
  if current_user_id is null then
    raise exception 'Anmeldung erforderlich.' using errcode = '42501';
  end if;
  if query_text = '' and pg_catalog.jsonb_array_length(terms) = 0 then
    raise exception 'Die Kartensuche braucht einen Suchbegriff.' using errcode = '22023';
  end if;
  if coalesce(pg_catalog.array_length(p_deck_ids, 1), 0) > 5000 then
    raise exception 'Höchstens 5000 Stapel können gleichzeitig durchsucht werden.' using errcode = '22023';
  end if;

  case p_sort_field
    when 'sortField' then
      sort_expression := 'catalog_row.sort_text';
      cursor_output_expression := 'catalog_row.sort_text';
    when 'nextStudyDate' then
      sort_expression := 'coalesce(catalog_row.due_at, ''infinity''::timestamptz)';
      cursor_output_expression := 'case when catalog_row.due_at is null then ''infinity'' else pg_catalog.to_char(catalog_row.due_at at time zone ''UTC'', ''YYYY-MM-DD"T"HH24:MI:SS.US'') || ''Z'' end';
    when 'variants' then
      sort_expression := 'catalog_row.has_active_variants';
      cursor_output_expression := 'catalog_row.has_active_variants::text';
    else
      raise exception 'Unbekannte Katalogsortierung.' using errcode = '22023';
  end case;

  if p_sort_direction in ('asc', 'desc') then
    sort_direction := p_sort_direction;
  else
    raise exception 'Unbekannte Sortierrichtung.' using errcode = '22023';
  end if;

  if query_text <> '' then
    query_pattern := '%' || pg_catalog.replace(pg_catalog.replace(pg_catalog.replace(query_text, '\', '\\'), '%', '\%'), '_', '\_') || '%';
  end if;

  execute pg_catalog.format($query$
    with matching_notes as materialized (
      select note_row.id
      from public.notes as note_row
      where $3 is not null and note_row.user_id = $1 and note_row.search_text like $3
    ), ranked as materialized (
      select catalog_row.*,
        %2$s as sort_value,
        pg_catalog.row_number() over (partition by catalog_row.deck_id order by %1$s %3$s, catalog_row.id %3$s) as deck_position,
        pg_catalog.count(*) over (partition by catalog_row.deck_id) as deck_total
      from public.card_catalog as catalog_row
      where catalog_row.user_id = $1
        and catalog_row.deck_id = any($2)
        and catalog_row.deleted_at is null
        and ($3 is null or catalog_row.note_id in (select matching_notes.id from matching_notes))
        and (
          select coalesce(pg_catalog.bool_and((
            select coalesce(pg_catalog.bool_or(
              case leaf->>'kind'
                when 'flag' then catalog_row.anki_flag = (leaf->>'value')::smallint
                when 'tag' then catalog_row.tag_keys @> array[leaf->>'value']
                when 'tag-none' then pg_catalog.cardinality(catalog_row.tag_keys) = 0
                when 'leech' then catalog_row.leeched
                when 'marked' then catalog_row.marked
                when 'suspended' then not catalog_row.reviewable
                when 'state' then case leaf->>'value'
                  when 'learn' then catalog_row.schedule_state in ('learning', 'relearning')
                  else catalog_row.schedule_state = leaf->>'value'
                end
                when 'maturity' then catalog_row.maturity_band = leaf->>'value'
                when 'variant' then catalog_row.has_active_variants
                when 'deck' then catalog_row.deck_id in (select pg_catalog.jsonb_array_elements_text(leaf->'ids'))
                when 'due' then catalog_row.schedule_state <> 'new' and catalog_row.due_at is not null
                  and (not coalesce((leaf->>'reviewableOnly')::boolean, false) or catalog_row.reviewable)
                  and (leaf->>'from' is null or catalog_row.due_at >= (leaf->>'from')::timestamptz)
                  and (leaf->>'to' is null or catalog_row.due_at < (leaf->>'to')::timestamptz)
                when 'since' then coalesce(case leaf->>'field'
                    when 'added' then catalog_row.created_at
                    when 'edited' then catalog_row.edited_at
                    when 'introduced' then catalog_row.first_reviewed_at
                  when 'rescheduled' then catalog_row.last_rescheduled_at
                    when 'rated' then case leaf->>'rating'
                      when 'again' then catalog_row.last_again_at
                      when 'hard' then catalog_row.last_hard_at
                      when 'good' then catalog_row.last_good_at
                      when 'easy' then catalog_row.last_easy_at
                      else greatest(catalog_row.last_again_at, catalog_row.last_hard_at, catalog_row.last_good_at, catalog_row.last_easy_at)
                    end
                  end >= (leaf->>'from')::timestamptz, false)
                when 'prop' then coalesce((
                    select case leaf->>'operator'
                      when '<' then compared.value < compared.target
                      when '<=' then compared.value <= compared.target
                      when '=' then compared.value = compared.target
                      when '!=' then compared.value <> compared.target
                      when '>=' then compared.value >= compared.target
                      when '>' then compared.value > compared.target
                    end
                    from (select case leaf->>'field'
                        when 'ivl' then case when catalog_row.schedule_state <> 'new' then catalog_row.interval_days end
                        when 'd' then case when catalog_row.schedule_state <> 'new' then catalog_row.difficulty end
                        when 's' then case when catalog_row.schedule_state <> 'new' then catalog_row.durability_days end
                        when 'reps' then catalog_row.reps::double precision
                        when 'lapses' then catalog_row.lapses::double precision
                      end as value, (leaf->>'value')::double precision as target) as compared
                  ), false)
                when 'form' then catalog_row.content_kind = leaf->>'value'
                when 'outdated' then catalog_row.has_outdated_variants
                when 'card' then coalesce(catalog_row.prompt_ordinal = (leaf->>'value')::integer, false)
                when 'buried' then coalesce(catalog_row.last_buried_at >= (leaf->>'from')::timestamptz
                  and (catalog_row.last_unburied_at is null or catalog_row.last_unburied_at < catalog_row.last_buried_at), false)
                when 'notetype' then coalesce(catalog_row.note_type_id in (select pg_catalog.jsonb_array_elements_text(leaf->'ids')), false)
                when 'field' then exists (
                  select 1
                  from public.note_search as field_search,
                    pg_catalog.jsonb_array_elements(field_search.search_fields) as field_entry
                  where field_search.user_id = catalog_row.user_id
                    and field_search.note_id = catalog_row.note_id
                    and field_entry->>'n' = leaf->>'name'
                    and pg_catalog.strpos(field_entry->>'t', leaf->>'value') > 0
                )
                when 'text' then exists (
                  select 1
                  from public.notes as text_note
                  where text_note.user_id = catalog_row.user_id
                    and text_note.id = catalog_row.note_id
                    and pg_catalog.strpos(text_note.search_text, leaf->>'value') > 0
                )
                else false
              end is distinct from coalesce((leaf->>'negated')::boolean, false)
            ), false)
            from pg_catalog.jsonb_array_elements(case when term->>'kind' = 'any' then term->'terms' else pg_catalog.jsonb_build_array(term) end) as leaf
          )), true)
          from pg_catalog.jsonb_array_elements($5) as term
        )
    ), page as materialized (
      select * from ranked where deck_position <= $4
    )
    select coalesce(pg_catalog.jsonb_object_agg(deck_page.deck_id, deck_page.result), '{}'::jsonb)
    from (
      select page.deck_id, pg_catalog.jsonb_build_object(
        'items', pg_catalog.jsonb_agg(pg_catalog.to_jsonb(page) - 'sort_value' - 'deck_position' - 'deck_total' order by page.deck_position),
        'totalCount', max(page.deck_total),
        'hasMore', max(page.deck_total) > $4,
        'nextCursor', case when max(page.deck_total) > $4 then
          (pg_catalog.array_agg(pg_catalog.jsonb_build_object('sortValue', page.sort_value, 'id', page.id) order by page.deck_position desc))[1]
        end
      ) as result
      from page
      group by page.deck_id
    ) as deck_page
  $query$, sort_expression, cursor_output_expression, sort_direction)
  into response
  using current_user_id, p_deck_ids, query_pattern, page_limit, terms;

  return pg_catalog.jsonb_build_object('groups', response);
end
$$;

-- Treffer lernen: Bewertungen mit `flags.kind = 'hit_review'` verbrauchen keine Tageslimits.

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
      bool_or(coalesce(review_row.scheduler_before->'card'->>'state', 'new') = 'new' and review_row.flags->>'kind' is distinct from 'hit_review') as introduced,
      bool_or(review_row.flags->>'kind' is distinct from 'hit_review') as counted
    from public.review_events as review_row, learning_range
    where coalesce(p_cursor, '') = ''
      and review_row.user_id = (select auth.uid())
      and review_row.rating <> 'manual'
      and review_row.answered_at >= learning_range.starts_at
      and review_row.answered_at < learning_range.ends_at
    group by review_row.deck_id, review_row.card_id
  ), bury_modes as materialized (
    select answered_card.note_id,
      bool_or(answered_deck.deck_settings->>'buryNewSiblings' = 'true') as bury_new,
      bool_or(answered_deck.deck_settings->>'buryReviewSiblings' = 'true') as bury_review,
      bool_or(answered_deck.deck_settings->>'buryInterdayLearningSiblings' = 'true') as bury_interday
    from today_events
    join public.cards as answered_card
      on answered_card.user_id = (select auth.uid()) and answered_card.id = today_events.card_id
    join public.decks as answered_deck
      on answered_deck.user_id = answered_card.user_id and answered_deck.id = answered_card.deck_id
    group by answered_card.note_id
  ), manually_buried as materialized (
    select latest.card_id as id
    from (
      select distinct on (review_row.card_id) review_row.card_id, review_row.flags->>'kind' as kind
      from public.review_events as review_row, learning_range
      where coalesce(p_cursor, '') = ''
        and review_row.user_id = (select auth.uid())
        and review_row.rating = 'manual'
        and review_row.flags->>'kind' in ('manual_bury', 'manual_unbury')
        and review_row.answered_at >= learning_range.starts_at
        and review_row.answered_at < learning_range.ends_at
      order by review_row.card_id, review_row.answered_at desc, review_row.id desc
    ) as latest
    where latest.kind = 'manual_bury'
  ), buried as materialized (
    select sibling.id
    from bury_modes
    join public.cards as sibling
      on sibling.user_id = (select auth.uid()) and sibling.note_id = bury_modes.note_id
    where not exists (select 1 from today_events where today_events.card_id = sibling.id)
      and ((sibling.state = 'new' and bury_modes.bury_new)
        or (sibling.state = 'review' and bury_modes.bury_review)
        or (sibling.state in ('learning', 'relearning') and bury_modes.bury_interday))
    union
    select id from manually_buried
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
      and not exists (select 1 from buried where buried.id = card_row.id)
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
      coalesce((select max(sync_change_id) from public.deck_study_summaries where user_id = (select auth.uid())), 0),
      coalesce((select max(sync_change_id) from public.note_type_sources where user_id = (select auth.uid())), 0)
    ),
    'studyOverview', case when coalesce(p_cursor, '') = '' then pg_catalog.jsonb_build_object(
      'contextKey', (select time_zone || ':' || day_start_hour::text from learning_range),
      'dayKey', (select day_key::text from learning_range),
      'introducedTodayByDeck', coalesce((
        select pg_catalog.jsonb_object_agg(deck_id, total order by deck_id)
        from (select deck_id, count(*)::integer as total from today_events where counted and introduced group by deck_id) as introduced
      ), '{}'::jsonb),
      'reviewedTodayByDeck', coalesce((
        select pg_catalog.jsonb_object_agg(deck_id, total order by deck_id)
        from (select deck_id, count(*)::integer as total from today_events where counted and not introduced group by deck_id) as reviewed
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

-- Bestandskatalog einmal mit allen Suchspalten füllen.

select private.refresh_card_catalog(grouped.user_id, grouped.card_ids)
from (select user_id, pg_catalog.array_agg(id) as card_ids from public.cards group by user_id) as grouped;

commit;
