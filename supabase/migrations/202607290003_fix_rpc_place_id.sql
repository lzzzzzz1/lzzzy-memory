-- Hotfix: qualify place_id references that conflict with the function's return column.
-- Run after 202607290002_visits_multimedia.sql.

create or replace function public.create_visit_memory(
  p_memory_id uuid,
  p_couple_id uuid,
  p_trip_id uuid,
  p_place_id uuid,
  p_country text,
  p_city text,
  p_latitude double precision,
  p_longitude double precision,
  p_title text,
  p_body text,
  p_occurred_on date,
  p_media jsonb
)
returns table (memory_id uuid, visit_id uuid, place_id uuid)
language plpgsql
security invoker
set search_path = public
as $$
declare
  resolved_place_id uuid;
  created_visit_id uuid;
  next_position integer;
begin
  if auth.uid() is null or not public.in_my_couple(p_couple_id) then
    raise exception 'NOT_AUTHORIZED' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.trips as target_trip
    where target_trip.id = p_trip_id
      and target_trip.couple_id = p_couple_id
  ) then
    raise exception 'TRIP_NOT_FOUND' using errcode = 'P0001';
  end if;

  if nullif(trim(p_title), '') is null then
    raise exception 'TITLE_REQUIRED' using errcode = 'P0001';
  end if;

  if jsonb_typeof(coalesce(p_media, '[]'::jsonb)) <> 'array' then
    raise exception 'INVALID_MEDIA_PAYLOAD' using errcode = 'P0001';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_trip_id::text, 0));

  if p_place_id is not null then
    select target_place.id
    into resolved_place_id
    from public.places as target_place
    where target_place.id = p_place_id
      and target_place.couple_id = p_couple_id;
  end if;

  if resolved_place_id is null then
    select target_place.id
    into resolved_place_id
    from public.places as target_place
    where target_place.couple_id = p_couple_id
      and lower(trim(target_place.country)) = lower(trim(p_country))
      and lower(trim(target_place.city)) = lower(trim(p_city))
    order by target_place.created_at
    limit 1;
  end if;

  if resolved_place_id is null then
    insert into public.places as inserted_place (
      couple_id, name, city, country, latitude, longitude, created_by, updated_by
    ) values (
      p_couple_id, trim(p_city), trim(p_city), trim(p_country),
      p_latitude, p_longitude, auth.uid(), auth.uid()
    )
    returning inserted_place.id into resolved_place_id;
  end if;

  if not exists (
    select 1
    from public.trip_places as target_link
    where target_link.trip_id = p_trip_id
      and target_link.place_id = resolved_place_id
  ) then
    select coalesce(max(target_link.position), 0) + 1
    into next_position
    from public.trip_places as target_link
    where target_link.trip_id = p_trip_id;

    insert into public.trip_places (trip_id, place_id, position)
    values (p_trip_id, resolved_place_id, next_position);
  end if;

  insert into public.visits as inserted_visit (
    couple_id, trip_id, place_id, title, visited_on, created_by, updated_by
  ) values (
    p_couple_id, p_trip_id, resolved_place_id, trim(p_title),
    p_occurred_on, auth.uid(), auth.uid()
  )
  returning inserted_visit.id into created_visit_id;

  insert into public.memories (
    id, couple_id, trip_id, place_id, visit_id, title, body, occurred_on,
    created_by, updated_by
  ) values (
    p_memory_id, p_couple_id, p_trip_id, resolved_place_id, created_visit_id,
    trim(p_title), coalesce(p_body, ''), p_occurred_on, auth.uid(), auth.uid()
  );

  insert into public.media (
    id, couple_id, memory_id, object_key, mime_type, size_bytes, position, created_by
  )
  select
    media_item.id,
    p_couple_id,
    p_memory_id,
    media_item.object_key,
    media_item.mime_type,
    media_item.size_bytes,
    media_item.position,
    auth.uid()
  from jsonb_to_recordset(coalesce(p_media, '[]'::jsonb)) as media_item(
    id uuid,
    object_key text,
    mime_type text,
    size_bytes bigint,
    position integer
  );

  return query
  select p_memory_id, created_visit_id, resolved_place_id;
end
$$;
