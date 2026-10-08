do $$
declare
  missing_tables text[];
  missing_required_columns text[];
  present_retired_tables text[];
  present_retired_columns text[];
  missing_policies text[];
  missing_statement_triggers text[];
  table_name text;
  constraint_definition text;
begin
  select array_agg(expected.name order by expected.name)
  into missing_tables
  from (values
    ('profiles'), ('decks'), ('note_type_sources'), ('notes'), ('note_sources'), ('cards'),
    ('card_variants'), ('review_events'), ('review_statistics_daily'), ('media_files'), ('note_media'),
    ('sync_devices'), ('sync_conflicts'), ('card_catalog'), ('deck_study_summaries')
  ) as expected(name)
  where to_regclass(format('public.%I', expected.name)) is null;
  if missing_tables is not null then
    raise exception 'Core-Tabellen fehlen: %', missing_tables;
  end if;

  select array_agg(format('%s.%s', expected.table_name, expected.column_name) order by expected.table_name, expected.column_name)
  into missing_required_columns
  from (values
    ('profiles', 'ui_preferences'),
    ('decks', 'anki_deck_id'),
    ('decks', 'sync_change_id'),
    ('notes', 'content'),
    ('notes', 'media'),
    ('notes', 'search_text'),
    ('notes', 'sort_text'),
    ('notes', 'anki_guid'),
    ('notes', 'translator_version'),
    ('notes', 'content_revision'),
    ('notes', 'imported_content_revision'),
    ('notes', 'marked'),
    ('note_sources', 'fields'),
    ('note_type_sources', 'definition'),
    ('cards', 'note_id'),
    ('cards', 'prompt_key'),
    ('cards', 'anki_card_id'),
    ('cards', 'state'),
    ('cards', 'due_at'),
    ('cards', 'stability'),
    ('cards', 'difficulty'),
    ('cards', 'study_extra'),
    ('cards', 'study_revision'),
    ('card_variants', 'performance'),
    ('review_events', 'card_id'),
    ('review_events', 'statistics_day'),
    ('review_events', 'retention_first'),
    ('media_files', 'storage_path'),
    ('card_catalog', 'note_id'),
    ('card_catalog', 'marked'),
    ('card_catalog', 'body_revision'),
    ('card_catalog', 'study_revision'),
    ('card_catalog', 'dependency_revision'),
    ('card_catalog', 'sync_change_id'),
    ('deck_study_summaries', 'sync_change_id')
  ) as expected(table_name, column_name)
  left join information_schema.columns columns
    on columns.table_schema = 'public'
   and columns.table_name = expected.table_name
   and columns.column_name = expected.column_name
  where columns.column_name is null;
  if missing_required_columns is not null then
    raise exception 'Erforderliche Spalten fehlen: %', missing_required_columns;
  end if;

  select array_agg(retired.name order by retired.name)
  into present_retired_tables
  from (values
    ('note_type_definitions'), ('media_assets'), ('ai_jobs'), ('apkg_import_jobs'), ('core_portable_exports'),
    ('admin_audit_events'), ('learning_item_source_snapshots'), ('source_documents')
  ) as retired(name)
  where to_regclass(format('public.%I', retired.name)) is not null;
  if present_retired_tables is not null then
    raise exception 'Ausgemusterte Tabellen sind noch vorhanden: %', present_retired_tables;
  end if;

  select array_agg(format('%s.%s', retired.table_name, retired.column_name) order by retired.table_name, retired.column_name)
  into present_retired_columns
  from (values
    ('cards', 'review_state'),
    ('cards', 'content_document'),
    ('cards', 'original_front'),
    ('cards', 'original_back'),
    ('cards', 'original_html'),
    ('cards', 'kind'),
    ('cards', 'note_type_definition_id'),
    ('card_catalog', 'normalized_search_text'),
    ('deck_study_summaries', 'due_count')
  ) as retired(table_name, column_name)
  join information_schema.columns columns
    on columns.table_schema = 'public'
   and columns.table_name = retired.table_name
   and columns.column_name = retired.column_name;
  if present_retired_columns is not null then
    raise exception 'Ausgemusterte Spalten sind noch vorhanden: %', present_retired_columns;
  end if;

  foreach table_name in array array[
    'profiles', 'decks', 'note_type_sources', 'notes', 'note_sources', 'cards', 'card_variants', 'review_events',
    'review_statistics_daily', 'media_files', 'note_media', 'sync_devices', 'sync_conflicts', 'card_catalog', 'deck_study_summaries'
  ]
  loop
    if not exists (
      select 1 from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relname = table_name and c.relrowsecurity
    ) then
      raise exception 'RLS fehlt für public.%', table_name;
    end if;
  end loop;

  foreach table_name in array array['review_statistics_daily', 'note_media', 'card_catalog', 'deck_study_summaries']
  loop
    if not exists (
      select 1 from pg_policies
      where schemaname = 'public' and tablename = table_name
        and roles = array['authenticated']::name[] and cmd = 'SELECT' and qual like '%auth.uid()%'
    ) then
      raise exception 'Owner-Select-Policy fehlt für public.%', table_name;
    end if;
    if not has_table_privilege('authenticated', format('public.%I', table_name), 'SELECT')
       or has_table_privilege('authenticated', format('public.%I', table_name), 'INSERT')
       or has_table_privilege('authenticated', format('public.%I', table_name), 'UPDATE')
       or has_table_privilege('authenticated', format('public.%I', table_name), 'DELETE')
       or has_table_privilege('anon', format('public.%I', table_name), 'SELECT') then
      raise exception 'Projektions-Tabellenrechte sind falsch für public.%', table_name;
    end if;
  end loop;

  select array_agg(table_names.name order by table_names.name)
  into missing_policies
  from unnest(array[
    'decks', 'note_type_sources', 'notes', 'note_sources', 'cards', 'card_variants', 'review_events',
    'media_files', 'sync_devices', 'sync_conflicts'
  ]) as table_names(name)
  where not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = table_names.name
      and roles = array['authenticated']::name[] and cmd = 'ALL'
      and qual like '%auth.uid()%' and with_check like '%auth.uid()%'
  )
  or not has_table_privilege('authenticated', format('public.%I', table_names.name), 'SELECT')
  or not has_table_privilege('authenticated', format('public.%I', table_names.name), 'INSERT')
  or not has_table_privilege('authenticated', format('public.%I', table_names.name), 'UPDATE')
  or not has_table_privilege('authenticated', format('public.%I', table_names.name), 'DELETE')
  or has_table_privilege('anon', format('public.%I', table_names.name), 'SELECT');
  if missing_policies is not null then
    raise exception 'Owner-Policy oder Tabellenrechte fehlen für: %', missing_policies;
  end if;

  select pg_get_constraintdef(oid) into constraint_definition
  from pg_constraint where conrelid = 'public.decks'::regclass and conname = 'decks_source_check';
  if constraint_definition is null or constraint_definition not like '%anki-apkg%' or constraint_definition not like '%manual%'
     or constraint_definition like '%text-import%' then
    raise exception 'Deck-Quellen-Constraint ist nicht auf Core verengt: %', constraint_definition;
  end if;

  if not exists (
    select 1 from pg_indexes
    where schemaname = 'public' and indexname = 'cards_note_prompt_key_idx'
      and indexdef like '%UNIQUE%' and indexdef like '%(user_id, note_id, prompt_key)%' and indexdef like '%deleted_at IS NULL%'
  ) then
    raise exception 'Eindeutiger Abfrageschlüssel je Inhalt fehlt.';
  end if;
  if not exists (
    select 1 from pg_indexes
    where schemaname = 'public' and indexname = 'cards_active_deck_due_idx'
      and indexdef like '%(user_id, deck_id, state, due_at)%' and indexdef like '%status = ''active''%'
  ) then
    raise exception 'Fälligkeitsindex der Karten ist falsch definiert.';
  end if;
  if not exists (
    select 1 from pg_indexes
    where schemaname = 'public' and indexname = 'notes_search_text_trgm_idx' and indexdef like '%gin_trgm_ops%'
  ) then
    raise exception 'Trigramm-Index der Inhaltssuche fehlt.';
  end if;
  if not exists (
    select 1 from pg_indexes
    where schemaname = 'public' and indexname = 'review_events_user_card_answered_idx'
      and indexdef like '%(user_id, card_id, answered_at, id)%'
  ) then
    raise exception 'Index für neuere Reviewereignisse je Karte fehlt.';
  end if;
  if exists (
    select 1
    from unnest(array[
      'decks_user_sync_change_id_idx', 'card_catalog_user_sync_change_id_idx', 'card_catalog_active_deck_sort_idx',
      'card_catalog_active_deck_due_idx', 'deck_study_summaries_user_sync_change_id_idx', 'note_media_user_sha1_idx',
      'review_events_user_answered_idx', 'cards_user_note_idx'
    ]) as expected(index_name)
    where not exists (select 1 from pg_indexes where schemaname = 'public' and indexname = expected.index_name)
  ) then
    raise exception 'Sync-, Katalog- oder Verknüpfungsindizes sind unvollständig.';
  end if;

  select array_agg(expected.name order by expected.name)
  into missing_statement_triggers
  from unnest(array[
    'cards_catalog_after_insert', 'cards_catalog_after_update', 'card_variants_catalog_after_insert',
    'card_variants_catalog_after_update', 'card_variants_catalog_after_delete', 'notes_catalog_after_update',
    'card_catalog_summary_after_insert', 'card_catalog_summary_after_update', 'card_catalog_summary_after_delete',
    'notes_media_after_insert', 'notes_media_after_update', 'review_events_statistics_after_insert',
    'review_events_statistics_after_update', 'review_events_statistics_after_delete'
  ]) as expected(name)
  where not exists (
    select 1 from pg_trigger trigger_row
    where trigger_row.tgname = expected.name and not trigger_row.tgisinternal
      and (trigger_row.tgtype & 1) = 0
  );
  if missing_statement_triggers is not null then
    raise exception 'Mengenbasierte Projektions-Trigger fehlen: %', missing_statement_triggers;
  end if;
  if not exists (
    select 1 from pg_trigger
    where tgrelid = 'public.decks'::regclass and tgname = 'decks_stamp_account_sync_change' and not tgisinternal
  ) then
    raise exception 'Delta-Sync-Stempel der Stapel fehlt.';
  end if;

  if to_regprocedure('public.record_review_atomic(text,jsonb,timestamp with time zone,text,jsonb,timestamp with time zone,jsonb,text)') is null
     or to_regprocedure('public.get_account_bootstrap(text,integer,integer)') is null
     or to_regprocedure('public.get_account_due_forecast()') is null
     or to_regprocedure('public.pull_account_catalog_delta(bigint,integer,integer)') is null
     or to_regprocedure('public.list_account_card_catalog(text,text,text,text,jsonb,integer,boolean)') is null
     or to_regprocedure('public.hydrate_account_cards(text[],text[])') is null
     or to_regprocedure('public.get_deck_offline_manifest(text,text,integer,boolean)') is null
     or to_regprocedure('public.get_account_statistics(text[],timestamp with time zone,timestamp with time zone,text,integer)') is null
     or to_regprocedure('public.delete_account_deck_tree(text,timestamp with time zone,text)') is null
     or to_regprocedure('public.list_retranslation_candidates(jsonb,text,integer)') is null
     or to_regprocedure('public.list_releasable_media(integer)') is null
     or to_regprocedure('public.load_reimport_targets(text[])') is null then
    raise exception 'Mindestens ein RPC-Vertrag des Kartenmodells fehlt.';
  end if;
  if to_regprocedure('public.get_account_bootstrap_v2(text,integer,integer)') is not null
     or to_regprocedure('public.hydrate_account_cards(text[])') is not null then
    raise exception 'Ausgemusterte Replica-v2-RPCs sind noch vorhanden.';
  end if;
  if exists (
    select 1
    from unnest(array[
      'public.record_review_atomic(text,jsonb,timestamp with time zone,text,jsonb,timestamp with time zone,jsonb,text)',
      'public.get_account_bootstrap(text,integer,integer)',
      'public.get_account_due_forecast()',
      'public.pull_account_catalog_delta(bigint,integer,integer)',
      'public.list_account_card_catalog(text,text,text,text,jsonb,integer,boolean)',
      'public.hydrate_account_cards(text[],text[])',
      'public.get_deck_offline_manifest(text,text,integer,boolean)',
      'public.get_account_statistics(text[],timestamp with time zone,timestamp with time zone,text,integer)',
      'public.delete_account_deck_tree(text,timestamp with time zone,text)',
      'public.list_retranslation_candidates(jsonb,text,integer)',
      'public.list_releasable_media(integer)',
      'public.load_reimport_targets(text[])'
    ]) as signatures(signature)
    where not has_function_privilege('authenticated', signatures.signature, 'EXECUTE')
       or has_function_privilege('anon', signatures.signature, 'EXECUTE')
  ) then
    raise exception 'RPC-Berechtigungen sind falsch konfiguriert.';
  end if;
  if exists (
    select 1
    from pg_proc procedure_row
    join pg_namespace namespace_row on namespace_row.oid = procedure_row.pronamespace
    where namespace_row.nspname = 'public'
      and procedure_row.proname in (
        'record_review_atomic', 'get_account_bootstrap', 'get_account_due_forecast', 'pull_account_catalog_delta',
        'list_account_card_catalog', 'hydrate_account_cards', 'get_deck_offline_manifest', 'get_account_statistics',
        'delete_account_deck_tree', 'list_retranslation_candidates', 'list_releasable_media', 'load_reimport_targets'
      )
      and procedure_row.prosecdef
  ) then
    raise exception 'Mindestens eine öffentliche RPC ist unerwartet SECURITY DEFINER.';
  end if;
  if exists (
    select 1
    from pg_proc procedure_row
    join pg_namespace namespace_row on namespace_row.oid = procedure_row.pronamespace
    where (namespace_row.nspname = 'private' or (namespace_row.nspname = 'public' and procedure_row.proname in (
        'record_review_atomic', 'get_account_bootstrap', 'get_account_due_forecast', 'pull_account_catalog_delta',
        'list_account_card_catalog', 'hydrate_account_cards', 'get_deck_offline_manifest', 'get_account_statistics',
        'delete_account_deck_tree', 'list_retranslation_candidates', 'list_releasable_media', 'load_reimport_targets'
      )))
      and not coalesce(procedure_row.proconfig, '{}'::text[]) @> array['search_path=""']::text[]
  ) then
    raise exception 'Mindestens eine Kartenmodell-Funktion besitzt keinen leeren search_path.';
  end if;
  if exists (
    select 1
    from pg_proc procedure_row
    join pg_namespace namespace_row on namespace_row.oid = procedure_row.pronamespace
    where namespace_row.nspname = 'private'
      and (has_function_privilege('authenticated', procedure_row.oid, 'EXECUTE')
        or has_function_privilege('anon', procedure_row.oid, 'EXECUTE'))
  ) then
    raise exception 'Mindestens eine private Funktion ist direkt aufrufbar.';
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
