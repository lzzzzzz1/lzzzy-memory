-- Run this migration in the Supabase SQL Editor before connecting the web app.
create extension if not exists pgcrypto;

create table public.couples (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.couple_members (
  couple_id uuid not null references public.couples(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (couple_id, user_id)
);
create table public.trips (
  id uuid primary key default gen_random_uuid(), couple_id uuid not null references public.couples(id) on delete cascade,
  name text not null, summary text not null default '', start_date date not null, end_date date not null,
  created_by uuid not null references auth.users(id), updated_by uuid not null references auth.users(id),
  version integer not null default 1 check (version > 0), created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check (end_date >= start_date)
);
create table public.places (
  id uuid primary key default gen_random_uuid(), couple_id uuid not null references public.couples(id) on delete cascade,
  name text not null, city text not null default '', country text not null default '', latitude double precision not null, longitude double precision not null,
  created_by uuid not null references auth.users(id), updated_by uuid not null references auth.users(id), version integer not null default 1,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), check (latitude between -90 and 90), check (longitude between -180 and 180)
);
create table public.trip_places (
  trip_id uuid not null references public.trips(id) on delete cascade, place_id uuid not null references public.places(id) on delete cascade,
  position integer not null check (position > 0), primary key (trip_id, place_id), unique (trip_id, position)
);
create table public.memories (
  id uuid primary key default gen_random_uuid(), couple_id uuid not null references public.couples(id) on delete cascade, trip_id uuid not null references public.trips(id) on delete cascade,
  place_id uuid references public.places(id) on delete set null, title text not null, body text not null, occurred_on date not null,
  created_by uuid not null references auth.users(id), updated_by uuid not null references auth.users(id), version integer not null default 1,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.media (
  id uuid primary key default gen_random_uuid(), couple_id uuid not null references public.couples(id) on delete cascade, memory_id uuid references public.memories(id) on delete set null,
  bucket text not null default 'travel-media', object_key text not null unique, mime_type text not null, size_bytes bigint not null check(size_bytes > 0),
  width integer, height integer, checksum text, captured_at timestamptz, latitude double precision, longitude double precision,
  created_by uuid not null references auth.users(id), created_at timestamptz not null default now()
);

create or replace function public.in_my_couple(target_couple uuid) returns boolean language sql stable security definer set search_path = public as $$ select exists (select 1 from public.couple_members where couple_id = target_couple and user_id = auth.uid()) $$;
create or replace function public.reject_stale_write() returns trigger language plpgsql as $$ begin if new.version <> old.version + 1 then raise exception 'STALE_VERSION' using errcode = 'P0001'; end if; new.updated_at = now(); return new; end $$;
create trigger trips_version before update on public.trips for each row execute function public.reject_stale_write();
create trigger places_version before update on public.places for each row execute function public.reject_stale_write();
create trigger memories_version before update on public.memories for each row execute function public.reject_stale_write();

alter table public.couples enable row level security; alter table public.couple_members enable row level security; alter table public.trips enable row level security; alter table public.places enable row level security; alter table public.trip_places enable row level security; alter table public.memories enable row level security; alter table public.media enable row level security;
create policy "couple members read couples" on public.couples for select using (public.in_my_couple(id));
create policy "members read membership" on public.couple_members for select using (user_id = auth.uid() or public.in_my_couple(couple_id));
create policy "members access trips" on public.trips for all using (public.in_my_couple(couple_id)) with check (public.in_my_couple(couple_id));
create policy "members access places" on public.places for all using (public.in_my_couple(couple_id)) with check (public.in_my_couple(couple_id));
create policy "members access memories" on public.memories for all using (public.in_my_couple(couple_id)) with check (public.in_my_couple(couple_id));
create policy "members access media" on public.media for all using (public.in_my_couple(couple_id)) with check (public.in_my_couple(couple_id));
create policy "members access trip_places" on public.trip_places for all using (exists (select 1 from public.trips t where t.id = trip_id and public.in_my_couple(t.couple_id))) with check (exists (select 1 from public.trips t where t.id = trip_id and public.in_my_couple(t.couple_id)));

insert into storage.buckets (id, name, public) values ('travel-media', 'travel-media', false) on conflict (id) do nothing;
create policy "members manage own media objects" on storage.objects for all using (bucket_id = 'travel-media' and public.in_my_couple(((storage.foldername(name))[2])::uuid)) with check (bucket_id = 'travel-media' and public.in_my_couple(((storage.foldername(name))[2])::uuid));
