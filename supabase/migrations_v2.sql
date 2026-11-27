-- Choddobeshi schema v2: room persistence + achievements.
-- Run this AFTER schema.sql, in the Supabase SQL editor.

-- Rooms survive a server restart: the game server snapshots each room here.
-- Server-only (secret key); no client access.
create table if not exists public.rooms (
  code text primary key,
  state jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.rooms enable row level security;
-- No policies: only the service_role (secret key) can read/write.

-- Achievements earned per user.
create table if not exists public.user_achievements (
  user_id uuid not null references auth.users (id) on delete cascade,
  achievement text not null,
  earned_at timestamptz not null default now(),
  primary key (user_id, achievement)
);
alter table public.user_achievements enable row level security;

drop policy if exists "achievements readable by all" on public.user_achievements;
create policy "achievements readable by all" on public.user_achievements
  for select using (true);
-- Inserts happen only via the server (secret key).
