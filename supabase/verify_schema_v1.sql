with core_tables(table_name) as (
  values
    ('profiles'),
    ('core_portable_exports'),
    ('decks'),
    ('cards'),
    ('card_variants'),
    ('review_events'),
    ('source_documents'),
    ('ai_jobs')
)
select
  'rls' as check_type,
  c.table_name,
  null::text as policyname,
  null::text as roles,
  case when p.rowsecurity then 'enabled' else 'disabled' end as status
from core_tables c
join information_schema.tables t
  on t.table_schema = 'public'
  and t.table_name = c.table_name
join pg_tables p
  on p.schemaname = t.table_schema
  and p.tablename = t.table_name
union all
select
  'policy' as check_type,
  c.table_name,
  pp.policyname,
  array_to_string(pp.roles, ',') as roles,
  pp.cmd as status
from core_tables c
join pg_policies pp
  on pp.schemaname = 'public'
  and pp.tablename = c.table_name
order by table_name, check_type, policyname nulls first;
