begin;

-- Karteneditor V2 (ADR-045): Tags bleiben Anki-Rohtexte im Inhalt, `imported_tags` hält den Stand des letzten
-- Imports für die Drei-Wege-Zusammenführung. Die Lernbremse ist ein Lernstandsfeld der Karte und läuft wie der
-- übrige Lernstand über `record_review_atomic`. Der Katalog führt Flagge, Lernbremse und Tag-Schlüssel, damit
-- Suche und Filter ohne Kartenkörper arbeiten.

alter table public.notes add column imported_tags text[];
alter table public.cards add column leeched_at timestamptz;
alter table public.card_catalog
  add column anki_flag smallint not null default 0 check (anki_flag between 0 and 7),
  add column leeched boolean not null default false,
  add column tag_keys text[] not null default '{}'::text[];

-- Kleingeschriebene Tags samt aller `::`-Elternpfade: `tag:a::b` findet so auch `a::b::c`.
create or replace function private.tag_search_keys(p_tags jsonb)
returns text[]
language sql
immutable
set search_path = ''
as $$
  select coalesce(pg_catalog.array_agg(distinct key order by key), '{}'::text[])
  from pg_catalog.jsonb_array_elements_text(
    case when pg_catalog.jsonb_typeof(p_tags) = 'array' then p_tags else '[]'::jsonb end
  ) as tag
  cross join lateral pg_catalog.generate_series(1, pg_catalog.cardinality(pg_catalog.string_to_array(tag, '::'))) as depth
  cross join lateral (
    select pg_catalog.array_to_string((pg_catalog.string_to_array(pg_catalog.lower(tag), '::'))[1:depth], '::') as key
  ) as prefix
$$;

revoke all on function private.tag_search_keys(jsonb) from public, anon, authenticated, service_role;

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
    updated_at = excluded.updated_at
  where (public.card_catalog.deck_id, public.card_catalog.note_id, public.card_catalog.front_preview,
    public.card_catalog.sort_text, public.card_catalog.due_at, public.card_catalog.schedule_state,
    public.card_catalog.maturity_band, public.card_catalog.reviewable, public.card_catalog.marked,
    public.card_catalog.anki_flag, public.card_catalog.leeched, public.card_catalog.tag_keys, public.card_catalog.has_active_variants,
    public.card_catalog.active_variant_count, public.card_catalog.active_variant_id,
    public.card_catalog.body_revision, public.card_catalog.study_revision, public.card_catalog.dependency_revision,
    public.card_catalog.deleted_at, public.card_catalog.created_at, public.card_catalog.updated_at)
  is distinct from
    (excluded.deck_id, excluded.note_id, excluded.front_preview, excluded.sort_text, excluded.due_at,
    excluded.schedule_state, excluded.maturity_band, excluded.reviewable, excluded.marked,
    excluded.anki_flag, excluded.leeched, excluded.tag_keys, excluded.has_active_variants,
    excluded.active_variant_count, excluded.active_variant_id, excluded.body_revision, excluded.study_revision,
    excluded.dependency_revision, excluded.deleted_at, excluded.created_at, excluded.updated_at);
end
$$;

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
    leeched_at = nullif(p_study->>'leeched_at', '')::timestamptz,
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

-- Zurückgestellte Karten (manuelle Ereignisse `manual_bury`/`manual_unbury` des Lerntags) zählen wie begrabene
-- Geschwister nicht zu den heutigen Lernzahlen.
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

