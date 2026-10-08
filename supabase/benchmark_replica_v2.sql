begin;

insert into auth.users (id, email)
values ('00000000-0000-0000-0000-000000000042', 'replica-benchmark@core.local');

alter table public.decks disable trigger user;
alter table public.notes disable trigger user;
alter table public.cards disable trigger user;
alter table public.review_events disable trigger user;
alter table public.card_catalog disable trigger user;

insert into public.profiles (
  id, email, display_name, timezone, onboarding_complete,
  scheduler_preferences, ui_preferences
) values (
  '00000000-0000-0000-0000-000000000042',
  'replica-benchmark@core.local',
  'Replica Benchmark',
  'Europe/Berlin',
  true,
  '{"settingsVersion":2,"dayStartHour":4}'::jsonb,
  '{"dashboardCollapsedDeckIds":[],"learnCollapsedDeckIds":[],"deckManagerExpandedDeckIds":[],"syncIntervalMinutes":5}'::jsonb
);

insert into public.decks (
  id, user_id, name, source, sync_change_id, revision,
  created_at, updated_at
) values (
  'replica-benchmark-deck',
  '00000000-0000-0000-0000-000000000042',
  'Replica Benchmark',
  'manual',
  1,
  1,
  '2026-08-18T00:00:00Z',
  '2026-08-18T00:00:00Z'
);

-- 100.000 Basic-Inhalte mit je einer Karte; Such- und Sortiertext wie `noteTextIndex`.
insert into public.notes (
  id, user_id, content, media, search_text, sort_text, source,
  content_revision, revision, created_at, updated_at
)
select
  'replica-note-' || pg_catalog.lpad(series_id::text, 6, '0'),
  '00000000-0000-0000-0000-000000000042',
  pg_catalog.jsonb_build_object(
    'schemaVersion', 1,
    'fields', pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object('id', 'front', 'name', 'Vorderseite', 'role', 'prompt', 'html', 'Skalierungsfrage ' || series_id),
      pg_catalog.jsonb_build_object('id', 'back', 'name', 'Rückseite', 'role', 'answer', 'html', 'Skalierungsantwort ' || series_id)
    ),
    'interaction', '{"kind":"reveal","prompts":[{"key":"forward","name":"Vorwärts","instruction":"","questionFieldIds":["front"],"answerFieldIds":["back"],"requires":null,"typeInFieldId":null}]}'::jsonb,
    'speech', '[]'::jsonb,
    'tags', '[]'::jsonb
  ),
  '{}'::jsonb,
  'skalierungsfrage ' || series_id || ' skalierungsantwort ' || series_id,
  'Skalierungsfrage ' || series_id,
  'manual',
  1,
  1,
  '2025-08-18T00:00:00Z'::timestamptz + ((series_id % 365) || ' days')::interval,
  '2026-08-18T00:00:00Z'
from pg_catalog.generate_series(1, 100000) as series_id;

insert into public.cards (
  id, user_id, note_id, deck_id, prompt_key, state, due_at, stability, difficulty,
  reps, interval_days, last_reviewed_at, study_revision, revision, created_at, updated_at
)
select
  'replica-card-' || pg_catalog.lpad(series_id::text, 6, '0'),
  '00000000-0000-0000-0000-000000000042',
  'replica-note-' || pg_catalog.lpad(series_id::text, 6, '0'),
  'replica-benchmark-deck',
  'forward',
  case when series_id % 5 = 0 then 'new' else 'review' end,
  '2026-08-18T12:00:00Z'::timestamptz + ((series_id % 365) || ' days')::interval,
  1 + (series_id % 60),
  1 + (series_id % 10),
  case when series_id % 5 = 0 then 0 else 3 end,
  case when series_id % 5 = 0 then 0 else greatest(1, series_id % 120) end,
  case when series_id % 5 = 0 then null else '2026-08-17T12:00:00Z'::timestamptz end,
  1,
  1,
  '2025-08-18T00:00:00Z'::timestamptz + ((series_id % 365) || ' days')::interval,
  '2026-08-18T00:00:00Z'
from pg_catalog.generate_series(1, 100000) as series_id;

