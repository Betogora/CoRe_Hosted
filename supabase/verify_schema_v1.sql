do $$
declare
  missing_tables text[];
  missing_required_columns text[];
  missing_dynamic_constraints text[];
  missing_sync_triggers text[];
  missing_data_api_grants text[];
  present_retired_tables text[];
  present_retired_columns text[];
  table_name text;
  constraint_definition text;
begin
  select array_agg(expected.name order by expected.name)
  into missing_tables
  from (values
    ('profiles'), ('decks'), ('note_type_definitions'), ('cards'), ('card_variants'),
    ('learning_item_source_snapshots'), ('review_events'), ('source_documents'),
    ('media_assets'), ('sync_devices'), ('sync_conflicts')
  ) as expected(name)
  where to_regclass(format('public.%I', expected.name)) is null;
  if missing_tables is not null then
    raise exception 'Core-Tabellen fehlen: %', missing_tables;
  end if;

  select array_agg(format('%s.%s', expected.table_name, expected.column_name) order by expected.table_name, expected.column_name)
  into missing_required_columns
  from (values
    ('profiles', 'ui_preferences'),
    ('cards', 'note_type_definition_id'),
    ('cards', 'content_document'),
    ('cards', 'latest_source_snapshot_id'),
    ('cards', 'content_revision'),
    ('card_variants', 'projection'),
    ('card_variants', 'scheduling_mode'),
    ('card_variants', 'study_deck_id'),
    ('card_variants', 'render_revision'),
    ('learning_item_source_snapshots', 'card_id'),
    ('learning_item_source_snapshots', 'schema_version'),
    ('learning_item_source_snapshots', 'source_kind'),
    ('learning_item_source_snapshots', 'import_fingerprint'),
    ('learning_item_source_snapshots', 'previous_snapshot_id'),
    ('learning_item_source_snapshots', 'note_type_definition_id'),
    ('learning_item_source_snapshots', 'source_payload'),
    ('learning_item_source_snapshots', 'created_at'),
    ('decks', 'sync_change_id'),
    ('note_type_definitions', 'sync_change_id'),
    ('cards', 'sync_change_id'),
    ('card_variants', 'sync_change_id'),
    ('learning_item_source_snapshots', 'sync_change_id'),
    ('review_events', 'sync_change_id'),
    ('source_documents', 'sync_change_id')
  ) as expected(table_name, column_name)
  left join information_schema.columns columns
    on columns.table_schema = 'public'
   and columns.table_name = expected.table_name
   and columns.column_name = expected.column_name
  where columns.column_name is null;
  if missing_required_columns is not null then
    raise exception 'Erforderliche Spalten fehlen: %', missing_required_columns;
  end if;

  select array_agg(expected.name order by expected.name)
  into missing_dynamic_constraints
  from (values
    ('cards_note_type_definition_owner_fk'),
    ('cards_latest_source_snapshot_owner_fk'),
    ('learning_item_source_snapshots_card_owner_fk'),
    ('learning_item_source_snapshots_note_type_owner_fk'),
    ('learning_item_source_snapshots_previous_owner_fk'),
    ('card_variants_study_deck_owner_fk'),
    ('card_variants_scheduling_mode_check'),
    ('card_variants_render_revision_check'),
    ('decks_sync_change_id_check'),
    ('note_type_definitions_sync_change_id_check'),
    ('cards_sync_change_id_check'),
    ('card_variants_sync_change_id_check'),
    ('learning_item_source_snapshots_sync_change_id_check'),
    ('review_events_sync_change_id_check'),
    ('source_documents_sync_change_id_check')
  ) as expected(name)
  left join pg_constraint constraint_row
    on constraint_row.conname = expected.name
   and constraint_row.connamespace = 'public'::regnamespace
  where constraint_row.oid is null;
  if missing_dynamic_constraints is not null then
    raise exception 'Dynamische Karten-Constraints fehlen: %', missing_dynamic_constraints;
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
    ('decks', 'visibility'),
    ('learning_item_source_snapshots', 'snapshot'),
    ('learning_item_source_snapshots', 'content_hash'),
    ('learning_item_source_snapshots', 'captured_at')
  ) as retired(table_name, column_name)
  join information_schema.columns columns
    on columns.table_schema = 'public'
   and columns.table_name = retired.table_name
   and columns.column_name = retired.column_name;
  if present_retired_columns is not null then
    raise exception 'Ausgemusterte Spalten sind noch vorhanden: %', present_retired_columns;
  end if;

  foreach table_name in array array['profiles', 'decks', 'note_type_definitions', 'cards', 'card_variants', 'learning_item_source_snapshots', 'review_events', 'source_documents', 'media_assets', 'sync_devices', 'sync_conflicts']
  loop
    if not exists (
      select 1 from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relname = table_name and c.relrowsecurity
    ) then
      raise exception 'RLS fehlt für public.%', table_name;
    end if;
  end loop;

  foreach table_name in array array['decks', 'note_type_definitions', 'cards', 'card_variants', 'learning_item_source_snapshots', 'review_events', 'source_documents', 'media_assets', 'sync_devices', 'sync_conflicts']
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

  select array_agg(format('%s:%s:%s', role_names.role_name, table_names.table_name, privilege_names.privilege) order by role_names.role_name, table_names.table_name, privilege_names.privilege)
  into missing_data_api_grants
  from unnest(array['authenticated', 'service_role']) as role_names(role_name)
  cross join unnest(array['note_type_definitions', 'learning_item_source_snapshots']) as table_names(table_name)
  cross join unnest(array['SELECT', 'INSERT', 'UPDATE', 'DELETE']) as privilege_names(privilege)
  where not has_table_privilege(role_names.role_name, format('public.%I', table_names.table_name), privilege_names.privilege);
  if missing_data_api_grants is not null then
    raise exception 'Explizite Data-API-Grants fehlen: %', missing_data_api_grants;
  end if;

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

  select pg_get_constraintdef(oid) into constraint_definition
  from pg_constraint
  where conrelid = 'public.cards'::regclass and conname = 'cards_kind_check';
  if constraint_definition is null
     or constraint_definition not like '%basic-with-images%'
     or constraint_definition not like '%multiple-choice%' then
    raise exception 'Kartenart-Constraint ist unvollständig: %', constraint_definition;
  end if;

  if to_regprocedure('public.record_review_atomic(text,integer,text,integer,jsonb,jsonb,timestamp with time zone,text,integer,jsonb,jsonb,timestamp with time zone,jsonb,text)') is null then
    raise exception 'Atomare Review-RPC fehlt.';
  end if;
  if not has_function_privilege('authenticated', 'public.record_review_atomic(text,integer,text,integer,jsonb,jsonb,timestamp with time zone,text,integer,jsonb,jsonb,timestamp with time zone,jsonb,text)', 'EXECUTE')
     or has_function_privilege('anon', 'public.record_review_atomic(text,integer,text,integer,jsonb,jsonb,timestamp with time zone,text,integer,jsonb,jsonb,timestamp with time zone,jsonb,text)', 'EXECUTE') then
    raise exception 'Review-RPC-Berechtigungen sind falsch konfiguriert.';
  end if;
  if to_regprocedure('public.stamp_account_sync_change()') is null
     or has_function_privilege('authenticated', 'public.stamp_account_sync_change()', 'EXECUTE')
     or has_function_privilege('anon', 'public.stamp_account_sync_change()', 'EXECUTE') then
    raise exception 'Serverseitiger Delta-Sync-Stempel fehlt oder ist direkt aufrufbar.';
  end if;
  select array_agg(expected.table_name order by expected.table_name)
  into missing_sync_triggers
  from unnest(array[
    'decks', 'note_type_definitions', 'cards', 'card_variants',
    'learning_item_source_snapshots', 'review_events', 'source_documents'
  ]) as expected(table_name)
  where not exists (
    select 1
    from pg_trigger trigger_row
    where trigger_row.tgrelid = format('public.%I', expected.table_name)::regclass
      and trigger_row.tgname = expected.table_name || '_stamp_account_sync_change'
      and not trigger_row.tgisinternal
  );
  if missing_sync_triggers is not null then
    raise exception 'Delta-Sync-Trigger fehlen: %', missing_sync_triggers;
  end if;
  if exists (
    select 1
    from unnest(array[
      'decks_user_updated_id_idx',
      'note_type_definitions_user_updated_id_idx',
      'cards_user_updated_id_idx',
      'card_variants_user_updated_id_idx',
      'source_documents_user_updated_id_idx',
      'review_events_user_answered_id_idx',
      'learning_item_source_snapshots_user_created_id_idx',
      'decks_user_sync_change_id_idx',
      'note_type_definitions_user_sync_change_id_idx',
      'cards_user_sync_change_id_idx',
      'card_variants_user_sync_change_id_idx',
      'learning_item_source_snapshots_user_sync_change_id_idx',
      'review_events_user_sync_change_id_idx',
      'source_documents_user_sync_change_id_idx'
    ]) as expected(index_name)
    where not exists (select 1 from pg_indexes where schemaname = 'public' and indexname = expected.index_name)
  ) then
    raise exception 'Delta-Sync-Indizes sind unvollständig.';
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
