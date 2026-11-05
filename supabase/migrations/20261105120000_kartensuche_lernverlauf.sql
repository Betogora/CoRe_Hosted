begin;

-- Kartenverwaltung 2.0, KV2b: Lernverlauf, Werte und Inhaltsform im Katalog, damit `added:`, `edited:`, `rated:`,
-- `introduced:`, `resched:`, `prop:ivl|d|reps|lapses` und `is:reveal|choice|cloze|occlusion` ohne Kartenkörper suchen. Den
-- Verlauf leitet der Katalog aus `review_events` ab (von den manuellen Ereignissen zählt nur die Neuplanung); `record_review_atomic` schreibt
-- das Ereignis vor der Karte, daher sieht die Auffrischung über den Kartentrigger die neue Antwort bereits.

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
  add column last_rescheduled_at timestamptz;

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
    first_reviewed_at, last_again_at, last_hard_at, last_good_at, last_easy_at, last_rescheduled_at
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
    history_row.last_rescheduled_at
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
  left join lateral (
    select
      min(event_row.answered_at) filter (where event_row.rating <> 'manual') as first_reviewed_at,
      max(event_row.answered_at) filter (where event_row.rating = 'again') as last_again_at,
      max(event_row.answered_at) filter (where event_row.rating = 'hard') as last_hard_at,
      max(event_row.answered_at) filter (where event_row.rating = 'good') as last_good_at,
      max(event_row.answered_at) filter (where event_row.rating = 'easy') as last_easy_at,
      max(event_row.answered_at) filter (where event_row.rating = 'manual' and event_row.flags->>'kind' = 'manual_reschedule') as last_rescheduled_at
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
    last_rescheduled_at = excluded.last_rescheduled_at
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
    public.card_catalog.last_good_at, public.card_catalog.last_easy_at, public.card_catalog.last_rescheduled_at)
  is distinct from
    (excluded.deck_id, excluded.note_id, excluded.front_preview, excluded.sort_text, excluded.due_at,
    excluded.schedule_state, excluded.maturity_band, excluded.reviewable, excluded.marked,
    excluded.anki_flag, excluded.leeched, excluded.tag_keys, excluded.has_active_variants,
    excluded.active_variant_count, excluded.active_variant_id, excluded.body_revision, excluded.study_revision,
    excluded.dependency_revision, excluded.deleted_at, excluded.created_at, excluded.updated_at,
    excluded.edited_at, excluded.content_kind, excluded.interval_days, excluded.difficulty, excluded.reps,
    excluded.lapses, excluded.first_reviewed_at, excluded.last_again_at, excluded.last_hard_at,
    excluded.last_good_at, excluded.last_easy_at, excluded.last_rescheduled_at);
end
$$;

-- Begriffsauswertung beider Katalog-RPCs um Zeitraum (`since`), Werte (`prop`) und Inhaltsform (`form`) ergänzt.
create or replace function public.list_account_card_catalog(
  p_deck_id text,
  p_query text default '',
  p_sort_field text default 'sortField',
  p_sort_direction text default 'asc',
  p_cursor jsonb default null,
  p_limit integer default 50,
  p_include_total boolean default false,
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
          select coalesce(pg_catalog.bool_and(
            case term->>'kind'
              when 'flag' then catalog_row.anki_flag = (term->>'value')::smallint
              when 'tag' then catalog_row.tag_keys @> array[term->>'value']
              when 'tag-none' then pg_catalog.cardinality(catalog_row.tag_keys) = 0
              when 'leech' then catalog_row.leeched
              when 'marked' then catalog_row.marked
              when 'suspended' then not catalog_row.reviewable
              when 'state' then case term->>'value'
                when 'learn' then catalog_row.schedule_state in ('learning', 'relearning')
                else catalog_row.schedule_state = term->>'value'
              end
              when 'maturity' then catalog_row.maturity_band = term->>'value'
              when 'variant' then catalog_row.has_active_variants
              when 'deck' then catalog_row.deck_id in (select pg_catalog.jsonb_array_elements_text(term->'ids'))
              when 'due' then catalog_row.schedule_state <> 'new' and catalog_row.due_at is not null
                and (not coalesce((term->>'reviewableOnly')::boolean, false) or catalog_row.reviewable)
                and (term->>'from' is null or catalog_row.due_at >= (term->>'from')::timestamptz)
                and (term->>'to' is null or catalog_row.due_at < (term->>'to')::timestamptz)
              when 'since' then coalesce(case term->>'field'
                  when 'added' then catalog_row.created_at
                  when 'edited' then catalog_row.edited_at
                  when 'introduced' then catalog_row.first_reviewed_at
                when 'rescheduled' then catalog_row.last_rescheduled_at
                  when 'rated' then case term->>'rating'
                    when 'again' then catalog_row.last_again_at
                    when 'hard' then catalog_row.last_hard_at
                    when 'good' then catalog_row.last_good_at
                    when 'easy' then catalog_row.last_easy_at
                    else greatest(catalog_row.last_again_at, catalog_row.last_hard_at, catalog_row.last_good_at, catalog_row.last_easy_at)
                  end
                end >= (term->>'from')::timestamptz, false)
              when 'prop' then coalesce((
                  select case term->>'operator'
                    when '<' then compared.value < compared.target
                    when '<=' then compared.value <= compared.target
                    when '=' then compared.value = compared.target
                    when '!=' then compared.value <> compared.target
                    when '>=' then compared.value >= compared.target
                    when '>' then compared.value > compared.target
                  end
                  from (select case term->>'field'
                      when 'ivl' then case when catalog_row.schedule_state <> 'new' then catalog_row.interval_days end
                      when 'd' then case when catalog_row.schedule_state <> 'new' then catalog_row.difficulty end
                      when 'reps' then catalog_row.reps::double precision
                      when 'lapses' then catalog_row.lapses::double precision
                    end as value, (term->>'value')::double precision as target) as compared
                ), false)
              when 'form' then catalog_row.content_kind = term->>'value'
              when 'field' then exists (
                select 1
                from public.note_search as field_search,
                  pg_catalog.jsonb_array_elements(field_search.search_fields) as field_entry
                where field_search.user_id = catalog_row.user_id
                  and field_search.note_id = catalog_row.note_id
                  and field_entry->>'n' = term->>'name'
                  and pg_catalog.strpos(field_entry->>'t', term->>'value') > 0
              )
              else false
            end is distinct from coalesce((term->>'negated')::boolean, false)
          ), true)
          from pg_catalog.jsonb_array_elements($7) as term
        )$terms$;
  end if;

  if p_include_total then
    execute pg_catalog.format($count$
      select count(*) from public.card_catalog as catalog_row
      where catalog_row.user_id = $1 and catalog_row.deck_id = $2 and catalog_row.deleted_at is null %s
    $count$, search_condition)
    into total_count
    using current_user_id, p_deck_id, query_pattern, null::jsonb, null::integer, null::bigint, terms;
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
  using current_user_id, p_deck_id, query_pattern, p_cursor, page_limit, total_count, terms;

  return response;
