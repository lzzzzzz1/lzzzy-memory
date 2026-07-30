-- Safe ToWhere-inspired shared archive modules.
-- Run after 202607290003_fix_rpc_place_id.sql.

create table if not exists public.couple_firsts (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references public.couples(id) on delete cascade,
  title text not null check (char_length(trim(title)) between 1 and 120),
  body text not null default '',
  happened_on date not null,
  category text not null default '旅行' check (char_length(trim(category)) between 1 and 30),
  created_by uuid not null references auth.users(id),
  updated_by uuid not null references auth.users(id),
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.couple_letters (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references public.couples(id) on delete cascade,
  title text not null check (char_length(trim(title)) between 1 and 120),
  content text not null check (char_length(trim(content)) between 1 and 20000),
  letter_date date not null,
  status text not null default 'sealed' check (status in ('draft', 'sealed')),
  created_by uuid not null references auth.users(id),
  updated_by uuid not null references auth.users(id),
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.couple_checkins (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references public.couples(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  checkin_date date not null,
  mood integer not null check (mood between 1 and 5),
  keyword text not null default '' check (char_length(trim(keyword)) <= 40),
  note text not null default '' check (char_length(note) <= 1000),
  created_by uuid not null references auth.users(id),
  updated_by uuid not null references auth.users(id),
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (couple_id, user_id, checkin_date)
);

create index if not exists couple_firsts_timeline_idx
  on public.couple_firsts (couple_id, happened_on desc, created_at desc);
create index if not exists couple_letters_timeline_idx
  on public.couple_letters (couple_id, letter_date desc, created_at desc);
create index if not exists couple_checkins_timeline_idx
  on public.couple_checkins (couple_id, checkin_date desc, created_at desc);

drop trigger if exists couple_firsts_version on public.couple_firsts;
create trigger couple_firsts_version
before update on public.couple_firsts
for each row execute function public.reject_stale_write();

drop trigger if exists couple_letters_version on public.couple_letters;
create trigger couple_letters_version
before update on public.couple_letters
for each row execute function public.reject_stale_write();

drop trigger if exists couple_checkins_version on public.couple_checkins;
create trigger couple_checkins_version
before update on public.couple_checkins
for each row execute function public.reject_stale_write();

alter table public.couple_firsts enable row level security;
alter table public.couple_letters enable row level security;
alter table public.couple_checkins enable row level security;

drop policy if exists "members access couple firsts" on public.couple_firsts;
create policy "members access couple firsts"
on public.couple_firsts for all
using (public.in_my_couple(couple_id))
with check (public.in_my_couple(couple_id));

drop policy if exists "members access couple letters" on public.couple_letters;
create policy "members access couple letters"
on public.couple_letters for all
using (public.in_my_couple(couple_id))
with check (public.in_my_couple(couple_id));

drop policy if exists "members access couple checkins" on public.couple_checkins;
create policy "members access couple checkins"
on public.couple_checkins for all
using (public.in_my_couple(couple_id))
with check (public.in_my_couple(couple_id));