insert into public.card_catalog (
  id, user_id, deck_id, note_id, front_preview, sort_text, due_at, schedule_state,
  maturity_band, reviewable, marked, has_active_variants, active_variant_count,
  body_revision, study_revision, dependency_revision, sync_change_id, created_at, updated_at
)
select
  card_row.id,
  card_row.user_id,
  card_row.deck_id,
  card_row.note_id,
  note_row.sort_text,
  lower(note_row.sort_text),
  card_row.due_at,
  card_row.state,
  case when card_row.interval_days >= 21 then 'mature' else 'young' end,
  true,
  false,
  false,
  0,
  1,
  card_row.study_revision,
  1,
  pg_catalog.nextval('public.account_sync_change_id_seq'::regclass),
  card_row.created_at,
  card_row.updated_at
from public.cards as card_row
join public.notes as note_row on note_row.user_id = card_row.user_id and note_row.id = card_row.note_id
where card_row.user_id = '00000000-0000-0000-0000-000000000042';

insert into public.deck_study_summaries (
  user_id, deck_id, total_count, new_count, learning_count, mature_count,
  suspended_count, active_variant_count, sync_change_id, updated_at
) values (
  '00000000-0000-0000-0000-000000000042',
  'replica-benchmark-deck',
  100000,
  20000,
  0,
  80000,
  0,
  0,
  pg_catalog.nextval('public.account_sync_change_id_seq'::regclass),
  '2026-08-18T00:00:00Z'
);

insert into public.review_events (
  id, user_id, card_id, deck_id, rating,
  answered_at, response_time_ms, scheduler_before, scheduler_after,
  statistics_day, statistics_hour, statistics_category, statistics_interval_days,
  created_at
)
select
  'replica-review-' || pg_catalog.lpad(series_id::text, 7, '0'),
  '00000000-0000-0000-0000-000000000042',
  'replica-card-' || pg_catalog.lpad(((series_id - 1) % 100000 + 1)::text, 6, '0'),
  'replica-benchmark-deck',
  (array['again', 'hard', 'good', 'easy'])[(series_id - 1) % 4 + 1],
  '2026-08-18T12:00:00Z'::timestamptz
    - (((series_id - 1) % 365) || ' days')::interval
    - (((series_id - 1) % 86400) || ' seconds')::interval,
  1000 + (series_id % 4000),
  pg_catalog.jsonb_build_object('card', pg_catalog.jsonb_build_object(
    'state', case when series_id % 10 = 0 then 'learning' else 'review' end,
    'intervalDays', greatest(1, series_id % 120)
  )),
  '{}'::jsonb,
  (('2026-08-18T12:00:00Z'::timestamptz
    - (((series_id - 1) % 365) || ' days')::interval
    - (((series_id - 1) % 86400) || ' seconds')::interval
  ) at time zone 'Europe/Berlin' - interval '4 hours')::date,
  extract(hour from (('2026-08-18T12:00:00Z'::timestamptz
    - (((series_id - 1) % 365) || ' days')::interval
    - (((series_id - 1) % 86400) || ' seconds')::interval
  ) at time zone 'Europe/Berlin'))::integer,
  case
    when series_id % 10 = 0 then 'learning'
    when greatest(1, series_id % 120) >= 21 then 'mature'
    else 'young'
  end,
  greatest(1, series_id % 120),
  '2026-08-18T12:00:00Z'::timestamptz
    - (((series_id - 1) % 365) || ' days')::interval
from pg_catalog.generate_series(1, 1000000) as series_id;

