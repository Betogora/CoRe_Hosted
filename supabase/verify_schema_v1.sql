select
  table_name,
  row_security
from information_schema.tables t
join pg_tables p
  on p.schemaname = t.table_schema
  and p.tablename = t.table_name
where t.table_schema = 'public'
  and t.table_name in (
    'profiles',
    'core_portable_exports',
    'decks',
    'cards',
    'card_variants',
    'review_events',
    'source_documents',
    'ai_jobs'
  )
order by table_name;

select
  schemaname,
  tablename,
  policyname,
  roles,
  cmd
from pg_policies
where schemaname = 'public'
  and tablename in (
    'profiles',
    'core_portable_exports',
    'decks',
    'cards',
    'card_variants',
    'review_events',
    'source_documents',
    'ai_jobs'
  )
order by tablename, policyname;
