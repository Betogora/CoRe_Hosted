do $$
declare
  missing_tables text[];
  present_retired_tables text[];
  present_retired_columns text[];
  table_name text;
  constraint_definition text;
begin
  select array_agg(expected.name order by expected.name)
  into missing_tables
  from (values
    ('profiles'), ('decks'), ('cards'), ('card_variants'), ('review_events'),
    ('source_documents'), ('media_assets'), ('sync_devices'), ('sync_conflicts')
  ) as expected(name)
  where to_regclass(format('public.%I', expected.name)) is null;
  if missing_tables is not null then
    raise exception 'Core-Tabellen fehlen: %', missing_tables;
  end if;

  select array_agg(retired.name order by retired.name)
  into present_retired_tables
  from (values ('ai_jobs'), ('apkg_import_jobs'), ('core_portable_exports'), ('admin_audit_events')) as retired(name)
  where to_regclass(format('public.%I', retired.name)) is not null;
  if present_retired_tables is not null then
    raise exception 'Ausgemusterte Tabellen sind noch vorhanden: %', present_retired_tables;
  end if;

  select array_agg(format('%s.%s', retired.table_name, retired.column_name) order by retired.table_name, retired.column_name)
  into present_retired_columns
  from (values
    ('profiles', 'privacy'),
    ('decks', 'graph'),
    ('decks', 'community_refs'),
    ('decks', 'visibility')
  ) as retired(table_name, column_name)
  join information_schema.columns columns
    on columns.table_schema = 'public'
   and columns.table_name = retired.table_name
   and columns.column_name = retired.column_name;
  if present_retired_columns is not null then
    raise exception 'Ausgemusterte Spalten sind noch vorhanden: %', present_retired_columns;
  end if;

  foreach table_name in array array['profiles', 'decks', 'cards', 'card_variants', 'review_events', 'source_documents', 'media_assets', 'sync_devices', 'sync_conflicts']
  loop
    if not exists (
      select 1 from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relname = table_name and c.relrowsecurity
    ) then
      raise exception 'RLS fehlt für public.%', table_name;
    end if;
  end loop;

  foreach table_name in array array['decks', 'cards', 'card_variants', 'review_events', 'source_documents', 'media_assets', 'sync_devices', 'sync_conflicts']
  loop
    if not exists (
      select 1 from pg_policies
      where schemaname = 'public'
        and tablename = table_name
        and roles = array['authenticated']::name[]
        and cmd = 'ALL'
        and qual like '%auth.uid()%'
        and with_check like '%auth.uid()%'
    ) then
      raise exception 'Owner-Policy fehlt für public.%', table_name;
    end if;
  end loop;

  select pg_get_constraintdef(oid) into constraint_definition
  from pg_constraint
  where conrelid = 'public.decks'::regclass and conname = 'decks_source_check';
  if constraint_definition is null
     or constraint_definition like '%ai-assisted%'
     or constraint_definition like '%community%'
     or constraint_definition not like '%anki-apkg%'
     or constraint_definition not like '%manual%' then
    raise exception 'Deck-Quellen-Constraint ist nicht auf Core verengt: %', constraint_definition;
  end if;

  select pg_get_constraintdef(oid) into constraint_definition
  from pg_constraint
  where conrelid = 'public.cards'::regclass and conname = 'cards_source_check';
  if constraint_definition is null
     or constraint_definition like '%ai-assisted%'
     or constraint_definition like '%community%'
     or constraint_definition not like '%anki-apkg%'
     or constraint_definition not like '%manual%' then
    raise exception 'Karten-Quellen-Constraint ist nicht auf Core verengt: %', constraint_definition;
  end if;

  if exists (select 1 from storage.buckets where id = 'core-imports') then
    raise exception 'Ausgemusterter Bucket core-imports ist noch vorhanden.';
  end if;
  if not exists (
    select 1 from storage.buckets
    where id = 'core-media' and name = 'core-media' and public = false and file_size_limit = 524288000
  ) then
    raise exception 'Privater Core-Medien-Bucket fehlt oder ist falsch konfiguriert.';
  end if;
end
$$;
