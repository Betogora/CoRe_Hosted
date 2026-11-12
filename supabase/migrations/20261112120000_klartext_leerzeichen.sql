-- Einmalige Reparatur der Klartexte: Im Browser trennte die Klartextbildung Zeilenumbrüche und Blöcke nicht, sodass
-- Such-, Sortier- und Feldtexte Wörter zusammenzogen („Ösophagus?Th9–Th11“). Die Migration rechnet sie wie
-- `noteTextIndex` aus dem Inhalt neu. Jede Spalte übernimmt den neuen Text nur, wenn er sich vom gespeicherten
-- ausschließlich in Leerraum unterscheidet; sonst bleibt sie, bis der Inhalt erneut gespeichert wird. Revision und
-- Änderungszeit bleiben; Katalog und `note_search` folgen über ihre Trigger und erreichen so jedes Gerät.

-- Leerraum wie `\s` in JavaScript.
create function pg_temp.strip_spacing(value text, replacement text)
returns text
language sql
immutable
as $$
  select pg_catalog.regexp_replace(value, '[\s   -     　﻿]+', replacement, 'g')
$$;

-- `plainText` in `coreModel/notes.ts`: Lücken aufgelöst, Umbrüche und Blöcke als Leerzeichen, Tags entfernt.
create function pg_temp.note_plain_text(html text)
returns text
language plpgsql
immutable
as $$
declare
  result text := coalesce(html, '');
  previous text;
begin
  loop
    previous := result;
    result := pg_catalog.regexp_replace(result, '\{\{c\d+?(?:,\d+)*::((?:(?!\{\{c\d).)*?)(?:::[^{}]*?)?\}\}', '\1', 'gi');
    exit when result = previous;
  end loop;
  result := pg_catalog.regexp_replace(result, '<(?:br|hr|/?(?:blockquote|dd|div|dl|dt|figcaption|figure|h[1-6]|li|ol|p|pre|table|tbody|td|tfoot|th|thead|tr|ul))\y[^>]*>', ' ', 'gi');
  result := pg_catalog.regexp_replace(result, '<[^>]*>', '', 'g');
  result := pg_catalog.regexp_replace(result, '&nbsp;', ' ', 'gi');
  result := pg_catalog.replace(pg_catalog.replace(pg_catalog.replace(pg_catalog.replace(pg_catalog.replace(pg_catalog.replace(
    result, '&lt;', '<'), '&gt;', '>'), '&quot;', '"'), '&#39;', ''''), '&apos;', ''''), '&amp;', '&');
  return pg_catalog.btrim(pg_temp.strip_spacing(result, ' '));
end
$$;

-- Der neue Text unterscheidet sich vom alten nur in Leerraum; beide sind höchstens `max_length` Zeichen lang.
create function pg_temp.differs_only_in_spacing(old_text text, new_text text, max_length integer)
returns boolean
language sql
immutable
as $$
  select pg_catalog.starts_with(pg_temp.strip_spacing(old_text, ''), pg_temp.strip_spacing(new_text, ''))
    and (pg_temp.strip_spacing(old_text, '') = pg_temp.strip_spacing(new_text, '') or pg_catalog.char_length(new_text) >= max_length)
$$;

create function pg_temp.fields_differ_only_in_spacing(old_fields jsonb, new_fields jsonb)
returns boolean
language sql
immutable
as $$
  select pg_catalog.jsonb_array_length(old_fields) = pg_catalog.jsonb_array_length(new_fields)
    and coalesce(pg_catalog.bool_and(old_field.value->>'n' = new_field.value->>'n'
      and pg_temp.differs_only_in_spacing(old_field.value->>'t', new_field.value->>'t', 4000)), true)
  from pg_catalog.jsonb_array_elements(old_fields) with ordinality as old_field(value, position)
  join pg_catalog.jsonb_array_elements(new_fields) with ordinality as new_field(value, position) using (position)
$$;

with repaired as (
  select
    note_row.user_id,
    note_row.id,
    pg_catalog.left(coalesce(sort_source.text, ''), 240) as sort_text,
    pg_catalog.left(pg_catalog.lower(coalesce(search_source.text, '')), 4000) as search_text,
    field_source.search_fields
  from public.notes as note_row
  left join lateral (
    select pg_temp.note_plain_text(field.value->>'html') as text
    from pg_catalog.jsonb_array_elements(note_row.content->'fields') with ordinality as field(value, position)
    order by (field.value->>'role' = 'prompt') is true desc, field.position
    limit 1
  ) as sort_source on true
  left join lateral (
    select pg_catalog.string_agg(part.text, ' ' order by part.kind, part.position) as text
    from (
      select 1 as kind, field.position, pg_temp.note_plain_text(field.value->>'html') as text
      from pg_catalog.jsonb_array_elements(note_row.content->'fields') with ordinality as field(value, position)
      union all
      select 2, choice.position, pg_temp.note_plain_text(choice.value->>'html')
      from pg_catalog.jsonb_array_elements(
        case when note_row.content->'interaction'->>'kind' = 'choice' then note_row.content->'interaction'->'options' else '[]'::jsonb end
      ) with ordinality as choice(value, position)
      union all
      select 3, tag.position, tag.value
      from pg_catalog.jsonb_array_elements_text(note_row.content->'tags') with ordinality as tag(value, position)
    ) as part
    where part.text <> ''
  ) as search_source on true
  left join lateral (
    select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('n', named.key, 't', pg_catalog.left(pg_catalog.lower(named.text), 4000)) order by named.position), '[]'::jsonb) as search_fields
    from (
      select
        field.position,
        pg_catalog.lower(pg_temp.strip_spacing(pg_catalog.btrim(pg_temp.strip_spacing(field.value->>'name', ' ')), '_')) as key,
        pg_temp.note_plain_text(field.value->>'html') as text
      from pg_catalog.jsonb_array_elements(note_row.content->'fields') with ordinality as field(value, position)
    ) as named
    where named.key <> '' and named.text <> ''
  ) as field_source on true
  where note_row.deleted_at is null
),
accepted as (
  select
    note_row.user_id,
    note_row.id,
    note_row.revision,
    case when pg_temp.differs_only_in_spacing(note_row.sort_text, repaired.sort_text, 240) then repaired.sort_text else note_row.sort_text end as sort_text,
    case when pg_temp.differs_only_in_spacing(note_row.search_text, repaired.search_text, 4000) then repaired.search_text else note_row.search_text end as search_text,
    case when pg_temp.fields_differ_only_in_spacing(note_row.search_fields, repaired.search_fields) then repaired.search_fields else note_row.search_fields end as search_fields
  from public.notes as note_row
  join repaired on repaired.user_id = note_row.user_id and repaired.id = note_row.id
)
update public.notes as note_row
set sort_text = accepted.sort_text, search_text = accepted.search_text, search_fields = accepted.search_fields
from accepted
where note_row.user_id = accepted.user_id
  and note_row.id = accepted.id
  -- Ein währenddessen gespeicherter Inhalt bringt seinen neuen Text selbst mit.
  and note_row.revision = accepted.revision
  and (note_row.sort_text, note_row.search_text, note_row.search_fields)
    is distinct from (accepted.sort_text, accepted.search_text, accepted.search_fields);