with daily as materialized (
  select user_id, deck_id, statistics_day,
    count(*)::integer as review_count,
    count(*) filter (where statistics_category = 'learning')::integer as learning_count,
    count(*) filter (where statistics_category = 'relearning')::integer as relearning_count,
    count(*) filter (where statistics_category = 'young')::integer as young_count,
    count(*) filter (where statistics_category = 'mature')::integer as mature_count,
    count(*) filter (where rating <> 'again')::integer as successful_count,
    count(*) filter (where response_time_ms is not null)::integer as timed_count,
    sum(greatest(0, least(response_time_ms, 60000)))::bigint as duration_ms,
    sum(greatest(0, least(response_time_ms, 60000))) filter (where statistics_category = 'learning')::bigint as duration_learning_ms,
    sum(greatest(0, least(response_time_ms, 60000))) filter (where statistics_category = 'relearning')::bigint as duration_relearning_ms,
    sum(greatest(0, least(response_time_ms, 60000))) filter (where statistics_category = 'young')::bigint as duration_young_ms,
    sum(greatest(0, least(response_time_ms, 60000))) filter (where statistics_category = 'mature')::bigint as duration_mature_ms
  from public.review_events
  where user_id = '00000000-0000-0000-0000-000000000042'
  group by user_id, deck_id, statistics_day
), hourly_rows as materialized (
  select user_id, deck_id, statistics_day, statistics_hour,
    count(*)::integer as review_count,
    count(*) filter (where rating <> 'again')::integer as successful_count
  from public.review_events
  where user_id = '00000000-0000-0000-0000-000000000042'
  group by user_id, deck_id, statistics_day, statistics_hour
), hourly as materialized (
  select user_id, deck_id, statistics_day,
    pg_catalog.jsonb_object_agg(statistics_hour, review_count) as reviews,
    pg_catalog.jsonb_object_agg(statistics_hour, successful_count) as successful
  from hourly_rows
  group by user_id, deck_id, statistics_day
), rating_rows as materialized (
  select user_id, deck_id, statistics_day, statistics_category, rating,
    count(*)::integer as rating_count
  from public.review_events
  where user_id = '00000000-0000-0000-0000-000000000042'
  group by user_id, deck_id, statistics_day, statistics_category, rating
), ratings as materialized (
  select user_id, deck_id, statistics_day,
    pg_catalog.jsonb_object_agg(statistics_category || ':' || rating, rating_count) as rating_counts
  from rating_rows
  group by user_id, deck_id, statistics_day
), first_reviews as materialized (
  select distinct on (user_id, card_id, statistics_day)
    user_id, deck_id, statistics_day, statistics_category, rating
  from public.review_events
  where user_id = '00000000-0000-0000-0000-000000000042'
    and statistics_interval_days >= 1
  order by user_id, card_id, statistics_day, answered_at, id
), retention as materialized (
  select user_id, deck_id, statistics_day,
    count(*) filter (where statistics_category = 'young')::integer as young_count,
    count(*) filter (where statistics_category = 'young' and rating <> 'again')::integer as young_remembered,
    count(*) filter (where statistics_category = 'mature')::integer as mature_count,
    count(*) filter (where statistics_category = 'mature' and rating <> 'again')::integer as mature_remembered
  from first_reviews
  group by user_id, deck_id, statistics_day
)
insert into public.review_statistics_daily (
  user_id, deck_id, day_key,
  review_count, learning_count, relearning_count, young_count, mature_count,
  successful_count, timed_count, duration_ms,
  duration_learning_ms, duration_relearning_ms, duration_young_ms, duration_mature_ms,
  retention_young_count, retention_young_remembered,
  retention_mature_count, retention_mature_remembered,
  hourly_reviews, hourly_successful, rating_counts
)
select daily.user_id, daily.deck_id, daily.statistics_day,
  daily.review_count, daily.learning_count, daily.relearning_count, daily.young_count, daily.mature_count,
  daily.successful_count, daily.timed_count, daily.duration_ms,
  coalesce(daily.duration_learning_ms, 0), coalesce(daily.duration_relearning_ms, 0),
  coalesce(daily.duration_young_ms, 0), coalesce(daily.duration_mature_ms, 0),
  coalesce(retention.young_count, 0), coalesce(retention.young_remembered, 0),
  coalesce(retention.mature_count, 0), coalesce(retention.mature_remembered, 0),
  coalesce(hourly.reviews, '{}'::jsonb), coalesce(hourly.successful, '{}'::jsonb),
  coalesce(ratings.rating_counts, '{}'::jsonb)
from daily
left join hourly using (user_id, deck_id, statistics_day)
left join ratings using (user_id, deck_id, statistics_day)
left join retention using (user_id, deck_id, statistics_day);

-- Die gemessenen Schreibpfade laufen mit den produktiven Triggern.
alter table public.decks enable trigger user;
alter table public.notes enable trigger user;
alter table public.cards enable trigger user;
alter table public.review_events enable trigger user;
alter table public.card_catalog enable trigger user;

