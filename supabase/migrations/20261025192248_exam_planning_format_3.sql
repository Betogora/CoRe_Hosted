-- K3 (E11, E13, Stichtag): Die Prüfungsplanung im Profil wechselt einmalig auf Format 3. Quizblöcke und
-- Quizaufgaben entfallen samt Aufgabenart; ein gewählter Stapel umfasst künftig neue Unterstapel, deshalb werden
-- bisher nicht gewählte direkte Unterstapel gewählter Stapel als Ausnahme festgehalten. Die letzte neue Karte
-- liegt mindestens einen Tag vor der Klausur.
with source as (
  select id, scheduler_preferences -> 'examPlanning' as planning
  from public.profiles
  where scheduler_preferences -> 'examPlanning' ->> 'version' = '2'
), converted as (
  select
    source.id,
    pg_catalog.jsonb_build_object(
      'version', 3,
      'exams', coalesce((
        select pg_catalog.jsonb_agg(
          exam || pg_catalog.jsonb_build_object('bufferDays', greatest(1, coalesce((exam ->> 'bufferDays')::integer, 1)))
            || coalesce((
              select pg_catalog.jsonb_build_object('excludedDeckIds', pg_catalog.jsonb_agg(deck.id order by deck.id))
              from public.decks as deck
              where deck.user_id = source.id
                and deck.deleted_at is null
                and deck.parent_deck_id in (select pg_catalog.jsonb_array_elements_text(exam -> 'deckIds'))
                and deck.id not in (select pg_catalog.jsonb_array_elements_text(exam -> 'deckIds'))
              having count(*) > 0
            ), '{}'::jsonb)
          order by position)
        from pg_catalog.jsonb_array_elements(coalesce(source.planning -> 'exams', '[]'::jsonb)) with ordinality as listed(exam, position)
      ), '[]'::jsonb),
      'capacity', pg_catalog.jsonb_build_object('timeBlocks', coalesce((
        select pg_catalog.jsonb_agg(block - 'kind' order by position)
        from pg_catalog.jsonb_array_elements(coalesce(source.planning -> 'capacity' -> 'timeBlocks', '[]'::jsonb)) with ordinality as listed(block, position)
        where coalesce(block ->> 'kind', 'study') <> 'quiz'
      ), '[]'::jsonb))
    ) || case when source.planning ? 'dailyTasks' then pg_catalog.jsonb_build_object('dailyTasks', coalesce((
      select pg_catalog.jsonb_agg(task order by position)
      from pg_catalog.jsonb_array_elements(source.planning -> 'dailyTasks') with ordinality as listed(task, position)
      where task ->> 'kind' <> 'quiz'
    ), '[]'::jsonb)) else '{}'::jsonb end as planning
  from source
)
update public.profiles as profile
set scheduler_preferences = pg_catalog.jsonb_set(profile.scheduler_preferences, '{examPlanning}', converted.planning),
  updated_at = now()
from converted
where profile.id = converted.id;

do $$
begin
  if exists (select 1 from public.profiles where scheduler_preferences -> 'examPlanning' ->> 'version' in ('1', '2')) then
    raise exception 'Prüfungsplanung im Format 1 oder 2 ist nach der Umstellung noch vorhanden.';
  end if;
end $$;
