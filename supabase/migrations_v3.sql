-- Choddobeshi schema v3: friends, weekly leaderboard, streaks, cosmetics,
-- word-pair balance stats and player reports.
-- Run AFTER schema.sql and migrations_v2.sql, in the Supabase SQL editor.

-- ---------------------------------------------------------------- profiles
alter table public.profiles add column if not exists friend_code text;
alter table public.profiles add column if not exists frame text not null default 'none';
alter table public.profiles add column if not exists color text;

create or replace function public.gen_friend_code()
returns text language sql volatile as $$
  select upper(substr(md5(random()::text || clock_timestamp()::text), 1, 6));
$$;

update public.profiles set friend_code = public.gen_friend_code() where friend_code is null;
alter table public.profiles alter column friend_code set default public.gen_friend_code();
create unique index if not exists profiles_friend_code_key on public.profiles (friend_code);

-- ----------------------------------------------------------------- friends
create table if not exists public.friendships (
  user_id uuid not null references auth.users (id) on delete cascade,
  friend_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, friend_id),
  check (user_id <> friend_id)
);
alter table public.friendships enable row level security;

drop policy if exists "read own friendships" on public.friendships;
create policy "read own friendships" on public.friendships
  for select using (user_id = auth.uid());

-- Add a friend by their friend code. Creates both directions. Returns a status.
create or replace function public.add_friend_by_code(p_code text)
returns text language plpgsql security definer set search_path = public as $$
declare
  fid uuid;
begin
  if auth.uid() is null then return 'unauthenticated'; end if;
  select id into fid from public.profiles where friend_code = upper(trim(p_code));
  if fid is null then return 'not_found'; end if;
  if fid = auth.uid() then return 'self'; end if;
  insert into public.friendships (user_id, friend_id) values (auth.uid(), fid) on conflict do nothing;
  insert into public.friendships (user_id, friend_id) values (fid, auth.uid()) on conflict do nothing;
  return 'ok';
end;
$$;

create or replace function public.remove_friend(p_friend uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  delete from public.friendships
   where (user_id = auth.uid() and friend_id = p_friend)
      or (user_id = p_friend and friend_id = auth.uid());
end;
$$;

revoke all on function public.add_friend_by_code(text) from public, anon;
revoke all on function public.remove_friend(uuid) from public, anon;
grant execute on function public.add_friend_by_code(text) to authenticated;
grant execute on function public.remove_friend(uuid) to authenticated;

-- ------------------------------------------------- streaks + weekly points
alter table public.player_stats add column if not exists streak_days integer not null default 0;
alter table public.player_stats add column if not exists best_streak integer not null default 0;
alter table public.player_stats add column if not exists last_played date;

create table if not exists public.weekly_points (
  user_id uuid not null references auth.users (id) on delete cascade,
  week_start date not null,
  points integer not null default 0,
  wins integer not null default 0,
  games integer not null default 0,
  primary key (user_id, week_start)
);
alter table public.weekly_points enable row level security;
drop policy if exists "weekly readable by all" on public.weekly_points;
create policy "weekly readable by all" on public.weekly_points for select using (true);

-- Extended: also maintains the day streak and the weekly totals.
create or replace function public.record_result(
  p_user uuid,
  p_role text,          -- 'civilian' | 'impostor' | 'jester'
  p_won boolean,
  p_win_team text,      -- 'civilians' | 'impostors' | 'guesser' | 'jester'
  p_points integer
) returns void language plpgsql security definer set search_path = public as $$
declare
  today date := (now() at time zone 'utc')::date;
  prev date;
  wk date := date_trunc('week', now() at time zone 'utc')::date;
begin
  insert into public.player_stats (user_id) values (p_user) on conflict (user_id) do nothing;

  select last_played into prev from public.player_stats where user_id = p_user;

  update public.player_stats set
    games = games + 1,
    wins = wins + (case when p_won then 1 else 0 end),
    civ_wins = civ_wins + (case when p_won and p_win_team = 'civilians' then 1 else 0 end),
    imp_wins = imp_wins + (case when p_won and p_win_team = 'impostors' then 1 else 0 end),
    guesser_wins = guesser_wins + (case when p_won and p_win_team = 'guesser' then 1 else 0 end),
    times_civilian = times_civilian + (case when p_role = 'civilian' then 1 else 0 end),
    times_impostor = times_impostor + (case when p_role = 'impostor' then 1 else 0 end),
    points = points + coalesce(p_points, 0),
    streak_days = case
      when prev = today then greatest(streak_days, 1)
      when prev = today - 1 then streak_days + 1
      else 1 end,
    last_played = today,
    updated_at = now()
  where user_id = p_user;

  update public.player_stats set best_streak = greatest(best_streak, streak_days) where user_id = p_user;

  insert into public.weekly_points (user_id, week_start, points, wins, games)
  values (p_user, wk, coalesce(p_points, 0), case when p_won then 1 else 0 end, 1)
  on conflict (user_id, week_start) do update set
    points = public.weekly_points.points + coalesce(p_points, 0),
    wins = public.weekly_points.wins + (case when p_won then 1 else 0 end),
    games = public.weekly_points.games + 1;
end;
$$;

revoke all on function public.record_result(uuid, text, boolean, text, integer) from public, anon, authenticated;
grant execute on function public.record_result(uuid, text, boolean, text, integer) to service_role;

create or replace view public.weekly_leaderboard as
  select w.user_id, p.username, w.points, w.wins, w.games
  from public.weekly_points w
  left join public.profiles p on p.id = w.user_id
  where w.week_start = date_trunc('week', now() at time zone 'utc')::date
  order by w.points desc, w.wins desc
  limit 100;

-- ------------------------------------------------------ word-pair balance
create table if not exists public.pair_stats (
  pair_key text primary key,
  plays integer not null default 0,
  impostor_wins integer not null default 0,
  updated_at timestamptz not null default now()
);
alter table public.pair_stats enable row level security;
-- No policies: server (secret key) only. Inspect in Table Editor.

create or replace function public.record_pair(p_key text, p_impostor_won boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into public.pair_stats (pair_key, plays, impostor_wins)
  values (p_key, 1, case when p_impostor_won then 1 else 0 end)
  on conflict (pair_key) do update set
    plays = public.pair_stats.plays + 1,
    impostor_wins = public.pair_stats.impostor_wins + (case when p_impostor_won then 1 else 0 end),
    updated_at = now();
end;
$$;
revoke all on function public.record_pair(text, boolean) from public, anon, authenticated;
grant execute on function public.record_pair(text, boolean) to service_role;

-- ------------------------------------------------------------------ reports
create table if not exists public.reports (
  id bigint generated always as identity primary key,
  room_code text,
  reporter_id uuid,
  reporter_name text,
  target_id uuid,
  target_name text,
  reason text not null,
  created_at timestamptz not null default now()
);
alter table public.reports enable row level security;
-- No policies: server (secret key) only. Review in Table Editor.
