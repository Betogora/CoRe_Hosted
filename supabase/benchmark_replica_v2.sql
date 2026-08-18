begin;

insert into auth.users (id, email)
values ('00000000-0000-0000-0000-000000000042', 'replica-benchmark@core.local');

alter table public.decks disable trigger user;
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
  id, user_id, name, source, card_count, sync_change_id, revision,
  created_at, updated_at
) values (
  'replica-benchmark-deck',
  '00000000-0000-0000-0000-000000000042',
  'Replica Benchmark',
  'manual',
  100000,
  1,
  1,
  '2026-08-18T00:00:00Z',
  '2026-08-18T00:00:00Z'
);

insert into public.cards (
  id, user_id, deck_id, source, kind, original_front, original_back,
  review_state, sync_change_id, revision, created_at, updated_at
)
select
  'replica-card-' || pg_catalog.lpad(series_id::text, 6, '0'),
  '00000000-0000-0000-0000-000000000042',
  'replica-benchmark-deck',
  'manual',
  'basic',
  'Skalierungsfrage ' || series_id,
  'Skalierungsantwort ' || series_id,
  pg_catalog.jsonb_build_object(
    'state', case when series_id % 5 = 0 then 'new' else 'review' end,
    'dueAt', pg_catalog.to_char(
      '2026-08-18T12:00:00Z'::timestamptz + ((series_id % 365) || ' days')::interval,
      'YYYY-MM-DD"T"HH24:MI:SS"Z"'
    ),
    'intervalDays', greatest(1, series_id % 120),
    'difficulty', 1 + (series_id % 10),
    'stability', 1 + (series_id % 60),
    'lastReviewedAt', '2026-08-17T12:00:00Z'
  ),
  series_id + 1,
  1,
  '2025-08-18T00:00:00Z'::timestamptz + ((series_id % 365) || ' days')::interval,
  '2026-08-18T00:00:00Z'
from pg_catalog.generate_series(1, 100000) as series_id;

insert into public.card_catalog (
  id, user_id, deck_id, front_preview, normalized_search_text, sort_text,
  due_at, schedule_state, maturity_band, reviewable, has_active_variants,
  active_variant_count, body_revision, dependency_revision, sync_change_id,
  interval_days, difficulty, stability, last_reviewed_at, created_at, updated_at
)
select
  card_row.id,
  card_row.user_id,
  card_row.deck_id,
  card_row.original_front,
  lower(card_row.original_front || ' ' || card_row.original_back),
  lower(card_row.original_front),
  (card_row.review_state->>'dueAt')::timestamptz,
  card_row.review_state->>'state',
  case when (card_row.review_state->>'intervalDays')::integer >= 21 then 'mature' else 'young' end,
  true,
  false,
  0,
  1,
  1,
  card_row.sync_change_id + 100000,
  (card_row.review_state->>'intervalDays')::numeric,
  (card_row.review_state->>'difficulty')::numeric,
  (card_row.review_state->>'stability')::numeric,
  (card_row.review_state->>'lastReviewedAt')::timestamptz,
  card_row.created_at,
  card_row.updated_at
from public.cards as card_row
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
  300001,
  '2026-08-18T00:00:00Z'
);

insert into public.review_events (
  id, user_id, deck_id, reviewable_type, reviewable_id, rating,
  answered_at, response_time_ms, scheduler_before, scheduler_after,
  statistics_day, statistics_hour, statistics_category, statistics_interval_days,
  sync_change_id, created_at
)
select
  'replica-review-' || pg_catalog.lpad(series_id::text, 7, '0'),
  '00000000-0000-0000-0000-000000000042',
  'replica-benchmark-deck',
  'card',
  'replica-card-' || pg_catalog.lpad(((series_id - 1) % 100000 + 1)::text, 6, '0'),
  (array['again', 'hard', 'good', 'easy'])[(series_id - 1) % 4 + 1],
  '2026-08-18T12:00:00Z'::timestamptz
    - (((series_id - 1) % 365) || ' days')::interval
    - (((series_id - 1) % 86400) || ' seconds')::interval,
  1000 + (series_id % 4000),
  pg_catalog.jsonb_build_object(
    'state', case when series_id % 10 = 0 then 'learning' else 'review' end,
    'intervalDays', greatest(1, series_id % 120)
  ),
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
  series_id + 400000,
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
  select distinct on (user_id, reviewable_id, statistics_day)
    user_id, deck_id, statistics_day, statistics_category, rating
  from public.review_events
  where user_id = '00000000-0000-0000-0000-000000000042'
    and statistics_interval_days >= 1
  order by user_id, reviewable_id, statistics_day, answered_at, id
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
  statistics_runs numeric[] := '{}';
  catalog_runs numeric[] := '{}';
begin
  for run_number in 1..5 loop
    started_at := pg_catalog.clock_timestamp();
    select public.get_account_statistics(
      array['replica-benchmark-deck'],
      null,
      '2026-08-19T00:00:00Z',
      'Europe/Berlin',
      4
    ) into result;
    statistics_runs := pg_catalog.array_append(
      statistics_runs,
      round(extract(epoch from (pg_catalog.clock_timestamp() - started_at)) * 1000, 2)
    );

    started_at := pg_catalog.clock_timestamp();
    select public.list_account_card_catalog(
      'replica-benchmark-deck',
      'skalierungsfrage 99999',
      'sortField',
      'asc',
      null,
      50,
      true
    ) into result;
    catalog_runs := pg_catalog.array_append(
      catalog_runs,
      round(extract(epoch from (pg_catalog.clock_timestamp() - started_at)) * 1000, 2)
    );
  end loop;

  raise notice 'CORE_STATISTICS_RPC_MS=%', pg_catalog.array_to_json(statistics_runs);
  raise notice 'CORE_CATALOG_SEARCH_MS=%', pg_catalog.array_to_json(catalog_runs);
end
$$;

reset role;
rollback;
