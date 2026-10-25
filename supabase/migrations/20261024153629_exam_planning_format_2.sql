-- K1 (E6): Die Prüfungsplanung im Profil wechselt einmalig auf Format 2. Die App kennt danach nur noch
-- dieses Format: Lernzeit je Klausur statt gemeinsamer Kapazität, keine Priorität, global nur Zeitblöcke.
-- Die gemeinsame Zeit wird auf die aktiven Klausuren geteilt; der Puffer in Lerntagen wird anhand der
-- Lernwochentage in Kalendertage umgerechnet.
with source as (
  select id, scheduler_preferences -> 'examPlanning' as planning
  from public.profiles
  where scheduler_preferences -> 'examPlanning' ->> 'version' = '1'
), shaped as (
  select
    id,
    planning,
    planning -> 'capacity' as capacity,
    greatest(1, (select count(*) from pg_catalog.jsonb_array_elements(coalesce(planning -> 'exams', '[]'::jsonb)) as exam where exam ->> 'status' = 'active')) as share,
    greatest(1, (select count(*) from pg_catalog.jsonb_array_elements_text(coalesce(planning -> 'capacity' -> 'weekdays', '[]'::jsonb)) as day where day = 'true')) as study_days
  from source
), converted as (
  select
    id,
    pg_catalog.jsonb_build_object(
      'version', 2,
      'exams', coalesce((
        select pg_catalog.jsonb_agg(
          (exam - 'priority') || pg_catalog.jsonb_build_object(
            'bufferDays', case when coalesce((exam ->> 'bufferDays')::integer, 0) = 0 then 0
              else least(365, ceil((exam ->> 'bufferDays')::numeric * 7 / study_days))::integer end,
            'studyTime', pg_catalog.jsonb_build_object(
              'dailyMinutes', round((capacity ->> 'weekdayMinutes')::numeric / share)::integer,
              'weekdays', capacity -> 'weekdays',
              'weeklyMinutes', (
                select pg_catalog.jsonb_agg(
                  case when (capacity -> 'weekdays' ->> day)::boolean
                    then round(coalesce((capacity -> 'weeklyMinutes' ->> day)::numeric,
                      (capacity ->> case when day < 5 then 'weekdayMinutes' else 'weekendMinutes' end)::numeric) / share)::integer
                    else 0 end
                  order by day)
                from pg_catalog.generate_series(0, 6) as day
              ),
              'dateOverrides', coalesce((
                select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('date', entry ->> 'date', 'minutes', round((entry ->> 'minutes')::numeric / share)::integer))
                from pg_catalog.jsonb_array_elements(coalesce(capacity -> 'dateOverrides', '[]'::jsonb)) as entry
              ), '[]'::jsonb)
            )
          )
          order by position)
        from pg_catalog.jsonb_array_elements(coalesce(planning -> 'exams', '[]'::jsonb)) with ordinality as listed(exam, position)
      ), '[]'::jsonb),
      'capacity', pg_catalog.jsonb_build_object('timeBlocks', coalesce(capacity -> 'timeBlocks', '[]'::jsonb))
    ) || case when planning ? 'dailyTasks' then pg_catalog.jsonb_build_object('dailyTasks', planning -> 'dailyTasks') else '{}'::jsonb end as planning
  from shaped
)
update public.profiles as profile
set scheduler_preferences = pg_catalog.jsonb_set(profile.scheduler_preferences, '{examPlanning}', converted.planning),
  updated_at = now()
from converted
where profile.id = converted.id;

do $$
begin
  if exists (select 1 from public.profiles where scheduler_preferences -> 'examPlanning' ->> 'version' = '1') then
    raise exception 'Prüfungsplanung im Format 1 ist nach der Umstellung noch vorhanden.';
  end if;
end $$;