analyze public.notes;
analyze public.cards;
analyze public.card_catalog;
analyze public.review_events;
analyze public.deck_study_summaries;
analyze public.review_statistics_daily;

set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000042';

do $$
declare
  started_at timestamptz;
  result jsonb;
  row_count integer;
  statistics_runs numeric[] := '{}';
  catalog_runs numeric[] := '{}';
  bootstrap_runs numeric[] := '{}';
  review_runs numeric[] := '{}';
  import_runs numeric[] := '{}';
  catalog_page_runs numeric[] := '{}';
  direct_page_runs numeric[] := '{}';
  summary_runs numeric[] := '{}';
  direct_summary_runs numeric[] := '{}';
begin
  for run_number in 1..5 loop
    started_at := pg_catalog.clock_timestamp();
    select public.get_account_statistics(array['replica-benchmark-deck'], null, '2026-08-19T00:00:00Z', 'Europe/Berlin', 4) into result;
    statistics_runs := pg_catalog.array_append(statistics_runs, round(extract(epoch from (pg_catalog.clock_timestamp() - started_at)) * 1000, 2));

    started_at := pg_catalog.clock_timestamp();
    select public.list_account_card_catalog('replica-benchmark-deck', 'skalierungsfrage 99999', 'sortField', 'asc', null, 50, true) into result;
    catalog_runs := pg_catalog.array_append(catalog_runs, round(extract(epoch from (pg_catalog.clock_timestamp() - started_at)) * 1000, 2));

    started_at := pg_catalog.clock_timestamp();
    select public.get_account_bootstrap('', 200, 204800) into result;
    bootstrap_runs := pg_catalog.array_append(bootstrap_runs, round(extract(epoch from (pg_catalog.clock_timestamp() - started_at)) * 1000, 2));

    -- Atomarer Review auf einer bislang unbewerteten Karte.
    started_at := pg_catalog.clock_timestamp();
    select public.record_review_atomic(
      'replica-card-' || pg_catalog.lpad((run_number * 5)::text, 6, '0'),
      '{"state":"learning","due_at":"2026-08-18T12:10:00Z","stability":1,"difficulty":5,"reps":1,"lapses":0,"interval_days":0,"learning_step_index":1,"last_reviewed_at":"2026-08-18T12:00:00Z","last_rating":"good","study_extra":{}}'::jsonb,
      '2026-08-18T12:00:00Z',
      null, null, null,
      pg_catalog.jsonb_build_object(
        'id', 'replica-atomic-review-' || run_number,
        'card_id', 'replica-card-' || pg_catalog.lpad((run_number * 5)::text, 6, '0'),
        'deck_id', 'replica-benchmark-deck',
        'rating', 'good',
        'answered_at', '2026-08-18T12:00:00Z',
        'response_time_ms', 1500,
        'scheduler_before', '{"card":{"state":"new"}}'::jsonb,
        'scheduler_after', '{"card":{"state":"learning"}}'::jsonb,
        'flags', '{}'::jsonb,
        'created_at', '2026-08-18T12:00:00Z'
      ),
      'replica-benchmark-device'
    ) into result;
    review_runs := pg_catalog.array_append(review_runs, round(extract(epoch from (pg_catalog.clock_timestamp() - started_at)) * 1000, 2));

    -- Import-Schreibbatch: 250 Inhalte und 250 Karten wie ein Commit-Chunk, mengenbasiert über die Trigger.
    started_at := pg_catalog.clock_timestamp();
    insert into public.notes (id, user_id, content, search_text, sort_text, source)
    select 'replica-import-note-' || run_number || '-' || series_id, '00000000-0000-0000-0000-000000000042',
      pg_catalog.jsonb_build_object('schemaVersion', 1,
        'fields', pg_catalog.jsonb_build_array(
          pg_catalog.jsonb_build_object('id', 'front', 'name', 'Vorderseite', 'role', 'prompt', 'html', 'Importfrage ' || series_id),
          pg_catalog.jsonb_build_object('id', 'back', 'name', 'Rückseite', 'role', 'answer', 'html', 'Importantwort ' || series_id)),
        'interaction', '{"kind":"reveal","prompts":[{"key":"forward","name":"Vorwärts","instruction":"","questionFieldIds":["front"],"answerFieldIds":["back"],"requires":null,"typeInFieldId":null}]}'::jsonb,
        'speech', '[]'::jsonb, 'tags', '[]'::jsonb),
      'importfrage ' || series_id || ' importantwort ' || series_id, 'Importfrage ' || series_id, 'manual'
    from pg_catalog.generate_series(1, 250) as series_id;
    insert into public.cards (id, user_id, note_id, deck_id, prompt_key, due_at)
    select 'replica-import-card-' || run_number || '-' || series_id, '00000000-0000-0000-0000-000000000042',
      'replica-import-note-' || run_number || '-' || series_id, 'replica-benchmark-deck', 'forward', '2026-08-18T12:00:00Z'
    from pg_catalog.generate_series(1, 250) as series_id;
    import_runs := pg_catalog.array_append(import_runs, round(extract(epoch from (pg_catalog.clock_timestamp() - started_at)) * 1000, 2));

    -- K4.2: erste Kartenseite über die Projektion gegenüber direkten Indizes auf `cards` und `notes`.
    started_at := pg_catalog.clock_timestamp();
    select public.list_account_card_catalog('replica-benchmark-deck', '', 'sortField', 'asc', null, 50, false) into result;
    catalog_page_runs := pg_catalog.array_append(catalog_page_runs, round(extract(epoch from (pg_catalog.clock_timestamp() - started_at)) * 1000, 2));

    started_at := pg_catalog.clock_timestamp();
    select count(*) into row_count from (
      select card_row.id
      from public.cards as card_row
      join public.notes as note_row on note_row.user_id = card_row.user_id and note_row.id = card_row.note_id
      where card_row.user_id = '00000000-0000-0000-0000-000000000042'
        and card_row.deck_id = 'replica-benchmark-deck'
        and card_row.deleted_at is null
      order by lower(note_row.sort_text), card_row.id
      limit 50
    ) as page;
    direct_page_runs := pg_catalog.array_append(direct_page_runs, round(extract(epoch from (pg_catalog.clock_timestamp() - started_at)) * 1000, 2));

    -- K4.2: Stapelzähler aus der Projektion gegenüber einer direkten Aggregation.
    started_at := pg_catalog.clock_timestamp();
    select count(*) into row_count from public.deck_study_summaries where user_id = '00000000-0000-0000-0000-000000000042';
    summary_runs := pg_catalog.array_append(summary_runs, round(extract(epoch from (pg_catalog.clock_timestamp() - started_at)) * 1000, 2));

    started_at := pg_catalog.clock_timestamp();
    select count(*) into row_count from (
      select deck_id, count(*) filter (where state = 'new'), count(*) filter (where state in ('learning', 'relearning')), count(*) filter (where status = 'suspended')
      from public.cards
      where user_id = '00000000-0000-0000-0000-000000000042' and deleted_at is null
      group by deck_id
    ) as summary;
    direct_summary_runs := pg_catalog.array_append(direct_summary_runs, round(extract(epoch from (pg_catalog.clock_timestamp() - started_at)) * 1000, 2));
  end loop;

  raise notice 'CORE_STATISTICS_RPC_MS=%', pg_catalog.array_to_json(statistics_runs);
  raise notice 'CORE_CATALOG_SEARCH_MS=%', pg_catalog.array_to_json(catalog_runs);
  raise notice 'CORE_BOOTSTRAP_RPC_MS=%', pg_catalog.array_to_json(bootstrap_runs);
  raise notice 'CORE_ATOMIC_REVIEW_MS=%', pg_catalog.array_to_json(review_runs);
  raise notice 'CORE_IMPORT_BATCH_MS=%', pg_catalog.array_to_json(import_runs);
  raise notice 'CORE_CATALOG_PAGE_MS=%', pg_catalog.array_to_json(catalog_page_runs);
  raise notice 'CORE_DIRECT_PAGE_MS=%', pg_catalog.array_to_json(direct_page_runs);
  raise notice 'CORE_SUMMARY_READ_MS=%', pg_catalog.array_to_json(summary_runs);
  raise notice 'CORE_DIRECT_SUMMARY_MS=%', pg_catalog.array_to_json(direct_summary_runs);
end
$$;

reset role;
rollback;
