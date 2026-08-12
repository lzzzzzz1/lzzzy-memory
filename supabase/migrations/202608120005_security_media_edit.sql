-- Security hardening and atomic memory/media editing.
-- Run after 202607300004_towhere_fusion.sql.

create or replace function public.validate_atlas_relationships()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  related_couple uuid;
begin
  if tg_table_name = 'trip_places' then
    select t.couple_id into related_couple from public.trips t where t.id = new.trip_id;
    if related_couple is null or not exists (
      select 1 from public.places p where p.id = new.place_id and p.couple_id = related_couple
    ) then raise exception 'CROSS_COUPLE_RELATIONSHIP' using errcode = '23514'; end if;
  elsif tg_table_name = 'visits' then
    if not exists (select 1 from public.trips t where t.id = new.trip_id and t.couple_id = new.couple_id)
      or not exists (select 1 from public.places p where p.id = new.place_id and p.couple_id = new.couple_id)
    then raise exception 'CROSS_COUPLE_RELATIONSHIP' using errcode = '23514'; end if;
  elsif tg_table_name = 'memories' then
    if not exists (select 1 from public.trips t where t.id = new.trip_id and t.couple_id = new.couple_id)
      or (new.place_id is not null and not exists (select 1 from public.places p where p.id = new.place_id and p.couple_id = new.couple_id))
      or (new.visit_id is not null and not exists (
        select 1 from public.visits v
        where v.id = new.visit_id and v.couple_id = new.couple_id and v.trip_id = new.trip_id
          and (new.place_id is null or v.place_id = new.place_id)
      ))
    then raise exception 'CROSS_COUPLE_RELATIONSHIP' using errcode = '23514'; end if;
  elsif tg_table_name = 'media' and new.memory_id is not null then
    if not exists (select 1 from public.memories m where m.id = new.memory_id and m.couple_id = new.couple_id)
      or new.object_key not like 'couples/' || new.couple_id::text || '/media/%'
    then raise exception 'INVALID_MEDIA_RELATIONSHIP' using errcode = '23514'; end if;
  end if;
  return new;
end
$$;

create trigger trip_places_relationship_guard before insert or update on public.trip_places
for each row execute function public.validate_atlas_relationships();
create trigger visits_relationship_guard before insert or update on public.visits
for each row execute function public.validate_atlas_relationships();
create trigger memories_relationship_guard before insert or update on public.memories
for each row execute function public.validate_atlas_relationships();
create trigger media_relationship_guard before insert or update on public.media
for each row execute function public.validate_atlas_relationships();

create or replace function public.update_memory_with_media(
  p_memory_id uuid,
  p_couple_id uuid,
  p_expected_version integer,
  p_title text,
  p_body text,
  p_occurred_on date,
  p_remove_media_ids uuid[],
  p_new_media jsonb
)
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  current_version integer;
  next_version integer;
begin
  if auth.uid() is null or not public.in_my_couple(p_couple_id) then
    raise exception 'NOT_AUTHORIZED' using errcode = '42501';
  end if;
  if nullif(trim(p_title), '') is null then
    raise exception 'TITLE_REQUIRED' using errcode = 'P0001';
  end if;
  if jsonb_typeof(coalesce(p_new_media, '[]'::jsonb)) <> 'array' then
    raise exception 'INVALID_MEDIA_PAYLOAD' using errcode = 'P0001';
  end if;

  select m.version into current_version
  from public.memories m
  where m.id = p_memory_id and m.couple_id = p_couple_id
  for update;
  if current_version is null then raise exception 'MEMORY_NOT_FOUND' using errcode = 'P0001'; end if;
  if current_version <> p_expected_version then raise exception 'STALE_VERSION' using errcode = 'P0001'; end if;

  if exists (
    select 1 from unnest(coalesce(p_remove_media_ids, array[]::uuid[])) id
    where not exists (select 1 from public.media md where md.id = id and md.memory_id = p_memory_id and md.couple_id = p_couple_id)
  ) then raise exception 'INVALID_MEDIA_SELECTION' using errcode = 'P0001'; end if;

  delete from public.media md
  where md.memory_id = p_memory_id and md.couple_id = p_couple_id
    and md.id = any(coalesce(p_remove_media_ids, array[]::uuid[]));

  insert into public.media (id, couple_id, memory_id, object_key, mime_type, size_bytes, position, created_by)
  select item.id, p_couple_id, p_memory_id, item.object_key, item.mime_type, item.size_bytes, item.position, auth.uid()
  from jsonb_to_recordset(coalesce(p_new_media, '[]'::jsonb)) as item(
    id uuid, object_key text, mime_type text, size_bytes bigint, position integer
  );

  next_version := current_version + 1;
  update public.memories
  set title = trim(p_title), body = coalesce(p_body, ''), occurred_on = p_occurred_on,
      updated_by = auth.uid(), version = next_version
  where id = p_memory_id;
  return next_version;
end
$$;

revoke all on function public.in_my_couple(uuid) from public, anon;
grant execute on function public.in_my_couple(uuid) to authenticated;
revoke all on function public.create_visit_memory(uuid, uuid, uuid, uuid, text, text, double precision, double precision, text, text, date, jsonb) from public, anon;
grant execute on function public.create_visit_memory(uuid, uuid, uuid, uuid, text, text, double precision, double precision, text, text, date, jsonb) to authenticated;
revoke all on function public.update_memory_with_media(uuid, uuid, integer, text, text, date, uuid[], jsonb) from public, anon;
grant execute on function public.update_memory_with_media(uuid, uuid, integer, text, text, date, uuid[], jsonb) to authenticated;

