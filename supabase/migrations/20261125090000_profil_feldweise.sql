-- Profiländerungen kommen als Patch: Die Funktion übernimmt nur übergebene Spalten und, in `scheduler_preferences`
-- und `ui_preferences`, nur übergebene Schlüssel der obersten Ebene. Gleichzeitige Änderungen verschiedener Geräte an
-- verschiedenen Schlüsseln bleiben so beide erhalten. `ui_preferences.dashboardStudyDays` wird als Menge vereinigt
-- und auf die 14 Lerntage bis zum Serverdatum begrenzt, damit eine falsch gehende Geräteuhr die Liste nicht leert.
-- Fehlt die Profilzeile noch, füllt `p_insert` (die vollständige lokale Zeile) sie, bevor der Patch gilt.

create or replace function public.patch_account_profile(p_patch jsonb, p_insert jsonb default '{}'::jsonb)
returns public.profiles
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_scheduler jsonb := coalesce(p_patch -> 'scheduler_preferences', '{}'::jsonb);
  v_ui jsonb := coalesce(p_patch -> 'ui_preferences', '{}'::jsonb);
  v_email text := coalesce(p_insert ->> 'email', (select auth.jwt() ->> 'email'), '');
  v_current jsonb;
  v_entry jsonb;
  v_day date;
  v_keys text[] := '{}';
  v_row public.profiles;
begin
  if v_user_id is null then raise exception 'Nicht angemeldet.' using errcode = '42501'; end if;
  if pg_catalog.jsonb_typeof(p_patch) <> 'object' or pg_catalog.jsonb_typeof(p_insert) <> 'object'
    or pg_catalog.jsonb_typeof(v_scheduler) <> 'object' or pg_catalog.jsonb_typeof(v_ui) <> 'object' then
    raise exception 'Ungültiger Profilpatch.' using errcode = '22023';
  end if;

  if v_ui ? 'dashboardStudyDays' then
    -- The row lock keeps a concurrent patch from merging against the same old list.
    select profile.ui_preferences -> 'dashboardStudyDays' into v_current
    from public.profiles as profile where profile.id = v_user_id for update;
    for v_entry in
      select entry from pg_catalog.jsonb_array_elements(
        (case when pg_catalog.jsonb_typeof(v_current) = 'array' then v_current else '[]'::jsonb end)
        || (case when pg_catalog.jsonb_typeof(v_ui -> 'dashboardStudyDays') = 'array' then v_ui -> 'dashboardStudyDays' else '[]'::jsonb end)
      ) as entries(entry)
    loop
      continue when pg_catalog.jsonb_typeof(v_entry) <> 'object' or coalesce(v_entry ->> 'deckId', '') = '' or coalesce(v_entry ->> 'day', '') !~ '^\d{4}-\d{2}-\d{2}$';
      begin
        v_day := (v_entry ->> 'day')::date;
      exception when others then
        continue;
      end;
      continue when v_day <= current_date - 14 or v_day > current_date + 1;
      v_keys := v_keys || (pg_catalog.to_char(v_day, 'YYYY-MM-DD') || ' ' || (v_entry ->> 'deckId'));
    end loop;
    v_ui := v_ui || pg_catalog.jsonb_build_object('dashboardStudyDays', (
      select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('deckId', pg_catalog.substr(keys.key, 12), 'day', pg_catalog.left(keys.key, 10)) order by keys.key), '[]'::jsonb)
      from (select distinct pg_catalog.unnest(v_keys) as key) as keys
    ));
  end if;

  insert into public.profiles as profile (id, email, display_name, timezone, onboarding_complete, scheduler_preferences, ui_preferences, updated_at)
  values (
    v_user_id,
    v_email,
    coalesce(p_patch ->> 'display_name', p_insert ->> 'display_name', pg_catalog.split_part(v_email, '@', 1)),
    coalesce(p_patch ->> 'timezone', p_insert ->> 'timezone', 'Europe/Berlin'),
    coalesce((p_patch ->> 'onboarding_complete')::boolean, (p_insert ->> 'onboarding_complete')::boolean, true),
    case when pg_catalog.jsonb_typeof(p_insert -> 'scheduler_preferences') = 'object' then p_insert -> 'scheduler_preferences' else '{}'::jsonb end || v_scheduler,
    case when pg_catalog.jsonb_typeof(p_insert -> 'ui_preferences') = 'object' then p_insert -> 'ui_preferences' else '{}'::jsonb end || v_ui,
    pg_catalog.clock_timestamp()
  )
  on conflict (id) do update set
    display_name = case when p_patch ? 'display_name' then excluded.display_name else profile.display_name end,
    timezone = case when p_patch ? 'timezone' then excluded.timezone else profile.timezone end,
    onboarding_complete = case when p_patch ? 'onboarding_complete' then excluded.onboarding_complete else profile.onboarding_complete end,
    scheduler_preferences = profile.scheduler_preferences || v_scheduler,
    ui_preferences = profile.ui_preferences || v_ui,
    -- Strictly increasing, so a reader comparing `updated_at` never misses a write that committed after its read.
    updated_at = greatest(pg_catalog.clock_timestamp(), profile.updated_at + interval '1 millisecond')
  returning * into v_row;
  return v_row;
end;
$$;

revoke all on function public.patch_account_profile(jsonb, jsonb) from public, anon;
grant execute on function public.patch_account_profile(jsonb, jsonb) to authenticated;