end
$$;

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
          select coalesce(pg_catalog.bool_and(
            case term->>'kind'
              when 'flag' then catalog_row.anki_flag = (term->>'value')::smallint
              when 'tag' then catalog_row.tag_keys @> array[term->>'value']
              when 'tag-none' then pg_catalog.cardinality(catalog_row.tag_keys) = 0
              when 'leech' then catalog_row.leeched
              when 'marked' then catalog_row.marked
              when 'suspended' then not catalog_row.reviewable
              when 'state' then case term->>'value'
                when 'learn' then catalog_row.schedule_state in ('learning', 'relearning')
                else catalog_row.schedule_state = term->>'value'
              end
              when 'maturity' then catalog_row.maturity_band = term->>'value'
              when 'variant' then catalog_row.has_active_variants
              when 'deck' then catalog_row.deck_id in (select pg_catalog.jsonb_array_elements_text(term->'ids'))
              when 'due' then catalog_row.schedule_state <> 'new' and catalog_row.due_at is not null
                and (not coalesce((term->>'reviewableOnly')::boolean, false) or catalog_row.reviewable)
                and (term->>'from' is null or catalog_row.due_at >= (term->>'from')::timestamptz)
                and (term->>'to' is null or catalog_row.due_at < (term->>'to')::timestamptz)
              when 'since' then coalesce(case term->>'field'
                  when 'added' then catalog_row.created_at
                  when 'edited' then catalog_row.edited_at
                  when 'introduced' then catalog_row.first_reviewed_at
                when 'rescheduled' then catalog_row.last_rescheduled_at
                  when 'rated' then case term->>'rating'
                    when 'again' then catalog_row.last_again_at
                    when 'hard' then catalog_row.last_hard_at
                    when 'good' then catalog_row.last_good_at
                    when 'easy' then catalog_row.last_easy_at
                    else greatest(catalog_row.last_again_at, catalog_row.last_hard_at, catalog_row.last_good_at, catalog_row.last_easy_at)
                  end
                end >= (term->>'from')::timestamptz, false)
              when 'prop' then coalesce((
                  select case term->>'operator'
                    when '<' then compared.value < compared.target
                    when '<=' then compared.value <= compared.target
                    when '=' then compared.value = compared.target
                    when '!=' then compared.value <> compared.target
                    when '>=' then compared.value >= compared.target
                    when '>' then compared.value > compared.target
                  end
                  from (select case term->>'field'
                      when 'ivl' then case when catalog_row.schedule_state <> 'new' then catalog_row.interval_days end
                      when 'd' then case when catalog_row.schedule_state <> 'new' then catalog_row.difficulty end
                      when 'reps' then catalog_row.reps::double precision
                      when 'lapses' then catalog_row.lapses::double precision
                    end as value, (term->>'value')::double precision as target) as compared
                ), false)
              when 'form' then catalog_row.content_kind = term->>'value'
              when 'field' then exists (
                select 1
                from public.note_search as field_search,
                  pg_catalog.jsonb_array_elements(field_search.search_fields) as field_entry
                where field_search.user_id = catalog_row.user_id
                  and field_search.note_id = catalog_row.note_id
                  and field_entry->>'n' = term->>'name'
                  and pg_catalog.strpos(field_entry->>'t', term->>'value') > 0
              )
              else false
            end is distinct from coalesce((term->>'negated')::boolean, false)
          ), true)
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

-- Bestehende Katalogzeilen mit den neuen Spalten füllen; die neue Änderungsnummer bringt sie per Delta auf die Geräte.
select private.refresh_card_catalog(grouped.user_id, grouped.card_ids)
from (select user_id, pg_catalog.array_agg(id) as card_ids from public.cards group by user_id) as grouped;

commit;
