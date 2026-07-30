-- Stage 1: repeat visits, configurable multi-media limits, and atomic memory creation.
-- Run after 202607270001_stage_zero.sql.

create table public.couple_settings (
  couple_id uuid primary key references public.couples(id) on delete cascade,
  max_images_per_memory integer not null default 20 check (max_images_per_memory between 1 and 100),
  max_videos_per_memory integer not null default 2 check (max_videos_per_memory between 0 and 20),
  max_image_bytes bigint not null default 20971520 check (max_image_bytes > 0),
  max_video_bytes bigint not null default 536870912 check (max_video_bytes > 0),
  updated_at timestamptz not null default now()
);

insert into public.couple_settings (couple_id)
select id from public.couples
on conflict (couple_id) do nothing;

create or replace function public.create_default_couple_settings()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.couple_settings (couple_id)
  values (new.id)
  on conflict (couple_id) do nothing;
  return new;
end
$$;

create trigger couples_default_settings
after insert on public.couples
for each row execute function public.create_default_couple_settings();

create table public.visits (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references public.couples(id) on delete cascade,
  trip_id uuid not null references public.trips(id) on delete cascade,
  place_id uuid not null references public.places(id) on delete cascade,
  title text not null default '',
  visited_on date not null,
  created_by uuid not null references auth.users(id),
  updated_by uuid not null references auth.users(id),
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index visits_couple_place_date_idx on public.visits (couple_id, place_id, visited_on desc);
create index visits_trip_date_idx on public.visits (trip_id, visited_on desc);

alter table public.memories add column visit_id uuid references public.visits(id) on delete cascade;
alter table public.media add column position integer;

insert into public.visits (couple_id, trip_id, place_id, title, visited_on, created_by, updated_by)
select
  m.couple_id,
  m.trip_id,
  m.place_id,
  coalesce(nullif(max(p.city), ''), '一次到访'),
  m.occurred_on,
  min(m.created_by::text)::uuid,
  min(m.updated_by::text)::uuid
from public.memories m
join public.places p on p.id = m.place_id
where m.place_id is not null
group by m.couple_id, m.trip_id, m.place_id, m.occurred_on;

update public.memories m
set visit_id = (
  select v.id
  from public.visits v
  where v.couple_id = m.couple_id
    and v.trip_id = m.trip_id
    and v.place_id = m.place_id
    and v.visited_on = m.occurred_on
  order by v.created_at, v.id
  limit 1
)
where m.place_id is not null and m.visit_id is null;

with ranked as (
  select id, row_number() over (partition by memory_id order by created_at, id)::integer as next_position
  from public.media
  where memory_id is not null
)
update public.media m
set position = ranked.next_position
from ranked
where m.id = ranked.id;

alter table public.media alter column position set default 1;
create unique index media_memory_position_key on public.media (memory_id, position) where memory_id is not null;

create trigger visits_version
before update on public.visits
for each row execute function public.reject_stale_write();

alter table public.visits enable row level security;
alter table public.couple_settings enable row level security;

create policy "members access visits"
on public.visits for all
using (public.in_my_couple(couple_id))
with check (public.in_my_couple(couple_id));

create policy "members access couple settings"
on public.couple_settings for all
using (public.in_my_couple(couple_id))
with check (public.in_my_couple(couple_id));

create or replace function public.enforce_media_policy()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  image_limit integer;
  video_limit integer;
  image_byte_limit bigint;
  video_byte_limit bigint;
  current_count integer;
begin
  select
    coalesce(max_images_per_memory, 20),
    coalesce(max_videos_per_memory, 2),
    coalesce(max_image_bytes, 20971520),
    coalesce(max_video_bytes, 536870912)
  into image_limit, video_limit, image_byte_limit, video_byte_limit
  from public.couple_settings
  where couple_id = new.couple_id;

  image_limit := coalesce(image_limit, 20);
  video_limit := coalesce(video_limit, 2);
  image_byte_limit := coalesce(image_byte_limit, 20971520);
  video_byte_limit := coalesce(video_byte_limit, 536870912);

  if new.mime_type like 'image/%' then
    if new.size_bytes > image_byte_limit then
      raise exception 'IMAGE_TOO_LARGE' using errcode = 'P0001';
    end if;
    select count(*) into current_count
    from public.media
    where memory_id = new.memory_id and mime_type like 'image/%';
    if current_count >= image_limit then
      raise exception 'IMAGE_LIMIT_EXCEEDED' using errcode = 'P0001';
    end if;
  elsif new.mime_type like 'video/%' then
    if new.size_bytes > video_byte_limit then
      raise exception 'VIDEO_TOO_LARGE' using errcode = 'P0001';
    end if;
    select count(*) into current_count
    from public.media
    where memory_id = new.memory_id and mime_type like 'video/%';
    if current_count >= video_limit then
      raise exception 'VIDEO_LIMIT_EXCEEDED' using errcode = 'P0001';
    end if;
  else
    raise exception 'UNSUPPORTED_MEDIA' using errcode = 'P0001';
  end if;

  return new;
end
$$;

create trigger media_policy
before insert or update on public.media
for each row execute function public.enforce_media_policy();

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
    select 1 from public.trips
    where id = p_trip_id and couple_id = p_couple_id
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
    select id into resolved_place_id
    from public.places
    where id = p_place_id and couple_id = p_couple_id;
  end if;

  if resolved_place_id is null then
    select id into resolved_place_id
    from public.places
    where couple_id = p_couple_id
      and lower(trim(country)) = lower(trim(p_country))
      and lower(trim(city)) = lower(trim(p_city))
    order by created_at
    limit 1;
  end if;

  if resolved_place_id is null then
    insert into public.places (
      couple_id, name, city, country, latitude, longitude, created_by, updated_by
    ) values (
      p_couple_id, trim(p_city), trim(p_city), trim(p_country),
      p_latitude, p_longitude, auth.uid(), auth.uid()
    )
    returning id into resolved_place_id;
  end if;

  if not exists (
    select 1 from public.trip_places
    where trip_id = p_trip_id and place_id = resolved_place_id
  ) then
    select coalesce(max(position), 0) + 1 into next_position
    from public.trip_places
    where trip_id = p_trip_id;

    insert into public.trip_places (trip_id, place_id, position)
    values (p_trip_id, resolved_place_id, next_position);
  end if;

  insert into public.visits (
    couple_id, trip_id, place_id, title, visited_on, created_by, updated_by
  ) values (
    p_couple_id, p_trip_id, resolved_place_id, trim(p_title),
    p_occurred_on, auth.uid(), auth.uid()
  )
  returning id into created_visit_id;

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
    item.id,
    p_couple_id,
    p_memory_id,
    item.object_key,
    item.mime_type,
    item.size_bytes,
    item.position,
    auth.uid()
  from jsonb_to_recordset(coalesce(p_media, '[]'::jsonb)) as item(
    id uuid,
    object_key text,
    mime_type text,
    size_bytes bigint,
    position integer
  );

  return query select p_memory_id, created_visit_id, resolved_place_id;
end
$$;

grant execute on function public.create_visit_memory(
  uuid, uuid, uuid, uuid, text, text, double precision, double precision,
  text, text, date, jsonb
) to authenticated;
