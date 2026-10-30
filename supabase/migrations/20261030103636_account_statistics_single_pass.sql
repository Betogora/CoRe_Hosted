-- Die Statistik las alle Karten in ein Zwischenergebnis, kopierte daraus die aktiven Karten in ein
-- zweites und die Abrufwahrscheinlichkeiten in ein drittes; jede Kennzahl las sie erneut.
-- Jetzt liefern drei Abfragen direkt auf den Karten alle Werte: Übersicht je Konto und Stapel,
-- Tageszählungen und Buckets in einem Durchlauf sowie die Intervall-Perzentile.
-- Signatur, Rückgabe und Rechte bleiben gleich.
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
  with active_variant_counts as materialized (
    select variant_row.card_id, count(*)::integer as variant_count
    from public.card_variants as variant_row
    where variant_row.user_id = (select auth.uid())
      and variant_row.deleted_at is null and variant_row.is_active and variant_row.quality_status = 'active'
    group by variant_row.card_id
  ), card_rows as not materialized (
    select card_row.id, card_row.deck_id, card_row.state, card_row.status, card_row.due_at,
      card_row.interval_days, card_row.difficulty, card_row.stability, card_row.last_reviewed_at, card_row.created_at,
      card_row.deleted_at is null as is_live,
      card_row.deleted_at is null and card_row.status = 'active' as is_current,
      coalesce(nullif(card_row.study_extra->>'maturityBand', ''), 'new') in ('mature', 'variant_ready', 'mastered') as is_mature
    from public.cards as card_row
    where card_row.user_id = (select auth.uid())
      and (p_deck_ids is null or card_row.deck_id = any(p_deck_ids))
  ), card_overview as materialized (
    select grouping(card_row.deck_id) = 0 as per_deck, card_row.deck_id,
      count(*) filter (where card_row.is_live)::integer as total,
      count(*) filter (where card_row.is_live and card_row.state = 'new')::integer as new_count,
      count(*) filter (where card_row.is_live and card_row.state in ('learning', 'relearning'))::integer as learning_count,
      count(*) filter (where card_row.is_live and card_row.is_mature)::integer as mature_count,
      count(*) filter (where card_row.is_live and card_row.status <> 'active')::integer as suspended_count,
      count(*) filter (where card_row.is_current and card_row.state <> 'new' and card_row.due_at < now())::integer as overdue_count,
      coalesce(sum(1 + coalesce(variant_count.variant_count, 0)) filter (where card_row.is_current), 0)::integer as active_variants,
      count(*) filter (where not card_row.is_live)::integer as deleted_items,
      sum(card_row.interval_days) filter (where card_row.is_current) as interval_total,
      count(*) filter (where card_row.is_current and card_row.interval_days > 0)::integer as interval_count,
      min(card_row.due_at) filter (where card_row.is_current) as next_due_at
    from card_rows as card_row
    left join active_variant_counts as variant_count on variant_count.card_id = card_row.id
    group by grouping sets ((), (card_row.deck_id))
  ), card_counts as materialized (
    select added_day, forecast_day, forecast_kind, interval_bucket, stability_bucket, difficulty_bucket,
      retrievability_bucket, count(*)::integer as card_count
    from (
      select
        case when (p_from is null or card_row.created_at >= p_from) and (p_to is null or card_row.created_at < p_to)
          then ((card_row.created_at at time zone p_time_zone) - pg_catalog.make_interval(hours => least(greatest(p_day_start_hour, 0), 23)))::date end as added_day,
        case when card_row.is_current and card_row.due_at >= now() and card_row.due_at < now() + interval '365 days'
          then ((card_row.due_at at time zone p_time_zone) - pg_catalog.make_interval(hours => least(greatest(p_day_start_hour, 0), 23)))::date end as forecast_day,
        case when card_row.state in ('new', 'learning') then 'learning'
          when card_row.state = 'relearning' then 'relearning'
          when card_row.is_mature then 'mature'
          else 'young' end as forecast_kind,
        case when card_row.is_current and card_row.interval_days > 0
          then least(59, floor(card_row.interval_days))::integer end as interval_bucket,
        case when card_row.is_current and card_row.stability > 0
          then least(39, floor(card_row.stability))::integer end as stability_bucket,
        case when card_row.is_current and card_row.difficulty > 0 and card_row.difficulty <= 10
          then least(10, greatest(1, ceil(card_row.difficulty)))::integer end as difficulty_bucket,
        case when card_row.is_current and card_row.stability > 0 and card_row.last_reviewed_at is not null
          then floor(least(0.999999, greatest(0,
            power(
              1 + (19::double precision / 81)
                * greatest(0, extract(epoch from (now() - card_row.last_reviewed_at))::double precision / 86400)
                / card_row.stability,
              -0.5::double precision
            )
          )) * 20)::integer end as retrievability_bucket
      from card_rows as card_row
    ) as card_key
    group by grouping sets ((added_day), (forecast_day, forecast_kind), (interval_bucket), (stability_bucket),
      (difficulty_bucket), (retrievability_bucket))
  ), card_totals as materialized (
    select total, new_count, learning_count, mature_count, suspended_count, overdue_count, active_variants, deleted_items
    from card_overview where not per_deck
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
    select added_day::text as day_key, card_count
    from card_counts where added_day is not null
  ), forecast_daily as materialized (
    select forecast_day::text as day_key,
      coalesce(sum(card_count) filter (where forecast_kind = 'learning'), 0)::integer as learning,
      coalesce(sum(card_count) filter (where forecast_kind = 'relearning'), 0)::integer as relearning,
      coalesce(sum(card_count) filter (where forecast_kind = 'young'), 0)::integer as young,
      coalesce(sum(card_count) filter (where forecast_kind = 'mature'), 0)::integer as mature,
      sum(card_count)::integer as total
    from card_counts where forecast_day is not null
    group by forecast_day
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
    select deck_id, interval_total, interval_count, next_due_at
    from card_overview where per_deck
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
    select interval_bucket as bucket, card_count as bucket_count
    from card_counts where interval_bucket is not null
  ), interval_distribution as materialized (
    select bucket, bucket_count,
      100 * sum(bucket_count) over (order by bucket)::numeric / nullif(sum(bucket_count) over (), 0) as cumulative_percent
    from interval_bucket_counts
  ), interval_statistics as materialized (
    select round(avg(interval_days)::numeric, 1) as average_days,
      percentile_cont(0.5) within group (order by interval_days) as median_days,
      percentile_cont(0.95) within group (order by interval_days) as percentile_95_days,
      round(sum(1 / greatest(interval_days, 1))::numeric, 1) as daily_workload
    from card_rows where is_current and interval_days > 0
  ), stability_bucket_counts as materialized (
    select stability_bucket as bucket, card_count as bucket_count
    from card_counts where stability_bucket is not null
  ), stability_distribution as materialized (
    select bucket, bucket_count,
      100 * sum(bucket_count) over (order by bucket)::numeric / nullif(sum(bucket_count) over (), 0) as cumulative_percent
    from stability_bucket_counts
  ), difficulty_bucket_counts as materialized (
    select difficulty_bucket as bucket, card_count as bucket_count
    from card_counts where difficulty_bucket is not null
  ), difficulty_distribution as materialized (
    select bucket, bucket_count,
      100 * sum(bucket_count) over (order by bucket)::numeric / nullif(sum(bucket_count) over (), 0) as cumulative_percent
    from difficulty_bucket_counts
  ), retrievability_bucket_counts as materialized (
    select retrievability_bucket as bucket, card_count as bucket_count
    from card_counts where retrievability_bucket is not null
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
