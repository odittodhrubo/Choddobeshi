-- Choddobeshi persistence schema.
-- Run this in the Supabase SQL editor (Dashboard → SQL → New query → Run).

-- 1. Profiles: one row per auth user (anonymous or Google).
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

drop policy if exists "profiles readable by all" on public.profiles;
create policy "profiles readable by all" on public.profiles
  for select using (true);

drop policy if exists "users manage own profile" on public.profiles;
create policy "users manage own profile" on public.profiles
  for all using (auth.uid() = id) with check (auth.uid() = id);

-- Auto-create a profile row when a user signs up.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id) values (new.id) on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 2. Lifetime stats, one row per user.
create table if not exists public.player_stats (
  user_id uuid primary key references auth.users (id) on delete cascade,
  games integer not null default 0,
  wins integer not null default 0,
  civ_wins integer not null default 0,
  imp_wins integer not null default 0,
  guesser_wins integer not null default 0,
  times_civilian integer not null default 0,
  times_impostor integer not null default 0,
  points integer not null default 0,
  updated_at timestamptz not null default now()
);

alter table public.player_stats enable row level security;

drop policy if exists "stats readable by all" on public.player_stats;
create policy "stats readable by all" on public.player_stats
  for select using (true);
-- Writes happen only via the server (secret key), so no insert/update policy for clients.

-- 3. Record one player's result. Called by the game server with the secret key.
create or replace function public.record_result(
  p_user uuid,
  p_role text,          -- 'civilian' | 'impostor'
  p_won boolean,
  p_win_team text,      -- 'civilians' | 'impostors' | 'guesser'
  p_points integer
) returns void language plpgsql security definer set search_path = public as $$
begin
  insert into public.player_stats (user_id) values (p_user)
    on conflict (user_id) do nothing;

  update public.player_stats set
    games = games + 1,
    wins = wins + (case when p_won then 1 else 0 end),
    civ_wins = civ_wins + (case when p_won and p_win_team = 'civilians' then 1 else 0 end),
    imp_wins = imp_wins + (case when p_won and p_win_team = 'impostors' then 1 else 0 end),
    guesser_wins = guesser_wins + (case when p_won and p_win_team = 'guesser' then 1 else 0 end),
    times_civilian = times_civilian + (case when p_role = 'civilian' then 1 else 0 end),
    times_impostor = times_impostor + (case when p_role = 'impostor' then 1 else 0 end),
    points = points + coalesce(p_points, 0),
    updated_at = now()
  where user_id = p_user;
end;
$$;

-- Only the game server (secret key = service_role) may record results.
revoke all on function public.record_result(uuid, text, boolean, text, integer) from public, anon, authenticated;
grant execute on function public.record_result(uuid, text, boolean, text, integer) to service_role;

-- 4. Global leaderboard view (public read).
create or replace view public.leaderboard as
  select s.user_id, p.username, s.points, s.wins, s.games
  from public.player_stats s
  left join public.profiles p on p.id = s.user_id
  order by s.points desc, s.wins desc
  limit 100;
