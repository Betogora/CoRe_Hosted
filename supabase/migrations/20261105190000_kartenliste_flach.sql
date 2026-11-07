begin;

-- Kartenverwaltung 2.0, KV3: Die flache Trefferliste läuft über alle Stapel des Suchbereichs. Ohne `p_deck_id` liest
-- `list_account_card_catalog` stapelübergreifend; der Client schränkt den Bereich mit einem `deck`-Begriff ein. Nur
-- ein noch unvollständiger lokaler Katalog fragt so, ein vollständiger sucht lokal (ADR-048).
--
-- `p_offset` öffnet eine Seite ohne Cursor direkt, damit die durchgehende Liste nach einem Sprung nicht hunderte Seiten
-- nacheinander lädt. Der Index über `note_id` hält die Volltextsuche über alle Stapel schnell: Ohne ihn schätzt der
-- Planer `search_text like` auf wenige Treffer und vergleicht jede Katalogzeile mit jedem Inhalt (50.000 Karten:
-- über 60 s statt 0,6 s).

create index if not exists card_catalog_active_note_idx on public.card_catalog (user_id, note_id) where deleted_at is null;

drop function public.list_account_card_catalog(text, text, text, text, jsonb, integer, boolean, jsonb);
create function public.list_account_card_catalog(
  p_deck_id text,
  p_query text default '',
  p_sort_field text default 'sortField',
  p_sort_direction text default 'asc',
  p_cursor jsonb default null,
  p_limit integer default 50,
  p_include_total boolean default false,
  p_terms jsonb default '[]'::jsonb,
  p_offset integer default 0
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  query_text text := lower(trim(coalesce(p_query, '')));
  query_pattern text;
  page_limit integer := least(greatest(p_limit, 1), 50);
  sort_expression text;
  cursor_expression text;
  cursor_output_expression text;
  sort_direction text;
  cursor_operator text;
  search_condition text := '';
  terms jsonb := coalesce(p_terms, '[]'::jsonb);
  total_count bigint := null;
  response jsonb;
begin
  if current_user_id is null then
    raise exception 'Anmeldung erforderlich.' using errcode = '42501';
  end if;

  case p_sort_field
    when 'sortField' then
      sort_expression := 'catalog_row.sort_text';
      cursor_expression := 'coalesce($4->>''sortValue'', '''')';
      cursor_output_expression := 'catalog_row.sort_text';
    when 'nextStudyDate' then
      sort_expression := 'coalesce(catalog_row.due_at, ''infinity''::timestamptz)';
      cursor_expression := 'coalesce(nullif($4->>''sortValue'', '''')::timestamptz, ''infinity''::timestamptz)';
      cursor_output_expression := 'case when catalog_row.due_at is null then ''infinity'' else pg_catalog.to_char(catalog_row.due_at at time zone ''UTC'', ''YYYY-MM-DD"T"HH24:MI:SS.US'') || ''Z'' end';
    when 'variants' then
      sort_expression := 'catalog_row.has_active_variants';
      cursor_expression := 'coalesce(($4->>''sortValue'')::boolean, false)';
      cursor_output_expression := 'catalog_row.has_active_variants::text';
    else
      raise exception 'Unbekannte Katalogsortierung.' using errcode = '22023';
  end case;

  if p_sort_direction = 'desc' then
    sort_direction := 'desc';
    cursor_operator := '<';
  elsif p_sort_direction = 'asc' then
    sort_direction := 'asc';
    cursor_operator := '>';
  else
    raise exception 'Unbekannte Sortierrichtung.' using errcode = '22023';
  end if;

  if query_text <> '' then
    query_pattern := '%' || pg_catalog.replace(pg_catalog.replace(pg_catalog.replace(query_text, '\', '\\'), '%', '\%'), '_', '\_') || '%';
    search_condition := 'and catalog_row.note_id in (select note_row.id from public.notes as note_row where note_row.user_id = $1 and note_row.search_text like $3)';
  end if;
  if pg_catalog.jsonb_array_length(terms) > 0 then
    search_condition := search_condition || $terms$
        and (
          select coalesce(pg_catalog.bool_and(
            case term->>'kind'
              when 'flag' then catalog_row.anki_flag = (term->>'value')::smallint
              when 'tag' then catalog_row.tag_keys @> array[term->>'value']
              when 'tag-none' then pg_catalog.cardinality(catalog_row.tag_keys) = 0
              when 'leech' then catalog_row.leeched
              when 'marked' then catalog_row.marked
              when 'suspended' then not catalog_row.reviewable
              when 'state' then case term->>'value'
                when 'learn' then catalog_row.schedule_state in ('learning', 'relearning')
                else catalog_row.schedule_state = term->>'value'
              end
              when 'maturity' then catalog_row.maturity_band = term->>'value'
              when 'variant' then catalog_row.has_active_variants
              when 'deck' then catalog_row.deck_id in (select pg_catalog.jsonb_array_elements_text(term->'ids'))
              when 'due' then catalog_row.schedule_state <> 'new' and catalog_row.due_at is not null
                and (not coalesce((term->>'reviewableOnly')::boolean, false) or catalog_row.reviewable)
                and (term->>'from' is null or catalog_row.due_at >= (term->>'from')::timestamptz)
                and (term->>'to' is null or catalog_row.due_at < (term->>'to')::timestamptz)
              when 'since' then coalesce(case term->>'field'
                  when 'added' then catalog_row.created_at
                  when 'edited' then catalog_row.edited_at
                  when 'introduced' then catalog_row.first_reviewed_at
                when 'rescheduled' then catalog_row.last_rescheduled_at
                  when 'rated' then case term->>'rating'
                    when 'again' then catalog_row.last_again_at
                    when 'hard' then catalog_row.last_hard_at
                    when 'good' then catalog_row.last_good_at
                    when 'easy' then catalog_row.last_easy_at
                    else greatest(catalog_row.last_again_at, catalog_row.last_hard_at, catalog_row.last_good_at, catalog_row.last_easy_at)
                  end
                end >= (term->>'from')::timestamptz, false)
              when 'prop' then coalesce((
                  select case term->>'operator'
                    when '<' then compared.value < compared.target
                    when '<=' then compared.value <= compared.target
                    when '=' then compared.value = compared.target
                    when '!=' then compared.value <> compared.target
                    when '>=' then compared.value >= compared.target
                    when '>' then compared.value > compared.target
                  end
                  from (select case term->>'field'
                      when 'ivl' then case when catalog_row.schedule_state <> 'new' then catalog_row.interval_days end
                      when 'd' then case when catalog_row.schedule_state <> 'new' then catalog_row.difficulty end
                      when 'reps' then catalog_row.reps::double precision
                      when 'lapses' then catalog_row.lapses::double precision
                    end as value, (term->>'value')::double precision as target) as compared
                ), false)
              when 'form' then catalog_row.content_kind = term->>'value'
              when 'outdated' then catalog_row.has_outdated_variants
              when 'card' then coalesce(catalog_row.prompt_ordinal = (term->>'value')::integer, false)
              when 'buried' then coalesce(catalog_row.last_buried_at >= (term->>'from')::timestamptz
                and (catalog_row.last_unburied_at is null or catalog_row.last_unburied_at < catalog_row.last_buried_at), false)
              when 'notetype' then coalesce(catalog_row.note_type_id in (select pg_catalog.jsonb_array_elements_text(term->'ids')), false)
              when 'field' then exists (
                select 1
                from public.note_search as field_search,
                  pg_catalog.jsonb_array_elements(field_search.search_fields) as field_entry
                where field_search.user_id = catalog_row.user_id
                  and field_search.note_id = catalog_row.note_id
                  and field_entry->>'n' = term->>'name'
                  and pg_catalog.strpos(field_entry->>'t', term->>'value') > 0
              )
              else false
            end is distinct from coalesce((term->>'negated')::boolean, false)
          ), true)
          from pg_catalog.jsonb_array_elements($7) as term
        )$terms$;
  end if;

  if p_include_total then
    execute pg_catalog.format($count$
      select count(*) from public.card_catalog as catalog_row
      where catalog_row.user_id = $1 and ($2 is null or catalog_row.deck_id = $2) and catalog_row.deleted_at is null %s
    $count$, search_condition)
    into total_count
    using current_user_id, p_deck_id, query_pattern, null::jsonb, null::integer, null::bigint, terms;
  end if;

  execute pg_catalog.format($query$
    with page_candidates as materialized (
      select catalog_row.*, %3$s as sort_value
      from public.card_catalog as catalog_row
      where catalog_row.user_id = $1
        and ($2 is null or catalog_row.deck_id = $2)
        and catalog_row.deleted_at is null
        %6$s
        and ($4 is null or (%1$s, catalog_row.id) %2$s (%4$s, coalesce($4->>'id', '')))
      order by %1$s %5$s, catalog_row.id %5$s
      limit $5 + 1
      offset case when $4 is null then $8 else 0 end
    ), page as materialized (
      select page_candidates.*,
        pg_catalog.row_number() over (order by sort_value %5$s, id %5$s) as page_position
      from page_candidates
      order by sort_value %5$s, id %5$s
      limit $5
    )
    select pg_catalog.jsonb_build_object(
      'items', coalesce((
        select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(page) - 'sort_value' - 'page_position' order by page_position)
        from page
      ), '[]'::jsonb),
      'totalCount', $6,
      'hasMore', (select count(*) from page_candidates) > (select count(*) from page),
      'nextCursor', (
        select pg_catalog.jsonb_build_object('sortValue', sort_value, 'id', id)
        from page order by page_position desc limit 1
      )
    )
  $query$, sort_expression, cursor_operator, cursor_output_expression, cursor_expression, sort_direction, search_condition)
  into response
  using current_user_id, p_deck_id, query_pattern, p_cursor, page_limit, total_count, terms, greatest(coalesce(p_offset, 0), 0);

  return response;
end
$$;

revoke all on function public.list_account_card_catalog(text, text, text, text, jsonb, integer, boolean, jsonb, integer) from public, anon;
grant execute on function public.list_account_card_catalog(text, text, text, text, jsonb, integer, boolean, jsonb, integer) to authenticated, service_role;

commit;