-- Die Suche kommt als Text und als Begriffsliste (`p_terms`, erzeugt von `cardSearchQuery.ts`); alle Begriffe
-- müssen zutreffen, `negated` kehrt einen um. Beide Katalogfunktionen werten die Liste gleich aus.
drop function public.list_account_card_catalog(text, text, text, text, jsonb, integer, boolean);
create function public.list_account_card_catalog(
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

drop function public.search_account_card_catalog(text[], text, text, text, integer);
create function public.search_account_card_catalog(
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

-- Kontoweites Tag-Verzeichnis: eine Zeile je Tag ohne Rücksicht auf Groß-/Kleinschreibung, mit der Schreibweise
-- des ältesten Inhalts, der Zahl der Inhalte und wie viele davon das Tag aus einem Import tragen.
create or replace function public.list_account_tags()
returns table (tag text, note_count integer, imported_count integer)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    (pg_catalog.array_agg(entry.tag order by note_row.created_at, note_row.id))[1],
    count(*)::integer,
    (count(*) filter (where entry.imported))::integer
  from public.notes as note_row
  cross join lateral (
    select tag, pg_catalog.lower(tag) = any(
      select pg_catalog.lower(imported) from pg_catalog.unnest(coalesce(note_row.imported_tags, '{}'::text[])) as imported
    ) as imported
    from pg_catalog.jsonb_array_elements_text(note_row.content->'tags') as tag
  ) as entry
  where note_row.user_id = (select auth.uid()) and note_row.deleted_at is null
  group by pg_catalog.lower(entry.tag)
  order by 1
$$;

-- Bis zu drei Inhalte mit ähnlichem Text (Trigramm-Ähnlichkeit ab 0,5), je mit einer Karte zum Öffnen. Der
-- Operator `%` nutzt den Trigramm-Index mit der Standardschwelle 0,3; die strengere Schwelle filtert danach.
create or replace function public.list_similar_notes(p_note_id text, p_limit integer default 3)
returns table (note_id text, card_id text, deck_id text, preview text, similarity real)
language sql
stable
security invoker
set search_path = ''
as $$
  select other.id, first_card.id, first_card.deck_id, left(other.sort_text, 240),
    extensions.similarity(other.search_text, source.search_text)
  from public.notes as source
  join public.notes as other
    on other.user_id = source.user_id and other.id <> source.id and other.deleted_at is null
    and other.search_text operator(extensions.%) source.search_text
  cross join lateral (
    select card_row.id, card_row.deck_id from public.cards as card_row
    where card_row.user_id = other.user_id and card_row.note_id = other.id and card_row.deleted_at is null
    order by card_row.id limit 1
  ) as first_card
  where source.user_id = (select auth.uid()) and source.id = p_note_id and pg_catalog.length(source.search_text) >= 12
    and extensions.similarity(other.search_text, source.search_text) >= 0.5
  order by 5 desc, other.id
  limit least(greatest(coalesce(p_limit, 3), 1), 3)
$$;

revoke all on function public.list_account_card_catalog(text, text, text, text, jsonb, integer, boolean, jsonb) from public, anon;
revoke all on function public.search_account_card_catalog(text[], text, text, text, integer, jsonb) from public, anon;
revoke all on function public.list_account_tags() from public, anon;
revoke all on function public.list_similar_notes(text, integer) from public, anon;
grant execute on function public.list_account_card_catalog(text, text, text, text, jsonb, integer, boolean, jsonb) to authenticated, service_role;
grant execute on function public.search_account_card_catalog(text[], text, text, text, integer, jsonb) to authenticated, service_role;
grant execute on function public.list_account_tags() to authenticated, service_role;
grant execute on function public.list_similar_notes(text, integer) to authenticated, service_role;

-- Einmalige Umrechnung des Bestands: Importierte Inhalte merken ihren Tag-Stand, das Anki-Tag `leech` wird zur
-- Lernbremse ihrer Karten (Karten mit Lapse; hat keine einen, alle) und verlässt die Tags.
update public.notes
set imported_tags = coalesce((
  select pg_catalog.array_agg(tag order by position)
  from pg_catalog.jsonb_array_elements_text(content->'tags') with ordinality as listed(tag, position)
  where pg_catalog.lower(tag) <> 'leech'
), '{}'::text[])
where source = 'anki-apkg';

with leech_notes as (
  select note_row.user_id, note_row.id,
    exists (
      select 1 from public.cards as card_row
      where card_row.user_id = note_row.user_id and card_row.note_id = note_row.id and card_row.lapses > 0
    ) as any_lapse
  from public.notes as note_row
  where exists (select 1 from pg_catalog.jsonb_array_elements_text(note_row.content->'tags') as tag where pg_catalog.lower(tag) = 'leech')
)
update public.cards as card_row
set leeched_at = coalesce(card_row.last_reviewed_at, now())
from leech_notes
where card_row.user_id = leech_notes.user_id and card_row.note_id = leech_notes.id
  and (card_row.lapses > 0 or not leech_notes.any_lapse);

update public.notes
set content = pg_catalog.jsonb_set(content, '{tags}', coalesce((
  select pg_catalog.jsonb_agg(tag order by position)
  from pg_catalog.jsonb_array_elements_text(content->'tags') with ordinality as listed(tag, position)
  where pg_catalog.lower(tag) <> 'leech'
), '[]'::jsonb))
where exists (select 1 from pg_catalog.jsonb_array_elements_text(content->'tags') as tag where pg_catalog.lower(tag) = 'leech');

-- Eigene Flaggennamen liegen in den Oberflächeneinstellungen; leer heißt Farbname.
update public.profiles
set ui_preferences = ui_preferences || '{"flagNames": ["", "", "", "", "", "", ""]}'::jsonb
where not ui_preferences ? 'flagNames';

-- Katalog mit den neuen Spalten füllen.
select private.refresh_card_catalog(grouped.user_id, grouped.card_ids)
from (select user_id, pg_catalog.array_agg(id) as card_ids from public.cards group by user_id) as grouped;

commit;
