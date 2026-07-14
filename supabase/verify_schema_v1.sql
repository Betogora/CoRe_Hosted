with
core_tables(table_name) as (
  values
    ('profiles'),
    ('core_portable_exports'),
    ('decks'),
    ('cards'),
    ('card_variants'),
    ('review_events'),
    ('source_documents'),
    ('ai_jobs'),
    ('media_assets'),
    ('sync_devices'),
    ('sync_conflicts'),
    ('admin_audit_events')
),
authenticated_tables(table_name) as (
  values
    ('profiles'),
    ('core_portable_exports'),
    ('decks'),
    ('cards'),
    ('card_variants'),
    ('review_events'),
    ('source_documents'),
    ('media_assets'),
    ('sync_devices'),
    ('sync_conflicts')
),
privileges(privilege_name) as (
  values ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE')
),
required_columns(table_name, column_name) as (
  values
    ('decks', 'revision'),
    ('decks', 'deleted_at'),
    ('decks', 'updated_by_device_id'),
    ('cards', 'revision'),
    ('cards', 'deleted_at'),
    ('cards', 'updated_by_device_id'),
    ('card_variants', 'revision'),
    ('card_variants', 'deleted_at'),
    ('card_variants', 'updated_by_device_id'),
    ('review_events', 'created_by_device_id'),
    ('source_documents', 'updated_at'),
    ('source_documents', 'revision'),
    ('source_documents', 'deleted_at'),
    ('source_documents', 'updated_by_device_id'),
    ('ai_jobs', 'revision'),
    ('ai_jobs', 'deleted_at'),
    ('ai_jobs', 'updated_by_device_id'),
    ('ai_jobs', 'contract_version'),
    ('ai_jobs', 'prompt_version'),
    ('ai_jobs', 'schema_version'),
    ('ai_jobs', 'idempotency_key'),
    ('ai_jobs', 'request_fingerprint'),
    ('ai_jobs', 'attempt_count'),
    ('ai_jobs', 'max_attempts'),
    ('ai_jobs', 'retryable'),
    ('ai_jobs', 'next_retry_at'),
    ('ai_jobs', 'provider'),
    ('ai_jobs', 'model'),
    ('ai_jobs', 'error_class'),
    ('ai_jobs', 'error_code'),
    ('ai_jobs', 'input_tokens'),
    ('ai_jobs', 'output_tokens'),
    ('ai_jobs', 'total_tokens'),
    ('ai_jobs', 'pricing_version'),
    ('ai_jobs', 'cost_micros'),
    ('ai_jobs', 'cost_currency'),
    ('ai_jobs', 'updated_at')
),
expected_sync_device_columns(column_name, data_type, is_nullable, column_default) as (
  values
    ('id', 'text', 'NO', null::text),
    ('label', 'text', 'NO', '''Browser''::text'),
    ('last_seen_at', 'timestamp with time zone', 'NO', 'now()'),
    ('user_agent', 'text', 'NO', '''''::text'),
    ('created_at', 'timestamp with time zone', 'NO', 'now()')
),
expected_policies(
  schema_name,
  table_name,
  policy_name,
  policy_command,
  policy_roles,
  require_qual,
  require_check,
  scope_kind
) as (
  values
    ('public', 'profiles', 'profiles_select_own', 'SELECT', array['authenticated']::text[], true, false, 'profile-owner'),
    ('public', 'profiles', 'profiles_insert_own', 'INSERT', array['authenticated']::text[], false, true, 'profile-owner'),
    ('public', 'profiles', 'profiles_update_own', 'UPDATE', array['authenticated']::text[], true, true, 'profile-owner'),
    ('public', 'core_portable_exports', 'portable_exports_owner_all', 'ALL', array['authenticated']::text[], true, true, 'user-owner'),
    ('public', 'decks', 'decks_owner_all', 'ALL', array['authenticated']::text[], true, true, 'user-owner'),
    ('public', 'cards', 'cards_owner_all', 'ALL', array['authenticated']::text[], true, true, 'user-owner'),
    ('public', 'card_variants', 'card_variants_owner_all', 'ALL', array['authenticated']::text[], true, true, 'user-owner'),
    ('public', 'review_events', 'review_events_owner_all', 'ALL', array['authenticated']::text[], true, true, 'user-owner'),
    ('public', 'source_documents', 'source_documents_owner_all', 'ALL', array['authenticated']::text[], true, true, 'user-owner'),
    ('public', 'ai_jobs', 'ai_jobs_select_own', 'SELECT', array['authenticated']::text[], true, false, 'user-owner'),
    ('public', 'media_assets', 'media_assets_owner_all', 'ALL', array['authenticated']::text[], true, true, 'user-owner'),
    ('public', 'sync_devices', 'sync_devices_owner_all', 'ALL', array['authenticated']::text[], true, true, 'user-owner'),
    ('public', 'sync_conflicts', 'sync_conflicts_owner_all', 'ALL', array['authenticated']::text[], true, true, 'user-owner'),
    ('public', 'admin_audit_events', 'admin_audit_service_only', 'ALL', array['service_role']::text[], true, true, 'service-only'),
    ('storage', 'objects', 'core_media_select_own', 'SELECT', array['authenticated']::text[], true, false, 'storage-owner'),
    ('storage', 'objects', 'core_media_insert_own', 'INSERT', array['authenticated']::text[], false, true, 'storage-owner'),
    ('storage', 'objects', 'core_media_delete_own', 'DELETE', array['authenticated']::text[], true, false, 'storage-owner')
),
expected_primary_keys(table_name, column_names) as (
  values
    ('profiles', array['id']::text[]),
    ('core_portable_exports', array['id']::text[]),
    ('decks', array['user_id', 'id']::text[]),
    ('cards', array['user_id', 'id']::text[]),
    ('card_variants', array['user_id', 'id']::text[]),
    ('review_events', array['user_id', 'id']::text[]),
    ('source_documents', array['user_id', 'id']::text[]),
    ('ai_jobs', array['user_id', 'id']::text[]),
    ('media_assets', array['user_id', 'id']::text[]),
    ('sync_devices', array['user_id', 'id']::text[]),
    ('sync_conflicts', array['user_id', 'id']::text[]),
    ('admin_audit_events', array['id']::text[])
),
expected_foreign_keys(
  table_name,
  constraint_name,
  column_names,
  referenced_schema,
  referenced_table,
  referenced_columns
) as (
  values
    ('profiles', 'profiles_id_fkey', array['id']::text[], 'auth', 'users', array['id']::text[]),
    ('core_portable_exports', 'core_portable_exports_user_id_fkey', array['user_id']::text[], 'auth', 'users', array['id']::text[]),
    ('decks', 'decks_user_id_fkey', array['user_id']::text[], 'auth', 'users', array['id']::text[]),
    ('cards', 'cards_user_id_fkey', array['user_id']::text[], 'auth', 'users', array['id']::text[]),
    ('cards', 'cards_deck_owner_fk', array['deck_id', 'user_id']::text[], 'public', 'decks', array['id', 'user_id']::text[]),
    ('card_variants', 'card_variants_user_id_fkey', array['user_id']::text[], 'auth', 'users', array['id']::text[]),
    ('card_variants', 'card_variants_card_owner_fk', array['card_id', 'user_id']::text[], 'public', 'cards', array['id', 'user_id']::text[]),
    ('review_events', 'review_events_user_id_fkey', array['user_id']::text[], 'auth', 'users', array['id']::text[]),
    ('review_events', 'review_events_deck_owner_fk', array['deck_id', 'user_id']::text[], 'public', 'decks', array['id', 'user_id']::text[]),
    ('source_documents', 'source_documents_user_id_fkey', array['user_id']::text[], 'auth', 'users', array['id']::text[]),
    ('ai_jobs', 'ai_jobs_user_id_fkey', array['user_id']::text[], 'auth', 'users', array['id']::text[]),
    ('ai_jobs', 'ai_jobs_deck_owner_fk', array['deck_id', 'user_id']::text[], 'public', 'decks', array['id', 'user_id']::text[]),
    ('media_assets', 'media_assets_user_id_fkey', array['user_id']::text[], 'auth', 'users', array['id']::text[]),
    ('media_assets', 'media_assets_deck_owner_fk', array['deck_id', 'user_id']::text[], 'public', 'decks', array['id', 'user_id']::text[]),
    ('media_assets', 'media_assets_card_deck_owner_fk', array['card_id', 'deck_id', 'user_id']::text[], 'public', 'cards', array['id', 'deck_id', 'user_id']::text[]),
    ('sync_devices', 'sync_devices_user_id_fkey', array['user_id']::text[], 'auth', 'users', array['id']::text[]),
    ('sync_conflicts', 'sync_conflicts_user_id_fkey', array['user_id']::text[], 'auth', 'users', array['id']::text[]),
    ('admin_audit_events', 'admin_audit_events_actor_user_id_fkey', array['actor_user_id']::text[], 'auth', 'users', array['id']::text[]),
    ('admin_audit_events', 'admin_audit_events_target_user_id_fkey', array['target_user_id']::text[], 'auth', 'users', array['id']::text[])
),
checks(check_name, passed, details) as (
  select
    'table:' || c.table_name,
    to_regclass(format('public.%I', c.table_name)) is not null,
    jsonb_build_object('schema', 'public', 'table', c.table_name)
  from core_tables c

  union all

  select
    'column:' || c.table_name || '.' || c.column_name,
    exists (
      select 1
      from information_schema.columns ic
      where ic.table_schema = 'public'
        and ic.table_name = c.table_name
        and ic.column_name = c.column_name
    ),
    jsonb_build_object('schema', 'public', 'table', c.table_name, 'column', c.column_name)
  from required_columns c

  union all

  select
    'column-contract:sync_devices.' || e.column_name,
    exists (
      select 1
      from information_schema.columns ic
      where ic.table_schema = 'public'
        and ic.table_name = 'sync_devices'
        and ic.column_name = e.column_name
        and ic.data_type = e.data_type
        and ic.is_nullable = e.is_nullable
        and ic.column_default is not distinct from e.column_default
    ),
    jsonb_build_object(
      'schema', 'public',
      'table', 'sync_devices',
      'column', e.column_name,
      'data_type', e.data_type,
      'is_nullable', e.is_nullable,
      'column_default', e.column_default
    )
  from expected_sync_device_columns e

  union all

  select
    'rls:' || c.table_name,
    coalesce((
      select p.rowsecurity
      from pg_tables p
      where p.schemaname = 'public'
        and p.tablename = c.table_name
    ), false),
    jsonb_build_object('schema', 'public', 'table', c.table_name, 'expected', 'enabled')
  from core_tables c

  union all

  select
    'policy:' || e.schema_name || '.' || e.table_name || '.' || e.policy_name,
    exists (
      select 1
      from pg_policies p
      where p.schemaname = e.schema_name
        and p.tablename = e.table_name
        and p.policyname = e.policy_name
        and p.cmd = e.policy_command
        and p.roles::text[] = e.policy_roles
        and (not e.require_qual or p.qual is not null)
        and (not e.require_check or p.with_check is not null)
        and case e.scope_kind
          when 'user-owner' then
            (not e.require_qual or (position('auth.uid()' in coalesce(p.qual, '')) > 0 and position('user_id' in coalesce(p.qual, '')) > 0))
            and (not e.require_check or (position('auth.uid()' in coalesce(p.with_check, '')) > 0 and position('user_id' in coalesce(p.with_check, '')) > 0))
          when 'profile-owner' then
            (not e.require_qual or position('auth.uid()' in coalesce(p.qual, '')) > 0)
            and (not e.require_check or position('auth.uid()' in coalesce(p.with_check, '')) > 0)
          when 'storage-owner' then
            position('core-media' in coalesce(p.qual, p.with_check, '')) > 0
            and position('auth.uid()' in coalesce(p.qual, p.with_check, '')) > 0
            and position('foldername' in coalesce(p.qual, p.with_check, '')) > 0
          when 'service-only' then
            position('true' in coalesce(p.qual, '')) > 0
            and position('true' in coalesce(p.with_check, '')) > 0
          else false
        end
    ),
    jsonb_build_object(
      'schema', e.schema_name,
      'table', e.table_name,
      'policy', e.policy_name,
      'command', e.policy_command,
      'roles', e.policy_roles,
      'scope', e.scope_kind
    )
  from expected_policies e

  union all

  select
    'policy-set:public-core-tables',
    (
      select count(*)
      from pg_policies p
      where p.schemaname = 'public'
        and p.tablename in (select table_name from core_tables)
    ) = (
      select count(*)
      from expected_policies e
      where e.schema_name = 'public'
    ),
    jsonb_build_object('expected', (select count(*) from expected_policies where schema_name = 'public'))

  union all

  select
    'policy-set:storage-core-media',
    (
      select count(*)
      from pg_policies p
      where p.schemaname = 'storage'
        and p.tablename = 'objects'
        and p.policyname like 'core_media_%'
    ) = (
      select count(*)
      from expected_policies e
      where e.schema_name = 'storage'
    ),
    jsonb_build_object('expected', (select count(*) from expected_policies where schema_name = 'storage'))

  union all

  select
    'grant:authenticated:' || t.table_name || ':' || p.privilege_name,
    case
      when to_regclass(format('public.%I', t.table_name)) is null then false
      else has_table_privilege('authenticated', format('public.%I', t.table_name), p.privilege_name)
    end,
    jsonb_build_object('role', 'authenticated', 'table', t.table_name, 'privilege', p.privilege_name)
  from authenticated_tables t
  cross join privileges p

  union all

  select
    'grant:authenticated:ai_jobs:' || p.privilege_name,
    case
      when p.privilege_name = 'SELECT' then has_table_privilege('authenticated', 'public.ai_jobs', p.privilege_name)
      else not has_table_privilege('authenticated', 'public.ai_jobs', p.privilege_name)
    end,
    jsonb_build_object('role', 'authenticated', 'table', 'ai_jobs', 'privilege', p.privilege_name, 'expected', 'select-only')
  from privileges p

  union all

  select
    'index:ai_jobs_user_idempotency_v1_idx',
    to_regclass('public.ai_jobs_user_idempotency_v1_idx') is not null,
    jsonb_build_object('index', 'ai_jobs_user_idempotency_v1_idx')

  union all

  select
    'index:ai_jobs_user_created_at_idx',
    to_regclass('public.ai_jobs_user_created_at_idx') is not null,
    jsonb_build_object('index', 'ai_jobs_user_created_at_idx')

  union all

  select
    'grant:authenticated:admin_audit_events:' || p.privilege_name,
    case
      when to_regclass('public.admin_audit_events') is null then false
      else not has_table_privilege('authenticated', 'public.admin_audit_events', p.privilege_name)
    end,
    jsonb_build_object('role', 'authenticated', 'table', 'admin_audit_events', 'privilege', p.privilege_name, 'expected', 'absent')
  from privileges p

  union all

  select
    'grant:anon:' || t.table_name || ':' || p.privilege_name,
    case
      when to_regclass(format('public.%I', t.table_name)) is null then false
      else not has_table_privilege('anon', format('public.%I', t.table_name), p.privilege_name)
    end,
    jsonb_build_object('role', 'anon', 'table', t.table_name, 'privilege', p.privilege_name, 'expected', 'absent')
  from core_tables t
  cross join privileges p

  union all

  select
    'grant:service_role:' || t.table_name || ':' || p.privilege_name,
    case
      when to_regclass(format('public.%I', t.table_name)) is null then false
      else has_table_privilege('service_role', format('public.%I', t.table_name), p.privilege_name)
    end,
    jsonb_build_object('role', 'service_role', 'table', t.table_name, 'privilege', p.privilege_name)
  from core_tables t
  cross join privileges p

  union all

  select
    'grant:authenticated:public-schema-usage',
    has_schema_privilege('authenticated', 'public', 'USAGE'),
    jsonb_build_object('role', 'authenticated', 'schema', 'public', 'privilege', 'USAGE')

  union all

  select
    'grant:service_role:public-schema-usage',
    has_schema_privilege('service_role', 'public', 'USAGE'),
    jsonb_build_object('role', 'service_role', 'schema', 'public', 'privilege', 'USAGE')

  union all

  select
    'bucket:core-media',
    exists (
      select 1
      from storage.buckets b
      where b.id = 'core-media'
        and b.name = 'core-media'
        and b.public is false
        and b.file_size_limit = 524288000
        and b.allowed_mime_types is null
    ),
    jsonb_build_object('bucket', 'core-media', 'public', false, 'file_size_limit', 524288000)

  union all

  select
    'primary-key:' || e.table_name,
    coalesce((
      select array_agg(a.attname order by k.ordinality)::text[] = e.column_names
      from pg_constraint c
      cross join unnest(c.conkey) with ordinality as k(attnum, ordinality)
      join pg_attribute a
        on a.attrelid = c.conrelid
        and a.attnum = k.attnum
      where c.conrelid = to_regclass(format('public.%I', e.table_name))
        and c.contype = 'p'
    ), false),
    jsonb_build_object('table', e.table_name, 'columns', e.column_names)
  from expected_primary_keys e

  union all

  select
    'foreign-key:' || e.table_name || '.' || e.constraint_name,
    coalesce((
      select
        array_agg(source_attribute.attname order by source_key.ordinality)::text[] = e.column_names
        and referenced_namespace.nspname = e.referenced_schema
        and referenced_table.relname = e.referenced_table
        and array_agg(referenced_attribute.attname order by source_key.ordinality)::text[] = e.referenced_columns
      from pg_constraint c
      cross join unnest(c.conkey, c.confkey) with ordinality as source_key(source_attnum, referenced_attnum, ordinality)
      join pg_attribute source_attribute
        on source_attribute.attrelid = c.conrelid
        and source_attribute.attnum = source_key.source_attnum
      join pg_class referenced_table
        on referenced_table.oid = c.confrelid
      join pg_namespace referenced_namespace
        on referenced_namespace.oid = referenced_table.relnamespace
      join pg_attribute referenced_attribute
        on referenced_attribute.attrelid = c.confrelid
        and referenced_attribute.attnum = source_key.referenced_attnum
      where c.conrelid = to_regclass(format('public.%I', e.table_name))
        and c.conname = e.constraint_name
        and c.contype = 'f'
      group by referenced_namespace.nspname, referenced_table.relname
    ), false),
    jsonb_build_object(
      'table', e.table_name,
      'constraint', e.constraint_name,
      'columns', e.column_names,
      'referenced_schema', e.referenced_schema,
      'referenced_table', e.referenced_table,
      'referenced_columns', e.referenced_columns
    )
  from expected_foreign_keys e
),
summary as (
  select
    bool_and(c.passed) as all_passed,
    jsonb_agg(
      jsonb_build_object(
        'check', c.check_name,
        'passed', c.passed,
        'details', c.details
      )
      order by c.check_name
    ) as checks
  from checks c
)
select
  1 / (s.all_passed::integer) as assertion,
  s.all_passed,
  s.checks
from summary s;
